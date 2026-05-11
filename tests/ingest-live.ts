#!/usr/bin/env tsx
/**
 * Live ingest pipeline test — exercises every source (wwdc/tutorials/hig/evolution/pathways)
 * against the real Apple + GitHub endpoints, but tiny slices so we don't DoS anyone.
 *
 * Uses a disposable /tmp DB. Intended for manual verification only — NOT run in smoke.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import { discoverSessionsForYear, ingestWwdc } from "../src/ingest/wwdc.js";
import { ingestTutorials } from "../src/ingest/tutorials.js";
import { ingestHig } from "../src/ingest/hig.js";
import { ingestEvolution } from "../src/ingest/evolution.js";
import { ingestPathways } from "../src/ingest/pathways.js";
import {
  listYears, listTopics, getEvolution, listPathways, getTutorial,
  searchHigFts, searchSessionsFts,
} from "../src/db/queries.js";

async function main(): Promise<void> {
  const dbPath = path.join(process.env.TMPDIR ?? "/tmp", `wwdc-live-${process.pid}.db`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  migrate(db);

  // ── 1) WWDC ingest (tiny slice: 3 discovered sessions) ───────────────────
  console.log("[live] 1/5 WWDC sessions (year=2024, 3 sessions)");
  const discovered = await discoverSessionsForYear(2024);
  assert.ok(discovered.length > 50, `expected many WWDC 2024 sessions, got ${discovered.length}`);
  // ingest only the first 3 to keep the test fast
  const { ingestWwdc: _ } = { ingestWwdc };
  const patchedYears = [2024] as const;
  const origFetch = (globalThis as any).fetch;
  // NB: the ingestWwdc iterates all sessions; limit via the `--year` arg isn't enough.
  // Instead we'll call the pipeline with a monkey-patched discovered list by directly
  // exercising the full helper with a single year and trust that it's the same code path.
  // For speed, we skip the pipeline and call the session path fetcher directly:
  const { parseSessionPage } = await import("../src/ingest/wwdc.js");
  const { upsertSession, upsertSampleCode } = await import("../src/db/queries.js");
  const { httpGet } = await import("../src/services/http.js");
  const slice = discovered.slice(0, 3);
  let wwdcIngested = 0;
  let totalChapters = 0;
  for (const info of slice) {
    const { data } = await httpGet<string>(info.url, { transformResponse: (x) => x });
    const html = typeof data === "string" ? data : String(data);
    const s = parseSessionPage(html, info);
    upsertSession(db, s);
    for (const url of s.sampleCodeUrls) {
      upsertSampleCode(db, {
        id: `${s.id}::${url.length}`, sessionId: s.id, title: `${s.title} sample`, url,
        kind: /\.zip$/i.test(url) ? "zip" : /github\.com/.test(url) ? "repo" : "snippet",
      });
    }
    wwdcIngested++;
    totalChapters += s.deepLinks.length;
    // BUG #1 GUARD: live-title should no longer contain the SEO suffix.
    assert.ok(!/\bApple\s+Developer\s*$/i.test(s.title), `SEO suffix leaked into title: ${s.title!}`);
    assert.ok(!/\-\s*WWDC\d{2,4}\b/i.test(s.title), `WWDC-year marker leaked into title: ${s.title!}`);
    // BUG #2 GUARD: deep-link extraction from 2024+ supplement <li> format
    for (const dl of s.deepLinks) {
      assert.ok(dl.url.includes(`?time=${dl.seconds}`), `deep-link url missing time param: ${dl.url}`);
      assert.ok(dl.label && dl.label.length <= 120, `bad chapter label: "${dl.label}"`);
      assert.ok(!/[{}]/.test(dl.label), `code-like content leaked into chapter label: "${dl.label}"`);
    }
  }
  assert.equal(wwdcIngested, 3, "3 WWDC sessions ingested");
  assert.ok(totalChapters >= 3, `expected at least 3 chapters across 3 sessions, got ${totalChapters}`);
  console.log(`[live] WWDC chapters extracted: ${totalChapters}`);
  const years = listYears(db);
  assert.ok(years.find((y) => y.year === 2024), "year 2024 present");

  // ── 2) Tutorials ingest (only the swiftui seed, to stay fast) ─────────────
  console.log("[live] 2/5 Tutorials (seed=swiftui only)");
  const tRes = await ingestTutorials(db, ["swiftui"] as const);
  assert.ok(tRes.ingested >= 1, `tutorials ingested ${tRes.ingested}`);
  const tut = getTutorial(db, "swiftui");
  assert.ok(tut, "swiftui tutorial stored");
  assert.ok(tut!.title.length > 0, "tutorial has title");

  // ── 3) HIG ingest (seed=buttons-ish minimal via 'components') ─────────────
  console.log("[live] 3/5 HIG (seed=components)");
  const hRes = await ingestHig(db, ["components"] as const);
  assert.ok(hRes.ingested >= 1, `HIG ingested ${hRes.ingested}`);
  // Rebuild FTS so HIG search works
  rebuildFts(db);
  const hFts = searchHigFts(db, `"components"`, 5, 0);
  assert.ok(hFts.hits.length >= 1, "HIG FTS finds 'components'");

  // ── 4) Swift Evolution ingest (limit=5 most recent) ──────────────────────
  console.log("[live] 4/5 Swift Evolution (last 5)");
  const eRes = await ingestEvolution(db, 5);
  assert.ok(eRes.ingested >= 1, `evolution ingested ${eRes.ingested}`);
  // Pick any proposal we ingested
  // We don't know the exact id, so just assert some SE- row exists
  const anyProp = db.prepare("SELECT id FROM evolution LIMIT 1").get() as { id: string } | undefined;
  assert.ok(anyProp?.id?.startsWith("SE-"), "at least one SE-XXXX proposal");
  const loaded = getEvolution(db, anyProp!.id);
  assert.ok(loaded, "proposal loadable");

  // ── 5) Pathways ingest (derives from tutorials + seeds curated) ──────────
  console.log("[live] 5/5 Pathways");
  const pRes = await ingestPathways(db);
  assert.ok(pRes.ingested >= 4, `pathways ingested ${pRes.ingested}`);
  const pw = listPathways(db);
  assert.ok(pw.find((p) => p.id === "ship-with-swift-6"), "curated pathway present");
  assert.ok(pw.find((p) => p.id === "swiftui-fundamentals"), "swiftui pathway present");

  // Final rebuild + search smoke
  rebuildFts(db);
  const sFts = searchSessionsFts(db, `"apple"`, 5, 0);
  assert.ok(sFts.hits.length >= 1, "session FTS works after live ingest");

  // Topics should include at least one WWDC-sourced tag
  const topics = listTopics(db);
  console.log(`[live] topics discovered: ${topics.slice(0, 5).map((t) => t.topic).join(", ")}`);

  db.close();
  fs.unlinkSync(dbPath);
  console.log(`[ingest-live] ok — wwdc=${wwdcIngested}, tutorials=${tRes.ingested}, hig=${hRes.ingested}, evolution=${eRes.ingested}, pathways=${pRes.ingested}`);
}

main().catch((e) => { console.error("[ingest-live] FAIL", e); process.exit(1); });
