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
  AppleDocPage,
  SwiftBookChapter,
  AppStoreGuidelineEntry,
  SearchHit,
  IngestStatus,
} from "../types.js";

const nowIso = () => new Date().toISOString();
const applePlatformTerms = new Set(["ios", "macos", "watchos", "tvos", "visionos", "ipados"]);
const platformAliases: Record<string, string[]> = {
  ios: ["ios", "iphone", "app store"],
  ipados: ["ipados", "ipad"],
  macos: ["macos", "mac os", "mac app", "appkit", "screencapturekit"],
  watchos: ["watchos", "watch"],
  tvos: ["tvos", "apple tv"],
  visionos: ["visionos", "vision pro", "spatial"],
};

function unquoteFtsLiteral(query: string): string {
  const trimmed = query.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

function appendPlatformPredicate(predicates: string[], params: unknown[], platforms: string[]): void {
  const terms = platforms
    .flatMap((platform) => platformAliases[platform.toLowerCase()] ?? [platform.toLowerCase()])
    .filter(Boolean);
  if (terms.length === 0) return;
  const haystack = `LOWER(
    COALESCE(s.platforms, '') || ' ' ||
    COALESCE(s.topics, '') || ' ' ||
    COALESCE(s.title, '') || ' ' ||
    COALESCE(s.description, '') || ' ' ||
    COALESCE(s.transcript, '') || ' ' ||
    COALESCE(s.related_docs, '') || ' ' ||
    COALESCE(s.deep_links, '')
  )`;
  predicates.push(`(${terms.map(() => `${haystack} LIKE ?`).join(" OR ")})`);
  for (const term of terms) params.push(`%${term}%`);
}

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

export function upsertAppleDoc(db: DatabaseType, d: AppleDocPage): void {
  db.prepare(`
    INSERT INTO apple_docs (
      id, title, role, symbol_kind, modules, platforms, url, abstract, body,
      topic_sections, references_json, raw_json, updated_at
    )
    VALUES (
      @id, @title, @role, @symbol_kind, @modules, @platforms, @url, @abstract, @body,
      @topic_sections, @references_json, @raw_json, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      role=excluded.role,
      symbol_kind=excluded.symbol_kind,
      modules=excluded.modules,
      platforms=excluded.platforms,
      url=excluded.url,
      abstract=excluded.abstract,
      body=excluded.body,
      topic_sections=excluded.topic_sections,
      references_json=excluded.references_json,
      raw_json=excluded.raw_json,
      updated_at=excluded.updated_at
  `).run({
    id: d.id,
    title: d.title,
    role: d.role ?? null,
    symbol_kind: d.symbolKind ?? null,
    modules: JSON.stringify(d.modules ?? []),
    platforms: JSON.stringify(d.platforms ?? []),
    url: d.url,
    abstract: d.abstract,
    body: d.body,
    topic_sections: JSON.stringify(d.topicSections ?? []),
    references_json: JSON.stringify(d.references ?? []),
    raw_json: d.rawJson,
    updated_at: d.updatedAt ?? nowIso(),
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
  filters: {
    year?: number;
    yearMin?: number;
    yearMax?: number;
    topics?: string[];
    platforms?: string[];
    requireTranscript?: boolean;
  } = {},
): { hits: SearchHit[]; total: number } {
  const predicates: string[] = [];
  const params: unknown[] = [query];
  if (filters.year !== undefined) {
    predicates.push("s.year = ?");
    params.push(filters.year);
  }
  if (filters.yearMin !== undefined) {
    predicates.push("s.year >= ?");
    params.push(filters.yearMin);
  }
  if (filters.yearMax !== undefined) {
    predicates.push("s.year <= ?");
    params.push(filters.yearMax);
  }
  for (const topic of filters.topics ?? []) {
    predicates.push("LOWER(s.topics) LIKE ?");
    params.push(`%${topic.toLowerCase()}%`);
  }
  appendPlatformPredicate(predicates, params, filters.platforms ?? []);
  if (filters.requireTranscript) {
    predicates.push("s.transcript IS NOT NULL AND LENGTH(s.transcript) > 0");
  }

  const literalQuery = unquoteFtsLiteral(query).toLowerCase();
  const platformQuery = literalQuery.replace(/[^a-z0-9]/g, "");
  if (applePlatformTerms.has(platformQuery)) {
    appendPlatformPredicate(predicates, params, [platformQuery]);
    const filterSql = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const total = (db.prepare(`
      SELECT COUNT(*) AS c
      FROM sessions s
      ${filterSql}
    `).get(...params.slice(1)) as any).c;
    const rows = db.prepare(`
      SELECT s.id, s.title, s.url, s.year, s.topics, s.platforms,
             substr(COALESCE(s.description, ''), 1, 240) AS snip,
             0 AS score
      FROM sessions s
      ${filterSql}
      ORDER BY s.year DESC, s.session_number LIMIT ? OFFSET ?
    `).all(...params.slice(1), limit, offset) as any[];
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
        platforms: r.platforms ? safeJson<string[]>(r.platforms, []) : [],
        score: r.score,
      })),
    };
  }

  const filterSql = predicates.length ? `AND ${predicates.join(" AND ")}` : "";
  const total = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM sessions_fts JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ? ${filterSql}
  `).get(...params) as any).c;
  const rows = db.prepare(`
    SELECT s.id, s.title, s.url, s.year, s.topics, s.platforms,
           snippet(sessions_fts, 2, '[', ']', '…', 16) AS snip,
           bm25(sessions_fts, 0, 10.0, 5.0, 1.0, 1.0) AS score
    FROM sessions_fts JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ? ${filterSql}
    ORDER BY score LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];
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
      platforms: r.platforms ? safeJson<string[]>(r.platforms, []) : [],
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
           snippet(tutorials_fts, 3, '[', ']', '…', 16) AS snip,
           bm25(tutorials_fts, 0, 10.0, 5.0, 1.0) AS score
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
           bm25(hig_fts, 0, 10.0, 5.0, 1.0) AS score
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
           bm25(evolution_fts, 0, 10.0, 1.0, 5.0) AS score
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

