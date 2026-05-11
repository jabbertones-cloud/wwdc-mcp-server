/**
 * wwdc-mcp-server — DB query helpers
 *
 * Upsert + read + search patterns used by ingest pipelines and tools.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import type {
  WwdcSession,
  Tutorial,
  Pathway,
  HigEntry,
  SwiftEvolutionProposal,
  SampleCodeRef,
  SearchHit,
  IngestStatus,
} from "../types.js";

const nowIso = () => new Date().toISOString();

// ---------- Upserts ----------

export function upsertSession(db: DatabaseType, s: WwdcSession): void {
  db.prepare(`
    INSERT INTO sessions (
      id, year, session_number, title, description, url, duration,
      topics, platforms, speakers, transcript,
      sample_code_urls, related_docs, video_url, deep_links, updated_at
    ) VALUES (
      @id, @year, @session_number, @title, @description, @url, @duration,
      @topics, @platforms, @speakers, @transcript,
      @sample_code_urls, @related_docs, @video_url, @deep_links, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      year=excluded.year,
      session_number=excluded.session_number,
      title=excluded.title,
      description=excluded.description,
      url=excluded.url,
      duration=excluded.duration,
      topics=excluded.topics,
      platforms=excluded.platforms,
      speakers=excluded.speakers,
      transcript=excluded.transcript,
      sample_code_urls=excluded.sample_code_urls,
      related_docs=excluded.related_docs,
      video_url=excluded.video_url,
      deep_links=excluded.deep_links,
      updated_at=excluded.updated_at
  `).run({
    id: s.id,
    year: s.year,
    session_number: s.sessionNumber,
    title: s.title,
    description: s.description,
    url: s.url,
    duration: s.duration ?? null,
    topics: JSON.stringify(s.topics ?? []),
    platforms: JSON.stringify(s.platforms ?? []),
    speakers: JSON.stringify(s.speakers ?? []),
    transcript: s.transcript ?? null,
    sample_code_urls: JSON.stringify(s.sampleCodeUrls ?? []),
    related_docs: JSON.stringify(s.relatedDocs ?? []),
    video_url: s.videoUrl ?? null,
    deep_links: JSON.stringify(s.deepLinks ?? []),
    updated_at: s.updatedAt ?? nowIso(),
  });
}

export function upsertTutorial(
  db: DatabaseType,
  slug: string,
  tutorial: Tutorial,
  body: string,
  humanUrl: string,
): void {
  db.prepare(`
    INSERT INTO tutorials (id, title, category, role, estimated_time, doc_url, url, body, raw_json, updated_at)
    VALUES (@id, @title, @category, @role, @estimated_time, @doc_url, @url, @body, @raw_json, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      category=excluded.category,
      role=excluded.role,
      estimated_time=excluded.estimated_time,
      doc_url=excluded.doc_url,
      url=excluded.url,
      body=excluded.body,
      raw_json=excluded.raw_json,
      updated_at=excluded.updated_at
  `).run({
    id: slug,
    title: tutorial.metadata.title,
    category: tutorial.metadata.category ?? null,
    role: tutorial.metadata.role ?? null,
    estimated_time: tutorial.metadata.estimatedTime ?? null,
    doc_url: tutorial.identifier.url,
    url: humanUrl,
    body,
    raw_json: JSON.stringify(tutorial),
    updated_at: nowIso(),
  });
}

export function upsertPathway(db: DatabaseType, p: Pathway): void {
  db.prepare(`
    INSERT INTO pathways (id, title, description, category, steps, source_url, updated_at)
    VALUES (@id, @title, @description, @category, @steps, @source_url, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, description=excluded.description,
      category=excluded.category, steps=excluded.steps,
      source_url=excluded.source_url, updated_at=excluded.updated_at
  `).run({
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    steps: JSON.stringify(p.steps ?? []),
    source_url: p.sourceUrl,
    updated_at: p.updatedAt ?? nowIso(),
  });
}

export function upsertHig(db: DatabaseType, h: HigEntry): void {
  db.prepare(`
    INSERT INTO hig_entries (id, title, platform, category, summary, body, url, updated_at)
    VALUES (@id, @title, @platform, @category, @summary, @body, @url, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, platform=excluded.platform, category=excluded.category,
      summary=excluded.summary, body=excluded.body, url=excluded.url, updated_at=excluded.updated_at
  `).run({
    id: h.id,
    title: h.title,
    platform: JSON.stringify(h.platform ?? []),
    category: h.category,
    summary: h.summary,
    body: h.body,
    url: h.url,
    updated_at: h.updatedAt ?? nowIso(),
  });
}

export function upsertEvolution(db: DatabaseType, e: SwiftEvolutionProposal): void {
  db.prepare(`
    INSERT INTO evolution (id, number, title, status, authors, review_manager,
                           implementation, swift_version, body, url, updated_at)
    VALUES (@id, @number, @title, @status, @authors, @review_manager,
            @implementation, @swift_version, @body, @url, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      number=excluded.number, title=excluded.title, status=excluded.status,
      authors=excluded.authors, review_manager=excluded.review_manager,
      implementation=excluded.implementation, swift_version=excluded.swift_version,
      body=excluded.body, url=excluded.url, updated_at=excluded.updated_at
  `).run({
    id: e.id,
    number: e.number,
    title: e.title,
    status: e.status,
    authors: JSON.stringify(e.authors ?? []),
    review_manager: e.reviewManager ?? null,
    implementation: JSON.stringify(e.implementation ?? []),
    swift_version: e.swiftVersion ?? null,
    body: e.body,
    url: e.url,
    updated_at: e.updatedAt ?? nowIso(),
  });
}

export function upsertSampleCode(db: DatabaseType, s: SampleCodeRef): void {
  db.prepare(`
    INSERT INTO sample_code (id, session_id, title, url, kind, extracted_at, files)
    VALUES (@id, @session_id, @title, @url, @kind, @extracted_at, @files)
    ON CONFLICT(id) DO UPDATE SET
      session_id=excluded.session_id, title=excluded.title, url=excluded.url,
      kind=excluded.kind, extracted_at=excluded.extracted_at, files=excluded.files
  `).run({
    id: s.id,
    session_id: s.sessionId ?? null,
    title: s.title,
    url: s.url,
    kind: s.kind,
    extracted_at: s.extractedAt ?? null,
    files: JSON.stringify(s.files ?? []),
  });
}

// ---------- Ingest status ----------

export function recordIngest(
  db: DatabaseType,
  source: IngestStatus["source"],
  itemsIngested: number,
  errors: number,
  notes?: string,
  success = true,
): void {
  const now = nowIso();
  db.prepare(`
    INSERT INTO ingest_status (source, last_run_at, last_success_at, items_ingested, errors, notes)
    VALUES (@source, @now, @last_success, @items, @errors, @notes)
    ON CONFLICT(source) DO UPDATE SET
      last_run_at=@now,
      last_success_at=COALESCE(@last_success, ingest_status.last_success_at),
      items_ingested=@items, errors=@errors, notes=@notes
  `).run({
    source,
    now,
    last_success: success ? now : null,
    items: itemsIngested,
    errors,
    notes: notes ?? null,
  });
}

export function listIngestStatus(db: DatabaseType): IngestStatus[] {
  return db.prepare(`SELECT * FROM ingest_status ORDER BY source`).all().map((r: any) => ({
    source: r.source,
    lastRunAt: r.last_run_at,
    lastSuccessAt: r.last_success_at ?? undefined,
    itemsIngested: r.items_ingested,
    errors: r.errors,
    notes: r.notes ?? undefined,
  }));
}

// ---------- Reads ----------

export function getSession(db: DatabaseType, id: string): WwdcSession | null {
  const row: any = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  if (!row) return null;
  return rowToSession(row);
}

export function listSessionsByYear(
  db: DatabaseType,
  year: number,
  limit = 100,
  offset = 0,
): { rows: WwdcSession[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE year = ?`).get(year) as any).c as number;
  const rows = db.prepare(
    `SELECT * FROM sessions WHERE year = ? ORDER BY session_number LIMIT ? OFFSET ?`,
  ).all(year, limit, offset) as any[];
  return { rows: rows.map(rowToSession), total };
}

export function listYears(db: DatabaseType): { year: number; count: number }[] {
  return (db.prepare(`SELECT year, COUNT(*) AS count FROM sessions GROUP BY year ORDER BY year DESC`).all() as any[])
    .map((r) => ({ year: r.year as number, count: r.count as number }));
}

export function listTopics(db: DatabaseType): { topic: string; count: number }[] {
  const rows = db.prepare(`SELECT topics FROM sessions WHERE topics IS NOT NULL`).all() as any[];
  const counts = new Map<string, number>();
  for (const r of rows) {
    try {
      const arr = JSON.parse(r.topics) as string[];
      for (const t of arr) counts.set(t, (counts.get(t) ?? 0) + 1);
    } catch { /* ignore parse errors */ }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

