/**
 * Local embeddings via @huggingface/transformers (ONNX, no Ollama required).
 * Model: nomic-ai/nomic-embed-text-v1.5 (768-dim, same as original Ollama schema).
 * Pipeline is lazy-initialized on first use so startup is not blocked.
 *
 * All original exports are preserved for backward compatibility.
 */

import path from "node:path";
import os from "node:os";
import type { Database as DatabaseType } from "better-sqlite3";
import { pipeline, env } from "@huggingface/transformers";
import {
  OLLAMA_EMBED_MODEL,
  OLLAMA_EMBED_DIM,
} from "../constants.js";

// Cache ONNX model files locally so they survive between runs.
env.cacheDir = path.join(os.homedir(), ".cache", "huggingface", "hub");

const HF_MODEL = "nomic-ai/nomic-embed-text-v1.5";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: any = null;
let embeddingAvailable: boolean | null = null;
let initErrorLogged = false;

async function getPipeline() {
  if (_pipe) return _pipe;
  if (embeddingAvailable === false) return null;
  try {
    _pipe = await pipeline("feature-extraction", HF_MODEL, { dtype: "fp32" });
    embeddingAvailable = true;
    return _pipe;
  } catch (err) {
    embeddingAvailable = false;
    if (!initErrorLogged) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[embed] local model unavailable; embeddings disabled for this process: ${message}`);
      initErrorLogged = true;
    }
    return null;
  }
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

/** Backward-compatible availability check used by ingest callers. */
export async function checkOllama(): Promise<boolean> {
  if (process.env.WWDC_SKIP_EMBEDDINGS === "1") return false;
  if (embeddingAvailable !== null) return embeddingAvailable;
  return Boolean(await getPipeline());
}

/** Reset cached availability so a later call may retry initialization. */
export function resetOllamaStatus(): void {
  _pipe = null;
  embeddingAvailable = null;
  initErrorLogged = false;
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

export const EMBED_DIM = OLLAMA_EMBED_DIM;
export const EMBED_MODEL = OLLAMA_EMBED_MODEL;