export function getAppleDoc(db: DatabaseType, id: string): AppleDocPage | null {
  const row: any = db.prepare(`SELECT * FROM apple_docs WHERE id = ?`).get(id);
  return row ? rowToAppleDoc(row) : null;
}

export function searchAppleDocsFts(
  db: DatabaseType,
  query: string,
  limit: number,
  offset: number,
): { hits: SearchHit[]; total: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM apple_docs_fts WHERE apple_docs_fts MATCH ?`).get(query) as any).c;
  const rows = db.prepare(`
    SELECT d.id, d.title, d.url, d.modules, d.platforms,
           snippet(apple_docs_fts, 2, '[', ']', '…', 16) AS snip,
           bm25(apple_docs_fts, 0, 10.0, 5.0, 1.0, 1.0, 1.0) AS score
    FROM apple_docs_fts JOIN apple_docs d ON d.rowid = apple_docs_fts.rowid
    WHERE apple_docs_fts MATCH ?
    ORDER BY score LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return {
    total,
    hits: rows.map((r) => ({
      id: r.id,
      kind: "doc" as const,
      title: r.title,
      url: r.url,
      snippet: r.snip,
      topics: r.modules ? safeJson<string[]>(r.modules, []) : [],
      platforms: r.platforms ? safeJson<string[]>(r.platforms, []) : [],
      score: r.score,
    })),
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

function rowToAppleDoc(row: any): AppleDocPage {
  return {
    id: row.id,
    title: row.title,
    role: row.role ?? undefined,
    symbolKind: row.symbol_kind ?? undefined,
    modules: safeJson<string[]>(row.modules, []),
    platforms: safeJson<string[]>(row.platforms, []),
    url: row.url,
    abstract: row.abstract ?? "",
    body: row.body ?? "",
    topicSections: safeJson<string[]>(row.topic_sections, []),
    references: safeJson<string[]>(row.references_json, []),
    rawJson: row.raw_json ?? "",
    updatedAt: row.updated_at,
  };
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ---------- Swift Book ----------

export function upsertSwiftBookChapter(db: DatabaseType, chapter: SwiftBookChapter): void {
  db.prepare(`
    INSERT OR REPLACE INTO swift_book (id, title, section, body, url, updated_at)
    VALUES (@id, @title, @section, @body, @url, @updatedAt)
  `).run({ ...chapter });
}

export function getSwiftBookChapter(db: DatabaseType, id: string): SwiftBookChapter | null {
  const row = db.prepare(`SELECT * FROM swift_book WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return { id: row.id, title: row.title, section: row.section ?? "", body: row.body ?? "", url: row.url, updatedAt: row.updated_at };
}

export function searchSwiftBookFts(
  db: DatabaseType,
  query: string,
  limit = 20,
  offset = 0,
): SearchHit[] {
  const rows = db.prepare(`
    SELECT b.id, b.title, b.section, b.url,
           snippet(swift_book_fts, 3, '[', ']', '...', 24) AS snippet,
           swift_book_fts.rank AS rank
    FROM swift_book_fts
    JOIN swift_book b ON b.rowid = swift_book_fts.rowid
    WHERE swift_book_fts MATCH ?
    ORDER BY rank
    LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return rows.map((r): SearchHit => ({
    id: r.id,
    kind: "doc",
    title: `[Swift Book] ${r.title}`,
    url: r.url,
    snippet: r.snippet ?? undefined,
  }));
}

// ---------- App Store Guidelines ----------

export function upsertAppStoreGuideline(db: DatabaseType, entry: AppStoreGuidelineEntry): void {
  db.prepare(`
    INSERT OR REPLACE INTO appstore_guidelines (id, section_number, title, body, url, updated_at)
    VALUES (@id, @sectionNumber, @title, @body, @url, @updatedAt)
  `).run({ ...entry });
}

export function getAppStoreGuideline(db: DatabaseType, id: string): AppStoreGuidelineEntry | null {
  const row = db.prepare(`SELECT * FROM appstore_guidelines WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return { id: row.id, sectionNumber: row.section_number ?? "", title: row.title, body: row.body ?? "", url: row.url, updatedAt: row.updated_at };
}

// ---------- API introduction / changelog / related ----------

export function findApiIntroduction(
  db: DatabaseType,
  symbol: string,
  limit = 5,
): { hits: SearchHit[]; earliestYear: number | null } {
  const rows = db.prepare(`
    SELECT s.id, s.year, s.title, s.url, s.description,
           snippet(sessions_fts, 2, '[', ']', '...', 32) AS snippet,
           sessions_fts.rank AS rank
    FROM sessions_fts
    JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ?
    ORDER BY s.year ASC, sessions_fts.rank
    LIMIT ?
  `).all(symbol, limit) as any[];
  const hits: SearchHit[] = rows.map((r): SearchHit => ({
    id: r.id,
    kind: "session",
    title: r.title,
    url: r.url,
    snippet: r.snippet ?? undefined,
    year: r.year ?? undefined,
  }));
  const earliestYear = rows.length > 0 ? (rows[0].year as number) : null;
  return { hits, earliestYear };
}

export function getSessionsByYearAndTopic(
  db: DatabaseType,
  query: string,
  year: number,
  limit = 5,
): { hits: SearchHit[] } {
  const rows = db.prepare(`
    SELECT s.id, s.year, s.title, s.url, s.description,
           snippet(sessions_fts, 3, '[', ']', '...', 24) AS snippet,
           sessions_fts.rank AS rank
    FROM sessions_fts
    JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ?
      AND s.year = ?
    ORDER BY sessions_fts.rank
    LIMIT ?
  `).all(query, year, limit) as any[];
  const hits: SearchHit[] = rows.map((r): SearchHit => ({
    id: r.id,
    kind: "session",
    title: r.title,
    url: r.url,
    snippet: r.snippet ?? undefined,
    year: r.year ?? undefined,
  }));
  return { hits };
}

export function findRelatedSessions(
  db: DatabaseType,
  sessionId: string,
  limit = 8,
): { seedTitle: string; seedYear: number; hits: SearchHit[] } | null {
  const seed = db.prepare(
    `SELECT id, year, title, description, topics FROM sessions WHERE id = ?`,
  ).get(sessionId) as any;
  if (!seed) return null;

  // Parse seed topics
  let seedTopics: string[] = [];
  try {
    seedTopics = JSON.parse(seed.topics ?? "[]") as string[];
  } catch { /* ignore */ }

  // Step 1: FTS on seed title (exclude seed itself)
  const ftsQuery = `"${seed.title.replace(/"/g, '""')}"`;
  const ftsRows = db.prepare(`
    SELECT s.id, s.year, s.title, s.url, s.description,
           snippet(sessions_fts, 3, '[', ']', '...', 24) AS snippet,
           sessions_fts.rank AS rank
    FROM sessions_fts
    JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE sessions_fts MATCH ?
      AND s.id != ?
    ORDER BY sessions_fts.rank
    LIMIT ?
  `).all(ftsQuery, sessionId, limit * 2) as any[];

  // Step 2: topic overlap — for each seed topic, find sessions with that topic
  const topicRows: any[] = [];
  for (const topic of seedTopics.slice(0, 5)) {
    const rows = db.prepare(`
      SELECT id, year, title, url, description, NULL AS snippet
      FROM sessions
      WHERE id != ?
        AND LOWER(topics) LIKE ?
      LIMIT ?
    `).all(sessionId, `%${topic.toLowerCase()}%`, limit) as any[];
    topicRows.push(...rows);
  }

  // Union + deduplicate, prefer FTS order then topic matches
  const seen = new Set<string>();
  const combined: SearchHit[] = [];
  for (const r of [...ftsRows, ...topicRows]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    combined.push({
      id: r.id,
      kind: "session",
      title: r.title,
      url: r.url,
      snippet: r.snippet ?? undefined,
      year: r.year ?? undefined,
    });
  }

  // Sort by year descending, take limit
  combined.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return {
    seedTitle: seed.title as string,
    seedYear: seed.year as number,
    hits: combined.slice(0, limit),
  };
}

export function searchAppStoreGuidelinesFts(
  db: DatabaseType,
  query: string,
  limit = 20,
  offset = 0,
): SearchHit[] {
  const rows = db.prepare(`
    SELECT g.id, g.section_number, g.title, g.url,
           snippet(appstore_guidelines_fts, 3, '[', ']', '...', 24) AS snippet,
           appstore_guidelines_fts.rank AS rank
    FROM appstore_guidelines_fts
    JOIN appstore_guidelines g ON g.rowid = appstore_guidelines_fts.rowid
    WHERE appstore_guidelines_fts MATCH ?
    ORDER BY rank
    LIMIT ? OFFSET ?
  `).all(query, limit, offset) as any[];
  return rows.map((r): SearchHit => ({
    id: r.id,
    kind: "doc",
    title: `[App Store §${r.section_number}] ${r.title}`,
    url: r.url,
    snippet: r.snippet ?? undefined,
  }));
}

// ---------- New query functions ----------

export function listHigEntries(
  db: DatabaseType,
  opts: { category?: string; keyword?: string; limit?: number; offset?: number } = {},
): { rows: Array<{ id: string; title: string; category: string | null; url: string | null }>; total: number } {
  const { category, keyword, limit = 30, offset = 0 } = opts;
  const predicates: string[] = [];
  const params: unknown[] = [];
  if (category) {
    predicates.push("LOWER(category) LIKE '%' || LOWER(?) || '%'");
    params.push(category);
  }
  if (keyword) {
    predicates.push("(LOWER(title) LIKE '%' || LOWER(?) || '%' OR LOWER(body) LIKE '%' || LOWER(?) || '%')");
    params.push(keyword, keyword);
  }
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM hig_entries ${where}`).get(...params) as any).c as number;
  const rows = db.prepare(
    `SELECT id, title, category, url FROM hig_entries ${where} ORDER BY category, title LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as any[];
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, title: r.title, category: r.category ?? null, url: r.url ?? null })),
  };
}

