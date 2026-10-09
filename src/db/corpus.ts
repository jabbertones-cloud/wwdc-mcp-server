/**
 * Corpus-version stamping.
 *
 * Every completed ingest run records one stamp: when it ran, which ingest
 * source produced it, the per-source ingest status at that moment, and how
 * much content the corpus held (session count + per-table counts).
 *
 * The latest stamp is the answer to "which corpus is this?" — it is
 * reported by `wwdc_ingest_status` and can be compared against
 * `scripts/verify-corpus.ts` output (integrity + sha256) for deploy proof.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { createHash } from "node:crypto";

/** Content tables whose row counts describe corpus coverage. */
export const CORPUS_CONTENT_TABLES = [
  "sessions",
  "tutorials",
  "pathways",
  "hig_entries",
  "evolution",
  "apple_docs",
  "swift_book",
  "appstore_guidelines",
  "sample_code",
  "release_notes",
  "swift_forum_posts",
  "apple_dev_forum_posts",
] as const;

export interface CorpusSourceStamp {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  itemsIngested: number;
  errors: number;
}

export interface CorpusVersion {
  stampId: number;
  /** Stable SHA-256 of the indexed content rows, independent of ingest wall clock. */
  contentSha256: string;
  /** Corpus identity: the ingest-completion timestamp. Sortable, unique per run. */
  version: string;
  ingestedAt: string;
  /** The `ingest --source` argument whose run produced this stamp. */
  ingestSource: string;
  sessionCount: number;
  totalItems: number;
  /** e.g. "2020–2026"; null when no sessions are indexed. */
  wwdcYears: string | null;
  counts: Record<string, number>;
  sources: Record<string, CorpusSourceStamp>;
  serverVersion: string | null;
}

/** Deterministic logical-content digest; excludes version rows and SQLite WAL layout. */
export function hashCorpusContent(db: DatabaseType): string {
  const hash = createHash("sha256");
  for (const table of CORPUS_CONTENT_TABLES) {
    hash.update("\nTABLE:" + table + "\n");
    // Compile-time table names only; id is the content-table stable primary key.
    for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY id`).iterate() as Iterable<Record<string, unknown>>) {
      hash.update("ROW\n");
      for (const [field, value] of Object.entries(row)) {
        hash.update(field + ":");
        if (Buffer.isBuffer(value)) hash.update(value);
        else hash.update(JSON.stringify(value ?? null));
        hash.update("\n");
      }
    }
  }
  return hash.digest("hex");
}

/**
 * Snapshot the corpus as it stands and append a stamp row.
 * Call once per ingest run, after the FTS rebuild, while the DB is open.
 */
export function recordCorpusVersion(
  db: DatabaseType,
  ingestSource: string,
  serverVersion?: string,
): CorpusVersion {
  const ingestedAt = new Date().toISOString();

  // Table names are compile-time constants (CORPUS_CONTENT_TABLES), never
  // caller input, so interpolating them into COUNT queries is safe.
  const counts: Record<string, number> = {};
  let totalItems = 0;
  for (const table of CORPUS_CONTENT_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
    totalItems += row.n;
  }
  const sessionCount = counts.sessions ?? 0;

  const yearRow = db
    .prepare(`SELECT MIN(year) AS lo, MAX(year) AS hi FROM sessions`)
    .get() as { lo: number | null; hi: number | null };
  const wwdcYears =
    yearRow.lo !== null && yearRow.hi !== null ? `${yearRow.lo}–${yearRow.hi}` : null;

  const sources: Record<string, CorpusSourceStamp> = {};
  const statusRows = db
    .prepare(`SELECT * FROM ingest_status ORDER BY source`)
    .all() as any[];
  for (const r of statusRows) {
    sources[r.source] = {
      lastRunAt: r.last_run_at ?? null,
      lastSuccessAt: r.last_success_at ?? null,
      itemsIngested: r.items_ingested,
      errors: r.errors,
    };
  }

  const contentSha256 = hashCorpusContent(db);
  const version = contentSha256;
  const info = db
    .prepare(
      `
      INSERT INTO corpus_versions
        (version, ingested_at, ingest_source, session_count, total_items,
         wwdc_years, counts, sources, server_version, content_sha256)
      VALUES
        (@version, @ingested_at, @ingest_source, @session_count, @total_items,
         @wwdc_years, @counts, @sources, @server_version, @content_sha256)
      `,
    )
    .run({
      version,
      content_sha256: contentSha256,
      ingested_at: ingestedAt,
      ingest_source: ingestSource,
      session_count: sessionCount,
      total_items: totalItems,
      wwdc_years: wwdcYears,
      counts: JSON.stringify(counts),
      sources: JSON.stringify(sources),
      server_version: serverVersion ?? null,
    });

  return {
    stampId: Number(info.lastInsertRowid),
    contentSha256,
    version,
    ingestedAt,
    ingestSource,
    sessionCount,
    totalItems,
    wwdcYears,
    counts,
    sources,
    serverVersion: serverVersion ?? null,
  };
}

/** The newest stamp, or null when no ingest run has ever stamped. */
export function getLatestCorpusVersion(db: DatabaseType): CorpusVersion | null {
  const row = db
    .prepare(`SELECT * FROM corpus_versions ORDER BY id DESC LIMIT 1`)
    .get() as any;
  if (!row) return null;
  return {
    stampId: row.id,
    contentSha256: row.content_sha256 ?? row.version,
    version: row.version,
    ingestedAt: row.ingested_at,
    ingestSource: row.ingest_source,
    sessionCount: row.session_count,
    totalItems: row.total_items,
    wwdcYears: row.wwdc_years ?? null,
    counts: JSON.parse(row.counts) as Record<string, number>,
    sources: JSON.parse(row.sources) as Record<string, CorpusSourceStamp>,
    serverVersion: row.server_version ?? null,
  };
}
