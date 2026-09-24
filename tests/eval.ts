#!/usr/bin/env tsx
/**
 * Lightweight retrieval eval for local CI/dev.
 *
 * Keep this deterministic: it uses the same seeded MCP harness as mcp-e2e and
 * checks audit-oriented behavior instead of live Apple endpoints.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import {
  upsertSession,
  upsertHig,
  upsertEvolution,
  recordIngest,
} from "../src/db/queries.js";
import type { HigEntry, SwiftEvolutionProposal, WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function seedEvalDb(dbPath: string): void {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  migrate(db);
  const now = new Date().toISOString();

  const session: WwdcSession = {
    id: "wwdc2024-10150",
    year: 2024,
    sessionNumber: "10150",
    title: "SwiftUI essentials",
    description: "Learn SwiftUI navigation, state, and app structure across Apple platforms.",
    url: "https://developer.apple.com/videos/play/wwdc2024/10150/",
    duration: 1700,
    topics: ["SwiftUI", "Navigation"],
    platforms: ["iOS", "macOS", "visionOS"],
    speakers: ["Taylor Kelly"],
    transcript: "NavigationStack and SwiftUI state make app navigation predictable.",
    sampleCodeUrls: [],
    relatedDocs: ["https://developer.apple.com/documentation/swiftui"],
    deepLinks: [],
    updatedAt: now,
  };
  upsertSession(db, session);

  const hig: HigEntry = {
    id: "navigation",
    title: "Navigation",
    platform: ["iOS", "macOS", "visionOS"],
    category: "patterns",
    summary: "Navigation helps people move through app structure.",
    body: "Use platform-appropriate navigation patterns.",
    url: "https://developer.apple.com/design/human-interface-guidelines/navigation",
    updatedAt: now,
  };
  upsertHig(db, hig);

  const evolution: SwiftEvolutionProposal = {
    id: "SE-0395",
    number: 395,
    title: "Observability",
    status: "Implemented",
    authors: ["Apple"],
    body: "Observation supports SwiftUI state updates.",
    implementation: [],
    url: "https://github.com/apple/swift-evolution/blob/main/proposals/0395-observability.md",
    updatedAt: now,
  };
  upsertEvolution(db, evolution);

  recordIngest(db, "wwdc", 1, 0, "eval");
  recordIngest(db, "hig", 1, 0, "eval");
  recordIngest(db, "evolution", 1, 0, "eval");
  rebuildFts(db);
  db.close();
}

function textOf(result: { content?: Array<{ text?: string }> }): string {
  return (result.content ?? []).map((content) => content.text ?? "").join("\n");
}

async function main(): Promise<void> {
  const dbPath = path.join(process.env.TMPDIR ?? "/tmp", `wwdc-eval-${process.pid}.db`);
  seedEvalDb(dbPath);

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(ROOT, "dist", "index.js")],
    env: {
      ...process.env as Record<string, string>,
      WWDC_MCP_DB: dbPath,
      OLLAMA_BASE: "http://127.0.0.1:1",
    },
    stderr: "ignore",
  });
  const client = new Client({ name: "wwdc-eval", version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);

  try {
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "swift_app_audit"), "swift_app_audit exists");

    const audit = await client.callTool({
      name: "swift_app_audit",
      arguments: {
        focus: "navigation",
        platforms: ["macOS"],
        frameworks: ["SwiftUI"],
        feature: "NavigationStack",
        year_min: 2024,
        format: "json",
      },
    }) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!audit.isError, "swift_app_audit succeeds");
    const data = JSON.parse(textOf(audit));
    assert.ok(data.results.sessions.some((hit: any) => hit.id === "wwdc2024-10150"), "relevant session");
    assert.ok(data.results.hig.some((hit: any) => hit.id === "navigation"), "relevant HIG");
    assert.ok(data.summary.next_tools.includes("wwdc_get_session"), "actionable next tool");

    console.log("[eval] swift audit retrieval eval passed");
  } finally {
    await client.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().catch((error) => {
  console.error("[eval] FAIL", error);
  process.exit(1);
});