export function filterEvolutionProposals(
  db: DatabaseType,
  opts: { swiftVersion?: string; status?: string; author?: string; keyword?: string; limit?: number; offset?: number } = {},
): { rows: Array<{ id: string; number: number; title: string; status: string | null; authors: string; swift_version: string | null; url: string }>; total: number } {
  const { swiftVersion, status, author, keyword, limit = 30, offset = 0 } = opts;

  if (keyword) {
    // FTS path with optional post-filters
    const predicates: string[] = [];
    const params: unknown[] = [keyword];
    if (swiftVersion) { predicates.push("e.swift_version LIKE ? || '%'"); params.push(swiftVersion); }
    if (status) { predicates.push("LOWER(e.status) LIKE '%' || LOWER(?) || '%'"); params.push(status); }
    if (author) { predicates.push("LOWER(e.authors) LIKE '%' || LOWER(?) || '%'"); params.push(author); }
    const filterSql = predicates.length ? `AND ${predicates.join(" AND ")}` : "";
    const total = (db.prepare(`
      SELECT COUNT(*) AS c
      FROM evolution_fts JOIN evolution e ON e.rowid = evolution_fts.rowid
      WHERE evolution_fts MATCH ? ${filterSql}
    `).get(...params) as any).c as number;
    const rows = db.prepare(`
      SELECT e.id, e.number, e.title, e.status, e.authors, e.swift_version, e.url,
             bm25(evolution_fts) AS score
      FROM evolution_fts
      JOIN evolution e ON e.rowid = evolution_fts.rowid
      WHERE evolution_fts MATCH ? ${filterSql}
      ORDER BY score
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];
    return { total, rows };
  }

  // Non-FTS path
  const predicates: string[] = [];
  const params: unknown[] = [];
  if (swiftVersion) { predicates.push("swift_version LIKE ? || '%'"); params.push(swiftVersion); }
  if (status) { predicates.push("LOWER(status) LIKE '%' || LOWER(?) || '%'"); params.push(status); }
  if (author) { predicates.push("LOWER(authors) LIKE '%' || LOWER(?) || '%'"); params.push(author); }
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM evolution ${where}`).get(...params) as any).c as number;
  const rows = db.prepare(
    `SELECT id, number, title, status, authors, swift_version, url FROM evolution ${where} ORDER BY CAST(number AS INTEGER) DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as any[];
  return { total, rows };
}

export function getSessionTranscriptChunk(
  db: DatabaseType,
  id: string,
  chunkIndex: number,
  chunkSize: number,
): { title: string; year: number; url: string; chunk: string; chunkIndex: number; totalChunks: number; transcriptLength: number } | null {
  const row = db.prepare(`SELECT transcript, title, year, url FROM sessions WHERE id = ?`).get(id) as any;
  if (!row) return null;
  const transcript: string = row.transcript ?? "";
  const transcriptLength = transcript.length;
  const totalChunks = transcriptLength === 0 ? 0 : Math.ceil(transcriptLength / chunkSize);
  const start = chunkIndex * chunkSize;
  const chunk = transcript.substring(start, start + chunkSize);
  return { title: row.title, year: row.year, url: row.url, chunk, chunkIndex, totalChunks, transcriptLength };
}

export function getTopicsByYear(
  db: DatabaseType,
  year?: number,
  topN = 15,
): { year?: number; topics: Array<{ topic: string; count: number }> } | { years: Record<number, Array<{ topic: string; count: number }>> } {
  if (year !== undefined) {
    const rows = db.prepare(
      `SELECT topics FROM sessions WHERE year = ? AND topics IS NOT NULL AND topics != '[]'`,
    ).all(year) as any[];
    const counts = new Map<string, number>();
    for (const r of rows) {
      try { for (const t of JSON.parse(r.topics) as string[]) counts.set(t, (counts.get(t) ?? 0) + 1); } catch { /* skip */ }
    }
    const topics = [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, topN);
    return { year, topics };
  }
  // All years
  const rows = db.prepare(
    `SELECT year, topics FROM sessions WHERE topics IS NOT NULL AND topics != '[]' ORDER BY year DESC`,
  ).all() as any[];
  const byYear = new Map<number, Map<string, number>>();
  for (const r of rows) {
    try {
      const arr = JSON.parse(r.topics) as string[];
      if (!byYear.has(r.year)) byYear.set(r.year, new Map());
      const map = byYear.get(r.year)!;
      for (const t of arr) map.set(t, (map.get(t) ?? 0) + 1);
    } catch { /* skip */ }
  }
  const years: Record<number, Array<{ topic: string; count: number }>> = {};
  for (const [yr, counts] of byYear.entries()) {
    years[yr] = [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, topN);
  }
  return { years };
}

export function listSampleCode(
  db: DatabaseType,
  opts: { year?: number; topic?: string; tag?: string; limit?: number; offset?: number } = {},
): { rows: Array<{ id: string; title: string; url: string; kind: string; year: number | null; session_id: string | null; session_title: string | null; session_number: string | null }>; total: number } {
  const { year, topic, tag, limit = 30, offset = 0 } = opts;
  const predicates: string[] = [];
  const params: unknown[] = [];
  if (year !== undefined) { predicates.push("s.year = ?"); params.push(year); }
  if (topic) { predicates.push("LOWER(s.topics) LIKE '%' || LOWER(?) || '%'"); params.push(topic); }
  if (tag) { predicates.push("LOWER(sc.kind) LIKE '%' || LOWER(?) || '%'"); params.push(tag); }
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const total = (db.prepare(`
    SELECT COUNT(*) AS c FROM sample_code sc
    LEFT JOIN sessions s ON s.id = sc.session_id
    ${where}
  `).get(...params) as any).c as number;
  const rows = db.prepare(`
    SELECT sc.id, sc.title, sc.url, sc.kind,
           s.year, s.id AS session_id, s.title AS session_title, s.session_number
    FROM sample_code sc
    LEFT JOIN sessions s ON s.id = sc.session_id
    ${where}
    ORDER BY s.year DESC, s.session_number ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind,
      year: r.year ?? null,
      session_id: r.session_id ?? null,
      session_title: r.session_title ?? null,
      session_number: r.session_number ?? null,
    })),
  };
}

