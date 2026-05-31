/**
 * WWDC session ingest — server-rendered HTML pages at developer.apple.com/videos/play/wwdc{year}/{session}/
 *
 * There's no JSON index for videos, so we:
 *   1. Walk the year index page and collect session URLs.
 *   2. Fetch each session page, extract title/description/topics/transcript excerpt/sample-code links.
 *   3. Persist to SQLite + embed with Ollama.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { APPLE_BASE, APPLE_WWDC_BASE, REQUEST_CONCURRENCY, WWDC_YEARS } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { WwdcSession } from "../types.js";
import { upsertSession, upsertSampleCode, recordIngest } from "../db/queries.js";
import { checkOllama, embed, storeEmbedding } from "../services/ollama.js";

interface DiscoveredSession {
  year: number;
  sessionNumber: string;
  url: string;
}

/** Discover session URLs for a given year from the /videos/wwdc{year}/ index page. */
export async function discoverSessionsForYear(year: number): Promise<DiscoveredSession[]> {
  const indexUrl = `${APPLE_WWDC_BASE}${year}/`;
  const { data } = await httpGet<string>(indexUrl, { transformResponse: (x) => x });
  const html = typeof data === "string" ? data : String(data);
  const $ = cheerio.load(html);
  const found = new Map<string, DiscoveredSession>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/videos\/play\/wwdc(\d{4})\/(\d+)\/?/);
    if (!m) return;
    const y = parseInt(m[1]!, 10);
    const session = m[2]!;
    if (y !== year) return;
    const canonical = `${APPLE_BASE}/videos/play/wwdc${y}/${session}/`;
    const id = `wwdc${y}-${session}`;
    if (!found.has(id)) {
      found.set(id, { year: y, sessionNumber: session, url: canonical });
    }
  });
  return [...found.values()];
}

