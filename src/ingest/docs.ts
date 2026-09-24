/**
 * Apple Developer documentation ingest — public DocC JSON at
 * /tutorials/data/documentation/{path}.json.
 *
 * Starts from Swift/Apple-platform seeds, follows documentation references, and
 * stores searchable body text plus raw JSON.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { APPLE_DOCS_BASE, APPLE_DOCS_JSON, APPLE_DOC_SEEDS } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { AppleDocPage } from "../types.js";
import { recordIngest, upsertAppleDoc } from "../db/queries.js";
import { checkOllama, embed, storeEmbedding } from "../services/ollama.js";

type DoccNode = {
  metadata?: {
    title?: string;
    role?: string;
    roleHeading?: string;
    symbolKind?: string;
    modules?: Array<{ name?: string }>;
    platforms?: Array<{ name?: string }>;
  };
  abstract?: Array<{ text?: string }>;
  primaryContentSections?: Array<{ kind?: string; content?: unknown[] }>;
  sections?: Array<{ kind?: string; title?: string; content?: unknown[] }>;
  topicSections?: Array<{ title?: string; anchor?: string; identifiers?: string[] }>;
  references?: Record<string, { url?: string; title?: string; abstract?: Array<{ text?: string }> }>;
};

export async function fetchAppleDoc(path: string): Promise<DoccNode | null> {
  const url = `${APPLE_DOCS_JSON}/${normalizeDocPath(path)}.json`;
  try {
    const { data } = await httpGet<DoccNode>(url);
    if (data && data.metadata) return data;
    return null;
  } catch {
    return null;
  }
}

export function normalizeDocPath(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/developer\.apple\.com\/documentation\//i, "")
    .replace(/^\/+/, "")
    .replace(/^documentation\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function docPathFromIdentifier(identifier: string): string | null {
  const match = identifier.match(/\/documentation\/(.+)$/);
  if (!match?.[1]) return null;
  const path = normalizeDocPath(match[1]);
  if (!path || path.includes("#")) return null;
  return path;
}

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
    const record = value as Record<string, unknown>;
    for (const key of ["heading", "title", "text", "caption", "name", "content"]) {
      if (key in record) walkText(record[key], out);
    }
  }
}

export function appleDocToPage(path: string, node: DoccNode): AppleDocPage {
  const id = normalizeDocPath(path);
  const title = node.metadata?.title ?? id;
  const modules = (node.metadata?.modules ?? []).map((m) => m.name).filter(Boolean) as string[];
  const platforms = (node.metadata?.platforms ?? []).map((p) => p.name).filter(Boolean) as string[];
  const abstract = (node.abstract ?? []).map((a) => a.text ?? "").join("").trim();
  const bodyParts = [title, abstract];
  walkText(node.primaryContentSections ?? [], bodyParts);
  walkText(node.sections ?? [], bodyParts);
  for (const section of node.topicSections ?? []) {
    if (section.title) bodyParts.push(section.title);
  }
  for (const ref of Object.values(node.references ?? {})) {
    if (ref.title) bodyParts.push(ref.title);
    const refAbstract = (ref.abstract ?? []).map((a) => a.text ?? "").join("").trim();
    if (refAbstract) bodyParts.push(refAbstract);
  }

  const references = new Set<string>();
  for (const identifier of Object.keys(node.references ?? {})) {
    const refPath = docPathFromIdentifier(identifier);
    if (refPath) references.add(refPath);
  }
  for (const section of node.topicSections ?? []) {
    for (const identifier of section.identifiers ?? []) {
      const refPath = docPathFromIdentifier(identifier);
      if (refPath) references.add(refPath);
    }
  }

  return {
    id,
    title,
    role: node.metadata?.role ?? node.metadata?.roleHeading,
    symbolKind: node.metadata?.symbolKind,
    modules,
    platforms,
    url: `${APPLE_DOCS_BASE}/${id}`,
    abstract,
    body: bodyParts.filter(Boolean).join("\n"),
    topicSections: (node.topicSections ?? []).map((s) => s.title ?? s.anchor).filter(Boolean) as string[],
    references: [...references],
    rawJson: JSON.stringify(node),
    updatedAt: new Date().toISOString(),
  };
}

export async function ingestAppleDocs(
  db: DatabaseType,
  seeds: readonly string[] = APPLE_DOC_SEEDS,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const maxPages = Math.max(1, parseInt(process.env.WWDC_DOCS_MAX_PAGES ?? "2500", 10));
  const ollamaOn = await checkOllama();
  const visited = new Set<string>();
  const queued = new Set<string>();
  const queue = seeds.map(normalizeDocPath);
  for (const seed of queue) queued.add(seed);

  while (queue.length > 0 && visited.size < maxPages) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const node = await fetchAppleDoc(path);
    if (!node) {
      errors++;
      continue;
    }
    const page = appleDocToPage(path, node);
    upsertAppleDoc(db, page);
    ingested++;

    if (ollamaOn) {
      const vec = await embed(`${page.title}\n${page.abstract}\n${page.body}`.slice(0, 4000));
      if (vec) storeEmbedding(db, `doc:${page.id}`, "doc", vec);
    }

    for (const ref of page.references) {
      if (visited.has(ref) || queued.has(ref) || visited.size + queue.length >= maxPages) continue;
      queued.add(ref);
      queue.push(ref);
    }
  }

  recordIngest(db, "docs", ingested, errors, `seeds: ${seeds.length}, visited: ${visited.size}, max_pages: ${maxPages}`);
  return { ingested, errors };
}