// ---------- wwdc_list_sessions ----------

export function listSessionsByYearFull(
  db: DatabaseType,
  year: number,
  opts: {
    sortBy?: "session_number" | "duration" | "title";
    topic?: string;
    platform?: string;
    hasTranscript?: boolean;
    hasSampleCode?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): { rows: any[]; total: number } {
  const { sortBy = "session_number", topic, platform, hasTranscript, hasSampleCode, limit = 20, offset = 0 } = opts;
  const predicates: string[] = ["year = ?"];
  const params: unknown[] = [year];

  if (topic) {
    predicates.push("LOWER(topics) LIKE ?");
    params.push(`%${topic.toLowerCase()}%`);
  }
  if (platform) {
    predicates.push("LOWER(platforms) LIKE ?");
    params.push(`%${platform.toLowerCase()}%`);
  }
  if (hasTranscript === true) {
    predicates.push("LENGTH(COALESCE(transcript,'')) > 200");
  }
  if (hasSampleCode === true) {
    predicates.push("LENGTH(COALESCE(sample_code_urls,'[]')) > 2");
  }

  const orderCol = sortBy === "duration" ? "duration" : sortBy === "title" ? "title" : "session_number";
  const where = predicates.join(" AND ");
  const sql = `
    SELECT id, title, session_number, duration, topics, platforms, url,
           CASE WHEN LENGTH(COALESCE(transcript,'')) > 200 THEN 1 ELSE 0 END as has_transcript,
           CASE WHEN LENGTH(COALESCE(sample_code_urls,'[]')) > 2 THEN 1 ELSE 0 END as has_sample_code
    FROM sessions
    WHERE ${where}
    ORDER BY ${orderCol} ASC
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS c FROM sessions WHERE ${where}`;

  const rows = db.prepare(sql).all(...params, limit, offset) as any[];
  const total = (db.prepare(countSql).get(...params) as any).c as number;
  return { rows, total };
}

// ---------- wwdc_speaker_search ----------

export function findSessionsBySpeaker(
  db: DatabaseType,
  speaker: string,
  year?: number,
  limit = 20,
): Array<SearchHit & { year?: number; speakers?: string[] }> {
  const params: unknown[] = [`%${speaker.toLowerCase()}%`];
  let sql = `
    SELECT id, year, session_number, title, url, speakers, topics
    FROM sessions
    WHERE LOWER(speakers) LIKE ?
  `;
  if (year !== undefined) {
    sql += " AND year = ?";
    params.push(year);
  }
  sql += " ORDER BY year DESC, session_number ASC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id as string,
    kind: "session" as const,
    title: r.title as string,
    url: r.url as string,
    year: r.year as number | undefined,
    speakers: safeJson<string[]>(r.speakers, []),
  }));
}

