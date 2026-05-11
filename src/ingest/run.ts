#!/usr/bin/env node
/**
 * Ingest orchestrator. Invoked via `npm run ingest -- --source <wwdc|tutorials|pathways|hig|evolution|all>`
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

    console.log("[ingest] Rebuilding FTS…");
    rebuildFts(db);
  } finally {
    db.close();
  }

  console.log("[ingest] Done:", results);
}

main().catch((e) => { console.error("[ingest] fatal:", e); process.exit(1); });