export function listPathways(db: DatabaseType): Pathway[] {
  return (db.prepare(`SELECT * FROM pathways ORDER BY category, title`).all() as any[])
    .map(rowToPathway);
}

export function getPathway(db: DatabaseType, id: string): Pathway | null {
  const row: any = db.prepare(`SELECT * FROM pathways WHERE id = ?`).get(id);
  return row ? rowToPathway(row) : null;
}

export function getTutorial(db: DatabaseType, id: string): {
  id: string;
  title: string;
  category: string | null;
  role: string | null;
  estimatedTime: string | null;
  url: string;
  body: string;
  raw: unknown;
} | null {
  const row: any = db.prepare(`SELECT * FROM tutorials WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    role: row.role,
    estimatedTime: row.estimated_time,
    url: row.url,
    body: row.body ?? "",
    raw: row.raw_json ? JSON.parse(row.raw_json) : null,
  };
}

export function listSampleCodeForSession(db: DatabaseType, sessionId: string): SampleCodeRef[] {
  return (db.prepare(`SELECT * FROM sample_code WHERE session_id = ?`).all(sessionId) as any[])
    .map((r) => ({
      id: r.id,
      sessionId: r.session_id ?? undefined,
      title: r.title,
      url: r.url,
      kind: r.kind,
      extractedAt: r.extracted_at ?? undefined,
      files: r.files ? JSON.parse(r.files) : [],
    }));
}

// ---------- Keyword search (FTS5) ----------

export function searchSessionsFts(
  db: DatabaseType,
  query: string,
  limit: number,
  offset: number,
): { hits: SearchHit[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM sessions_fts WHERE sessions_fts MATCH ?`).get(query) as any).c;
  const rows = db.prepare(`
    SELECT s.id, s.title, s.url, s.year, s.topics,
           snippet(sessions_fts, 2, '[', ']', '…', 16) AS snip,
           bm25(sessions_fts) AS score
    FROM sessions_fts JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ?
    ORDER BY score LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      kind: "session" as const,
      title: r.title,
      url: r.url,
      snippet: r.snip,
      year: r.year,
      topics: r.topics ? safeJson<string[]>(r.topics, []) : [],
      score: r.score,
    })),
  };
}

export function searchTutorialsFts(
  db: DatabaseType,
  query: string,
  limit: number,
  offset: number,
): { hits: SearchHit[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM tutorials_fts WHERE tutorials_fts MATCH ?`).get(query) as any).c;
  const rows = db.prepare(`
    SELECT t.id, t.title, t.url, t.category,
           snippet(tutorials_fts, 2, '[', ']', '…', 16) AS snip,
           bm25(tutorials_fts) AS score
    FROM tutorials_fts JOIN tutorials t ON t.rowid = tutorials_fts.rowid
    WHERE tutorials_fts MATCH ?
    ORDER BY score LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      kind: "tutorial" as const,
      title: r.title,
      url: r.url,
      snippet: r.snip,
      topics: r.category ? [r.category] : [],
      score: r.score,
    })),
  };
}

export function searchHigFts(
  db: DatabaseType,
  query: string,
  limit: number,
  offset: number,
): { hits: SearchHit[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM hig_fts WHERE hig_fts MATCH ?`).get(query) as any).c;
  const rows = db.prepare(`
    SELECT h.id, h.title, h.url, h.category,
           snippet(hig_fts, 2, '[', ']', '…', 16) AS snip,
           bm25(hig_fts) AS score
    FROM hig_fts JOIN hig_entries h ON h.rowid = hig_fts.rowid
    WHERE hig_fts MATCH ?
    ORDER BY score LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      kind: "hig" as const,
      title: r.title,
      url: r.url,
      snippet: r.snip,
      topics: r.category ? [r.category] : [],
      score: r.score,
    })),
  };
}

export function searchEvolutionFts(
  db: DatabaseType,
  query: string,
  limit: number,
  offset: number,
): { hits: SearchHit[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM evolution_fts WHERE evolution_fts MATCH ?`).get(query) as any).c;
  const rows = db.prepare(`
    SELECT e.id, e.title, e.url, e.status,
           snippet(evolution_fts, 1, '[', ']', '…', 16) AS snip,
           bm25(evolution_fts) AS score
    FROM evolution_fts JOIN evolution e ON e.rowid = evolution_fts.rowid
    WHERE evolution_fts MATCH ?
    ORDER BY score LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      kind: "evolution" as const,
      title: r.title,
      url: r.url,
      snippet: r.snip,
      topics: r.status ? [r.status] : [],
      score: r.score,
    })),
  };
}

export function getEvolution(db: DatabaseType, id: string): SwiftEvolutionProposal | null {
  const row: any = db.prepare(`SELECT * FROM evolution WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    authors: safeJson<string[]>(row.authors, []),
    reviewManager: row.review_manager ?? undefined,
    implementation: safeJson<string[]>(row.implementation, []),
    swiftVersion: row.swift_version ?? undefined,
    body: row.body,
    url: row.url,
    updatedAt: row.updated_at,
  };
}

