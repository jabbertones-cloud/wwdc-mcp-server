#!/usr/bin/env tsx
/**
 * Corpus-version stamping tests (src/db/corpus.ts): a stamp snapshots the
 * ingest date, per-source status, session count, and per-table counts;
 * getLatestCorpusVersion reads back the newest stamp. Offline temp DB.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { openDb, migrate } from "../src/db/schema.js";
import { recordIngest } from "../src/db/queries.js";
import {
  recordCorpusVersion,
  getLatestCorpusVersion,
} from "../src/db/corpus.js";

function insertSession(
  db: ReturnType<typeof openDb>,
  id: string,
  year: number,
): void {
  db.prepare(
    `INSERT INTO sessions (id, year, session_number, title, url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, year, id, `Session ${id}`, `https://example.invalid/${id}`, new Date().toISOString());
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-corpus-test-"));
  const db = openDb(path.join(dir, "test.db"));
  try {
    migrate(db);

    assert.equal(
      getLatestCorpusVersion(db),
      null,
      "no stamp exists before the first ingest",
    );
    console.log("  ok  unstamped corpus reports null, not a fabricated version");

    insertSession(db, "wwdc2024-101", 2024);
    insertSession(db, "wwdc2025-202", 2025);
    recordIngest(db, "wwdc", 2, 0);
    recordIngest(db, "hig", 0, 1, undefined, false);

    const stamp = recordCorpusVersion(db, "all", "0.2.1");
    assert.equal(stamp.sessionCount, 2);
    assert.equal(stamp.totalItems, 2, "total counts every indexed item (sessions only here)");
    assert.equal(stamp.counts.sessions, 2);
    assert.equal(stamp.wwdcYears, "2024–2025");
    assert.equal(stamp.version, stamp.ingestedAt, "version is the ingest timestamp");
    assert.equal(stamp.sources.wwdc?.itemsIngested, 2);
    assert.equal(stamp.sources.wwdc?.errors, 0);
    assert.ok(stamp.sources.wwdc?.lastSuccessAt, "successful source carries a success time");
    assert.equal(stamp.sources.hig?.lastSuccessAt, null, "failed source has no success time");
    assert.equal(stamp.sources.hig?.errors, 1);
    assert.equal(stamp.serverVersion, "0.2.1");
    console.log("  ok  stamp captures date, sources, session count, and totals");

    const latest = getLatestCorpusVersion(db);
    assert.ok(latest, "latest stamp is readable after recording");
    assert.equal(latest.stampId, stamp.stampId);
    assert.equal(latest.sessionCount, 2);
    assert.deepEqual(latest.counts, stamp.counts);
    assert.deepEqual(latest.sources, stamp.sources);
    console.log("  ok  latest stamp round-trips through the database");

    insertSession(db, "wwdc2026-303", 2026);
    const stamp2 = recordCorpusVersion(db, "wwdc", "0.2.1");
    const latest2 = getLatestCorpusVersion(db);
    assert.equal(latest2?.stampId, stamp2.stampId, "newest stamp wins");
    assert.equal(latest2?.sessionCount, 3);
    assert.equal(latest2?.wwdcYears, "2024–2026");
    assert.equal(latest2?.ingestSource, "wwdc", "stamp records which source ran");
    console.log("  ok  a later ingest replaces the reported version");

    console.log("[corpus-version] all tests passed");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("[corpus-version] FAIL", e);
  process.exit(1);
});
