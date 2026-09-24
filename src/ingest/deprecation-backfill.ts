/**
 * Deprecation backfill — enriches existing apple_docs rows with:
 *   - deprecated (0/1)
 *   - introduced_at (e.g. "iOS 13.0")
 *   - deprecated_at (e.g. "iOS 14.0")
 *   - deprecated_message (prose summary of the deprecation reason)
 *
 * Fetches the DocC JSON for each doc and extracts platform availability metadata.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import pLimit from "p-limit";
import { APPLE_DOCS_JSON, REQUEST_CONCURRENCY } from "../constants.js";
import { httpGet, HttpError } from "../services/http.js";
import { recordIngest } from "../db/queries.js";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type PlatformAvailability = {
  name?: string;
  introducedAt?: string;
  deprecatedAt?: string;
  message?: string;
  /** DocC top-level platforms use isDeprecated; metadata.platforms use deprecated */
  isDeprecated?: boolean;
  deprecated?: boolean;
  unavailable?: boolean;
  beta?: boolean;
};

type DeprecationSummaryNode = {
  type?: string;
  text?: string;
  inlineContent?: DeprecationSummaryNode[];
};

type DoccDoc = {
  deprecated?: boolean;
  platforms?: PlatformAvailability[];
  deprecationSummary?: { inlineContent?: DeprecationSummaryNode[] }[];
  metadata?: {
    title?: string;
    platforms?: PlatformAvailability[];
  };
};

function extractInlineText(nodes: DeprecationSummaryNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text" && typeof n.text === "string") return n.text;
      if (n.inlineContent) return extractInlineText(n.inlineContent);
      return "";
    })
    .join("")
    .trim();
}

function docUrlToDataUrl(url: string): string | null {
  // url like https://developer.apple.com/documentation/uikit/uiwebview
  const m = url.match(/developer\.apple\.com\/documentation\/(.+)$/i);
  if (!m) return null;
  const path = m[1]!.replace(/\/$/, "").toLowerCase();
  return `${APPLE_DOCS_JSON}/${path}.json`;
}

const BATCH_SIZE = 20;

export async function backfillDeprecations(
  db: DatabaseType,
  batchLimit = 5000,
): Promise<{ updated: number; deprecated: number; errors: number }> {
  let updated = 0;
  let deprecated = 0;
  let errors = 0;
  const limit = pLimit(REQUEST_CONCURRENCY);

  // Select docs that haven't been backfilled yet.
  // deprecated IS NULL = never processed by this backfill.
  // Once processed (even if not deprecated), deprecated is set to 0 or 1.
  // introduced_at may legitimately be NULL for docs that don't specify a platform version.
  const selectStmt = db.prepare<[number], { id: string; url: string }>(`
    SELECT id, url FROM apple_docs
    WHERE deprecated IS NULL
      AND url IS NOT NULL
    LIMIT ?
  `);

  const updateStmt = db.prepare(`
    UPDATE apple_docs
    SET deprecated=@deprecated,
        introduced_at=@introducedAt,
        deprecated_at=@deprecatedAt,
        deprecated_message=@deprecatedMessage
    WHERE id=@id
  `);

  const rows = selectStmt.all(batchLimit);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((row) =>
        limit(async () => {
          const dataUrl = docUrlToDataUrl(row.url);
          if (!dataUrl) return;

          let doc: DoccDoc | null = null;
          try {
            const { data, status } = await httpGet<DoccDoc>(dataUrl);
            if (status === 404) return;
            doc = data && typeof data === "object" ? data : null;
          } catch (e) {
            if (e instanceof HttpError && e.status === 404) return;
            errors++;
            return;
          }

          if (!doc) return;

          // DocC JSON stores platform availability under metadata.platforms, not top-level
          const platforms = doc.metadata?.platforms ?? doc.platforms ?? [];
          const isDeprecated =
            doc.deprecated === true ||
            platforms.some(
              (p) =>
                p.isDeprecated ||
                p.deprecated === true ||
                Boolean(p.deprecatedAt),
            );

          // Minimum introducedAt across platforms (lexicographic on version strings works
          // for Apple's format like "iOS 13.0")
          const introducedValues = platforms
            .map((p) => p.introducedAt)
            .filter((v): v is string => Boolean(v));
          const introducedAt = introducedValues.length
            ? introducedValues.sort()[0]!
            : null;

          const deprecatedValues = platforms
            .map((p) => p.deprecatedAt)
            .filter((v): v is string => Boolean(v));
          const deprecatedAt = deprecatedValues.length
            ? deprecatedValues.sort()[0]!
            : null;

          // Deprecation message: try deprecationSummary first, then platform message
          let deprecatedMessage: string | null = null;
          const summary = doc.deprecationSummary?.[0];
          if (summary?.inlineContent) {
            deprecatedMessage = extractInlineText(summary.inlineContent) || null;
          }
          if (!deprecatedMessage) {
            const platformMsg = platforms.find((p) => p.message)?.message;
            deprecatedMessage = platformMsg ?? null;
          }

          try {
            updateStmt.run({
              id: row.id,
              deprecated: isDeprecated ? 1 : 0,
              introducedAt,
              deprecatedAt,
              deprecatedMessage,
            });
            updated++;
            if (isDeprecated) deprecated++;
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
    `rows checked: ${rows.length}, deprecated: ${deprecated}`,
  );
  return { updated, deprecated, errors };
}
