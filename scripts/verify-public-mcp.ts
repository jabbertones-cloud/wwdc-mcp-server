#!/usr/bin/env node
/**
 * Read-only production dogfood of the PUBLIC WWDC MCP after exact SHA deploy.
 * It uses the real hosted MCP endpoint, not fixtures or direct function calls.
 * This proves the service wire protocol; private ChatGPT plugin activation is
 * a separate end-user connection proof.
 */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.env.WWDC_PUBLIC_BASE_URL ?? "https://wwdc-mcp.smatdesigns.com";
const expectedSha = process.env.WWDC_EXPECT_SHA;
const expectedCorpus = process.env.WWDC_EXPECT_CORPUS_SHA256;

if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("WWDC_EXPECT_SHA must identify the exact intended source commit");
}
if (!expectedCorpus || !/^[0-9a-f]{64}$/.test(expectedCorpus)) {
  throw new Error("WWDC_EXPECT_CORPUS_SHA256 must be the logical corpus version digest");
}

function jsonToolResult(result: any, name: string): any {
  assert.notEqual(result.isError, true, name + " returned isError=true");
  const text = (result.content ?? [])
    .filter((part: any) => part.type === "text")
    .map((part: any) => part.text).join("\n");
  assert.ok(text.length > 0, name + " returned no text");
  const parsed = JSON.parse(text);
  // Real WWDC corpus status exceeds the JSON response budget (72+ KiB).
  // The service returns a valid compacted { truncated, data } envelope.
  // Inspect that live response instead of treating compaction as lost data.
  if (parsed?.truncated === true && parsed?.data && typeof parsed.data === "object") {
    return parsed.data;
  }
  return parsed;
}

async function main() {
  const started = Date.now();
  const healthResponse = await fetch(new URL("/healthz", origin), {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(healthResponse.status, 200, "real hosted health endpoint");
  const health = await healthResponse.json() as any;
  assert.equal(health.ok, true);
  assert.equal(health.release?.sha, expectedSha, "live source identity");
  assert.equal(health.release?.corpusSha256, expectedCorpus, "live logical corpus identity");
  assert.equal(health.corpus?.verified, true, "running process attests its opened DB");
  assert.equal(health.corpus?.needsRestart, false, "no stale open corpus");
  assert.equal(health.publicReadOnly, true, "must remain publicly read-only");
  assert.equal(health.authConfigured, false, "public endpoint must not silently become commercial auth");

  const client = new Client(
    { name: "wwdc-direct-chatgpt-public-acceptance", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin));
  try {
    await client.connect(transport);
    const catalog = (await client.listTools()).tools;
    assert.equal(catalog.length, 45, "exact hosted 45-tool catalog");
    const names = new Set(catalog.map((tool) => tool.name));
    for (const name of [
      "wwdc_ingest_status",
      "wwdc_security_manifest",
      "swift_app_audit",
      "appstore_guidelines_search",
      "wwdc_search",
    ]) assert.ok(names.has(name), "missing public MCP tool: " + name);
    for (const tool of catalog) {
      assert.equal(tool.annotations?.readOnlyHint, true, "non-read-only tool: " + tool.name);
    }

    async function call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      return jsonToolResult(result, name);
    }

    const ingest = await call("wwdc_ingest_status", { format: "json", limit: 1 });
    assert.equal(ingest.corpus?.version, expectedCorpus, "MCP tool must report deployed DB");
    assert.ok(ingest.corpus?.sessionCount >= 1200, "expected indexed session coverage");

    const security = await call("wwdc_security_manifest", { format: "json" });
    assert.equal(security.tool_count, 45, "real manifest tool count");
    assert.ok(security.tool_manifest_hash, "manifest hash required");

    const search = await call("wwdc_search", {
      query: "SwiftUI", kinds: ["session"], year: 2026, format: "json", limit: 3,
    });
    assert.ok(search.count > 0, "fresh WWDC26 sessions missing");
    assert.ok(search.hits.some((hit: any) => String(hit.url).startsWith("https://developer.apple.com/")),
      "Apple source evidence missing");

    const guidelines = await call("appstore_guidelines_search", {
      query: "privacy", format: "json", limit: 3,
    });
    assert.ok(guidelines.hits?.length > 0, "App Store guidelines search returned no evidence");

    const audit = await call("swift_app_audit", {
      focus: "localization",
      platforms: ["macOS"],
      frameworks: ["SwiftUI"],
      feature: "App Store screenshots and regional localization workflow",
      year_min: 2025,
      limit: 2,
      format: "json",
    });
    assert.ok(audit && typeof audit === "object" && Object.keys(audit).length > 0,
      "Swift app audit returned no research result");

    console.log(JSON.stringify({
      ok: true,
      scope: "actual public HTTPS MCP operations; not ChatGPT plugin connection",
      endpoint: new URL("/mcp", origin).toString(),
      releaseSha: health.release.sha,
      corpusSha256: ingest.corpus.version,
      corpusIngestedAt: ingest.corpus.ingestedAt,
      sessions: ingest.corpus.sessionCount,
      toolCount: catalog.length,
      toolManifestHash: security.tool_manifest_hash,
      toolsCalled: [
        "wwdc_ingest_status", "wwdc_security_manifest",
        "wwdc_search", "appstore_guidelines_search", "swift_app_audit",
      ],
      wwdc2026Example: search.hits.slice(0, 2).map((hit: any) => ({title: hit.title, url: hit.url})),
      appStoreExample: guidelines.hits.slice(0, 2).map((hit: any) => ({title: hit.title, url: hit.url})),
      auditFields: Object.keys(audit).slice(0, 12),
      elapsedMs: Date.now() - started,
    }, null, 2));
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("[wwdc-public-mcp] ACCEPTANCE FAILED:", error.message ?? String(error));
  process.exitCode = 1;
});
