/**
 * Deprecation backfill — enriches existing apple_docs rows with:
 *   - deprecated (0/1)
 *   - introduced_at (e.g. "iOS 13.0")
 *   - deprecated_at (e.g. "iOS 14.0")
 *   - deprecated_message (prose summary of the deprecation reason)
 *   - deprecated_checked_at (when the check ran — the processed marker)
 *
 * Fetches the DocC JSON for each unchecked doc and extracts platform
 * availability metadata with the shared parser (src/ingest/availability.ts),
 * the same parser the base docs ingest applies at crawl time. This pass is
 * the repair path for rows indexed before that parsing existed.
 *
 * TL-194: the processed state is the explicit `deprecated_checked_at`
 * marker. The previous queue selected `deprecated IS NULL`, but the
 * schema default is 0 and the base upsert never wrote NULL — so no real
 * row was ever eligible and the enrichment silently never ran.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import pLimit from "p-limit";
import { APPLE_DOCS_JSON, REQUEST_CONCURRENCY } from "../constants.js";
import { httpGet, HttpError } from "../services/http.js";
import { recordIngest } from "../db/queries.js";
import {
  parseAvailability,
  type AvailabilitySource,
} from "./availability.js";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function docUrlToDataUrl(url: string): string | null {
  // url like https://developer.apple.com/documentation/uikit/uiwebview
  const m = url.match(/developer\.apple\.com\/documentation\/(.+)$/i);
  if (!m) return null;
  const path = m[1]!.replace(/\/$/, "").toLowerCase();
  return `${APPLE_DOCS_JSON}/${path}.json`;
}

const BATCH_SIZE = 20;

/**
 * Rows whose deprecation state has never been checked. Falls back to the
 * legacy `deprecated IS NULL` predicate only when the marker column does
 * not exist yet (a database migrate() has not touched).
 */
export function selectUncheckedDocs(
  db: DatabaseType,
  limit: number,
): { id: string; url: string }[] {
  const hasMarker = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM pragma_table_info('apple_docs') WHERE name = 'deprecated_checked_at'`,
      )
      .get() as { c: number }
  ).c > 0;
  const predicate = hasMarker
    ? "deprecated_checked_at IS NULL"
    : "deprecated IS NULL";
  return db
    .prepare<[number], { id: string; url: string }>(
      `SELECT id, url FROM apple_docs WHERE ${predicate} AND url IS NOT NULL LIMIT ?`,
    )
    .all(limit);
}

export async function backfillDeprecations(
  db: DatabaseType,
  batchLimit = 5000,
): Promise<{ updated: number; deprecated: number; errors: number; examined: number }> {
  let updated = 0;
  let deprecated = 0;
  let errors = 0;
  const limit = pLimit(REQUEST_CONCURRENCY);

  const updateStmt = db.prepare(`
    UPDATE apple_docs
    SET deprecated=@deprecated,
        introduced_at=@introducedAt,
        deprecated_at=@deprecatedAt,
        deprecated_message=@deprecatedMessage,
        deprecated_checked_at=@checkedAt
    WHERE id=@id
  `);

  const rows = selectUncheckedDocs(db, batchLimit);
  const examined = rows.length;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((row) =>
        limit(async () => {
          const dataUrl = docUrlToDataUrl(row.url);
          if (!dataUrl) return;

          let doc: AvailabilitySource | null = null;
          let gone = false;
          try {
            const { data, status } = await httpGet<AvailabilitySource>(dataUrl);
            if (status === 404) gone = true;
            else doc = data && typeof data === "object" ? data : null;
          } catch (e) {
            if (e instanceof HttpError && e.status === 404) gone = true;
            else {
              errors++;
              return;
            }
          }

          // A 404 means the page is gone: the check was performed and
          // found nothing — record it as checked (not deprecated) so the
          // row does not re-enter the queue forever.
          if (!doc && !gone) return;

          const parsed = doc
            ? parseAvailability(doc)
            : { deprecated: false, introducedAt: null, deprecatedAt: null, deprecatedMessage: null };

          try {
            updateStmt.run({
              id: row.id,
              deprecated: parsed.deprecated ? 1 : 0,
              introducedAt: parsed.introducedAt,
              deprecatedAt: parsed.deprecatedAt,
              deprecatedMessage: parsed.deprecatedMessage,
              checkedAt: new Date().toISOString(),
            });
            updated++;
            if (parsed.deprecated) deprecated++;
          } catch {
            errors++;
          }
        })
      )
    );

    if (i + BATCH_SIZE < rows.length) {
      await delay(300);
    }
  }

  recordIngest(
    db,
    "deprecation-backfill",
    updated,
    errors,
    `rows checked: ${examined}, updated: ${updated}, deprecated: ${deprecated}`,
  );
  return { updated, deprecated, errors, examined };
}
