/**
 * Swift Language Reference ingest — The Swift Programming Language book
 * hosted at docs.swift.org/swift-book/
 *
 * Uses the public DocC JSON endpoint:
 *   https://docs.swift.org/swift-book/data/documentation/the-swift-programming-language/{chapter}.json
 *
 * Chapter slugs are discovered from the top-level navigation JSON.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { SWIFT_BOOK_DATA_JSON, SWIFT_BOOK_BASE } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { SwiftBookChapter } from "../types.js";
import { upsertSwiftBookChapter, recordIngest } from "../db/queries.js";
import { checkOllama, embed, storeEmbedding } from "../services/ollama.js";

type DoccRef = { url?: string; title?: string; abstract?: Array<{ text?: string }> };
type DoccNode = {
  metadata?: { title?: string; roleHeading?: string; role?: string };
  abstract?: Array<{ text?: string }>;
  primaryContentSections?: unknown[];
  sections?: unknown[];
  topicSections?: Array<{ title?: string; anchor?: string; identifiers?: string[] }>;
  references?: Record<string, DoccRef>;
};

// Section groupings keyed by lowercase-concatenated slug (matches docs.swift.org URL slugs).
// Slugs are derived from the nav endpoint identifiers by lowercasing the PascalCase suffix.
const SECTION_MAP: Record<string, string> = {
  // Welcome
  "aboutswift": "Welcome",
  "compatibility": "Welcome",
  "guidedtour": "Welcome",
  // Language Guide
  "thebasics": "Language Guide",
  "basicoperators": "Language Guide",
  "stringsandcharacters": "Language Guide",
  "collectiontypes": "Language Guide",
  "controlflow": "Language Guide",
  "functions": "Language Guide",
  "closures": "Language Guide",
  "enumerations": "Language Guide",
  "classesandstructures": "Language Guide",
  "properties": "Language Guide",
  "methods": "Language Guide",
  "subscripts": "Language Guide",
  "inheritance": "Language Guide",
  "initialization": "Language Guide",
  "deinitialization": "Language Guide",
  "optionalchaining": "Language Guide",
  "errorhandling": "Language Guide",
  "concurrency": "Language Guide",
  "macros": "Language Guide",
  "typecasting": "Language Guide",
  "nestedtypes": "Language Guide",
  "extensions": "Language Guide",
  "protocols": "Language Guide",
  "generics": "Language Guide",
  "opaquetypes": "Language Guide",
  "automaticreferencecounting": "Language Guide",
  "memorysafety": "Language Guide",
  "accesscontrol": "Language Guide",
  "advancedoperators": "Language Guide",
  // Language Reference
  "aboutthelanguagereference": "Language Reference",
  "lexicalstructure": "Language Reference",
  "types": "Language Reference",
  "expressions": "Language Reference",
  "statements": "Language Reference",
  "declarations": "Language Reference",
  "attributes": "Language Reference",
  "patterns": "Language Reference",
  "genericparametersandarguments": "Language Reference",
  "summaryofthegrammar": "Language Reference",
  "revisionhistory": "Revision History",
};

function walkText(value: unknown, out: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean) out.push(clean);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkText(item, out);
    return;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of ["heading", "title", "text", "caption", "content", "inlineContent"]) {
      if (key in rec) walkText(rec[key], out);
    }
  }
}

async function fetchChapter(slug: string): Promise<DoccNode | null> {
  // URL: https://docs.swift.org/swift-book/data/documentation/the-swift-programming-language/{slug}.json
  const url = `${SWIFT_BOOK_DATA_JSON}/${slug}.json`;
  try {
    const { data } = await httpGet<DoccNode>(url);
    if (data?.metadata) return data;
    return null;
  } catch {
    return null;
  }
}

async function fetchNavigation(): Promise<string[]> {
  // Top-level navigation: https://docs.swift.org/swift-book/data/documentation/the-swift-programming-language.json
  // (one level up from chapters — uses the same base without the last path segment)
  try {
    const navBase = SWIFT_BOOK_DATA_JSON.replace(/\/the-swift-programming-language$/, "");
    const url = `${navBase}/the-swift-programming-language.json`;
    const { data } = await httpGet<DoccNode>(url);
    if (!data?.topicSections?.length) throw new Error("no topics");
    const slugs: string[] = [];
    for (const section of data.topicSections) {
      for (const id of section.identifiers ?? []) {
        // Last path segment lowercased = URL slug (e.g. "Closures" → "closures")
        const match = id.match(/\/([^/]+)$/);
        if (match?.[1] && !match[1].includes("#")) slugs.push(match[1].toLowerCase());
      }
    }
    if (slugs.length > 5) return slugs;
    throw new Error("too few");
  } catch {
    // Static fallback: all known chapters
    return Object.keys(SECTION_MAP);
  }
}

export async function ingestSwiftBook(
  db: DatabaseType,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const ollamaOn = await checkOllama();

  const slugs = await fetchNavigation();
  console.log(`[swiftbook] ${slugs.length} chapters to fetch`);

  for (const slug of slugs) {
    const node = await fetchChapter(slug);
    if (!node) {
      errors++;
      continue;
    }
    const title = node.metadata?.title ?? slug;
    const section = SECTION_MAP[slug] ?? "Miscellaneous";
    const parts: string[] = [title];
    if (node.abstract) parts.push(...node.abstract.map((a) => a.text ?? "").filter(Boolean));
    walkText(node.primaryContentSections ?? [], parts);
    walkText(node.sections ?? [], parts);
    for (const ts of node.topicSections ?? []) {
      if (ts.title) parts.push(ts.title);
    }
    const body = parts.filter(Boolean).join("\n");
    const url = `${SWIFT_BOOK_BASE}/swift-book/documentation/the-swift-programming-language/${slug}`;

    const chapter: SwiftBookChapter = {
      id: slug,
      title,
      section,
      body,
      url,
      updatedAt: new Date().toISOString(),
    };
    upsertSwiftBookChapter(db, chapter);
    ingested++;

    if (ollamaOn) {
      const vec = await embed(`${title}\n${section}\n${body}`.slice(0, 4000));
      if (vec) storeEmbedding(db, `swiftbook:${slug}`, "swiftbook", vec);
    }
  }

  recordIngest(db, "swiftbook" as any, ingested, errors, `chapters: ${slugs.length}`);
  return { ingested, errors };
}
