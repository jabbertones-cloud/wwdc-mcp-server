/**
 * Deprecation Q&A JSONL Export — Task B
 *
 * Exports structured Q&A pairs for fine-tuning from the existing database.
 * No LLM needed — pure SQL + template logic.
 *
 * Output format (one JSON per line):
 *   {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
 *
 * Sources:
 *   1. apple_docs with deprecated=1
 *   2. evolution proposals with status='accepted'
 *   3. sessions with transcripts — keyword-anchored pairs
 */

import fs from "node:fs";
import path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { DATA_DIR } from "../constants.js";

const DEFAULT_OUTPUT = path.join(DATA_DIR, "deprecation-qa.jsonl");

interface QAPair {
  messages: [
    { role: "user"; content: string },
    { role: "assistant"; content: string },
  ];
}

function writePair(
  stream: fs.WriteStream,
  prompt: string,
  response: string,
): void {
  const pair: QAPair = {
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: response },
    ],
  };
  stream.write(JSON.stringify(pair) + "\n");
}

export async function exportDeprecationQA(
  db: DatabaseType,
  outputPath: string = DEFAULT_OUTPUT,
): Promise<{ exported: number }> {
  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(outputPath, { encoding: "utf8" });
  let exported = 0;

  // ---------- Source 1: deprecated apple_docs ----------
  // Guard: only query if 'deprecated' column exists
  const depColExists = (db.prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info('apple_docs') WHERE name = 'deprecated'`,
  ).get() as { c: number }).c > 0;

  if (depColExists) {
    const deprecatedDocs = db.prepare(`
      SELECT id, title, deprecated_at, introduced_at, deprecated_message, url
      FROM apple_docs
      WHERE deprecated = 1
        AND deprecated_message IS NOT NULL
      LIMIT 2000
    `).all() as Array<{
      id: string;
      title: string;
      deprecated_at: string | null;
      introduced_at: string | null;
      deprecated_message: string;
      url: string;
    }>;

    for (const doc of deprecatedDocs) {
      const depAt = doc.deprecated_at ?? "an earlier OS version";
      const intrAt = doc.introduced_at ?? "an unknown version";

      // Pair 1: Is X deprecated?
      writePair(
        stream,
        `Is ${doc.title} deprecated?`,
        `Yes, ${doc.title} was deprecated in iOS ${depAt}. ${doc.deprecated_message}. See: ${doc.url}`,
      );
      exported++;

      // Pair 2: What replaced X?
      writePair(
        stream,
        `What replaced ${doc.title}?`,
        `${doc.deprecated_message} Documentation: ${doc.url}`,
      );
      exported++;

      // Pair 3: When was X introduced?
      writePair(
        stream,
        `When was ${doc.title} introduced?`,
        `${doc.title} was introduced in iOS ${intrAt}.`,
      );
      exported++;
    }
  }

  // ---------- Source 2: accepted Swift Evolution proposals ----------
  const evolutionRows = db.prepare(`
    SELECT id, title, status, authors, body, url
    FROM evolution
    WHERE status = 'accepted'
    LIMIT 500
  `).all() as Array<{
    id: string;
    title: string;
    status: string;
    authors: string | null;
    body: string | null;
    url: string;
  }>;

  for (const proposal of evolutionRows) {
    // Extract number from id like "SE-0251"
    const match = proposal.id.match(/SE-0*(\d+)/i);
    const number = match ? match[1]! : proposal.id.replace(/\D/g, "");
    const authorsStr = (() => {
      try {
        const arr = JSON.parse(proposal.authors ?? "[]") as string[];
        return arr.join(", ");
      } catch {
        return proposal.authors ?? "Unknown";
      }
    })();

    // Abstract = first 300 chars of body (raw markdown)
    const abstract = (proposal.body ?? "").slice(0, 300).replace(/\n/g, " ").trim();

    // Pair 1: What is proposal SE-XXXX?
    writePair(
      stream,
      `What is Swift Evolution proposal ${proposal.id}?`,
      `${proposal.title}. Authors: ${authorsStr}. Status: ${proposal.status}. ${abstract} See: ${proposal.url}`,
    );
    exported++;

    // Pair 2: What does SE-NNN propose?
    writePair(
      stream,
      `What does SE-${number} propose?`,
      `${proposal.title}: ${abstract}`,
    );
    exported++;
  }

  // ---------- Source 3: sessions with transcripts ----------
  const sessionRows = db.prepare(`
    SELECT id, year, title, topics, description, url
    FROM sessions
    WHERE LENGTH(COALESCE(transcript,'')) > 500
    LIMIT 1000
  `).all() as Array<{
    id: string;
    year: number;
    title: string;
    topics: string | null;
    description: string | null;
    url: string;
  }>;

  for (const session of sessionRows) {
    let topicsArr: string[] = [];
    try {
      topicsArr = JSON.parse(session.topics ?? "[]") as string[];
    } catch { /* ignore */ }
    const firstTopic = topicsArr[0] ?? "Apple platforms";
    const desc = (session.description ?? "").trim();

    // Pair 1: What WWDC session covers X?
    writePair(
      stream,
      `What WWDC session covers ${firstTopic}?`,
      `WWDC ${session.year}: ${session.title}. ${desc} Watch at: ${session.url}`,
    );
    exported++;

    // Pair 2: What did Apple announce at WWDC YYYY about X?
    writePair(
      stream,
      `What did Apple announce at WWDC ${session.year} about ${firstTopic}?`,
      `${session.title}: ${desc}`,
    );
    exported++;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`[export-deprecation-qa] Wrote ${exported} Q&A pairs to ${outputPath}`);
  return { exported };
}