// ---------- wwdc_transcript_search ----------

export function searchTranscripts(
  db: DatabaseType,
  query: string,
  opts: {
    year?: number;
    yearMin?: number;
    yearMax?: number;
    limit?: number;
    offset?: number;
  } = {},
): { hits: Array<SearchHit & { deepLinks?: string; score?: number }>; total: number } {
  const { year, yearMin, yearMax, limit = 10, offset = 0 } = opts;
  const predicates: string[] = [
    "sessions_fts MATCH ?",
    "LENGTH(COALESCE(s.transcript, '')) > 200",
  ];
  const params: unknown[] = [query];

  if (year !== undefined) {
    predicates.push("s.year = ?");
    params.push(year);
  } else {
    if (yearMin !== undefined) {
      predicates.push("s.year >= ?");
      params.push(yearMin);
    }
    if (yearMax !== undefined) {
      predicates.push("s.year <= ?");
      params.push(yearMax);
    }
  }

  const where = predicates.join(" AND ");
  // sessions_fts column indices: id=0(UNINDEXED), title=1, description=2, transcript=3, topics=4
  const sql = `
    SELECT s.id, s.year, s.title, s.url, s.deep_links,
           snippet(sessions_fts, 2, '**', '**', '…', 40) AS snip,
           bm25(sessions_fts) AS score
    FROM sessions_fts
    JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE ${where}
    ORDER BY score
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) AS c
    FROM sessions_fts
    JOIN sessions s ON s.rowid = sessions_fts.rowid
    WHERE ${where}
  `;

  const rows = db.prepare(sql).all(...params, limit, offset) as any[];
  const total = (db.prepare(countSql).get(...params) as any).c as number;
  const hits = rows.map((r) => ({
    id: r.id as string,
    kind: "session" as const,
    title: r.title as string,
    url: r.url as string,
    snippet: (r.snip ?? undefined) as string | undefined,
    year: (r.year ?? undefined) as number | undefined,
    score: (r.score ?? undefined) as number | undefined,
    deepLinks: (r.deep_links ?? undefined) as string | undefined,
  }));
  return { hits, total };
}

// ---------- apple_doc_list_framework ----------

export function listDocsByFramework(
  db: DatabaseType,
  framework: string,
  opts: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {},
): { rows: Array<{ id: string; title: string; role: string | null; type: string | null; url: string }>; total: number } {
  const { type, limit = 50, offset = 0 } = opts;
  const fw = framework.toLowerCase();
  const predicates: string[] = [
    "(LOWER(modules) LIKE ? OR LOWER(id) LIKE ?)",
  ];
  const params: unknown[] = [`%${fw}%`, `${fw}/%`];

  if (type) {
    predicates.push("LOWER(COALESCE(symbol_kind, role, '')) LIKE ?");
    params.push(`%${type.toLowerCase()}%`);
  }

  const where = predicates.join(" AND ");
  const sql = `
    SELECT id, title, role, symbol_kind AS type, url
    FROM apple_docs
    WHERE ${where}
    ORDER BY title
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS c FROM apple_docs WHERE ${where}`;

  const rows = db.prepare(sql).all(...params, limit, offset) as any[];
  const total = (db.prepare(countSql).get(...params) as any).c as number;
  return { rows, total };
}

