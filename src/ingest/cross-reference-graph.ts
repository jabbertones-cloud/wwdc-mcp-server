/**
 * Cross-Reference Graph Builder — Task C
 *
 * Builds edges between entities in the database using pure SQL + JS heuristics.
 * No LLM required. Edges are stored in the cross_references table.
 *
 * Edge sets:
 *   1. session → doc (mentions_api)       — doc title appears in session transcript
 *   2. session → evolution (implements_proposal) — SE-XXXX appears in transcript/description
 *   3. doc → doc (deprecates)             — deprecated_message "use X instead" heuristic
 *   4. session → session (related_session) — shared topics overlap
 *
 * Register as: --source cross-reference
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { recordIngest } from "../db/queries.js";

const SESSION_BATCH = 100;

export async function buildCrossReferenceGraph(
  db: DatabaseType,
): Promise<{ edges: number }> {
  let edges = 0;

  const insertEdge = db.prepare(`
    INSERT OR REPLACE INTO cross_references
      (from_type, from_id, to_type, to_id, relationship, weight)
    VALUES
      (@from_type, @from_id, @to_type, @to_id, @relationship, @weight)
  `);

  // -----------------------------------------------------------------------
  // Edge set 1: session → doc (mentions_api)
  // For each batch of sessions, check which short doc titles appear in transcript.
  // Only check docs with role='symbol' and short titles (< 40 chars) to avoid
  // expensive LIKE on too many rows.
  // -----------------------------------------------------------------------
  console.log("[cross-reference] Building session → doc (mentions_api) edges…");

  const totalSessions = (db.prepare(
    `SELECT COUNT(*) AS c FROM sessions WHERE LENGTH(COALESCE(transcript,'')) > 500`,
  ).get() as { c: number }).c;

  // Pre-fetch candidate docs (short symbol titles)
  const candidateDocs = db.prepare(`
    SELECT id, title FROM apple_docs
    WHERE role = 'symbol'
      AND LENGTH(title) < 40
      AND LENGTH(title) > 2
  `).all() as Array<{ id: string; title: string }>;

  let sessionOffset = 0;
  while (sessionOffset < totalSessions) {
    const sessions = db.prepare(`
      SELECT id, transcript
      FROM sessions
      WHERE LENGTH(COALESCE(transcript,'')) > 500
      ORDER BY year DESC, session_number ASC
      LIMIT ? OFFSET ?
    `).all(SESSION_BATCH, sessionOffset) as Array<{
      id: string;
      transcript: string;
    }>;

    if (sessions.length === 0) break;

    const insertMany = db.transaction(() => {
      for (const session of sessions) {
        const lowerTranscript = session.transcript.toLowerCase();
        for (const doc of candidateDocs) {
          if (lowerTranscript.includes(doc.title.toLowerCase())) {
            insertEdge.run({
              from_type: "session",
              from_id: session.id,
              to_type: "doc",
              to_id: doc.id,
              relationship: "mentions_api",
              weight: 1.0,
            });
            edges++;
          }
        }
      }
    });

    insertMany();
    sessionOffset += sessions.length;
    console.log(`  [cross-reference] session→doc: processed ${sessionOffset}/${totalSessions} sessions, ${edges} edges so far`);
  }

  // -----------------------------------------------------------------------
  // Edge set 2: session → evolution (implements_proposal)
  // Match sessions that mention SE-XXXX in transcript or description.
  // -----------------------------------------------------------------------
  console.log("[cross-reference] Building session → evolution (implements_proposal) edges…");

  const proposals = db.prepare(
    `SELECT id FROM evolution WHERE LENGTH(id) > 2`,
  ).all() as Array<{ id: string }>;

  const sessionTextRows = db.prepare(`
    SELECT id, LOWER(COALESCE(transcript,'') || ' ' || COALESCE(description,'')) AS body
    FROM sessions
    WHERE LENGTH(COALESCE(transcript,'')) > 200 OR LENGTH(COALESCE(description,'')) > 50
  `).all() as Array<{ id: string; body: string }>;

  const insertProposalEdges = db.transaction(() => {
    for (const session of sessionTextRows) {
      for (const proposal of proposals) {
        if (session.body.includes(proposal.id.toLowerCase())) {
          insertEdge.run({
            from_type: "session",
            from_id: session.id,
            to_type: "evolution",
            to_id: proposal.id,
            relationship: "implements_proposal",
            weight: 1.0,
          });
          edges++;
        }
      }
    }
  });

  insertProposalEdges();
  console.log(`  [cross-reference] session→evolution: ${edges} total edges`);

  // -----------------------------------------------------------------------
  // Edge set 3: doc → doc (deprecates)
  // From deprecated docs, extract replacement API name from deprecated_message.
  // Heuristic: "use X instead" or "replaced by X" → look up X in apple_docs.
  // -----------------------------------------------------------------------
  console.log("[cross-reference] Building doc → doc (deprecates) edges…");

  // Only run if deprecation columns exist
  const depColExists = (db.prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info('apple_docs') WHERE name = 'deprecated'`,
  ).get() as { c: number }).c > 0;

  if (depColExists) {
    const deprecatedDocs = db.prepare(`
      SELECT id, deprecated_message FROM apple_docs
      WHERE deprecated = 1
        AND deprecated_message IS NOT NULL
    `).all() as Array<{ id: string; deprecated_message: string }>;

    const insertDeprecatesEdges = db.transaction(() => {
      for (const doc of deprecatedDocs) {
        const candidate = extractReplacement(doc.deprecated_message);
        if (!candidate || candidate.length < 2) continue;

        // Try exact title match
        const match = db.prepare(
          `SELECT id FROM apple_docs WHERE LOWER(title) = LOWER(?) LIMIT 1`,
        ).get(candidate) as { id: string } | undefined;

        if (match) {
          insertEdge.run({
            from_type: "doc",
            from_id: doc.id,
            to_type: "doc",
            to_id: match.id,
            relationship: "deprecates",
            weight: 1.0,
          });
          edges++;
        }
      }
    });

    insertDeprecatesEdges();
    console.log(`  [cross-reference] doc→doc: ${edges} total edges`);
  }

  // -----------------------------------------------------------------------
  // Edge set 4: session → session (related_session)
  // For each session, find top 3 sessions by shared topics and insert edges.
  // -----------------------------------------------------------------------
  console.log("[cross-reference] Building session → session (related_session) edges…");

  const allSessions = db.prepare(`
    SELECT id, topics FROM sessions WHERE topics IS NOT NULL AND topics != '[]'
  `).all() as Array<{ id: string; topics: string }>;

  const insertRelatedEdges = db.transaction(() => {
    for (const session of allSessions) {
      let sessionTopics: string[] = [];
      try {
        sessionTopics = JSON.parse(session.topics) as string[];
      } catch { continue; }

      if (sessionTopics.length === 0) continue;

      // Score other sessions by topic overlap
      const scored: Array<{ id: string; score: number }> = [];

      for (const other of allSessions) {
        if (other.id === session.id) continue;
        let otherTopics: string[] = [];
        try { otherTopics = JSON.parse(other.topics) as string[]; } catch { continue; }

        const overlap = sessionTopics.filter((t) =>
          otherTopics.some((ot) => ot.toLowerCase() === t.toLowerCase()),
        ).length;

        if (overlap > 0) scored.push({ id: other.id, score: overlap });
      }

      // Top 3 by overlap score
      scored.sort((a, b) => b.score - a.score);
      for (const related of scored.slice(0, 3)) {
        insertEdge.run({
          from_type: "session",
          from_id: session.id,
          to_type: "session",
          to_id: related.id,
          relationship: "related_session",
          weight: related.score,
        });
        edges++;
      }
    }
  });

  insertRelatedEdges();
  console.log(`  [cross-reference] session→session: ${edges} total edges`);

  recordIngest(db, "cross-reference", edges, 0, "graph build complete");
  return { edges };
}

/** Extract a candidate replacement name from a deprecated_message string. */
function extractReplacement(msg: string): string | null {
  // "Use X instead", "Use X.", "replaced by X", "replaced with X"
  const patterns = [
    /\buse\s+([A-Za-z_][A-Za-z0-9_.]+)/i,
    /\breplaced?\s+(?:by|with)\s+([A-Za-z_][A-Za-z0-9_.]+)/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(msg);
    if (m?.[1]) return m[1];
  }
  return null;
}
