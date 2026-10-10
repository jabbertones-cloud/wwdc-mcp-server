#!/usr/bin/env tsx
/**
 * wwdc_search year-filter honesty tests: year/year_min/year_max only filter
 * WWDC sessions, but the response used to echo the requested year in
 * `filters` for every kind, implying tutorials/docs/HIG/evolution were
 * year-filtered too. The response must now disclose applicability:
 * filters.year_applies_to = ["session"], plus a judgment caveat whenever a
 * year constraint is combined with any non-session kind.
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
import { upsertSession, upsertTutorial } from "../src/db/queries.js";
import type { WwdcSession, Tutorial } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const now = new Date().toISOString();

function session(id: string, year: number): WwdcSession {
  return {
    id,
    year,
    sessionNumber: id.split("-")[1] ?? "101",
    title: `SwiftUI session ${id}`,
    description: "Seeded session for search year-disclosure tests.",
    url: `https://developer.apple.com/videos/play/wwdc${year}/${id.split("-")[1] ?? "101"}/`,
    duration: 60,
    topics: ["SwiftUI"],
    platforms: ["iOS"],
    speakers: [],
    transcript: "SwiftUI lists and navigation fixture text.",
    sampleCodeUrls: [],
    relatedDocs: [],
    videoUrl: undefined,
    deepLinks: [],
    updatedAt: now,
  };
}

function seedDb(dbPath: string): void {
  const db = openDb(dbPath);
  migrate(db);
  upsertSession(db, session("wwdc2024-101", 2024));
  upsertSession(db, session("wwdc2024-102", 2024));
  upsertSession(db, session("wwdc2025-101", 2025));
  const tutorial: Tutorial = {
    metadata: { title: "SwiftUI tutorial fixture", category: "SwiftUI" },
    identifier: { url: "https://developer.apple.com/tutorials/swiftui" },
  } as Tutorial;
  upsertTutorial(
    db,
    "swiftui-fixture",
    tutorial,
    "SwiftUI tutorial body about lists and navigation.",
    "https://developer.apple.com/tutorials/swiftui",
  );
  db.close();
}

async function callSearch(
  dbPath: string,
  args: Record<string, unknown>,
): Promise<any> {
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
    { name: "search-year-disclosure", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_search",
      arguments: { format: "json", ...args },
    });
    assert.ok(!r.isError, "wwdc_search errored");
    return JSON.parse(r.content[0].text);
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-year-test-"));
  try {
    const dbPath = path.join(dir, "seeded.db");
    seedDb(dbPath);

    // A) Non-session kind + year: year must NOT silently filter; disclosure
    // must name that it applies to sessions only.
    const a = await callSearch(dbPath, {
      query: "SwiftUI",
      kinds: ["tutorial"],
      year: 2020,
    });
    assert.equal(a.total, 1, "tutorial results are not year-filtered");
    assert.deepEqual(a.filters.year_applies_to, ["session"]);
    assert.ok(
      (a.judgment?.caveats ?? []).some((c: string) =>
        c.includes("sessions only"),
      ),
      "judgment caveat names year-applies-to-sessions-only",
    );
    console.log("  ok  tutorial + year disclosed as sessions-only, unfiltered");

    // B) Sessions + year: the filter applies (2024 → 2 of 3 sessions).
    const b = await callSearch(dbPath, {
      query: "SwiftUI",
      kinds: ["session"],
      year: 2024,
    });
    assert.equal(b.total, 2, "year still filters sessions");
    assert.deepEqual(b.filters.year_applies_to, ["session"]);
    assert.ok(
      !(b.judgment?.caveats ?? []).some((c: string) =>
        c.includes("not filtered by year"),
      ),
      "no sessions-only caveat when only sessions are searched",
    );
    console.log("  ok  session + year still filters, no misleading caveat");

    // C) No year requested: filters shape is unchanged (no extra key).
    const c = await callSearch(dbPath, {
      query: "SwiftUI",
      kinds: ["tutorial"],
    });
    assert.equal(c.filters.year_applies_to, undefined);
    console.log("  ok  no year requested → filters shape unchanged");

    console.log("[search-year-disclosure] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[search-year-disclosure] FAILED:", err);
  process.exit(1);
});
