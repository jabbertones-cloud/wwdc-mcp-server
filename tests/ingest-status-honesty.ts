#!/usr/bin/env tsx
/**
 * wwdc_ingest_status honesty tests: an absent DB file is silently created
 * empty on open (openDb), so a missing/misconfigured corpus volume used to
 * present as a healthy-looking empty status ("none recorded yet; run
 * ingest"). The tool must now name the three corpus states explicitly:
 * "empty" (0 sessions, no stamp — probable missing volume), "unstamped"
 * (sessions present, no corpus version stamp), and "stamped".
 * Offline: spawns the built server against temp DB paths.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { openDb, migrate } from "../src/db/schema.js";
import { upsertSession, recordIngest } from "../src/db/queries.js";
import { recordCorpusVersion } from "../src/db/corpus.js";
import type { WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

async function callStatus(
  dbPath: string,
  args: Record<string, unknown>,
): Promise<string> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(ROOT, "dist", "index.js")],
    env: {
      ...(process.env as Record<string, string>),
      WWDC_MCP_DB: dbPath,
      WWDC_SKIP_EMBEDDINGS: "1",
    },
    stderr: "ignore",
  });
  const client = new Client(
    { name: "ingest-status-honesty", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_ingest_status",
      arguments: args,
    });
    assert.ok(!r.isError, "wwdc_ingest_status errored");
    return r.content[0].text as string;
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-status-test-"));
  try {
    // A) DB file does not exist: server auto-creates it empty; the tool must
    // say EMPTY CORPUS (probable missing volume), not a benign empty status.
    const missing = path.join(dir, "missing.db");
    const jsonA = JSON.parse(await callStatus(missing, { format: "json" }));
    assert.equal(jsonA.corpus_state, "empty");
    assert.equal(jsonA.sessions_indexed, 0);
    assert.equal(jsonA.corpus, null);
    assert.equal(jsonA.db_path, missing);
    const mdA = await callStatus(missing, {});
    assert.match(mdA, /EMPTY CORPUS/);
    console.log("  ok  missing DB file reports EMPTY CORPUS with the db path");

    // B) Sessions ingested but no corpus stamp yet: "unstamped".
    const seeded = path.join(dir, "seeded.db");
    const db = openDb(seeded);
    migrate(db);
    const now = new Date().toISOString();
    const s1: WwdcSession = {
      id: "wwdc2025-101",
      year: 2025,
      sessionNumber: "101",
      title: "Honesty fixture",
      description: "Seeded session for ingest-status state tests.",
      url: "https://developer.apple.com/videos/play/wwdc2025/101/",
      duration: 60,
      topics: ["Swift"],
      platforms: ["iOS"],
      speakers: [],
      transcript: "Fixture transcript.",
      sampleCodeUrls: [],
      relatedDocs: [],
      videoUrl: undefined,
      deepLinks: [],
      updatedAt: now,
    };
    upsertSession(db, s1);
    db.close();
    const jsonB = JSON.parse(await callStatus(seeded, { format: "json" }));
    assert.equal(jsonB.corpus_state, "unstamped");
    assert.equal(jsonB.sessions_indexed, 1);
    assert.equal(jsonB.corpus, null);
    console.log("  ok  seeded-but-unstamped corpus reports unstamped");

    // C) Stamped corpus: state "stamped", stamp round-trips as before.
    const db2 = openDb(seeded);
    recordIngest(db2, "wwdc", 1, 0);
    recordCorpusVersion(db2, "all", "0.2.1");
    db2.close();
    const jsonC = JSON.parse(await callStatus(seeded, { format: "json" }));
    assert.equal(jsonC.corpus_state, "stamped");
    assert.equal(jsonC.sessions_indexed, 1);
    assert.ok(jsonC.corpus, "stamped state still reports the corpus stamp");
    assert.equal(jsonC.corpus.sessionCount, 1);
    console.log("  ok  stamped corpus still reports its stamp (shape unchanged)");

    console.log("[ingest-status-honesty] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[ingest-status-honesty] FAILED:", err);
  process.exit(1);
});