// ---------- apple_api_deprecation ----------

export function getApiDeprecation(
  db: DatabaseType,
  apiName: string,
): { rows: any[]; fallback: boolean } {
  // Check if deprecation columns exist (they may not if migration hasn't run)
  const colCheck = db.prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info('apple_docs') WHERE name = 'deprecated'`,
  ).get() as { c: number };

  if (colCheck.c === 0) {
    // Fallback: columns not yet present
    const rows = db.prepare(
      `SELECT id, title, url FROM apple_docs WHERE LOWER(title) = LOWER(?) LIMIT 5`,
    ).all(apiName) as any[];
    return { rows, fallback: true };
  }

  const rows = db.prepare(
    `SELECT id, title, deprecated, deprecated_at, introduced_at, deprecated_message, url
     FROM apple_docs
     WHERE (LOWER(title) = LOWER(?) OR LOWER(id) LIKE '%/' || LOWER(?))
       AND deprecated = 1
     ORDER BY deprecated_at DESC
     LIMIT 10`,
  ).all(apiName, apiName) as any[];
  return { rows, fallback: false };
}

// ---------- apple_api_availability ----------

export function getApiAvailability(
  db: DatabaseType,
  apiName: string,
): any[] {
  return db.prepare(
    `SELECT id, title, introduced_at, deprecated_at, deprecated, url
     FROM apple_docs
     WHERE LOWER(title) = LOWER(?) OR LOWER(id) LIKE '%/' || LOWER(?)
     LIMIT 5`,
  ).all(apiName, apiName) as any[];
}

// ---------- apple_release_notes_search ----------

export function searchReleaseNotes(
  db: DatabaseType,
  query: string,
  opts: { os?: string; limit?: number; offset?: number },
): { rows: any[]; tableExists: boolean } {
  const tableCheck = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='release_notes'`,
  ).get() as any;
  if (!tableCheck) return { rows: [], tableExists: false };

  const { os, limit = 10, offset = 0 } = opts;
  let sql: string;
  let params: any[];

  if (os) {
    sql = `SELECT rn.id, rn.os, rn.version, rn.title, rn.url,
                  snippet(release_notes_fts, 4, '**', '**', '…', 40) AS snip,
                  bm25(release_notes_fts, 0, 0, 0, 1.0, 0) AS score
           FROM release_notes_fts
           JOIN release_notes rn ON rn.rowid = release_notes_fts.rowid
           WHERE release_notes_fts MATCH ? AND rn.os = ?
           ORDER BY score
           LIMIT ? OFFSET ?`;
    params = [query, os, limit, offset];
  } else {
    sql = `SELECT rn.id, rn.os, rn.version, rn.title, rn.url,
                  snippet(release_notes_fts, 4, '**', '**', '…', 40) AS snip,
                  bm25(release_notes_fts, 0, 0, 0, 1.0, 0) AS score
           FROM release_notes_fts
           JOIN release_notes rn ON rn.rowid = release_notes_fts.rowid
           WHERE release_notes_fts MATCH ?
           ORDER BY score
           LIMIT ? OFFSET ?`;
    params = [query, limit, offset];
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return { rows, tableExists: true };
}

// ---------- apple_what_replaced ----------