// ---------- Grep across sample-code bodies (placeholder; file-system grep lives in services) ----------

export function listSessionsAddedSince(db: DatabaseType, iso: string, limit: number): WwdcSession[] {
  return (db.prepare(`
    SELECT * FROM sessions WHERE updated_at > ? ORDER BY year DESC, session_number LIMIT ?
  `).all(iso, limit) as any[]).map(rowToSession);
}

// ---------- Helpers ----------

function rowToSession(row: any): WwdcSession {
  return {
    id: row.id,
    year: row.year,
    sessionNumber: row.session_number,
    title: row.title,
    description: row.description ?? "",
    url: row.url,
    duration: row.duration ?? undefined,
    topics: safeJson<string[]>(row.topics, []),
    platforms: safeJson<string[]>(row.platforms, []),
    speakers: safeJson<string[]>(row.speakers, []),
    transcript: row.transcript ?? undefined,
    sampleCodeUrls: safeJson<string[]>(row.sample_code_urls, []),
    relatedDocs: safeJson<string[]>(row.related_docs, []),
    videoUrl: row.video_url ?? undefined,
    deepLinks: safeJson<WwdcSession["deepLinks"]>(row.deep_links, []),
    updatedAt: row.updated_at,
  };
}

function rowToPathway(row: any): Pathway {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    steps: safeJson<Pathway["steps"]>(row.steps, []),
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
  };
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
