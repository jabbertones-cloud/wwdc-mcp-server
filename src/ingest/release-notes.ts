/**
 * Release notes ingest — iOS/iPadOS, Xcode, macOS, watchOS, tvOS, visionOS.
 *
 * Fetches the DocC JSON index from Apple's tutorial data endpoints, then fetches
 * each individual release note page and stores prose content in release_notes.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import pLimit from "p-limit";
import { APPLE_DOCS_JSON, APPLE_DOCS_BASE, REQUEST_CONCURRENCY } from "../constants.js";
import { httpGet, HttpError } from "../services/http.js";
import { recordIngest } from "../db/queries.js";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Known OS release note index slugs and their canonical OS label. */
const RELEASE_NOTE_INDEXES: { slug: string; os: string }[] = [
  { slug: "ios-ipados-release-notes", os: "iOS" },
  { slug: "xcode-release-notes",      os: "Xcode" },
  { slug: "macos-release-notes",       os: "macOS" },
  { slug: "watchos-release-notes",     os: "watchOS" },
  { slug: "tvos-release-notes",        os: "tvOS" },
  { slug: "visionos-release-notes",    os: "visionOS" },
];

type DoccReference = {
  identifier: string;
  title?: string;
  url?: string;
  kind?: string;
  role?: string;
};

type DoccIndex = {
  references?: Record<string, DoccReference>;
  topicSections?: { title?: string; identifiers?: string[] }[];
};

type DoccSection = {
  kind?: string;
  content?: DoccContentNode[];
};

type DoccContentNode = {
  type?: string;
  text?: string;
  inlineContent?: DoccContentNode[];
  items?: DoccContentNode[];
  content?: DoccContentNode[];
};

type DoccPage = {
  metadata?: { title?: string };
  abstract?: DoccContentNode[];
  primaryContentSections?: DoccSection[];
};

function extractText(nodes: DoccContentNode[] | undefined): string {
  if (!nodes) return "";
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (node.inlineContent) parts.push(extractText(node.inlineContent));
    if (node.items) parts.push(extractText(node.items));
    if (node.content) parts.push(extractText(node.content));
  }
  return parts.join("").trim();
}

function extractPageText(page: DoccPage): string {
  const parts: string[] = [];
  // abstract
  if (page.abstract) {
    parts.push(extractText(page.abstract));
  }
  // primaryContentSections with kind "content"
  for (const section of page.primaryContentSections ?? []) {
    if (section.kind === "content" && section.content) {
      parts.push(extractText(section.content));
    }
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * Parse version from a release note title like "iOS 17.4 Release Notes"
 * or "Xcode 15.3 Release Notes".
 */
function parseVersion(title: string): string {
  const m = title.match(/\d+(?:\.\d+)*/);
  return m ? m[0] : "unknown";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const { data, status } = await httpGet<T>(url);
    if (status === 404) return null;
    return data && typeof data === "object" ? data : null;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    return null;
  }
}

export async function ingestReleaseNotes(
  db: DatabaseType,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const limit = pLimit(REQUEST_CONCURRENCY);

  const upsertStmt = db.prepare(`
    INSERT INTO release_notes (id, os, version, title, content, url, updated_at)
    VALUES (@id, @os, @version, @title, @content, @url, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      os=@os, version=@version, title=@title, content=@content, url=@url, updated_at=@updatedAt
  `);

  for (const { slug, os } of RELEASE_NOTE_INDEXES) {
    const indexUrl = `${APPLE_DOCS_JSON}/${slug}.json`;
    const index = await fetchJson<DoccIndex>(indexUrl);
    if (!index) {
      errors++;
      continue;
    }

    // Collect child page identifiers from topicSections
    const childPaths: { path: string; title: string }[] = [];
    for (const section of index.topicSections ?? []) {
      for (const identifier of section.identifiers ?? []) {
        const ref = index.references?.[identifier];
        if (!ref?.url) continue;
        // ref.url like /documentation/ios-ipados-release-notes/ios-17_4-release-notes
        const m = ref.url.match(/^\/documentation\/(.+?)\/?$/);
        if (!m) continue;
        childPaths.push({ path: m[1]!, title: ref.title ?? "" });
      }
    }

    // Also collect from references directly (some indexes structure differently)
    if (childPaths.length === 0 && index.references) {
      for (const ref of Object.values(index.references)) {
        if (!ref.url) continue;
        const m = ref.url.match(/^\/documentation\/(.+?)\/?$/);
        if (!m || m[1] === slug) continue; // skip self-reference
        if (ref.role === "article" || ref.kind === "article") {
          childPaths.push({ path: m[1]!, title: ref.title ?? "" });
        }
      }
    }

    // Batch fetch with concurrency + 500ms cooldown between batches
    const BATCH = REQUEST_CONCURRENCY;
    for (let i = 0; i < childPaths.length; i += BATCH) {
      const batch = childPaths.slice(i, i + BATCH);
      await Promise.all(
        batch.map(({ path, title: indexTitle }) =>
          limit(async () => {
            const pageUrl = `${APPLE_DOCS_JSON}/${path}.json`;
            const page = await fetchJson<DoccPage>(pageUrl);
            if (!page) return; // 404 — skip

            const title = page.metadata?.title ?? indexTitle ?? path;
            const content = extractPageText(page);
            const version = parseVersion(title);
            const url = `${APPLE_DOCS_BASE}/${path}`;
            const id = path;

            try {
              upsertStmt.run({
                id,
                os,
                version,
                title,
                content: content || null,
                url,
                updatedAt: new Date().toISOString(),
              });
              ingested++;
            } catch {
              errors++;
            }
          })
        )
      );
      if (i + BATCH < childPaths.length) {
        await delay(500);
      }
    }
  }

  recordIngest(db, "release-notes", ingested, errors, `indexes: ${RELEASE_NOTE_INDEXES.length}`);
  return { ingested, errors };
}
