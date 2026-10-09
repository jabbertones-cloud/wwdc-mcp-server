import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";\nimport { getLatestCorpusVersion, hashCorpusContent, CORPUS_CONTENT_TABLES } from "../src/db/corpus.js";

const path = process.argv[2] ?? process.env.WWDC_MCP_DB ?? ".deploy-data/wwdc.db";\nconst requireAll = process.argv.includes("--require-all");
if (!fs.existsSync(path)) throw new Error(`corpus missing: ${path}`);
const db = new Database(path, { readonly: true });
const integrity = db.pragma("integrity_check", { simple: true });
if (integrity !== "ok") throw new Error(`integrity_check failed: ${integrity}`);

const years = db.prepare("select year,count(*) count from sessions group by year order by year").all() as Array<{year:number,count:number}>;
for (const year of [2020,2021,2022,2023,2024,2025,2026]) {
  if (!years.some(r => r.year === year && r.count > 0)) throw new Error(`missing WWDC year ${year}`);
}
const required: Array<[string,string]> = [
  ["sessions","sessions"],["tutorials","tutorials"],["hig_entries","hig"],
  ["evolution","evolution"],["apple_docs","docs"],["swift_book","swiftbook"],
  ["appstore_guidelines","appstore"]
];
for (const [table,label] of required) {
  const row = db.prepare(`select count(*) count from ${table}`).get() as {count:number};
  if (row.count < 1) throw new Error(`required corpus source empty: ${label}`);
}
const statuses = db.prepare("select source,items_ingested,errors,last_success_at,last_run_at from ingest_status order by source").all();
const stamp = getLatestCorpusVersion(db);
if (!stamp) throw new Error("missing version stamp: ingest not completed");
const digest = hashCorpusContent(db);
if (stamp.contentSha256 !== digest || stamp.version !== digest) {
  throw new Error("corpus version identity does not match persisted content");
}
if (requireAll) {
  if (stamp.ingestSource !== "all") throw new Error("last refresh did not cover all sources");
  const all = ["wwdc","tutorials","pathways","hig","evolution","docs","swiftbook","appstore"];
  for (const name of all) {
    const state = stamp.sources[name];
    if (!state || state.errors > 0 || state.itemsIngested < 1 || !state.lastSuccessAt)
      throw new Error("source is incomplete: " + name);
    if (!state.lastRunAt || Date.parse(state.lastRunAt) < Date.parse(stamp.ingestedAt) - 12 * 3600000)
      throw new Error("source not refreshed by this ingestion: " + name);
  }
  if (Date.now() - Date.parse(stamp.ingestedAt) > 8 * 86400000)
    throw new Error("corpus refresh is stale beyond 8 days");
}
const counts: Record<string, number> = {};
for (const table of CORPUS_CONTENT_TABLES) {
  counts[table] = Number((db.prepare("select count(*) n from " + table).get() as {n: number}).n);
}
db.close();
const hash = createHash("sha256").update(fs.readFileSync(path)).digest("hex");
console.log(JSON.stringify({ok:true,path,sha256:hash,corpusVersion:stamp.version,ingestedAt:stamp.ingestedAt,ingestSource:stamp.ingestSource,counts,years,statuses},null,2));
