/**
 * Tutorials ingest — Apple DocC JSON at /tutorials/data/tutorials/{slug}.json
 *
 * Starts from a curated list of top-level tutorial packs, then follows references
 * to harvest child tutorial pages. Stores raw JSON + extracted body text.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { APPLE_BASE, APPLE_TUTORIALS_DATA } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { Tutorial } from "../types.js";
import { upsertTutorial, recordIngest } from "../db/queries.js";
import { storeEmbedding, embed, checkOllama } from "../services/ollama.js";

/** Seed slugs — top-level tutorial packs Apple publishes. */
export const TUTORIAL_SEEDS: readonly string[] = [
  "swiftui",
  "swiftui-concepts",
  "app-dev-training",
  "develop-in-swift",
  "app-dev-training-beyond",
  "swift-playgrounds",
  "visionos",
  "realitykit",
  "wwdc25-journey",
  "wwdc24-journey",
  "swiftdata",
] as const;

export async function fetchTutorial(slug: string): Promise<Tutorial | null> {
  const url = `${APPLE_TUTORIALS_DATA}/${slug}.json`;
  try {
    const { data } = await httpGet<Tutorial>(url);
    if (data && data.identifier && data.metadata) return data;
    return null;
  } catch {
    return null;
  }
}

/** Shallow text extraction from DocC sections. */
export function tutorialBodyText(t: Tutorial): string {
  const parts: string[] = [t.metadata.title];
  if (t.metadata.category) parts.push(`Category: ${t.metadata.category}`);
  if (t.metadata.estimatedTime) parts.push(`Estimated: ${t.metadata.estimatedTime}`);

  for (const section of t.sections ?? []) {
    if (section.title) parts.push(`\n## ${section.title}`);
    if (section.chapters) {
      for (const c of section.chapters) {
        parts.push(`\n### ${c.name}`);
        for (const ref of c.tutorials ?? []) {
          const resolved = t.references?.[ref];
          if (resolved?.title) parts.push(`- ${resolved.title}${resolved.estimatedTime ? ` (${resolved.estimatedTime})` : ""}`);
          else parts.push(`- ${ref}`);
        }
      }
    }
  }

  // Include any reference abstracts for extra context.
  for (const [, ref] of Object.entries(t.references ?? {})) {
    if (ref.abstract) {
      const abstractText = ref.abstract.map((a) => a.text).join("");
      if (abstractText) parts.push(`\n${ref.title}: ${abstractText}`);
    }
  }
  return parts.join("\n");
}

export function humanUrlForTutorial(slug: string): string {
  return `${APPLE_BASE}/tutorials/${slug}`;
}

export async function ingestTutorials(
  db: DatabaseType,
  seeds: readonly string[] = TUTORIAL_SEEDS,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const ollamaOn = await checkOllama();
  const visited = new Set<string>();

  async function walk(slug: string): Promise<void> {
    if (visited.has(slug)) return;
    visited.add(slug);

    const tut = await fetchTutorial(slug);
    if (!tut) { errors++; return; }

    const body = tutorialBodyText(tut);
    upsertTutorial(db, slug, tut, body, humanUrlForTutorial(slug));
    ingested++;

    // Store embedding if Ollama is up
    if (ollamaOn) {
      const textForEmb = `${tut.metadata.title}\n${body}`.slice(0, 4000);
      const vec = await embed(textForEmb);
      if (vec) storeEmbedding(db, `tutorial:${slug}`, "tutorial", vec);
    }

    // Follow references into child slugs
    for (const ref of Object.values(tut.references ?? {})) {
      if (!ref.url) continue;
      const childMatch = ref.url.match(/^\/tutorials\/(.+)$/);
      if (!childMatch) continue;
      const child = childMatch[1];
      if (!child || visited.has(child)) continue;
      // Only follow if child JSON is reachable
      await walk(child);
    }
  }

  for (const seed of seeds) {
    try { await walk(seed); } catch { errors++; }
  }

  recordIngest(db, "tutorials", ingested, errors, `seeds: ${seeds.length}, visited: ${visited.size}`);
  return { ingested, errors };
}
