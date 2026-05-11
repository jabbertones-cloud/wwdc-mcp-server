/**
 * Pathways ingest — curated learning tracks.
 *
 * Apple doesn't publish a single JSON for "pathways". We construct them from:
 *   - The top-level tutorial pack sections (SwiftUI essentials → Drawing paths → ...)
 *   - Known curated tracks we maintain in a local seed list.
 *
 * This module:
 *   1. Reads already-ingested tutorials.
 *   2. For each top-level tutorial pack, builds a Pathway with steps = chapters → tutorials.
 *   3. Adds a small set of seeded WWDC-centric pathways (e.g. "Ship with Swift 6").
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { getTutorial, upsertPathway, recordIngest } from "../db/queries.js";
import type { Pathway, PathwayStep } from "../types.js";
import { TUTORIAL_SEEDS } from "./tutorials.js";

/** Hand-curated WWDC-centric pathways (titles only; steps resolved from DB at runtime). */
const CURATED_PATHWAYS: Array<{
  id: string;
  title: string;
  description: string;
  category: string;
  /** Array of {kind,url,title?}  — resolved as-is. */
  steps: Array<{ title: string; kind: PathwayStep["kind"]; url: string; estimatedTime?: string }>;
}> = [
  {
    id: "ship-with-swift-6",
    title: "Ship with Swift 6",
    description: "Migrate to Swift 6 language mode with strict concurrency and data-race safety.",
    category: "Swift",
    steps: [
      { title: "Migrate your app to Swift 6", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2024/10169/" },
      { title: "What's new in Swift", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2024/10136/" },
      { title: "Explore Swift performance", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2024/10217/" },
    ],
  },
  {
    id: "ai-with-apple-intelligence",
    title: "Build with Apple Intelligence",
    description: "On-device Foundation Models, Writing Tools, Image Playground, and Siri integration.",
    category: "AI",
    steps: [
      { title: "Meet Foundation Models", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2025/286/" },
      { title: "Bring your app to Apple Intelligence", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2024/10210/" },
    ],
  },
  {
    id: "swiftui-fundamentals",
    title: "SwiftUI Fundamentals",
    description: "From first view to full app with SwiftUI.",
    category: "SwiftUI",
    steps: [
      { title: "Introducing SwiftUI", kind: "tutorial", url: "https://developer.apple.com/tutorials/swiftui" },
      { title: "SwiftUI essentials", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2024/10150/" },
      { title: "What's new in SwiftUI", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2025/256/" },
    ],
  },
  {
    id: "visionos-essentials",
    title: "visionOS Essentials",
    description: "Build immersive spatial apps with SwiftUI and RealityKit.",
    category: "visionOS",
    steps: [
      { title: "Get started with building apps for spatial computing", kind: "session", url: "https://developer.apple.com/videos/play/wwdc2023/10260/" },
      { title: "Meet visionOS tutorials", kind: "tutorial", url: "https://developer.apple.com/tutorials/visionos" },
    ],
  },
];

/** Derive a pathway from a top-level tutorial pack's chapter structure. */
function pathwayFromTutorialPack(
  db: DatabaseType,
  slug: string,
): Pathway | null {
  const tut = getTutorial(db, slug);
  if (!tut || !tut.raw) return null;
  const raw = tut.raw as { sections?: unknown[]; references?: Record<string, { title?: string; url?: string; estimatedTime?: string }> };
  const steps: PathwayStep[] = [];
  let order = 0;

  for (const section of raw.sections ?? []) {
    const s = section as { kind?: string; chapters?: Array<{ name?: string; tutorials?: string[] }> };
    if (s.kind !== "volume") continue;
    for (const chapter of s.chapters ?? []) {
      for (const ref of chapter.tutorials ?? []) {
        const r = raw.references?.[ref];
        if (!r) continue;
        steps.push({
          order: ++order,
          title: r.title ?? ref,
          kind: "tutorial",
          url: r.url ? `https://developer.apple.com${r.url}` : "",
          estimatedTime: r.estimatedTime,
        });
      }
    }
  }
  if (steps.length === 0) return null;

  return {
    id: `pack-${slug}`,
    title: tut.title,
    description: `Auto-derived pathway from the ${tut.title} tutorial pack.`,
    category: tut.category ?? "General",
    steps,
    sourceUrl: tut.url,
    updatedAt: new Date().toISOString(),
  };
}

export async function ingestPathways(db: DatabaseType): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;

  // 1) derive from tutorial packs
  for (const slug of TUTORIAL_SEEDS) {
    try {
      const pw = pathwayFromTutorialPack(db, slug);
      if (pw) { upsertPathway(db, pw); ingested++; }
    } catch { errors++; }
  }

  // 2) curated pathways
  for (const c of CURATED_PATHWAYS) {
    try {
      upsertPathway(db, {
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        steps: c.steps.map((s, i) => ({ order: i + 1, ...s })),
        sourceUrl: "internal://curated",
        updatedAt: new Date().toISOString(),
      });
      ingested++;
    } catch { errors++; }
  }

  recordIngest(db, "pathways", ingested, errors, `tutorial-derived + curated`);
  return { ingested, errors };
}
