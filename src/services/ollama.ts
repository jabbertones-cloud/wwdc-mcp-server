/**
 * Ollama local embeddings service.
 * Uses nomic-embed-text (768-dim) via POST /api/embeddings.
 * No paid API dependency. Gracefully degrades when Ollama is offline.
 */

import axios from "axios";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  OLLAMA_BASE,
  OLLAMA_EMBED_MODEL,
  OLLAMA_EMBED_DIM,
} from "../constants.js";

interface EmbeddingsResponse {
  embedding: number[];
}

let ollamaAvailable: boolean | null = null;

export async function checkOllama(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const resp = await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    ollamaAvailable = resp.status === 200;
  } catch {
    ollamaAvailable = false;
  }
  return ollamaAvailable;
}

/** Reset the cached flag (useful in tests). */
export function resetOllamaStatus(): void { ollamaAvailable = null; }

export async function embed(text: string): Promise<Float32Array | null> {
  if (!(await checkOllama())) return null;
  try {
    const resp = await axios.post<EmbeddingsResponse>(
      `${OLLAMA_BASE}/api/embeddings`,
      { model: OLLAMA_EMBED_MODEL, prompt: text },
      { timeout: 20_000 },
    );
    const arr = resp.data?.embedding;
    if (!Array.isArray(arr)) return null;
    return new Float32Array(arr);
  } catch {
    return null;
  }
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
    model: OLLAMA_EMBED_MODEL,
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
