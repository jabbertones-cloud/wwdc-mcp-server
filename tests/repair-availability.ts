/**
 * TL-194 repair-path regression: re-deriving availability fields from
 * archived raw_json fixes parser-era defects without a network refetch,
 * and the re-stamp is granted only on a provably complete prior refresh.
 *
 * Run: tsx tests/repair-availability.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { migrate } from "../src/db/schema.js";
import { recordIngest, upsertAppleDoc } from "../src/db/queries.js";
import { getLatestCorpusVersion, hashCorpusContent, recordCorpusVersion } from "../src/db/corpus.js";
import { repairAvailability } from "../src/ingest/repair-availability.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(here, "fixtures", "docc-uigraphicsbeginimagecontext.json"), "utf8"),
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const SOURCES = ["wwdc", "tutorials", "pathways", "hig", "evolution", "docs", "swiftbook", "appstore"];

function seededDb(badSource: string | null) {
  const db = new Database(":memory:");
  migrate(db);
  for (const s of SOURCES) {
    recordIngest(db, s as never, 10, s === badSource ? 3 : 0);
  }
  recordCorpusVersion(db, "all", "0.2.1");
  // The TL-194 corpus defect, verbatim shape: deprecated parsed, but the
  // message lost its reference node ("Use  instead.").
  upsertAppleDoc(db, {
    id: "uikit/uigraphicsbeginimagecontext(_:)",
    title: "UIGraphicsBeginImageContext(_:)",
    url: "https://developer.apple.com/documentation/uikit/uigraphicsbeginimagecontext(_:)",
    rawJson: JSON.stringify(FIXTURE),
    updatedAt: new Date().toISOString(),
    deprecated: 1,
    introducedAt: "1.0",
    deprecatedAt: "27.0",
    deprecatedMessage: "Use  instead.",
    deprecatedCheckedAt: new Date().toISOString(),
  });
  return db;
}

check("repair: reference-node message re-derived from raw_json; complete prior refresh re-stamps", () => {
  const db = seededDb(null);
  const r = repairAvailability(db);
  assert.equal(r.examined, 1);
  assert.equal(r.changed, 1);
  assert.equal(r.unparseable, 0);
  assert.equal(r.stamped, true);
  const row = db
    .prepare("SELECT deprecated_message FROM apple_docs WHERE id LIKE 'uikit/uigraphics%'")
    .get() as { deprecated_message: string };
  assert.equal(row.deprecated_message, "Use UIGraphicsImageRenderer instead.");
  const stamp = getLatestCorpusVersion(db);
  assert.equal(stamp?.ingestSource, "all");
  assert.equal(stamp?.contentSha256, hashCorpusContent(db));
  db.close();
});

check("repair: an errored source in the prior refresh refuses the stamp", () => {
  const db = seededDb("docs");
  const r = repairAvailability(db);
  assert.equal(r.changed, 1); // fields still repaired
  assert.equal(r.stamped, false); // but no deployable stamp is claimed
  assert.ok(r.stampReason.includes("docs"));
  db.close();
});

check("repair: a second run is a no-op (idempotent)", () => {
  const db = seededDb(null);
  repairAvailability(db);
  const r2 = repairAvailability(db);
  assert.equal(r2.changed, 0);
  assert.equal(r2.stamped, true);
  db.close();
});

console.log(`\nrepair-availability: ${passed} checks passed`);
