# Apple Developer DocC JSON Endpoints — WWDC MCP Spec

**Research Date:** 2026-04-17  
**Status:** Partial success; tutorials endpoint confirmed, video listing requires client-side enumeration.

---

## Summary

Apple's developer.apple.com uses **DocC JSON** for tutorials (confirmed working) but **server-renders video pages** (no public JSON index). This document outlines discovered endpoints, response schemas, and fallback patterns.

---

## 1. Tutorials Endpoint ✅ CONFIRMED

### URL Pattern
```
https://developer.apple.com/tutorials/data/tutorials/{slug}.json
```

### Example: SwiftUI Tutorials
```
GET https://developer.apple.com/tutorials/data/tutorials/swiftui.json
```

### Response Structure (Sample excerpt, ~1700 lines full)
```json
{
  "identifier": {
    "url": "doc://com.apple.SwiftUI/tutorials/SwiftUI",
    "interfaceLanguage": "swift"
  },
  "schemaVersion": {
    "major": 0,
    "minor": 3,
    "patch": 0
  },
  "metadata": {
    "title": "Introducing SwiftUI",
    "categoryPathComponent": "SwiftUI",
    "role": "overview",
    "category": "SwiftUI",
    "estimatedTime": "4hr 25min"
  },
  "hierarchy": {
    "paths": [],
    "reference": "doc://com.apple.SwiftUI/tutorials/SwiftUI"
  },
  "sections": [
    {
      "kind": "hero",
      "title": "Introducing SwiftUI",
      "backgroundImage": "overview-hero.png",
      "action": {
        "type": "reference",
        "identifier": "doc://com.apple.SwiftUI/tutorials/SwiftUI/creating-and-combining-views"
      }
    },
    {
      "kind": "volume",
      "chapters": [
        {
          "name": "SwiftUI essentials",
          "image": "swiftui-essentials.png",
          "tutorials": [
            "doc://com.apple.SwiftUI/tutorials/SwiftUI/creating-and-combining-views",
            "doc://com.apple.SwiftUI/tutorials/SwiftUI/building-lists-and-navigation",
            "doc://com.apple.SwiftUI/tutorials/SwiftUI/handling-user-input"
          ]
        }
      ]
    },
    {
      "kind": "resources",
      "tiles": [
        {
          "title": "Documentation",
          "identifier": "documentation",
          "action": { "type": "link", "destination": "https://developer.apple.com/documentation/swiftui" }
        }
      ]
    }
  ],
  "references": {
    "doc://com.apple.SwiftUI/tutorials/SwiftUI/interfacing-with-uikit": {
      "title": "Interfacing with UIKit",
      "kind": "project",
      "role": "project",
      "estimatedTime": "25min",
      "url": "/tutorials/swiftui/interfacing-with-uikit"
    }
  }
}
```

### Key Properties
- **identifier**: DocC URI + language
- **schemaVersion**: Always major 0, minor 3, patch 0
- **metadata**: Title, estimated duration, category
- **sections**: Array of hero, volume (chapters), and resources
- **references**: Linked tutorials with metadata (resolved IDs)

### TypeScript Interface
```typescript
interface Tutorial {
  identifier: {
    url: string; // e.g., "doc://com.apple.SwiftUI/tutorials/SwiftUI"
    interfaceLanguage: "swift" | "objc";
  };
  schemaVersion: { major: number; minor: number; patch: number };
  metadata: {
    title: string;
    categoryPathComponent: string;
    role: "overview" | "project" | "article";
    category: string;
    estimatedTime: string; // e.g., "4hr 25min"
  };
  sections: TutorialSection[];
  references: Record<string, TutorialReference>;
  legalNotices?: { copyright: string; termsOfUse: string; privacyPolicy: string };
}

interface TutorialSection {
  kind: "hero" | "volume" | "resources";
  title?: string;
  chapters?: TutorialChapter[];
  tiles?: ResourceTile[];
  action?: { type: "reference" | "link"; identifier?: string; destination?: string };
}

interface TutorialChapter {
  name: string;
  image?: string;
  tutorials: string[]; // References to resolved tutorial IDs
  content?: ContentBlock[];
}

interface TutorialReference {
  title: string;
  kind: "project" | "article" | "sample";
  role: "project" | "sampleCode" | "collectionGroup";
  estimatedTime?: string;
  url: string;
  identifier: string;
  abstract?: ContentBlock[];
}
```

---

## 2. WWDC Video Sessions ⚠️ PARTIAL

**Status:** No confirmed JSON endpoint. Server-renders HTML. Videos follow URL pattern `/videos/play/wwdc{YYYY}/{ID}/`.

### Attempted Patterns (All 404/502)
- `https://developer.apple.com/tutorials/data/videos/play/wwdc2025/286.json` → 404
- `https://developer.apple.com/api/videos/wwdc2025/286` → 404
- `https://developer.apple.com/videos/data/wwdc2025/index.json` → 404

### HTML Page Structure (Confirmed)
```
https://developer.apple.com/videos/play/wwdc{YYYY}/{ID}/
```
Returns HTML with inline metadata (no JSON endpoint confirmed).

