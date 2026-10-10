/**
 * Local embeddings via @huggingface/transformers (ONNX, no Ollama required).
 * Model: nomic-ai/nomic-embed-text-v1.5 (768-dim, same as original Ollama schema).
 * Pipeline is lazy-initialized on first use so startup is not blocked.
 *
 */

import path from "node:path";
import os from "node:os";
import type { Database as DatabaseType } from "better-sqlite3";
import { pipeline, env } from "@huggingface/transformers";
import { OptionalService } from "./optional-service.js";
import {
  LOCAL_EMBED_MODEL,
  LOCAL_EMBED_DIM,
} from "../constants.js";

// Cache ONNX model files locally so they survive between runs.
env.cacheDir = path.join(os.homedir(), ".cache", "huggingface", "hub");

const HF_MODEL = LOCAL_EMBED_MODEL;

// The embedding pipeline is an optional capability: when the local model
// cannot load (offline first run, cold cache), search degrades to FTS only
// instead of failing. OptionalService owns that degradation contract —
// cached probe, null-safe access, one-time caveat, resettable verdict.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const embeddingService = new OptionalService<any>({
  name: "embed",
  init: () => pipeline("feature-extraction", HF_MODEL, { dtype: "fp32" }),
  onUnavailable: (message) =>
    console.error(
      `[embed] local model unavailable; embeddings disabled for this process: ${message}`,
    ),
});

async function getPipeline() {
  return embeddingService.get();
}

/**
 * Embed a text string using the local ONNX model.
 * Returns a Float32Array of length 768, or null on error.
 */
export async function embed(text: string): Promise<Float32Array | null> {
  try {
    const pipe = await getPipeline();
    if (!pipe) return null;
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float32Array);
  } catch (err) {
    console.error("[embed] HuggingFace inference error:", err);
    return null;
  }
}

/**
 * Backward-compatible availability check used by ingest callers.
 * With `timeoutMs`, the probe is bounded (see OptionalService.getBounded):
 * a slow first model load reports `false` for this call rather than
 * blocking the caller, does not mark embeddings unavailable, and may
 * still succeed on a later call once loading finishes in the background.
 */
export async function checkEmbeddings(timeoutMs?: number): Promise<boolean> {
  if (process.env.WWDC_SKIP_EMBEDDINGS === "1") return false;
  if (timeoutMs === undefined) return embeddingService.isAvailable();
  return (await embeddingService.getBounded(timeoutMs)) !== null;
}

/** Reset cached availability so a later call may retry initialization. */
export function resetEmbeddingStatus(): void {
  embeddingService.reset();
}

export function storeEmbedding(
  db: DatabaseType,
  docId: string,
  kind: string,
  vec: Float32Array,
): void {
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  db.prepare(`
    INSERT INTO embeddings (doc_id, kind, vector, dim, model, created_at)
    VALUES (@doc_id, @kind, @vector, @dim, @model, @created_at)
    ON CONFLICT(doc_id) DO UPDATE SET
      kind=excluded.kind, vector=excluded.vector, dim=excluded.dim,
      model=excluded.model, created_at=excluded.created_at
  `).run({
    doc_id: docId,
    kind,
    vector: buf,
    dim: vec.length,
    model: HF_MODEL,
    created_at: new Date().toISOString(),
  });
}

export interface VectorRow {
  docId: string;
  kind: string;
  vector: Float32Array;
}

export function loadEmbeddings(db: DatabaseType, kinds?: string[]): VectorRow[] {
  const sql = kinds && kinds.length
    ? `SELECT doc_id, kind, vector, dim FROM embeddings WHERE kind IN (${kinds.map(() => "?").join(",")})`
    : `SELECT doc_id, kind, vector, dim FROM embeddings`;
  const rows = (kinds && kinds.length
    ? db.prepare(sql).all(...kinds)
    : db.prepare(sql).all()) as any[];
  return rows.map((r) => ({
    docId: r.doc_id,
    kind: r.kind,
    vector: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4),
  }));
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SemanticHit {
  docId: string;
  kind: string;
  score: number;
}

export async function semanticSearch(
  db: DatabaseType,
  query: string,
  kinds: string[],
  topK = 20,
): Promise<SemanticHit[]> {
  const q = await embed(query);
  if (!q) return [];
  const rows = loadEmbeddings(db, kinds);
  const scored = rows.map((r) => ({ docId: r.docId, kind: r.kind, score: cosine(q, r.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export const EMBED_DIM = LOCAL_EMBED_DIM;
export const EMBED_MODEL = LOCAL_EMBED_MODEL;
