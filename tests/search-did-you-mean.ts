#!/usr/bin/env tsx
/**
 * wwdc_search did-you-mean tests: when both terms are misspelled the strict
 * search and the any-term fallback both return zero and the user dead-ends.
 * The server must now PROPOSE a correction built from the corpus vocabulary
 * (session titles + topics) — never execute it silently — and must stay
 * silent when no plausible correction exists (no fabricated guesses).
 * Offline: spawns the built server against a temp DB.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { openDb, migrate } from "../src/db/schema.js";
import { upsertSession } from "../src/db/queries.js";
import type { WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const now = new Date().toISOString();

function session(
  id: string,
  year: number,
  title: string,
  topics: string[],
  transcript: string,
): WwdcSession {
  return {
    id,
    year,
    sessionNumber: id.split("-")[1] ?? "101",
    title,
    description: "Seeded session for did-you-mean tests.",
    url: `https://developer.apple.com/videos/play/wwdc${year}/${id.split("-")[1] ?? "101"}/`,
    duration: 60,
    topics,
    platforms: ["iOS"],
    speakers: [],
    transcript,
    sampleCodeUrls: [],
    relatedDocs: [],
    videoUrl: undefined,
    deepLinks: [],
    updatedAt: now,
  };
}

async function callSearch(
  dbPath: string,
  args: Record<string, unknown>,
): Promise<{ json: any; text: string }> {
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
    { name: "search-did-you-mean", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_search",
      arguments: args,
    });
    assert.ok(!r.isError, "wwdc_search errored");
    const text = r.content[0].text as string;
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* markdown: not JSON */
    }
    return { json, text };
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-dym-test-"));
  try {
    const dbPath = path.join(dir, "seeded.db");
    const db = openDb(dbPath);
    migrate(db);
    upsertSession(
      db,
      session(
        "wwdc2024-101",
        2024,
        "SwiftUI navigation stack deep dive",
        ["SwiftUI", "Navigation"],
        "SwiftUI navigation stacks and paths fixture text.",
      ),
    );
    upsertSession(
      db,
      session(
        "wwdc2025-286",
        2025,
        "Meet Foundation Models",
        ["Foundation Models"],
        "Foundation Models on-device fixture text.",
      ),
    );
    db.close();

    // A) Both terms misspelled: zero hits, correction proposed (not run).
    const a = await callSearch(dbPath, {
      query: "SwftUI navigaton",
      kinds: ["session"],
      format: "json",
    });
    assert.equal(a.json.total, 0);
    assert.equal(a.json.did_you_mean.suggested_query, "SwiftUI navigation");
    assert.deepEqual(
      a.json.did_you_mean.corrections.map((c: any) => `${c.from}->${c.to}`),
      ["SwftUI->SwiftUI", "navigaton->navigation"],
    );
    assert.ok(
      (a.json.judgment?.caveats ?? []).some((c: string) =>
        c.includes("Did you mean"),
      ),
      "judgment caveat carries the suggestion",
    );
    const aMd = await callSearch(dbPath, {
      query: "SwftUI navigaton",
      kinds: ["session"],
    });
    assert.match(aMd.text, /Did you mean: \*\*SwiftUI navigation\*\*/);
    console.log("  ok  both-terms-misspelled proposes a corpus-based correction");

    // B) Correctly spelled query: hits, and no suggestion noise.
    const b = await callSearch(dbPath, {
      query: "SwiftUI navigation",
      kinds: ["session"],
      format: "json",
    });
    assert.ok(b.json.total >= 1);
    assert.equal(b.json.did_you_mean, undefined);
    console.log("  ok  matching query gets no suggestion");

    // C) Gibberish with no near vocabulary: silence, not a fabricated guess.
    const c = await callSearch(dbPath, {
      query: "zzqx jkwv",
      kinds: ["session"],
      format: "json",
    });
    assert.equal(c.json.total, 0);
    assert.equal(c.json.did_you_mean, undefined);
    console.log("  ok  uncorrectable query stays silent (no fabrication)");

    console.log("[search-did-you-mean] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[search-did-you-mean] FAILED:", err);
  process.exit(1);
});
