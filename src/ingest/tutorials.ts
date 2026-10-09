/**
 * Tutorials ingest — Apple DocC JSON at /tutorials/data/tutorials/{slug}.json
 *
 * Starts from a curated list of top-level tutorial packs, then follows references
 * to harvest child tutorial pages. Stores raw JSON + extracted body text.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { APPLE_BASE, APPLE_TUTORIALS_DATA } from "../constants.js";
import { httpGet, HttpError } from "../services/http.js";
import type { Tutorial } from "../types.js";
import { upsertTutorial, recordIngest } from "../db/queries.js";
import { storeEmbedding, embed, checkEmbeddings } from "../services/embeddings.js";

/** Seed slugs — top-level tutorial packs Apple publishes. */
export const TUTORIAL_SEEDS: readonly string[] = [
  "swiftui",
  "swiftui-concepts",
  "app-dev-training",
  "develop-in-swift",
  // Other historical seeds now return HTTP 404 (verified October 9, 2026).
  // Discover live child tutorials from healthy seed references instead.
] as const;

/** Convert an Apple DocC link to a fetchable tutorial document identity.
 * #chapter fragments refer to anchors within the same JSON document. */
export function tutorialSlugFromUrl(url: string): string | null {
  const matched = url.match(/^\/tutorials\/(.+)$/);
  if (!matched) return null;
  const slug = matched[1]?.split(/[?#]/, 1)[0]?.replace(/\/+$/, "");
  return slug || null;
}

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
  let skippedNotFound = 0;
  const unavailable: string[] = [];
  const failures: string[] = [];
  const maxPages = Math.max(1, parseInt(process.env.WWDC_TUTORIAL_MAX_PAGES ?? "250", 10));
  const embeddingsOn = await checkEmbeddings();
  const visited = new Set<string>();
  const queued = new Set<string>();
  const queue = [...seeds];
  for (const seed of seeds) queued.add(seed);

  async function processSlug(slug: string): Promise<void> {
    if (visited.has(slug) || visited.size >= maxPages) return;
    visited.add(slug);

    let tut: Tutorial;
    try {
      const response = await httpGet<Tutorial>(APPLE_TUTORIALS_DATA + "/" + slug + ".json");
      if (!response.data?.identifier || !response.data?.metadata) {
        throw new Error("unexpected tutorial DocC response");
      }
      tut = response.data;
    } catch (error) {
      const retired = error instanceof HttpError && (error.status === 404 || error.status === 410);
      if (retired && !seeds.includes(slug)) {
        skippedNotFound++;
        if (unavailable.length < 10) unavailable.push(slug);
      } else {
        errors++;
        if (failures.length < 10) failures.push(slug + ": " + (error instanceof Error ? error.message : String(error)));
      }
      return;
    }

    const body = tutorialBodyText(tut);
    upsertTutorial(db, slug, tut, body, humanUrlForTutorial(slug));
    ingested++;

    // Store embedding if local embeddings are available
    if (embeddingsOn) {
      const textForEmb = `${tut.metadata.title}\n${body}`.slice(0, 4000);
      const vec = await embed(textForEmb);
      if (vec) storeEmbedding(db, `tutorial:${slug}`, "tutorial", vec);
    }

    // Follow references into child slugs
    for (const ref of Object.values(tut.references ?? {})) {
      if (!ref.url) continue;
      const child = tutorialSlugFromUrl(ref.url);
      if (!child || visited.has(child) || queued.has(child) || visited.size + queue.length >= maxPages) continue;
      queued.add(child);
      queue.push(child);
    }
  }

  while (queue.length > 0 && visited.size < maxPages) {
    const slug = queue.shift()!;
    try { await processSlug(slug); } catch (error) {
      errors++;
      if (failures.length < 10) failures.push(slug + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }

  if (skippedNotFound > Math.max(10, Math.floor(visited.size * 0.45))) {
    errors++;
    failures.push("unavailable tutorial references exceeded 45% of crawled pages");
  }
  console.log("[tutorials] crawl:", JSON.stringify({
    visited: visited.size, ingested, skippedNotFound, errors,
    unavailableExamples: unavailable, failureExamples: failures,
  }));
  recordIngest(db, "tutorials", ingested, errors,
    "seeds: " + seeds.length + ", visited: " + visited.size + ", max_pages: " + maxPages +
    ", skipped_not_found: " + skippedNotFound + ", sample: " + unavailable.join(","));
  return { ingested, errors };
}
