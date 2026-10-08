import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";

const path = process.argv[2] ?? process.env.WWDC_MCP_DB ?? ".deploy-data/wwdc.db";
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
const statuses = db.prepare("select source,items_ingested,errors,last_success_at from ingest_status order by source").all();
db.close();
const hash = createHash("sha256").update(fs.readFileSync(path)).digest("hex");
console.log(JSON.stringify({ok:true,path,sha256:hash,years,statuses},null,2));