export function findApiReplacement(
  db: DatabaseType,
  apiName: string,
): { deprecation: any[]; sessions: any[] } {
  const deprecation = db.prepare(
    `SELECT id, title, deprecated_message, deprecated_at, url
     FROM apple_docs
     WHERE (LOWER(title) = LOWER(?) OR LOWER(id) LIKE '%/' || LOWER(?))
       AND (deprecated = 1 OR deprecated_message IS NOT NULL)
     LIMIT 3`,
  ).all(apiName, apiName) as any[];

  let sessions: any[] = [];
  if (deprecation.length > 0) {
    const msg = deprecation[0].deprecated_message;
    if (msg) {
      // Extract a candidate replacement name from the deprecated_message
      const candidate = msg.replace(/^[Uu]se\s+/i, "").split(/[\s,.(]/)[0];
      if (candidate && candidate.length > 2) {
        sessions = db.prepare(
          `SELECT s.id, s.year, s.title, s.url
           FROM sessions_fts
           JOIN sessions s ON s.rowid = sessions_fts.rowid
           WHERE sessions_fts MATCH ?
           ORDER BY bm25(sessions_fts, 0, 10.0, 5.0, 1.0, 0)
           LIMIT 5`,
        ).all(`"${candidate.replace(/"/g, '""')}"`) as any[];
      }
    }
  }
  return { deprecation, sessions };
}

// ---------- apple_search_all ----------

export function searchAll(
  db: DatabaseType,
  query: string,
  opts: { types?: string[]; limit?: number },
): any[] {
  const { types = ["session", "doc", "hig", "evolution"], limit = 15 } = opts;
  const q = query;
  const results: any[] = [];

  if (types.includes("session")) {
    const rows = db.prepare(
      `SELECT 'session' AS type, s.id, CAST(s.year AS TEXT) AS year, s.title, s.url,
              snippet(sessions_fts, 1, '**', '**', '…', 30) AS snip,
              bm25(sessions_fts, 0, 10.0, 5.0, 1.0, 0) AS score
       FROM sessions_fts JOIN sessions s ON s.rowid = sessions_fts.rowid
       WHERE sessions_fts MATCH ?
       LIMIT 5`,
    ).all(q) as any[];
    results.push(...rows);
  }

  if (types.includes("doc")) {
    const rows = db.prepare(
      `SELECT 'doc' AS type, ad.id, '' AS year, ad.title, ad.url,
              snippet(apple_docs_fts, 1, '**', '**', '…', 30) AS snip,
              bm25(apple_docs_fts, 0, 10.0, 5.0, 1.0, 1.0, 1.0) AS score
       FROM apple_docs_fts JOIN apple_docs ad ON ad.rowid = apple_docs_fts.rowid
       WHERE apple_docs_fts MATCH ?
       LIMIT 5`,
    ).all(q) as any[];
    results.push(...rows);
  }

  if (types.includes("hig")) {
    const rows = db.prepare(
      `SELECT 'hig' AS type, h.id, '' AS year, h.title, h.url,
              snippet(hig_fts, 1, '**', '**', '…', 30) AS snip,
              bm25(hig_fts, 0, 10.0, 5.0, 1.0) AS score
       FROM hig_fts JOIN hig_entries h ON h.rowid = hig_fts.rowid
       WHERE hig_fts MATCH ?
       LIMIT 3`,
    ).all(q) as any[];
    results.push(...rows);
  }

  if (types.includes("evolution")) {
    const rows = db.prepare(
      `SELECT 'evolution' AS type, e.id, '' AS year, e.title, e.url,
              snippet(evolution_fts, 1, '**', '**', '…', 30) AS snip,
              bm25(evolution_fts, 0, 10.0, 1.0, 5.0) AS score
       FROM evolution_fts JOIN evolution e ON e.rowid = evolution_fts.rowid
       WHERE evolution_fts MATCH ?
       LIMIT 3`,
    ).all(q) as any[];
    results.push(...rows);
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit);
}

// ---------- wwdc_sessions_for_api ----------

export function findSessionsForApi(
  db: DatabaseType,
  symbol: string,
  year?: number,
): any[] {
  let sql: string;
  let params: any[];

  if (year) {
    sql = `SELECT s.id, s.year, s.title, s.url,
                  snippet(sessions_fts, 2, '**', '**', '…', 40) AS transcript_snip,
                  bm25(sessions_fts, 0, 5.0, 3.0, 1.0, 0) AS score
           FROM sessions_fts
           JOIN sessions s ON s.rowid = sessions_fts.rowid
           WHERE sessions_fts MATCH ? AND s.year = ?
           ORDER BY score
           LIMIT 20`;
    params = [symbol, year];
  } else {
    sql = `SELECT s.id, s.year, s.title, s.url,
                  snippet(sessions_fts, 2, '**', '**', '…', 40) AS transcript_snip,
                  bm25(sessions_fts, 0, 5.0, 3.0, 1.0, 0) AS score
           FROM sessions_fts
           JOIN sessions s ON s.rowid = sessions_fts.rowid
           WHERE sessions_fts MATCH ?
           ORDER BY score
           LIMIT 20`;
    params = [symbol];
  }

  return db.prepare(sql).all(...params) as any[];
}

// ---------- swift_forum_search ----------

export function searchSwiftForums(
  db: DatabaseType,
  query: string,
  opts: { category?: string; limit?: number; offset?: number },
): any[] {
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
  ).get("swift_forum_posts");
  if (!tableExists) return [];

  const { category, limit = 10, offset = 0 } = opts;
  let sql: string;
  let params: any[];

  if (category) {
    sql = `SELECT p.id, p.topic_id, p.title, p.category, p.url, p.author, p.post_count, p.reply_count,
                  snippet(swift_forum_posts_fts, 3, '**', '**', '…', 40) AS snip,
                  bm25(swift_forum_posts_fts, 0, 10.0, 5.0, 1.0) AS score
           FROM swift_forum_posts_fts
           JOIN swift_forum_posts p ON p.rowid = swift_forum_posts_fts.rowid
           WHERE swift_forum_posts_fts MATCH ? AND p.category = ?
           ORDER BY score
           LIMIT ? OFFSET ?`;
    params = [query, category, limit, offset];
  } else {
    sql = `SELECT p.id, p.topic_id, p.title, p.category, p.url, p.author, p.post_count, p.reply_count,
                  snippet(swift_forum_posts_fts, 3, '**', '**', '…', 40) AS snip,
                  bm25(swift_forum_posts_fts, 0, 10.0, 5.0, 1.0) AS score
           FROM swift_forum_posts_fts
           JOIN swift_forum_posts p ON p.rowid = swift_forum_posts_fts.rowid
           WHERE swift_forum_posts_fts MATCH ?
           ORDER BY score
           LIMIT ? OFFSET ?`;
    params = [query, limit, offset];
  }

  return db.prepare(sql).all(...params) as any[];
}

// ---------- apple_dev_forum_search ----------

export function searchAppleDevForums(
  db: DatabaseType,
  query: string,
  opts: { limit?: number; offset?: number },
): any[] {
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
  ).get("apple_dev_forum_posts");
  if (!tableExists) return [];

  const { limit = 10, offset = 0 } = opts;
  const sql = `SELECT p.id, p.title, p.tags, p.url, p.author, p.published_at,
                      snippet(apple_dev_forum_posts_fts, 3, '**', '**', '…', 40) AS snip,
                      bm25(apple_dev_forum_posts_fts, 0, 10.0, 5.0, 1.0) AS score
               FROM apple_dev_forum_posts_fts
               JOIN apple_dev_forum_posts p ON p.rowid = apple_dev_forum_posts_fts.rowid
               WHERE apple_dev_forum_posts_fts MATCH ?
               ORDER BY score
               LIMIT ? OFFSET ?`;

  return db.prepare(sql).all(query, limit, offset) as any[];
}

