/**
 * Swift Evolution ingest — pulls proposal markdown from apple/swift-evolution GitHub.
 * Endpoint: GitHub contents API for directory listing, then raw URLs for bodies.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import pLimit from "p-limit";
import {
  SWIFT_EVOLUTION_INDEX_API,
  SWIFT_EVOLUTION_PROPOSALS,
  REQUEST_CONCURRENCY,
} from "../constants.js";
import { httpGet } from "../services/http.js";
import { upsertEvolution, recordIngest } from "../db/queries.js";
import { embed, checkOllama, storeEmbedding } from "../services/ollama.js";
import type { SwiftEvolutionProposal } from "../types.js";

interface GithubFile {
  name: string;
  path: string;
  download_url: string;
  type: string;
}

export async function listProposalFiles(): Promise<GithubFile[]> {
  const { data } = await httpGet<GithubFile[]>(SWIFT_EVOLUTION_INDEX_API);
  const parsed = typeof data === "string" ? JSON.parse(data) as GithubFile[] : data;
  return Array.isArray(parsed) ? parsed.filter((f) => f.type === "file" && /\.md$/i.test(f.name)) : [];
}

/** Parse the leading metadata block of a Swift Evolution proposal. */
export function parseProposal(md: string, filename: string): SwiftEvolutionProposal | null {
  const seMatch = filename.match(/^(\d{4})[-_](.+)\.md$/i);
  if (!seMatch) return null;
  const number = parseInt(seMatch[1]!, 10);
  const id = `SE-${seMatch[1]!.padStart(4, "0")}`;

  const titleMatch = md.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch?.[1]?.trim() ?? seMatch[2]!.replace(/[-_]/g, " ");

  const field = (label: string): string | undefined => {
    const re = new RegExp(`\\*\\s*\\*?${label}\\*?:\\s*(.+?)\\s*(?:\\n|$)`, "i");
    const m = md.match(re);
    return m?.[1]?.trim();
  };

  const status = field("Status") ?? "Unknown";
  const authorsRaw = field("Authors?") ?? "";
  const authors = authorsRaw
    .split(",")
    .map((a) => a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim())
    .filter(Boolean);
  const reviewManager = field("Review Manager");
  const swiftVersion = field("Swift Version");
  const implRaw = field("Implementation") ?? "";
  const implementation = implRaw.match(/https?:\/\/\S+/g) ?? [];

  const url = `https://github.com/apple/swift-evolution/blob/main/proposals/${filename}`;

  return {
    id,
    number,
    title,
    status: status.replace(/\[|\]/g, "").split("(")[0]!.trim(),
    authors,
    reviewManager,
    implementation,
    swiftVersion,
    body: md,
    url,
    updatedAt: new Date().toISOString(),
  };
}

export async function ingestEvolution(
  db: DatabaseType,
  limit?: number,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  let files: GithubFile[] = [];
  try {
    files = await listProposalFiles();
  } catch (e) {
    // Never swallow the listing failure silently — without the file list the
    // whole ingest is a no-op and used to look like a hang.
    console.error(`[evolution] failed to list proposal files: ${(e as Error)?.message ?? e}`);
    errors++;
  }

  const ollamaOn = await checkOllama();
  const toProcess = limit ? files.slice(-limit) : files;
  const gate = pLimit(REQUEST_CONCURRENCY);

  await Promise.all(toProcess.map((f) => gate(async () => {
    try {
      const rawUrl = f.download_url ?? `${SWIFT_EVOLUTION_PROPOSALS}/${f.name}`;
      const { data } = await httpGet<string>(rawUrl, { transformResponse: (x) => x });
      const md = typeof data === "string" ? data : String(data);
      const proposal = parseProposal(md, f.name);
      if (!proposal) { errors++; return; }
      upsertEvolution(db, proposal);
      ingested++;

      if (ollamaOn) {
        const vec = await embed(`${proposal.title}\n${proposal.body}`.slice(0, 4000));
        if (vec) storeEmbedding(db, `evolution:${proposal.id}`, "evolution", vec);
      }
    } catch (error) {
      errors++;
      if (errors <= 5) console.error(`[evolution] failed ${f.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  })));
  recordIngest(db, "evolution", ingested, errors, `total files: ${files.length}`);
  return { ingested, errors };
}
