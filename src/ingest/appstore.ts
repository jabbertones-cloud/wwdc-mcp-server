/**
 * App Store Review Guidelines ingest.
 *
 * Scrapes https://developer.apple.com/app-store/review/guidelines/
 * and breaks the page into per-section entries keyed by section number
 * (e.g. "1.1", "2.3.4") with the section title and full text body.
 *
 * Structure of the page (stable since 2019):
 *   <section id="safety">
 *     <h2>1. Safety</h2>
 *     <section id="safety-legal">
 *       <h3>1.1 Objectionable Content</h3>
 *       <ul>...</ul>
 *       <p>...</p>
 *     </section>
 *   </section>
 */

import type { Database as DatabaseType } from "better-sqlite3";
import { APPSTORE_GUIDELINES_URL } from "../constants.js";
import { httpGet } from "../services/http.js";
import type { AppStoreGuidelineEntry } from "../types.js";
import { upsertAppStoreGuideline, recordIngest } from "../db/queries.js";
import { checkOllama, embed, storeEmbedding } from "../services/ollama.js";

// Minimal HTML text extraction without a full DOM parser.
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extract section number prefix from a heading like "1.1 Objectionable Content" */
function extractSectionNumber(heading: string): string | null {
  const m = heading.match(/^(\d+(?:\.\d+)*)\s/);
  return m ? m[1]! : null;
}

/** Build a slug from a section number and title */
function makeId(sectionNumber: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${sectionNumber}-${slug}`.replace(/\./g, "-");
}

interface RawSection {
  number: string;
  title: string;
  body: string;
  anchor: string;
}

export function parseGuidelinesHtml(html: string): RawSection[] {
  const sections: RawSection[] = [];

  // Apple's guidelines page uses data-sidenav="N.N Title" data-nr attributes
  // on h3 elements. Parse those first (most reliable), then fall back to heading text.

  // Strategy 1: extract from data-sidenav attributes
  // Pattern: data-sidenav="1.2 User-Generated Content" id="user-generated-content"
  const sidenavRe = /data-nr[^>]*data-sidenav="([^"]+)"[^>]*id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  const found: Array<{ sidenavText: string; anchor: string; pos: number }> = [];
  while ((m = sidenavRe.exec(html)) !== null) {
    found.push({ sidenavText: m[1]!, anchor: m[2]!, pos: m.index });
  }

  if (found.length > 3) {
    for (let i = 0; i < found.length; i++) {
      const { sidenavText, anchor, pos } = found[i]!;
      const sectionNumber = extractSectionNumber(sidenavText);
      if (!sectionNumber) continue;
      const title = sidenavText.replace(/^\d[\d.]*\s+/, "").trim();

      // Body = text between this anchor and the next
      const anchorPos = html.indexOf(`id="${anchor}"`, pos);
      const nextAnchorPos = found[i + 1]
        ? html.indexOf(`id="${found[i + 1]!.anchor}"`, found[i + 1]!.pos)
        : html.length;
      const rawBody = html.slice(anchorPos, nextAnchorPos < anchorPos ? html.length : nextAnchorPos);
      const body = stripTags(rawBody).replace(sidenavText, "").trim().slice(0, 4000);

      sections.push({ number: sectionNumber, title, body, anchor });
    }
    if (sections.length > 3) return sections;
  }

  // Strategy 2: top-level sections with numeric headings (N. Title)
  const headingRe = /<h[2-4][^>]*id="([^"]+)"[^>]*>([^<]*<span[^>]*>\s*<\/span>\s*)?(\d[\d.]*\.?\s[^<]+)</g;
  while ((m = headingRe.exec(html)) !== null) {
    const anchor = m[1]!;
    const fullText = m[3]!.trim();
    const sectionNumber = extractSectionNumber(fullText);
    if (!sectionNumber) continue;
    const title = fullText.replace(/^\d[\d.]*\.?\s+/, "").trim();
    sections.push({ number: sectionNumber, title, body: "", anchor });
  }

  return sections;
}

export async function ingestAppStoreGuidelines(
  db: DatabaseType,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;

  let html: string;
  try {
    const { data } = await httpGet<string>(APPSTORE_GUIDELINES_URL, { responseType: "text" as any });
    html = typeof data === "string" ? data : JSON.stringify(data);
  } catch (err) {
    console.error("[appstore] failed to fetch guidelines:", err);
    errors++;
    recordIngest(db, "appstore" as any, 0, errors, "fetch failed");
    return { ingested, errors };
  }

  const sections = parseGuidelinesHtml(html);
  console.log(`[appstore] ${sections.length} sections parsed`);
  if (sections.length === 0) {
    // Fallback: store a single entry with the full stripped text
    const body = stripTags(html).slice(0, 8000);
    const entry: AppStoreGuidelineEntry = {
      id: "guidelines-full",
      sectionNumber: "0",
      title: "App Store Review Guidelines (full)",
      body,
      url: APPSTORE_GUIDELINES_URL,
      updatedAt: new Date().toISOString(),
    };
    upsertAppStoreGuideline(db, entry);
    ingested++;
    recordIngest(db, "appstore" as any, ingested, errors, "fallback single-entry");
    return { ingested, errors };
  }

  const ollamaOn = await checkOllama();

  for (const sec of sections) {
    const id = makeId(sec.number, sec.title);
    const entry: AppStoreGuidelineEntry = {
      id,
      sectionNumber: sec.number,
      title: sec.title,
      body: sec.body,
      url: `${APPSTORE_GUIDELINES_URL}#${sec.anchor}`,
      updatedAt: new Date().toISOString(),
    };
    try {
      upsertAppStoreGuideline(db, entry);
      ingested++;

      if (ollamaOn) {
        const vec = await embed(`${sec.number} ${sec.title}\n${sec.body}`.slice(0, 4000));
        if (vec) storeEmbedding(db, `appstore:${id}`, "appstore", vec);
      }
    } catch {
      errors++;
    }
  }

  recordIngest(db, "appstore" as any, ingested, errors, `sections: ${sections.length}`);
  return { ingested, errors };
}
