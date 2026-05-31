/**
 * MCP tool registrations.
 *
 * Exposes 15 tools:
 *   - wwdc_search
 *   - wwdc_list_years
 *   - wwdc_list_topics
 *   - wwdc_list_pathways
 *   - wwdc_get_pathway
 *   - wwdc_get_session
 *   - wwdc_session_deep_link
 *   - wwdc_list_session_code
 *   - wwdc_sample_code_grep
 *   - apple_doc_lookup
 *   - apple_tutorial_get
 *   - apple_hig_search
 *   - apple_swift_evolution_get
 *   - apple_swift_evolution_list
 *   - wwdc_ingest_status
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  getSession,
  listSessionsByYear,
  listYears,
  listTopics,
  listPathways,
  getPathway,
  getTutorial,
  listSampleCodeForSession,
  searchSessionsFts,
  searchTutorialsFts,
  searchHigFts,
  searchEvolutionFts,
  getEvolution,
  listIngestStatus,
  listSessionsAddedSince,
} from "../db/queries.js";
import { httpGet } from "../services/http.js";
import { APPLE_DOCS_BASE } from "../constants.js";
import { formatResponse, errorText, truncate } from "../services/format.js";
import { semanticSearch, checkOllama } from "../services/ollama.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";

const formatArg = z.enum(["markdown", "json"]).default("markdown").describe("Response format");
const limitArg = z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT);
const offsetArg = z.number().int().min(0).default(0);
const detailArg = z.enum(["compact", "standard", "detailed"]).default("standard").describe("How much judgment and context to include.");

/** Quote an FTS5 query safely — keep phrases, escape quotes. */
function ftsQuote(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

function documentationPathFromInput(input: string): { clean?: string; error?: string } {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { error: "Invalid Apple documentation URL." };
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== "developer.apple.com") {
      return { error: "Only https://developer.apple.com/documentation/... URLs are supported." };
    }
    const match = parsed.pathname.match(/^\/documentation\/(.+)$/);
    if (!match) {
      return { error: "Apple documentation URL must start with /documentation/." };
    }
    return { clean: normalizeDocumentationPath(match[1]!) };
  }
  return { clean: normalizeDocumentationPath(trimmed) };
}

