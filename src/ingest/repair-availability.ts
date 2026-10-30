/**
 * Availability repair — re-derive the structured availability fields of
 * every apple_docs row from the DocC JSON the ingest already archived in
 * `raw_json`, using the current shared parser.
 *
 * Why this exists (TL-194): the corpus stores each fetched page's raw
 * DocC node. When a parser fix lands (e.g. reference nodes in
 * deprecation summaries resolving to the replacement symbol's name), the
 * archived data is sufficient to repair the derived fields exactly —
 * re-fetching 2,500 pages to recompute five columns is waste, and under
 * upstream throttling it can turn a deterministic repair into a failed
 * refresh. The re-derivation is byte-equivalent to what a fresh ingest
 * with the fixed parser writes, because ingest parses the same node.
 *
 * Stamp discipline: the repair re-stamps the corpus (source "all") ONLY
 * when the previous stamp's per-source snapshot shows a complete,
 * error-free refresh whose runs are still inside the verifier's 12-hour
 * freshness window — the same conditions `verify-corpus --require-all`
 * enforces. Otherwise it repairs the fields, reports, and exits non-zero
 * WITHOUT stamping: an unstamped corpus is undeployable, never a lie.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { parseAvailability, type AvailabilitySource } from "./availability.js";
import { getLatestCorpusVersion, recordCorpusVersion } from "../db/corpus.js";
import { rebuildFts } from "../db/schema.js";
import { SERVER_VERSION } from "../server.js";

const REQUIRED_SOURCES = [
  "wwdc",
  "tutorials",
  "pathways",
  "hig",
  "evolution",
  "docs",
  "swiftbook",
  "appstore",
] as const;

const FRESHNESS_MS = 12 * 3600_000;

export interface RepairResult {
  examined: number;
  changed: number;
  unparseable: number;
  stamped: boolean;
  stampReason: string;
}

export function repairAvailability(db: DatabaseType): RepairResult {
  const rows = db
    .prepare(
      `SELECT id, raw_json, deprecated, introduced_at, deprecated_at,
              deprecated_message, deprecated_checked_at
       FROM apple_docs`,
    )
    .all() as {
    id: string;
    raw_json: string;
    deprecated: number;
    introduced_at: string | null;
    deprecated_at: string | null;
    deprecated_message: string | null;
    deprecated_checked_at?: string | null;
  }[];

  const update = db.prepare(`
    UPDATE apple_docs
    SET deprecated=@deprecated,
        introduced_at=@introducedAt,
        deprecated_at=@deprecatedAt,
        deprecated_message=@deprecatedMessage,
        deprecated_checked_at=@checkedAt
    WHERE id=@id
  `);

  let changed = 0;
  let unparseable = 0;
  const now = new Date().toISOString();
  const apply = db.transaction(() => {
    for (const row of rows) {
      let node: AvailabilitySource | null = null;
      try {
        node = JSON.parse(row.raw_json) as AvailabilitySource;
      } catch {
        unparseable++;
        continue;
      }
      const parsed = parseAvailability(node);
      const next = {
        deprecated: parsed.deprecated ? 1 : 0,
        introducedAt: parsed.introducedAt,
        deprecatedAt: parsed.deprecatedAt,
        deprecatedMessage: parsed.deprecatedMessage,
      };
      if (
        next.deprecated !== row.deprecated ||
        next.introducedAt !== row.introduced_at ||
        next.deprecatedAt !== row.deprecated_at ||
        next.deprecatedMessage !== row.deprecated_message
      ) {
        update.run({ id: row.id, ...next, checkedAt: now });
        changed++;
      }
    }
  });
  apply();

  rebuildFts(db);

  // Re-stamp only on a provably complete prior refresh (see header).
  const prior = getLatestCorpusVersion(db);
  let stamped = false;
  let stampReason = "no prior stamp";
  if (prior) {
    const problems: string[] = [];
    for (const name of REQUIRED_SOURCES) {
      const state = prior.sources[name];
      if (!state) problems.push(`${name}: missing`);
      else if (state.errors > 0) problems.push(`${name}: errors=${state.errors}`);
      else if (state.itemsIngested < 1) problems.push(`${name}: no items`);
      else if (!state.lastSuccessAt) problems.push(`${name}: never succeeded`);
      else if (
        !state.lastRunAt ||
        Date.parse(state.lastRunAt) < Date.parse(prior.ingestedAt) - FRESHNESS_MS
      )
        problems.push(`${name}: outside freshness window`);
    }
    if (problems.length === 0) {
      recordCorpusVersion(db, "all", SERVER_VERSION);
      stamped = true;
      stampReason = "prior refresh complete and fresh; re-stamped as all";
    } else {
      stampReason = `refusing to stamp: ${problems.join("; ")}`;
    }
  }

  return { examined: rows.length, changed, unparseable, stamped, stampReason };
}
