/**
 * HIG ingest — Human Interface Guidelines topics.
 *
 * The HIG uses a DocC JSON tree under /tutorials/data/design/human-interface-guidelines/
 * We walk a seed list of top-level topics.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { APPLE_BASE, APPLE_HIG_JSON } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { HigEntry } from "../types.js";
import { upsertHig, recordIngest } from "../db/queries.js";
import { checkOllama, embed, storeEmbedding } from "../services/ollama.js";

/** Top-level HIG topic slugs (extend as Apple adds more). */
export const HIG_SEEDS: readonly string[] = [
  "designing-for-ios",
  "designing-for-ipados",
  "designing-for-macos",
  "designing-for-watchos",
  "designing-for-visionos",
  "designing-for-tvos",
  "foundations",
  "patterns",
  "components",
  "inputs",
  "technologies",
] as const;

interface HigDocJson {
  metadata?: { title?: string; platforms?: { name: string }[]; role?: string };
  abstract?: { type: string; text: string }[];
  primaryContentSections?: unknown[];
  references?: Record<string, { title?: string; url?: string; kind?: string; role?: string }>;
  topicSections?: { title?: string; identifiers?: string[] }[];
  identifier?: { url?: string };
}

function extractText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    return Object.values(obj).map(extractText).join(" ");
  }
  return "";
}

async function fetchHigJson(slug: string): Promise<HigDocJson | null> {
  try {
    const { data } = await httpGet<HigDocJson>(`${APPLE_HIG_JSON}/${slug}.json`);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export async function ingestHig(
  db: DatabaseType,
  seeds: readonly string[] = HIG_SEEDS,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const visited = new Set<string>();
  const ollamaOn = await checkOllama();

  async function walk(slug: string, category = "foundations", depth = 0): Promise<void> {
    if (visited.has(slug) || depth > 3) return;
    visited.add(slug);
    const doc = await fetchHigJson(slug);
    if (!doc) { errors++; return; }

    const title = doc.metadata?.title ?? slug.replace(/-/g, " ");
    const platforms = (doc.metadata?.platforms ?? []).map((p) => p.name).filter(Boolean);
    const summary = (doc.abstract ?? []).map((a) => a.text).join("").trim();
    const body = extractText(doc.primaryContentSections ?? []);
    const url = `${APPLE_BASE}/design/human-interface-guidelines/${slug}`;

    const entry: HigEntry = {
      id: slug,
      title,
      platform: platforms.length ? platforms : ["iOS"],
      category,
      summary,
      body: body.trim(),
      url,
      updatedAt: new Date().toISOString(),
    };
    upsertHig(db, entry);
    ingested++;

    if (ollamaOn) {
      const vec = await embed(`${title}\n${summary}\n${body}`.slice(0, 4000));
      if (vec) storeEmbedding(db, `hig:${slug}`, "hig", vec);
    }

    // Follow topic sections and referenced children under the HIG tree.
    for (const ts of doc.topicSections ?? []) {
      for (const id of ts.identifiers ?? []) {
        const ref = doc.references?.[id];
        const childUrl = ref?.url ?? "";
        const m = childUrl.match(/^\/design\/human-interface-guidelines\/(.+?)\/?$/);
        if (m) await walk(m[1]!, ts.title ?? category, depth + 1);
      }
    }
  }

  for (const seed of seeds) {
    try { await walk(seed, seed); } catch { errors++; }
  }

  recordIngest(db, "hig", ingested, errors, `visited: ${visited.size}`);
  return { ingested, errors };
}
