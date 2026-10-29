#!/usr/bin/env tsx
/** Live test: ingest 3 sessions from WWDC 2024 and query them. */
import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import { discoverSessionsForYear, parseSessionPage } from "../src/ingest/wwdc.js";
import { upsertSession, listYears, searchSessionsFts } from "../src/db/queries.js";
import { httpGet } from "../src/services/http.js";

async function main(): Promise<void> {
  const dbPath = "/tmp/wwdc-live.db";
  const db = openDb(dbPath);
  migrate(db);

  const sessions = await discoverSessionsForYear(2024);
  console.log(`discovered 2024: ${sessions.length} sessions`);

  let ok = 0;
  for (const info of sessions.slice(0, 3)) {
    try {
      const { data } = await httpGet<string>(info.url, { transformResponse: (x) => x });
      const html = typeof data === "string" ? data : String(data);
      const s = parseSessionPage(html, info);
      upsertSession(db, s);
      console.log(`  ingested: ${s.id} — ${s.title.slice(0, 70)}`);
      ok++;
    } catch (e: any) {
      console.error(`  err ${info.url}: ${e?.message ?? e}`);
    }
  }
  rebuildFts(db);

  console.log("years:", listYears(db));
  const hits = searchSessionsFts(db, '"apple"', 5, 0);
  console.log(`search 'apple': ${hits.hits.length} hits`);
  if (hits.hits[0]) console.log("  top:", hits.hits[0].title);

  db.close();
  if (ok === 0) { console.error("NO SESSIONS INGESTED"); process.exit(1); }
  console.log(`ingested ${ok}/3 sessions — live pipeline works`);
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