function normalizeDocumentationPath(input: string): string {
  return input
    .replace(/^\/+/, "")
    .replace(/^documentation\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
}

function deepLinkUrl(baseUrl: string, seconds: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("time", String(seconds));
  return url.toString();
}

type SearchHitWithJudgment = {
  id: string;
  kind: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  year?: number;
  topics?: string[];
  platforms?: string[];
  judgment?: {
    confidence: "high" | "medium" | "low";
    reasons: string[];
    caveats: string[];
    suggested_next_tools: string[];
  };
};

const APPLE_PLATFORM_TERMS = ["ios", "macos", "watchos", "tvos", "visionos", "ipados"];
const APPLE_FRAMEWORK_TERMS = [
  "swiftui", "swiftdata", "observation", "storekit", "gamekit", "appkit", "uikit",
  "instruments", "foundation models", "foundationmodels", "core data", "coredata",
  "metal", "realitykit", "cloudkit", "widgetkit",
];

function analyzeQuery(query: string) {
  const normalized = query.toLowerCase().replace(/[^a-z0-9+.# ]+/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const platformTerms = APPLE_PLATFORM_TERMS.filter((term) => words.includes(term));
  const frameworkTerms = APPLE_FRAMEWORK_TERMS.filter((term) => normalized.includes(term));
  return {
    normalized,
    platformTerms,
    frameworkTerms,
    isPlatformOnly: words.length > 0 && words.every((word) => APPLE_PLATFORM_TERMS.includes(word)),
  };
}

function judgeHit(query: string, hit: SearchHitWithJudgment): NonNullable<SearchHitWithJudgment["judgment"]> {
  const q = query.toLowerCase();
  const signals = analyzeQuery(query);
  const reasons: string[] = [];
  const caveats: string[] = [];
  const next = hit.kind === "session"
    ? ["wwdc_get_session", "wwdc_session_deep_link"]
    : hit.kind === "tutorial"
      ? ["apple_tutorial_get"]
      : hit.kind === "hig"
        ? ["apple_hig_search", "apple_doc_lookup"]
        : ["apple_swift_evolution_get"];

  if (hit.title.toLowerCase().includes(q)) reasons.push("query appears in title");
  if ((hit.snippet ?? "").toLowerCase().includes(q)) reasons.push("query appears in indexed snippet");
  if ((hit.topics ?? []).some((topic) => topic.toLowerCase().includes(q))) reasons.push("query appears in topics/status");
  if ((hit.platforms ?? []).some((platform) => signals.platformTerms.includes(platform.toLowerCase()))) reasons.push("query appears in platform metadata");
  if (signals.frameworkTerms.some((term) => `${hit.title} ${(hit.topics ?? []).join(" ")} ${hit.snippet ?? ""}`.toLowerCase().includes(term))) reasons.push("Apple framework term matches indexed metadata");
  if (hit.kind === "session" && hit.year && hit.year >= 2024) reasons.push("recent WWDC session");
  if (!hit.snippet) caveats.push("no snippet available for this hit");
  if (hit.kind === "session" && !hit.year) caveats.push("session year missing");
  if (signals.isPlatformOnly) caveats.push("platform-only query is broad; add framework, API, or failure symptom for audit-grade guidance");

  const rawConfidence = reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";
  const confidence = signals.isPlatformOnly && rawConfidence === "high" ? "medium" : rawConfidence;
  return { confidence, reasons, caveats, suggested_next_tools: next };
}

function judgeSearch(query: string, hits: SearchHitWithJudgment[], total: number, hybrid: boolean, ingestStatus = [] as ReturnType<typeof listIngestStatus>) {
  const signals = analyzeQuery(query);
  const top = hits[0]?.judgment?.confidence ?? "low";
  const confidence = total === 0 ? "low" : top;
  const caveats: string[] = [];
  const indexedItems = ingestStatus.reduce((sum, row) => sum + row.itemsIngested, 0);
  if (total === 0 && indexedItems === 0) {
    caveats.push("local index appears empty; run `npm run ingest:all` or `npm run ingest:wwdc -- --year 2024 --year 2025`");
  } else if (total === 0) {
    caveats.push("no indexed matches; broaden query or run targeted ingest");
  }
  if (signals.isPlatformOnly) caveats.push("platform-only query is broad; add framework, API, error text, or app feature before making code changes");
  if (!hybrid) caveats.push("semantic rerank unavailable; results use FTS only");
  if (hits.length < total) caveats.push("more results available via offset");
  return {
    confidence,
    basis: hits.slice(0, 3).map((hit) => `${hit.kind}:${hit.id}`),
    caveats,
    suggested_next_tools: total === 0 ? ["wwdc_ingest_status", "wwdc_list_topics", "wwdc_list_years"] : [...new Set(hits.flatMap((hit) => hit.judgment?.suggested_next_tools ?? []))].slice(0, 4),
    answer_readiness: confidence === "high" ? "good_seed_context" : confidence === "medium" ? "needs_follow_up" : "insufficient_context",
  };
}

export function registerAllTools(server: McpServer, db: DatabaseType): void {
  // ---------- wwdc_search ----------
  server.registerTool(
    "wwdc_search",
    {
      title: "Search WWDC + Apple docs",
      description:
        "Full-text + semantic search across WWDC sessions, tutorials, HIG, and Swift Evolution. Returns ranked hits with snippets. If Ollama is available, hybrid (FTS + vector) is used; otherwise FTS only.",
      inputSchema: {
        query: z.string().min(1).describe("Search query; supports multi-word phrases."),
        kinds: z.array(z.enum(["session", "tutorial", "hig", "evolution"])).default(["session", "tutorial", "hig", "evolution"]),
        year: z.number().int().optional().describe("Restrict to a WWDC year."),
        year_min: z.number().int().optional().describe("Restrict WWDC sessions to this year or newer."),
        year_max: z.number().int().optional().describe("Restrict WWDC sessions to this year or older."),
        topics: z.array(z.string().min(1)).default([]).describe("Require WWDC session topics/status text to include every value."),
        platforms: z.array(z.string().min(1)).default([]).describe("Require WWDC session platforms to include every value."),
        require_transcript: z.boolean().default(false).describe("Only return WWDC sessions with transcript text."),
        judgment: z.boolean().default(true).describe("Include per-hit and overall search judgment metadata."),
        detail: detailArg,
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, kinds, year, year_min, year_max, topics, platforms, require_transcript, judgment, detail, limit, offset, format }) => {
      const fts = ftsQuote(query);
      const hits: SearchHitWithJudgment[] = [];
      let total = 0;

      if (kinds.includes("session")) {
        const { hits: h, total: t } = searchSessionsFts(db, fts, limit, offset, {
          year,
          yearMin: year_min,
          yearMax: year_max,
          topics,
          platforms,
          requireTranscript: require_transcript,
        });
        hits.push(...h);
        total += t;
      }
      if (kinds.includes("tutorial")) {
        const { hits: h, total: t } = searchTutorialsFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }
      if (kinds.includes("hig")) {
        const { hits: h, total: t } = searchHigFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }
      if (kinds.includes("evolution")) {
        const { hits: h, total: t } = searchEvolutionFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }

      // Semantic rerank if Ollama is available.
      const ollamaOn = await checkOllama();
      if (ollamaOn && hits.length > 1) {
        try {
          const vecHits = await semanticSearch(db, query, kinds.map((k) => k), Math.max(limit * 2, 20));
          const scoreMap = new Map(vecHits.map((v) => [`${v.kind}:${v.docId.split(":")[1] ?? v.docId}`, v.score]));
          hits.sort((a, b) => (scoreMap.get(`${b.kind}:${b.id}`) ?? 0) - (scoreMap.get(`${a.kind}:${a.id}`) ?? 0));
        } catch { /* fallback to FTS only */ }
      }

      const page = hits.slice(0, limit);
      const judgedPage = page.map((hit) => judgment || detail === "detailed" ? { ...hit, judgment: judgeHit(query, hit) } : hit);
      const searchJudgment = judgment || detail === "detailed" ? judgeSearch(query, judgedPage, total, ollamaOn, listIngestStatus(db)) : undefined;
      const md = renderSearchMd(query, judgedPage, total, searchJudgment, detail);
      const data = {
        query,
        filters: { kinds, year, year_min, year_max, topics, platforms, require_transcript },
        total,
        count: judgedPage.length,
        hits: judgedPage,
        judgment: searchJudgment,
        hybrid: ollamaOn,
      };
      return { content: [{ type: "text", text: formatResponse(format, md, data) }] };
    },
  );

  // ---------- wwdc_list_years ----------
  server.registerTool(
    "wwdc_list_years",
    {
      title: "List WWDC years",
      description: "Returns the set of WWDC years present in the local index with session counts.",
      inputSchema: { format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ format }) => {
      const rows = listYears(db);
      const md = `# WWDC years\n\n${rows.map((r) => `- **${r.year}** — ${r.count} sessions`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { years: rows }) }] };
    },
  );

  // ---------- wwdc_list_topics ----------
  server.registerTool(
    "wwdc_list_topics",
    {
      title: "List WWDC topics",
      description: "Top topics across WWDC sessions with counts (e.g. SwiftUI, Swift, AI, visionOS).",
      inputSchema: { limit: limitArg, format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, format }) => {
      const rows = listTopics(db).slice(0, limit);
      const md = `# Topics (top ${rows.length})\n\n${rows.map((r) => `- ${r.topic} — ${r.count}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { topics: rows }) }] };
    },
  );

  // ---------- wwdc_list_pathways ----------
  server.registerTool(
    "wwdc_list_pathways",
    {
      title: "List learning pathways",
      description: "Curated + auto-derived Apple learning pathways (SwiftUI, visionOS, Swift 6, AI, etc.).",
      inputSchema: { category: z.string().optional(), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category, format }) => {
      const all = listPathways(db);
      const rows = category ? all.filter((p) => p.category.toLowerCase() === category.toLowerCase()) : all;
      const md = `# Pathways (${rows.length})\n\n${rows.map((p) => `## ${p.title}\n*${p.category}* — ${p.description}\n- id: \`${p.id}\`\n- ${p.steps.length} steps`).join("\n\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { pathways: rows }) }] };
    },
  );

  // ---------- wwdc_get_pathway ----------
  server.registerTool(
    "wwdc_get_pathway",
    {
      title: "Get a specific pathway",
      description: "Returns a pathway with its ordered steps (sessions + tutorials + docs).",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const p = getPathway(db, id);
      if (!p) return { isError: true, content: [{ type: "text", text: errorText(`pathway not found: ${id}`, "Use wwdc_list_pathways to enumerate IDs.") }] };
      const md = `# ${p.title}\n\n${p.description}\n\n**Category:** ${p.category}\n\n## Steps\n${p.steps.map((s) => `${s.order}. [${s.kind}] ${s.title} — ${s.url}${s.estimatedTime ? ` (${s.estimatedTime})` : ""}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, p) }] };
    },
  );

  // ---------- wwdc_get_session ----------
  server.registerTool(
    "wwdc_get_session",
    {
      title: "Get WWDC session",
      description: "Full record for a WWDC session by id (e.g. wwdc2024-10150). Includes description, topics, transcript, sample-code URLs, related docs.",
      inputSchema: {
        id: z.string().min(1).describe("Session id, e.g. wwdc2024-10150"),
        include_transcript: z.boolean().default(true),
        transcript_chars: z.number().int().min(500).max(25_000).default(8000).describe("Maximum transcript characters to return in markdown/json when transcript is included."),
        include_chapters: z.boolean().default(true),
        include_sample_code: z.boolean().default(true),
        include_related_docs: z.boolean().default(true),
        include_judgment: z.boolean().default(true),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, include_transcript, transcript_chars, include_chapters, include_sample_code, include_related_docs, include_judgment, format }) => {
      const s = getSession(db, id);
      if (!s) return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${id}`, "Use wwdc_search or wwdc_list_years → session list.") }] };
      if (!include_transcript) s.transcript = undefined;
      if (s.transcript && s.transcript.length > transcript_chars) s.transcript = truncate(s.transcript, transcript_chars);
      if (!include_chapters) s.deepLinks = [];
      if (!include_sample_code) s.sampleCodeUrls = [];
      if (!include_related_docs) s.relatedDocs = [];
      const sessionJudgment = include_judgment ? {
        confidence: s.transcript ? "high" : "medium",
        coverage: {
          has_transcript: Boolean(s.transcript),
          chapter_count: s.deepLinks?.length ?? 0,
          sample_code_count: s.sampleCodeUrls.length,
          related_doc_count: s.relatedDocs.length,
        },
        caveats: [
          ...(s.transcript ? [] : ["transcript unavailable"]),
          ...((s.deepLinks?.length ?? 0) === 0 ? ["chapter deep links unavailable"] : []),
        ],
        suggested_next_tools: ["wwdc_session_deep_link", "wwdc_list_session_code", "apple_doc_lookup"],
      } : undefined;
      const md = renderSessionMd(s, sessionJudgment);
      return { content: [{ type: "text", text: formatResponse(format, md, { ...s, judgment: sessionJudgment }) }] };
    },
  );

  // ---------- wwdc_session_deep_link ----------
  server.registerTool(
    "wwdc_session_deep_link",
    {
      title: "Create a deep link into a session",
      description: "Returns a URL with a ?time=SECONDS query so the user jumps straight to a chapter.",
      inputSchema: {
        id: z.string().min(1),
        seconds: z.number().int().min(0).optional(),
        timestamp: z.string().optional().describe("HH:MM:SS or MM:SS — alternative to seconds"),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, seconds, timestamp, format }) => {
      const s = getSession(db, id);
      if (!s) return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${id}`) }] };
      let total = seconds;
      if (total === undefined && timestamp) {
        const rawParts = timestamp.split(":");
        const parts = rawParts.map(Number);
        if (
          rawParts.length < 1 ||
          rawParts.length > 3 ||
          parts.some((part) => !Number.isInteger(part) || part < 0)
        ) {
          return { isError: true, content: [{ type: "text", text: errorText("Invalid timestamp. Use HH:MM:SS, MM:SS, or seconds.") }] };
        }
        total = parts.length === 3 ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]! : parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0]!;
      }
      if (total === undefined) return { isError: true, content: [{ type: "text", text: errorText("Provide either `seconds` or `timestamp`.") }] };
      if (!Number.isInteger(total) || total < 0) return { isError: true, content: [{ type: "text", text: errorText("Time must resolve to a non-negative integer number of seconds.") }] };
      const url = deepLinkUrl(s.url, total);
      const md = `[${s.title}](${url}) — ${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { id, url, seconds: total }) }] };
    },
  );

  // ---------- wwdc_list_session_code ----------
  server.registerTool(
    "wwdc_list_session_code",
    {
      title: "List sample-code links for a session",
      description: "Returns every sample-code URL Apple linked from the session page (zips, GitHub repos, snippets).",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const refs = listSampleCodeForSession(db, id);
      const md = refs.length
        ? `# Sample code for ${id}\n\n${refs.map((r) => `- [${r.kind}] ${r.title} — ${r.url}`).join("\n")}`
        : `No sample-code links recorded for ${id}.`;
      return { content: [{ type: "text", text: formatResponse(format, md, { id, count: refs.length, refs }) }] };
    },
  );

  // ---------- wwdc_sample_code_grep ----------
  server.registerTool(
    "wwdc_sample_code_grep",
    {
      title: "Grep WWDC sample-code URLs",
      description: "Filter all indexed sample-code refs by substring/regex (e.g. find sessions with `.zip` or `SwiftData`).",
      inputSchema: {
        pattern: z.string().min(1).describe("Regex or literal substring."),
        is_regex: z.boolean().default(false),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ pattern, is_regex, limit, format }) => {
      const rows = db.prepare(`SELECT id, session_id, title, url, kind FROM sample_code`).all() as Array<{ id: string; session_id: string; title: string; url: string; kind: string }>;
      let re: RegExp | null = null;
      if (is_regex) {
        try {
          re = new RegExp(pattern, "i");
        } catch (e: any) {
          return { isError: true, content: [{ type: "text", text: errorText(`Invalid regex: ${e?.message ?? String(e)}`) }] };
        }
      }
      const needle = pattern.toLowerCase();
      const hits = rows.filter((r) => re ? re.test(r.url) : r.url.toLowerCase().includes(needle)).slice(0, limit);
      const md = `# Sample-code grep: ${pattern}\n\n${hits.map((h) => `- [${h.session_id ?? "?"}] ${h.title}\n  ${h.url}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { pattern, count: hits.length, hits }) }] };
    },
  );

  // ---------- apple_doc_lookup ----------
  server.registerTool(
    "apple_doc_lookup",
    {
      title: "Lookup an Apple developer doc",
      description: "Fetch an Apple /documentation JSON node by path (e.g. 'swiftui/view', 'foundationmodels/languagemodel'). Returns live data (no cache).",
      inputSchema: {
        path: z.string().min(1).describe("Framework path or Apple documentation URL, e.g. `swiftui/view` or `https://developer.apple.com/documentation/swiftui/view`."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ path, format }) => {
      const normalized = documentationPathFromInput(path);
      if (normalized.error || !normalized.clean) {
        return { isError: true, content: [{ type: "text", text: errorText(normalized.error ?? "Invalid documentation path.") }] };
      }
      const clean = normalized.clean;
      const jsonUrl = `https://developer.apple.com/tutorials/data/documentation/${clean}.json`;
      const htmlUrl = `${APPLE_DOCS_BASE}/${clean}`;
      try {
        const { data, status } = await httpGet<{ metadata?: { title?: string; role?: string }; abstract?: Array<{ text: string }> }>(jsonUrl);
        if (status >= 400 || !data) {
          return { isError: true, content: [{ type: "text", text: errorText(`apple docs: HTTP ${status} for ${jsonUrl}`, `Try the path without trailing segments. Browser URL: ${htmlUrl}`) }] };
        }
        const title = data.metadata?.title ?? clean;
        const abstract = (data.abstract ?? []).map((a) => a.text).join("");
        const md = `# ${title}\n\n${abstract}\n\n${htmlUrl}`;
        return { content: [{ type: "text", text: formatResponse(format, md, { title, abstract, url: htmlUrl, raw: data }) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: errorText(e?.message ?? String(e)) }] };
      }
    },
  );

  // ---------- apple_tutorial_get ----------
  server.registerTool(
    "apple_tutorial_get",
    {
      title: "Get an Apple tutorial (DocC)",
      description: "Return a tutorial from local index (ingest first) including chapter list and estimated time.",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const t = getTutorial(db, id);
      if (!t) return { isError: true, content: [{ type: "text", text: errorText(`tutorial not found: ${id}`, "Run: npm run ingest:tutorials") }] };
      const md = `# ${t.title}\n\n*${t.category ?? ""}*${t.estimatedTime ? ` — ${t.estimatedTime}` : ""}\n\n${truncate(t.body, 8000)}\n\n${t.url}`;
      return { content: [{ type: "text", text: formatResponse(format, md, t) }] };
    },
  );

  // ---------- apple_hig_search ----------
  server.registerTool(
    "apple_hig_search",
    {
      title: "Search Human Interface Guidelines",
      description: "Keyword search across HIG topics (components, patterns, platforms).",
      inputSchema: { query: z.string().min(1), limit: limitArg, format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, format }) => {
      const { hits, total } = searchHigFts(db, ftsQuote(query), limit, 0);
      const md = `# HIG results for: ${query}\n\n${hits.map((h) => `- **${h.title}** — ${h.url}\n  ${h.snippet ?? ""}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { total, hits }) }] };
    },
  );

  // ---------- apple_swift_evolution_get ----------
  server.registerTool(
    "apple_swift_evolution_get",
    {
      title: "Get a Swift Evolution proposal",
      description: "Return a proposal by id (e.g. SE-0428) with status, authors, and full body.",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const p = getEvolution(db, id);
      if (!p) return { isError: true, content: [{ type: "text", text: errorText(`proposal not found: ${id}`, "Run npm run ingest:evolution; id format: SE-0428.") }] };
      const md = `# ${p.id}: ${p.title}\n\n**Status:** ${p.status}  **Authors:** ${p.authors.join(", ")}${p.swiftVersion ? `  **Swift:** ${p.swiftVersion}` : ""}\n\n${truncate(p.body, 10000)}\n\n${p.url}`;
      return { content: [{ type: "text", text: formatResponse(format, md, p) }] };
    },
  );

  // ---------- apple_swift_evolution_list ----------
  server.registerTool(
    "apple_swift_evolution_list",
    {
      title: "List Swift Evolution proposals",
      description: "List proposals (optionally filter by status: Implemented, Accepted, Rejected, Active review).",
      inputSchema: {
        status: z.string().optional(),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, limit, offset, format }) => {
      const rows = status
        ? db.prepare(`SELECT id, number, title, status, url FROM evolution WHERE status LIKE ? ORDER BY number LIMIT ? OFFSET ?`).all(`%${status}%`, limit, offset)
        : db.prepare(`SELECT id, number, title, status, url FROM evolution ORDER BY number LIMIT ? OFFSET ?`).all(limit, offset);
      const md = `# Swift Evolution proposals${status ? ` — ${status}` : ""} (${rows.length})\n\n${(rows as any[]).map((r) => `- **${r.id}** ${r.title} — ${r.status}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { count: rows.length, rows }) }] };
    },
  );

  // ---------- wwdc_ingest_status ----------
  server.registerTool(
    "wwdc_ingest_status",
    {
      title: "Ingest status + what's new",
      description: "Shows per-source last-run metadata and the most recent sessions added. Use to confirm the index is fresh before querying.",
      inputSchema: {
        since: z.string().optional().describe("ISO timestamp; defaults to 7 days ago."),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ since, limit, format }) => {
      const sinceIso = since ?? new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const status = listIngestStatus(db);
      const recent = listSessionsAddedSince(db, sinceIso, limit);
      const md = `# Ingest status\n\n${status.map((s) => `- **${s.source}** — last run: ${s.lastRunAt}, items: ${s.itemsIngested}, errors: ${s.errors}${s.notes ? ` (${s.notes})` : ""}`).join("\n")}\n\n## Added since ${sinceIso}\n${recent.map((r) => `- [${r.year}] ${r.title} (${r.id})`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { status, recent, since: sinceIso }) }] };
    },
  );
}

// ---------- helpers ----------

function renderSearchMd(
  query: string,
  hits: SearchHitWithJudgment[],
  total: number,
  judgment?: ReturnType<typeof judgeSearch>,
  detail: "compact" | "standard" | "detailed" = "standard",
): string {
  if (hits.length === 0) return `No matches for **${query}** (total=${total}).`;
  const lines = hits.map((h) => {
    const basics = `- **[${h.kind}]** ${h.title}${h.year ? ` — WWDC ${h.year}` : ""}\n  ${h.url}`;
    if (detail === "compact") return basics;
    const snippet = h.snippet ? `\n  _${h.snippet}_` : "";
    const reasons = detail === "detailed" && h.judgment?.reasons.length
      ? `\n  Judgment: ${h.judgment.confidence}; ${h.judgment.reasons.join("; ")}`
      : "";
    return `${basics}${snippet}${reasons}`;
  });
  const judgmentMd = judgment
    ? `\n\n## Search judgment\n- confidence: ${judgment.confidence}\n- answer readiness: ${judgment.answer_readiness}${judgment.caveats.length ? `\n- caveats: ${judgment.caveats.join("; ")}` : ""}${judgment.suggested_next_tools.length ? `\n- next tools: ${judgment.suggested_next_tools.join(", ")}` : ""}`
    : "";
  return `# Search: ${query}\n\n${lines.join("\n")}\n\n_${hits.length} shown / ${total} matched_${judgmentMd}`;
}

function renderSessionMd(s: {
  id: string; title: string; year: number; url: string; description: string;
  topics: string[]; platforms: string[]; speakers?: string[]; duration?: number;
  transcript?: string; sampleCodeUrls: string[]; relatedDocs: string[];
  deepLinks?: { label: string; seconds: number; url: string }[];
}, judgment?: {
  confidence: string;
  coverage: { has_transcript: boolean; chapter_count: number; sample_code_count: number; related_doc_count: number };
  caveats: string[];
  suggested_next_tools: string[];
}): string {
  const dur = s.duration ? ` — ${Math.round(s.duration / 60)} min` : "";
  const topics = s.topics.length ? `**Topics:** ${s.topics.join(", ")}\n` : "";
  const plats = s.platforms.length ? `**Platforms:** ${s.platforms.join(", ")}\n` : "";
  const speakers = s.speakers?.length ? `**Speakers:** ${s.speakers.join(", ")}\n` : "";
  const chaps = s.deepLinks && s.deepLinks.length
    ? `\n## Chapters\n${s.deepLinks.map((c) => `- ${c.label} — ${c.url}`).join("\n")}\n`
    : "";
  const sample = s.sampleCodeUrls.length ? `\n## Sample code\n${s.sampleCodeUrls.map((u) => `- ${u}`).join("\n")}\n` : "";
  const docs = s.relatedDocs.length ? `\n## Related docs\n${s.relatedDocs.slice(0, 15).map((u) => `- ${u}`).join("\n")}\n` : "";
  const transcript = s.transcript ? `\n## Transcript (excerpt)\n${s.transcript}\n` : "";
  const judgmentMd = judgment
    ? `\n## Session judgment\n- confidence: ${judgment.confidence}\n- coverage: transcript=${judgment.coverage.has_transcript}, chapters=${judgment.coverage.chapter_count}, sample_code=${judgment.coverage.sample_code_count}, related_docs=${judgment.coverage.related_doc_count}${judgment.caveats.length ? `\n- caveats: ${judgment.caveats.join("; ")}` : ""}\n- next tools: ${judgment.suggested_next_tools.join(", ")}\n`
    : "";
  return `# ${s.title}\nWWDC ${s.year}${dur}\n${topics}${plats}${speakers}\n${s.description}\n\n${s.url}\n${judgmentMd}${chaps}${sample}${docs}${transcript}`;
}