/** Parse a session detail page. */
export function parseSessionPage(
  html: string,
  info: DiscoveredSession,
): WwdcSession {
  const $ = cheerio.load(html);
  const id = `wwdc${info.year}-${info.sessionNumber}`;

  const rawTitle =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1.video-details-title, h1").first().text().trim() ||
    `WWDC ${info.year} — Session ${info.sessionNumber}`;
  // Apple's og:title ends with " - WWDC24 - Videos - Apple Developer" SEO suffix.
  // Strip it so downstream tools (search, display) show clean titles.
  const title = rawTitle
    .replace(/\s*[-–—]\s*WWDC\d{2,4}\s*[-–—]\s*Videos\s*[-–—]\s*Apple\s+Developer\s*$/i, "")
    .replace(/\s*[-–—]\s*Apple\s+Developer\s*$/i, "")
    .trim();

  const description =
    $("meta[property='og:description']").attr("content")?.trim() ||
    $("meta[name='description']").attr("content")?.trim() ||
    $(".video-description, .supplement.details .description, .description").first().text().trim() ||
    "";

  // Topics / tags
  const topics = new Set<string>();
  $(".details-content .topic, .video-details .metadata .tag, .supplement.details .topic").each((_, el) => {
    const t = $(el).text().trim();
    if (t) topics.add(t);
  });
  // Meta keywords fallback
  const kw = $("meta[name='keywords']").attr("content") ?? "";
  kw.split(/,/).map((x) => x.trim()).filter(Boolean).forEach((t) => topics.add(t));

  const platforms = new Set<string>();
  $(".video-details .platforms li, .supplement.details .platform").each((_, el) => {
    const p = $(el).text().trim();
    if (p) platforms.add(p);
  });

  // Speakers
  const speakers = new Set<string>();
  $(".video-details .presenter, .supplement.details .presenter, .byline").each((_, el) => {
    const s = $(el).text().trim();
    if (s) speakers.add(s.replace(/^by\s+/i, ""));
  });

  // Duration
  let duration: number | undefined;
  const durText = $(".video-details .duration, .details-content .runtime, time.duration").first().text().trim();
  const durMatch = durText.match(/(\d+)\s*min/i);
  if (durMatch) duration = parseInt(durMatch[1]!, 10) * 60;

  // Transcript — prefer individual sentence spans (2025+) to avoid picking up
  // UI chrome ("Search this video…", "Transcript Code") that lives in the same
  // #transcript container. Fall back to full container text for older pages.
  const sentences = $("#transcript .sentence, .transcript .sentence")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const transcript =
    sentences.length > 0
      ? sentences.join(" ")
      : ($("#transcript, .transcript, .video-transcript").text().replace(/\s+/g, " ").trim() || undefined);

  // Sample code + related docs
  const sampleCodeUrls: string[] = [];
  const relatedDocs: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href) return;
    const abs = href.startsWith("http") ? href : href.startsWith("/") ? `${APPLE_BASE}${href}` : href;
    if (/\.zip$/i.test(abs) || /\/sample-code\//i.test(abs) || /github\.com/.test(abs)) {
      if (!sampleCodeUrls.includes(abs)) sampleCodeUrls.push(abs);
    } else if (abs.includes("/documentation/")) {
      if (!relatedDocs.includes(abs)) relatedDocs.push(abs);
    }
  });

  // Chapter deep links — handle three layouts:
  //   (a) 2025+ jump-to-time anchors: <a class="jump-to-time" data-start-time="125">Label</a>
  //   (b) legacy data-start anchors: <a data-start="00:02:10">Label</a>
  //   (c) 2024+ supplement <li> text of shape "M:SS - Label" or "H:MM:SS - Label"
  // Strip duplicates and ignore "Copy Code" snippet lines (those are inline samples, not chapters).
  const deepLinks: WwdcSession["deepLinks"] = [];
  const seenChapters = new Set<string>();
  const addChapter = (seconds: number, label: string): void => {
    if (!label || label.length > 120 || /[{}]/.test(label)) return;
    const key = `${seconds}::${label}`;
    if (seenChapters.has(key)) return;
    seenChapters.add(key);
    deepLinks.push({ label, seconds, url: `${info.url}?time=${seconds}` });
  };

  // (a) 2025+ jump-to-time anchors — most reliable, integer data-start-time attribute
  $("a.jump-to-time[data-start-time]").each((_, el) => {
    const raw = $(el).attr("data-start-time");
    if (!raw) return;
    const seconds = Math.floor(parseFloat(raw));
    if (isNaN(seconds)) return;
    addChapter(seconds, $(el).text().trim());
  });

  // (b) legacy anchors
  $(".chapters-list a[data-start], .chapter-link[data-start]").each((_, el) => {
    const label = $(el).text().trim();
    const start = $(el).attr("data-start") ?? $(el).attr("data-time");
    if (!start) return;
    const seconds = parseTime(start);
    if (seconds === null) return;
    addChapter(seconds, label);
  });

  // (c) supplement <li> text lines — "0:00 - Introduction"
  // Match leading timestamp (M:SS or H:MM:SS), optional leading prefix like "Copy Code" which we skip.
  const chapterRe = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+?)$/;
  $(".supplement li, .chapters li, li.chapter-item").each((_, el) => {
    const raw = $(el).text().trim().replace(/\s+/g, " ");
    if (!raw) return;
    // Skip sample-code blocks ("Copy Code 1:28 - Existing Live Activity views struct ...")
    if (/^Copy\s+Code\b/i.test(raw)) return;
    const m = raw.match(chapterRe);
    if (!m) return;
    const seconds = parseTime(m[1]!);
    if (seconds === null) return;
    addChapter(seconds, m[2]!.trim());
  });

  // video url (hls/mp4 meta)
  const videoUrl =
    $("meta[property='og:video']").attr("content") ||
    $("meta[property='og:video:url']").attr("content") ||
    undefined;

  return {
    id,
    year: info.year,
    sessionNumber: info.sessionNumber,
    title,
    description,
    url: info.url,
    duration,
    topics: [...topics],
    platforms: [...platforms],
    speakers: [...speakers],
    transcript,
    sampleCodeUrls,
    relatedDocs,
    videoUrl,
    deepLinks,
    updatedAt: new Date().toISOString(),
  };
}

function parseTime(s: string): number | null {
  // Accept "HH:MM:SS", "MM:SS", or "S" (seconds)
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

export async function ingestWwdc(
  db: DatabaseType,
  years: readonly number[] = WWDC_YEARS,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;
  const ollamaOn = await checkOllama();
  const limit = pLimit(REQUEST_CONCURRENCY);

  for (const y of years) {
    let discovered: DiscoveredSession[] = [];
    try {
      discovered = await discoverSessionsForYear(y);
    } catch {
      errors++;
      continue;
    }

    await Promise.all(discovered.map((info) => limit(async () => {
      try {
        const { data } = await httpGet<string>(info.url, { transformResponse: (x) => x });
        const html = typeof data === "string" ? data : String(data);
        const session = parseSessionPage(html, info);
        upsertSession(db, session);

        // Save sample code URLs as refs
        for (const url of session.sampleCodeUrls) {
          const kind = /\.zip$/i.test(url) ? "zip" : /github\.com/.test(url) ? "repo" : "snippet";
          const scId = `${session.id}::${hash(url)}`;
          upsertSampleCode(db, {
            id: scId,
            sessionId: session.id,
            title: `${session.title} sample`,
            url,
            kind: kind as "zip" | "repo" | "snippet",
          });
        }

        if (ollamaOn) {
          const text = `${session.title}\n${session.description}\n${(session.transcript ?? "").slice(0, 3000)}`;
          const vec = await embed(text.slice(0, 4000));
          if (vec) storeEmbedding(db, `session:${session.id}`, "session", vec);
        }
        ingested++;
      } catch {
        errors++;
      }
    })));
  }

  recordIngest(db, "wwdc", ingested, errors, `years: ${years.join(",")}`);
  return { ingested, errors };
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
