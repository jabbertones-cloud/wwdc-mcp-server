/**
 * Session Summary Extraction — Task A
 *
 * Uses the Anthropic API (via axios, no SDK dependency) to generate structured
 * summaries for WWDC sessions that have transcripts but no summary yet.
 *
 * Register as: --source session-summaries
 * Default maxSessions=50 to prevent runaway costs.
 */

import axios from "axios";
import type { Database as DatabaseType } from "better-sqlite3";
import { recordIngest } from "../db/queries.js";

const RATE_LIMIT_MS = 500;

interface SessionRow {
  id: string;
  title: string;
  year: number;
  topics: string | null;
  description: string | null;
  transcript_chunk: string;
}

interface SummaryPayload {
  summary: string;
  key_apis: string[];
  key_topics: string[];
  code_patterns: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export async function extractSessionSummaries(
  db: DatabaseType,
  opts: {
    batchSize?: number;
    maxSessions?: number;
    model?: string;
    apiKey?: string;
  } = {},
): Promise<{ processed: number; skipped: number; errors: number }> {
  const {
    batchSize = 10,
    maxSessions = 50,
    model = "claude-haiku-3-5-20241022",
    apiKey = process.env.ANTHROPIC_API_KEY,
  } = opts;

  if (!apiKey) {
    console.warn(
      "[session-summaries] ANTHROPIC_API_KEY not set — skipping summary extraction.",
    );
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO session_summaries
      (session_id, summary, key_apis, key_topics, code_patterns, difficulty, model_used)
    VALUES
      (@session_id, @summary, @key_apis, @key_topics, @code_patterns, @difficulty, @model_used)
  `);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches up to maxSessions total
  const limit = Math.min(batchSize, maxSessions);
  let offset = 0;

  while (processed + skipped < maxSessions) {
    const remaining = maxSessions - (processed + skipped + errors);
    if (remaining <= 0) break;

    const batchLimit = Math.min(limit, remaining);

    const rows = db.prepare(`
      SELECT s.id, s.title, s.year, s.topics, s.description,
             SUBSTR(s.transcript, 1, 8000) AS transcript_chunk
      FROM sessions s
      LEFT JOIN session_summaries ss ON ss.session_id = s.id
      WHERE LENGTH(COALESCE(s.transcript, '')) > 500
        AND ss.session_id IS NULL
      ORDER BY s.year DESC, s.session_number ASC
      LIMIT ? OFFSET ?
    `).all(batchLimit, offset) as SessionRow[];

    if (rows.length === 0) break;

    for (const session of rows) {
      try {
        const payload = await callAnthropicApi(session, model, apiKey);
        if (!payload) {
          skipped++;
          continue;
        }

        insert.run({
          session_id: session.id,
          summary: payload.summary,
          key_apis: JSON.stringify(payload.key_apis ?? []),
          key_topics: JSON.stringify(payload.key_topics ?? []),
          code_patterns: JSON.stringify(payload.code_patterns ?? []),
          difficulty: payload.difficulty ?? "intermediate",
          model_used: model,
        });
        processed++;
        console.log(`  [session-summaries] summarized: ${session.id} (${session.year} — ${session.title})`);
      } catch (err) {
        console.error(`  [session-summaries] error for ${session.id}:`, err instanceof Error ? err.message : err);
        errors++;
      }

      // Rate limit between requests
      await sleep(RATE_LIMIT_MS);
    }

    offset += rows.length;
    if (rows.length < batchLimit) break; // no more rows
  }

  recordIngest(db, "session-summaries", processed, errors, `skipped=${skipped}`);
  return { processed, skipped, errors };
}

async function callAnthropicApi(
  session: SessionRow,
  model: string,
  apiKey: string,
): Promise<SummaryPayload | null> {
  const topicsStr = session.topics
    ? (() => { try { return (JSON.parse(session.topics!) as string[]).join(", "); } catch { return session.topics!; } })()
    : "Unknown";

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Analyze this WWDC ${session.year} session titled "${session.title}".

Topics: ${topicsStr}
Description: ${session.description ?? ""}

Transcript excerpt:
${session.transcript_chunk}

Return JSON only (no markdown):
{
  "summary": "2-3 sentence summary of what this session covers and who should watch it",
  "key_apis": ["APIName1", "APIName2"],
  "key_topics": ["topic1", "topic2"],
  "code_patterns": ["pattern description 1"],
  "difficulty": "beginner|intermediate|advanced"
}`,
        },
      ],
    },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 30_000,
    },
  );

  const text: string = response.data?.content?.[0]?.text ?? "";
  if (!text) return null;

  // Strip markdown fences if present
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned) as SummaryPayload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