// ---------- session_summaries ----------

export function getSessionSummary(
  db: DatabaseType,
  sessionId: string,
): {
  session_id: string;
  summary: string;
  key_apis: string[];
  key_topics: string[];
  code_patterns: string[];
  difficulty: string | null;
  model_used: string | null;
  generated_at: string | null;
  title: string;
  year: number;
  url: string;
  description: string;
  topics: string[];
} | null {
  const tableCheck = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries'`,
  ).get() as any;
  if (!tableCheck) return null;

  const row = db.prepare(`
    SELECT ss.session_id, ss.summary, ss.key_apis, ss.key_topics,
           ss.code_patterns, ss.difficulty, ss.model_used, ss.generated_at,
           s.title, s.year, s.url, s.description, s.topics
    FROM session_summaries ss
    JOIN sessions s ON s.id = ss.session_id
    WHERE ss.session_id = ?
  `).get(sessionId) as any;
  if (!row) return null;
  return {
    session_id: row.session_id,
    summary: row.summary,
    key_apis: safeJson<string[]>(row.key_apis, []),
    key_topics: safeJson<string[]>(row.key_topics, []),
    code_patterns: safeJson<string[]>(row.code_patterns, []),
    difficulty: row.difficulty ?? null,
    model_used: row.model_used ?? null,
    generated_at: row.generated_at ?? null,
    title: row.title,
    year: row.year,
    url: row.url,
    description: row.description ?? "",
    topics: safeJson<string[]>(row.topics, []),
  };
}

// ---------- cross_references ----------

export function getCrossReferences(
  db: DatabaseType,
  entityType: string,
  entityId: string,
  direction: "out" | "in" | "both" = "both",
): {
  outgoing: Array<{ to_type: string; to_id: string; relationship: string; weight: number }>;
  incoming: Array<{ from_type: string; from_id: string; relationship: string; weight: number }>;
} {
  const tableCheck = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='cross_references'`,
  ).get() as any;
  if (!tableCheck) return { outgoing: [], incoming: [] };

  const outgoing =
    direction !== "in"
      ? (db.prepare(`
          SELECT to_type, to_id, relationship, weight
          FROM cross_references
          WHERE from_type = ? AND from_id = ?
          ORDER BY weight DESC LIMIT 20
        `).all(entityType, entityId) as Array<{
          to_type: string;
          to_id: string;
          relationship: string;
          weight: number;
        }>)
      : [];

  const incoming =
    direction !== "out"
      ? (db.prepare(`
          SELECT from_type, from_id, relationship, weight
          FROM cross_references
          WHERE to_type = ? AND to_id = ?
          ORDER BY weight DESC LIMIT 20
        `).all(entityType, entityId) as Array<{
          from_type: string;
          from_id: string;
          relationship: string;
          weight: number;
        }>)
      : [];

  return { outgoing, incoming };
}

// ---------- export_status ----------

export function getExportStatus(db: DatabaseType): Array<{ table_name: string; count: number }> {
  const tables = [
    "sessions",
    "sessions_with_transcript",
    "apple_docs",
    "session_summaries",
    "cross_references",
    "release_notes",
    "swift_forum_posts",
    "apple_dev_forum_posts",
    "tutorials",
    "hig_entries",
    "evolution",
    "sample_code",
    "swift_book",
    "appstore_guidelines",
    "embeddings",
  ];

  const existing = new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>)
      .map((r) => r.name),
  );

  const results: Array<{ table_name: string; count: number }> = [];

  for (const table of tables) {
    if (table === "sessions_with_transcript") {
      if (existing.has("sessions")) {
        const row = db.prepare(
          `SELECT COUNT(*) AS c FROM sessions WHERE LENGTH(COALESCE(transcript,''))>200`,
        ).get() as { c: number };
        results.push({ table_name: table, count: row.c });
      }
    } else if (existing.has(table)) {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
      results.push({ table_name: table, count: row.c });
    } else {
      results.push({ table_name: table, count: 0 });
    }
  }

  return results;
}

// ---------- appstore_guideline_get ----------

export function getAppStoreGuidelineById(
  db: DatabaseType,
  id: string,
): { exact: AppStoreGuidelineEntry | null; partialMatches: AppStoreGuidelineEntry[] } {
  const exact = db.prepare(
    `SELECT * FROM appstore_guidelines WHERE id = ? OR section_number = ?`,
  ).get(id, id) as any;

  if (exact) {
    return {
      exact: { id: exact.id, sectionNumber: exact.section_number ?? "", title: exact.title, body: exact.body ?? "", url: exact.url, updatedAt: exact.updated_at },
      partialMatches: [],
    };
  }

  const partialRows = db.prepare(
    `SELECT * FROM appstore_guidelines WHERE id LIKE ? OR section_number LIKE ? LIMIT 3`,
  ).all(`${id}%`, `${id}%`) as any[];

  return {
    exact: null,
    partialMatches: partialRows.map((r): AppStoreGuidelineEntry => ({
      id: r.id,
      sectionNumber: r.section_number ?? "",
      title: r.title,
      body: r.body ?? "",
      url: r.url,
      updatedAt: r.updated_at,
    })),
  };
}
