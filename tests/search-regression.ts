#!/usr/bin/env tsx
/**
 * Regression tests for the 2026-09-24 search fix:
 *  - FTS sync triggers keep sessions_fts in step with sessions on INSERT/UPDATE/DELETE
 *  - multi-word search uses per-token quoting (implicit AND), not one exact phrase
 *  - explicit user "phrases" are preserved verbatim
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { openDb, migrate } from "../src/db/schema.js";
import { upsertSession, searchSessionsFts } from "../src/db/queries.js";
import { ftsQuote } from "../src/tools/index.js";
import type { WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  // Use TMPDIR to avoid filling the 512M /tmp tmpfs shared in this container.
  const tmp = path.join(process.env.TMPDIR ?? "/tmp", `wwdc-search-regression-${process.pid}.db`);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const db = openDb(tmp);
  migrate(db);

  const hits = (q: string, limit = 10) =>
    searchSessionsFts(db, ftsQuote(q), limit, 0).hits;

  const base: WwdcSession = {
    id: "wwdc2024-10203",
    year: 2024,
    sessionNumber: "10203",
    title: "Meet AccessorySetupKit",
    description: "Elevate your accessory setup experience with AccessorySetupKit for Bluetooth pairing.",
    url: "https://developer.apple.com/videos/play/wwdc2024/10203/",
    topics: ["Bluetooth"],
    platforms: ["iOS"],
    sampleCodeUrls: [],
    relatedDocs: [],
  };

  // 1. Incremental INSERT sync: newly inserted session is searchable immediately.
  upsertSession(db, base);
  assert.ok(hits("AccessorySetupKit").some((h) => h.id === base.id), "insert must sync FTS");
  console.log("  ok  FTS index syncs on INSERT");

  // 2. Multi-word search: implicit AND, not one exact phrase.
  assert.ok(
    hits("Bluetooth pairing").some((h) => h.id === base.id),
    "multi-word search must return hits",
  );
  assert.equal(
    ftsQuote("Bluetooth pairing"),
    '"Bluetooth" "pairing"',
    "tokens must be individually quoted",
  );
  console.log("  ok  multi-word search uses per-token quoting");

  // 3. Explicit quoted phrases are preserved verbatim.
  const phraseId = "wwdc2024-99999";
  upsertSession(db, {
    ...base,
    id: phraseId,
    sessionNumber: "99999",
    title: "Pair your e-bike computer",
    description: "Companion app pairing flow.",
    url: "https://developer.apple.com/videos/play/wwdc2024/99999/",
  });
  assert.ok(hits('"e-bike computer"').some((h) => h.id === phraseId), "explicit phrase must match");
  assert.equal(hits('"computer e-bike"').length, 0, "reordered words must not match a phrase");
  console.log("  ok  explicit quoted phrases preserved");

  // 4. Incremental UPDATE sync: changed terms indexed, stale terms removed.
  upsertSession(db, { ...base, description: "Now about Wi-Fi onboarding instead." });
  assert.ok(hits("onboarding").some((h) => h.id === base.id), "updated terms must be indexed");
  // "pairing" appeared only in the old description (topics still hold "Bluetooth"),
  // so it must be gone from the index after the update.
  assert.ok(!hits("pairing").some((h) => h.id === base.id), "stale terms must be dropped");
  console.log("  ok  FTS index syncs on UPDATE");

  // 5. Incremental DELETE sync.
  db.prepare("DELETE FROM sessions WHERE id = ?").run(base.id);
  assert.ok(
    !hits("AccessorySetupKit").some((h) => h.id === base.id),
    "deleted session must leave the index",
  );
  console.log("  ok  FTS index syncs on DELETE");

  db.close();
  fs.unlinkSync(tmp);
  console.log("[search-regression] all regression tests passed");
}

main().catch((e) => {
  console.error("[search-regression] FAIL", e);
  process.exit(1);
});