### Fallback Strategy: Client-Side Enumeration
1. Crawl `/videos/wwdc{YYYY}/` → extract links from `<a href="/videos/play/wwdc{YYYY}/{ID}/">`
2. For each video, parse HTML `<time>`, `<h5>`, image URL
3. **No transcript JSON found** — may require video host API (YouTube/Vimeo)

### Known Session ID Pattern
- WWDC 2025, Session 286: "Meet the Foundation Models framework"
- ID range: Likely 200–400+ per year
- URL: `https://developer.apple.com/videos/play/wwdc2025/286/`

### TypeScript Interface (Inferred)
```typescript
interface WwdcSession {
  id: string;
  year: number;
  title: string;
  duration: string; // e.g., "45:32"
  thumbnail: string; // CDN URL: devimages-cdn.apple.com/wwdc-services/images/...
  description?: string;
  transcript?: Transcript[]; // ❌ No confirmed source yet
  resources?: Resource[];
  chapters?: Chapter[];
  sampleCodeUrl?: string; // ZIP download
}

interface Transcript {
  timestamp: number; // seconds
  speaker: string;
  text: string;
}

interface Chapter {
  startTime: number;
  title: string;
}
```

---

## 3. Pathways ⚠️ NOT FOUND

**Status:** 502/404 on all attempted patterns.

### Attempted Patterns
- `https://developer.apple.com/tutorials/data/pathways.json` → 404
- `https://developer.apple.com/tutorials/data/pathways/swiftui.json` → 502

### Known Pathway URLs
- `/pathways/` (index)
- `/pathways/swiftui/` (SwiftUI pathway)

### Inference
Pathways may be dynamically constructed from tutorials + documentation links. No separate JSON endpoint discovered.

### TypeScript Interface (Speculative)
```typescript
interface Pathway {
  id: string;
  title: string;
  description: string;
  estimatedDuration: string;
  steps: PathwayStep[]; // Video + doc + tutorial sequence
}

interface PathwayStep {
  type: "video" | "documentation" | "tutorial";
  reference: string; // DocC URL or video play link
  title: string;
  description: string;
}
```

---

## 4. Session Listing per Year ⚠️ HTML-BASED

**Status:** No JSON index; HTML-rendered at `/videos/wwdc{YYYY}/`.

### URL Pattern
```
https://developer.apple.com/videos/wwdc{YYYY}/
```

### Enumeration Strategy
1. Fetch HTML from above URL
2. Parse `<a href="/videos/play/wwdc{YYYY}/{ID}/">` links
3. Extract ID and metadata from HTML structure
4. Build in-memory index per year

### Year Coverage (Confirmed by page links)
- WWDC 2025 (current)
- WWDC 2024
- WWDC 2023
- Prior years available

### TypeScript Interface
```typescript
interface SessionListing {
  year: number;
  sessions: SessionSummary[];
  totalCount: number;
}

interface SessionSummary {
  id: string;
  title: string;
  duration: string;
  thumbnailUrl: string;
  collectionId: "wwdc2025" | "wwdc2024" | string;
}
```

---

## 5. Rate Limits & Gotchas

### Recommended Approach
- **Tutorials endpoint:** Documented, reliable. Cache aggressively (1 week).
- **Video pages:** HTML-based; use 1 req/sec, respectful User-Agent.
- **No official API:** Apple does not expose a WWDC video API.

### Gotchas
1. **Video JSON doesn't exist:** Tutorials JSON works; video endpoint is server-rendered.
2. **Transcript unavailable:** No confirmed JSON source for transcripts; may require screenscraping or third-party service.
3. **Pathways endpoint 502:** Either private or deprecate.
4. **DocC identifier format:** All references use `doc://com.apple.{Framework}/path/to/item` namespace.
5. **schemaVersion locked:** Always `{ major: 0, minor: 3, patch: 0 }` for tutorials.

---

## 6. Implementation Notes

### For wwdc-mcp-server Scraper

**Phase 1: Tutorials (Reliable)**
```typescript
const getTutorial = async (slug: string) => {
  const url = `https://developer.apple.com/tutorials/data/tutorials/${slug}.json`;
  const resp = await fetch(url, { headers: { "User-Agent": "wwdc-mcp-server/1.0" } });
  return resp.json() as Tutorial;
};
```

**Phase 2: Video Enumeration (HTML Scrape)**
```typescript
const getSessionIds = async (year: number) => {
  const html = await fetch(`https://developer.apple.com/videos/wwdc${year}/`).then(r => r.text());
  const matches = html.matchAll(/<a href="\/videos\/play\/wwdc\d+\/(\d+)\/">/g);
  return [...matches].map(m => m[1]);
};
```

**Phase 3: Transcripts (TBD)**
- Check if Apple hosts transcripts as `.vtt` or `.srt` files alongside video pages
- Fallback to video platform's caption API (e.g., YouTube CC)

---

## Files & References
- Confirmed JSON endpoint: `/tutorials/data/tutorials/{slug}.json`
- Fallback for videos: HTML scrape from `/videos/wwdc{YYYY}/` and `/videos/play/wwdc{YYYY}/{ID}/`
- CDN images: `devimages-cdn.apple.com/wwdc-services/images/`

---

**Next Steps:**
1. Implement Phase 1 (tutorials ingestion) — low-hanging fruit.
2. Use Playwright to enumerate video IDs from HTML (Phase 2).
3. Research transcript availability (YouTube, Apple's CDN, or manual SRT).
