#!/usr/bin/env node
/** Authenticated end-to-end acceptance against an already running MCP daemon.
 * This does NOT instantiate our server or seed test fixtures.
 * It reads the existing operator-managed Bearer token from disk, uses the
 * public MCP HTTP wire protocol, and independently reads the persisted SQLite DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getLatestCorpusVersion, hashCorpusContent } from "../src/db/corpus.js";

const dataDir = path.join(os.homedir(), "Library", "Application Support", "wwdc-mcp-server");
const base = process.env.WWDC_LIVE_URL ?? "http://127.0.0.1:8797";
const tokenPath = process.env.WWDC_LIVE_TOKEN_FILE ?? path.join(dataDir, "http-token");
const dbPath = process.env.WWDC_LIVE_DB ?? path.join(dataDir, "wwdc.db");
const expectedSha = process.env.WWDC_EXPECT_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const token = fs.readFileSync(tokenPath, "utf8").trim();

function textResponse(raw: any): string {
  return (raw.content ?? []).filter((e: any) => e.type === "text").map((e: any) => e.text).join("\n");
}
async function main() {
  const started = Date.now();
  const healthResponse = await fetch(new URL("/wwdc/healthz", base), { signal: AbortSignal.timeout(8000) });
  assert.equal(healthResponse.status, 200, "live health");
  const health = await healthResponse.json() as any;
  assert.equal(health.ok, true);
  assert.equal(health.authConfigured, true);
  assert.notEqual(health.publicReadOnly, true, "bearer auth must remain enforced");
  assert.equal(health.release?.sha, expectedSha, "LIVE revision does not match merged GitHub revision");
  const noAuth = await fetch(new URL("/wwdc/mcp", base), {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"no-auth-probe",version:"1"}}}),
    signal: AbortSignal.timeout(8000),
  });
  assert.equal(noAuth.status, 401, "MCP must reject unauthenticated requests");

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  let version;
  try {
    assert.equal(db.pragma("integrity_check", {simple:true}), "ok", "persisted corpus integrity");
    version = getLatestCorpusVersion(db);
    assert.ok(version, "live corpus is version-stamped");
    assert.equal(version.contentSha256, hashCorpusContent(db), "logical content digest matches the live database");
    assert.equal(version.version, version.contentSha256);
    assert.ok(version.sessionCount >= 1200, "production session count floor");
    assert.equal(version.wwdcYears, "2020–2026", "seven-year corpus");
  } finally { db.close(); }
  assert.equal(health.corpus?.verified, true, "live server must independently confirm its corpus");
  assert.equal(health.corpus?.version, version.version, "live server reports matching corpus");
  assert.equal(health.release?.corpusSha256, version.contentSha256,
    "health corpus identity must equal SQLite contents");

  const transport = new StreamableHTTPClientTransport(new URL("/wwdc/mcp", base), {
    requestInit: { headers: { authorization: "Bearer " + token } },
  });
  const client = new Client({name:"wwdc-production-acceptance",version:"1.0.0"},{capabilities:{}});
  const observations: Record<string, unknown> = {};
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 45, "live 45-tool API");
    async function call(name: string, args: Record<string, unknown>): Promise<any> {
      const result = await client.callTool({name,arguments:args});
      return result;
    }
    const statusWire = JSON.parse(textResponse(await call("wwdc_ingest_status", {format:"json",limit:1})));
    const status = statusWire.data ?? statusWire;
    assert.equal(status.corpus.version, version.version, "the installed MCP reports persisted corpus identity");
    assert.equal(status.corpus.sessionCount, version.sessionCount);

    const swift = JSON.parse(textResponse(await call("wwdc_search", {
      query:"SwiftUI",kinds:["session"],year:2026,format:"json",limit:3,
    })));
    assert.ok(swift.count > 0, "SwiftUI WWDC 2026 matches");
    assert.ok(swift.hits.every((h: any) => String(h.url).startsWith("https://developer.apple.com/")),
      "results must link to Apple developer WWDC sources");
    observations.swiftui = swift.hits.map((h: any) => ({title:h.title,year:h.year,url:h.url})).slice(0,2);

    const docs = JSON.parse(textResponse(await call("wwdc_search", {
      query:"SwiftUI",kinds:["doc"],format:"json",limit:3,
    })));
    assert.ok(docs.count > 0, "Apple documentation matches");
    assert.ok(docs.hits.every((h: any) => String(h.url).startsWith("https://developer.apple.com/")),
      "Apple documentation provenance");
    observations.appleDocs = docs.hits.map((h: any) => ({title:h.title,url:h.url})).slice(0,2);

    const regional = JSON.parse(textResponse(await call("appstore_guidelines_search", {
      query:"European",format:"json",limit:3,
    })));
    assert.ok(regional.hits.length > 0, "regional App Store requirements returned");
    assert.ok(regional.hits.every((h: any) => String(h.url).startsWith("https://developer.apple.com/")));
    observations.regional = regional.hits.map((h: any) => ({title:h.title,url:h.url})).slice(0,2);

    const oversizedAt = Date.now();
    const oversized = await call("wwdc_search", {
      query:"SwiftUI navigation ".repeat(550),format:"json",limit:1,
    }).catch((err: Error) => ({isError:true,content:[{type:"text",text:err.message}]}));
    const oversizedMs = Date.now() - oversizedAt;
    assert.ok(oversized.isError || /500|too long|too large|at most/i.test(textResponse(oversized)),
      "oversized query must be rejected, never return search hits");
    assert.ok(oversizedMs < 5000, "oversized query took too long (" + oversizedMs + " ms)");
    observations.oversizedMs = oversizedMs;

    const startedLoad = Date.now();
    const concurrent = await Promise.all(
      ["SwiftUI","SwiftData","StoreKit","Foundation","WidgetKit","SwiftUI","AppIntents","SwiftData"].map((query) =>
        call("wwdc_search",{query,kinds:["session"],format:"json",limit:1}),
      ),
    );
    for (const r of concurrent) {
      assert.equal(Boolean(r.isError), false, "concurrent live MCP search failed");
      assert.ok(JSON.parse(textResponse(r)).count > 0, "concurrent search unexpectedly empty");
    }
    observations.concurrency = {requests:concurrent.length,wallMs:Date.now()-startedLoad};

    console.log(JSON.stringify({
      ok:true,
      endpoint:base,
      serverVersion:health.version,
      releaseSha:health.release.sha,
      auth:"bearer-required",
      tools:tools.length,
      corpusVersion:version.version,
      ingestSource:version.ingestSource,
      ingestedAt:version.ingestedAt,
      sessions:version.sessionCount,
      years:version.wwdcYears,
      observations,
      elapsedMs:Date.now()-started,
    },null,2));
  } finally { await client.close(); }
}
main().catch((err) => { console.error("[live-MCP] FAIL:", err.message ?? String(err)); process.exitCode=1; });
