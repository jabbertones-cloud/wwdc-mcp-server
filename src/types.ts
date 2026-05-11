/**
 * wwdc-mcp-server — shared types
 *
 * Covers WWDC sessions, Apple tutorials (DocC JSON),
 * HIG entries, Swift Evolution proposals, sample code.
 */

// ---------- WWDC Sessions ----------

export interface WwdcSession {
  id: string;                   // canonical id: `wwdc{year}-{session}` e.g. `wwdc2025-10042`
  year: number;
  sessionNumber: string;        // e.g. "10042"
  title: string;
  description: string;
  url: string;                  // canonical watch URL
  duration?: number;            // seconds
  topics: string[];             // e.g. ["SwiftUI", "Swift"]
  platforms: string[];          // e.g. ["iOS", "macOS"]
  speakers?: string[];
  transcript?: string;          // full transcript text, if captured
  sampleCodeUrls: string[];     // zip or GitHub links harvested from the page
  relatedDocs: string[];        // /documentation/... links on the page
  videoUrl?: string;            // hls/mp4 if surfaced
  deepLinks?: {                 // t=HH:MM:SS deep links to chapters
    label: string;
    seconds: number;
    url: string;                // includes ?time=<seconds>
  }[];
  updatedAt: string;            // ISO timestamp of last ingest
}

// ---------- Apple Tutorials (DocC JSON) ----------

export interface TutorialMetadata {
  title: string;
  category?: string;
  role?: string;
  estimatedTime?: string;
  categoryPathComponent?: string;
}

export interface TutorialSection {
  kind: string;                 // "hero" | "volume" | "resources" | "tasks" | ...
  title?: string;
  chapters?: TutorialChapter[];
  tiles?: TutorialTile[];
  backgroundImage?: string;
  action?: TutorialAction;
}

export interface TutorialChapter {
  name: string;
  image?: string;
  tutorials: string[];          // DocC identifiers
  content?: unknown[];
}

export interface TutorialTile {
  title: string;
  identifier: string;
  action?: TutorialAction;
  content?: unknown[];
}

export interface TutorialAction {
  type: string;                 // "reference" | "link"
  identifier?: string;
  destination?: string;
  overridingTitle?: string;
}

export interface TutorialReference {
  title: string;
  kind?: string;                // "project" | "article" | "topic"
  role?: string;
  estimatedTime?: string;
  url?: string;
  identifier?: string;
  abstract?: { type: string; text: string }[];
}

export interface Tutorial {
  identifier: { url: string; interfaceLanguage: string };
  schemaVersion: { major: number; minor: number; patch: number };
  metadata: TutorialMetadata;
  hierarchy?: { paths: string[][]; reference: string };
  sections: TutorialSection[];
  references: Record<string, TutorialReference>;
}

// ---------- Pathways (aggregated from tutorials + WWDC) ----------

export interface Pathway {
  id: string;                   // slug e.g. "swiftui-essentials"
  title: string;
  description: string;
  category: string;             // "SwiftUI" | "Swift" | ...
  steps: PathwayStep[];
  sourceUrl: string;
  updatedAt: string;
}

export interface PathwayStep {
  order: number;
  title: string;
  kind: "tutorial" | "session" | "doc" | "article";
  url: string;
  estimatedTime?: string;
  refId?: string;               // link into our DB: wwdc session id or tutorial slug
}

// ---------- HIG (Human Interface Guidelines) ----------

export interface HigEntry {
  id: string;                   // slug e.g. "buttons"
  title: string;
  platform: string[];           // ["iOS","macOS","watchOS","tvOS","visionOS"]
  category: string;             // e.g. "components"
  summary: string;
  body: string;                 // markdown/plaintext
  url: string;
  updatedAt: string;
}

// ---------- Swift Evolution ----------

export interface SwiftEvolutionProposal {
  id: string;                   // "SE-0428"
  number: number;
  title: string;
  status: string;               // "Implemented" | "Accepted" | "Rejected" | ...
  authors: string[];
  reviewManager?: string;
  implementation?: string[];    // PR links
  swiftVersion?: string;
  body: string;                 // full proposal markdown
  url: string;
  updatedAt: string;
}

// ---------- Sample Code ----------

export interface SampleCodeRef {
  id: string;                   // e.g. "wwdc2025-10042-swift-ui-enhancements"
  sessionId?: string;
  title: string;
  url: string;                  // zip or repo
  kind: "zip" | "repo" | "snippet";
  extractedAt?: string;
  files?: string[];             // if extracted
}

// ---------- Ingest status ----------

export interface IngestStatus {
  source: "wwdc" | "tutorials" | "pathways" | "hig" | "evolution" | "sample-code";
  lastRunAt: string;
  lastSuccessAt?: string;
  itemsIngested: number;
  errors: number;
  notes?: string;
}

// ---------- Tool response helpers ----------

export interface SearchHit {
  id: string;
  kind: "session" | "tutorial" | "pathway" | "hig" | "evolution" | "doc";
  title: string;
  url: string;
  snippet?: string;
  year?: number;
  topics?: string[];
  score?: number;
}

export interface Pagination {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}
