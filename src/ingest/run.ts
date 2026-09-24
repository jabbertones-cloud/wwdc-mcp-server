#!/usr/bin/env node
/**
 * Ingest orchestrator. Invoked via `npm run ingest -- --source <wwdc|tutorials|pathways|hig|evolution|docs|all>`
 */

import fs from "node:fs";
import path from "node:path";
import { DB_PATH, DATA_DIR, WWDC_YEARS } from "../constants.js";
import { openDb, migrate, rebuildFts } from "../db/schema.js";
import { ingestWwdc } from "./wwdc.js";
import { ingestTutorials } from "./tutorials.js";
import { ingestPathways } from "./pathways.js";
import { ingestHig } from "./hig.js";
import { ingestEvolution } from "./evolution.js";
import { ingestAppleDocs } from "./docs.js";
import { ingestSwiftBook } from "./swiftbook.js";
import { ingestAppStoreGuidelines } from "./appstore.js";
import { ingestReleaseNotes } from "./release-notes.js";
import { backfillDeprecations } from "./deprecation-backfill.js";
import { ingestSwiftForums } from "./swift-forums.js";
import { ingestAppleDevForums } from "./apple-dev-forums.js";
import { extractSessionSummaries } from "./session-summaries.js";
import { buildCrossReferenceGraph } from "./cross-reference-graph.js";
import { exportDeprecationQA } from "../export/deprecation-qa.js";

interface Args { source: string; years?: number[]; limit?: number; }

function parseArgs(argv: string[]): Args {
  const args: Args = { source: "all" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source" && argv[i + 1]) { args.source = argv[++i]!; continue; }
    if (a === "--year" && argv[i + 1]) { (args.years ??= []).push(parseInt(argv[++i]!, 10)); continue; }
    if (a === "--limit" && argv[i + 1]) { args.limit = parseInt(argv[++i]!, 10); continue; }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = openDb(DB_PATH);
  migrate(db);

  const years = args.years ?? [...WWDC_YEARS];
  console.log(`[ingest] db=${DB_PATH} source=${args.source} years=${years.join(",")}`);

  const results: Record<string, { ingested: number; errors: number }> = {};

  try {
    if (args.source === "wwdc" || args.source === "all") {
      console.log("[ingest] WWDC sessions…");
      results.wwdc = await ingestWwdc(db, years);
      console.log("  →", results.wwdc);
    }
    if (args.source === "tutorials" || args.source === "all") {
      console.log("[ingest] Tutorials…");
      results.tutorials = await ingestTutorials(db);
      console.log("  →", results.tutorials);
    }
    if (args.source === "pathways" || args.source === "all") {
      console.log("[ingest] Pathways…");
      results.pathways = await ingestPathways(db);
      console.log("  →", results.pathways);
    }
    if (args.source === "hig" || args.source === "all") {
      console.log("[ingest] HIG…");
      results.hig = await ingestHig(db);
      console.log("  →", results.hig);
    }
    if (args.source === "evolution" || args.source === "all") {
      console.log("[ingest] Swift Evolution…");
      results.evolution = await ingestEvolution(db, args.limit);
      console.log("  →", results.evolution);
    }
    if (args.source === "docs" || args.source === "all") {
      console.log("[ingest] Apple documentation…");
      results.docs = await ingestAppleDocs(db);
      console.log("  →", results.docs);
    }
    if (args.source === "swiftbook" || args.source === "all") {
      console.log("[ingest] Swift Language Reference…");
      results.swiftbook = await ingestSwiftBook(db);
      console.log("  →", results.swiftbook);
    }
    if (args.source === "appstore" || args.source === "all") {
      console.log("[ingest] App Store Review Guidelines…");
      results.appstore = await ingestAppStoreGuidelines(db);
      console.log("  →", results.appstore);
    }
    if (args.source === "release-notes") {
      console.log("[ingest] Release Notes…");
      results["release-notes"] = await ingestReleaseNotes(db);
      console.log("  →", results["release-notes"]);
    }
    if (args.source === "deprecation-backfill") {
      console.log("[ingest] Deprecation backfill…");
      const r = await backfillDeprecations(db);
      results["deprecation-backfill"] = { ingested: r.updated, errors: r.errors };
      console.log("  →", r);
    }
    if (args.source === "swift-forums") {
      console.log("[ingest] Swift Forums…");
      results["swift-forums"] = await ingestSwiftForums(db);
      console.log("  →", results["swift-forums"]);
    }
    if (args.source === "apple-dev-forums") {
      console.log("[ingest] Apple Developer Forums…");
      results["apple-dev-forums"] = await ingestAppleDevForums(db);
      console.log("  →", results["apple-dev-forums"]);
    }
    if (args.source === "session-summaries") {
      console.log("[ingest] Session summaries (LLM)…");
      const r = await extractSessionSummaries(db, { maxSessions: args.limit ?? 50 });
      results["session-summaries"] = { ingested: r.processed, errors: r.errors };
      console.log("  →", r);
    }
    if (args.source === "cross-reference") {
      console.log("[ingest] Cross-reference graph…");
      const r = await buildCrossReferenceGraph(db);
      results["cross-reference"] = { ingested: r.edges, errors: 0 };
      console.log("  →", r);
    }
    if (args.source === "export-deprecation-qa") {
      console.log("[ingest] Export deprecation Q&A…");
      const r = await exportDeprecationQA(db);
      results["export-deprecation-qa"] = { ingested: r.exported, errors: 0 };
      console.log("  →", r);
    }

    console.log("[ingest] Rebuilding FTS…");
    rebuildFts(db);
  } finally {
    db.close();
  }

  console.log("[ingest] Done:", results);
}

main().catch((e) => { console.error("[ingest] fatal:", e); process.exit(1); });
