#!/usr/bin/env tsx
/**
 * Offline smoke test — exercises DB schema, seed fixtures, FTS, and tool stubs
 * without talking to Apple or Ollama.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import {
  upsertSession, upsertTutorial, upsertHig, upsertEvolution,
  searchSessionsFts, getSession, listYears, listTopics,
  upsertPathway, listPathways, getPathway, getTutorial, searchHigFts,
  searchEvolutionFts, getEvolution,
} from "../src/db/queries.js";
import type { WwdcSession, HigEntry, SwiftEvolutionProposal, Pathway } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  // Use /tmp to avoid SMB/sandbox limitations on WAL mode.
  const tmp = path.join(process.env.TMPDIR ?? "/tmp", `wwdc-smoke-${process.pid}.db`);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const db = openDb(tmp);
  migrate(db);

  // Seed sessions
  const sess: WwdcSession = {
    id: "wwdc2024-10150",
    year: 2024, sessionNumber: "10150",
    title: "SwiftUI essentials",
    description: "Learn the fundamentals of SwiftUI for building great apps across Apple platforms.",
    url: "https://developer.apple.com/videos/play/wwdc2024/10150/",
    duration: 1700,
    topics: ["SwiftUI", "Swift"],
    platforms: ["iOS", "macOS", "watchOS", "visionOS"],
    speakers: ["Taylor Kelly"],
    transcript: "SwiftUI gives you a declarative syntax to describe your UI. Views, state, and bindings.",
    sampleCodeUrls: ["https://developer.apple.com/tutorials/sample-code/swiftui-essentials.zip"],
    relatedDocs: ["https://developer.apple.com/documentation/swiftui"],
    videoUrl: undefined,
    deepLinks: [{ label: "Intro", seconds: 0, url: "https://developer.apple.com/videos/play/wwdc2024/10150/?time=0" }],
    updatedAt: new Date().toISOString(),
  };
  upsertSession(db, sess);

  const sess2: WwdcSession = {
    ...sess, id: "wwdc2025-286", year: 2025, sessionNumber: "286",
    title: "Meet Foundation Models",
    description: "Apple Intelligence is powered by Foundation Models on device.",
    url: "https://developer.apple.com/videos/play/wwdc2025/286/",
    topics: ["AI", "Foundation Models", "Apple Intelligence"],
    transcript: "Foundation Models provide on-device language model capabilities with LanguageModelSession.",
    sampleCodeUrls: [],
    relatedDocs: ["https://developer.apple.com/documentation/foundationmodels"],
    deepLinks: [],
  };
  upsertSession(db, sess2);

  // Seed HIG
  const hig: HigEntry = {
    id: "buttons",
    title: "Buttons",
    platform: ["iOS", "macOS"],
    category: "components",
    summary: "A button initiates an instantaneous action.",
    body: "Buttons should clearly communicate their action. Use concise verbs. Support Dynamic Type.",
    url: "https://developer.apple.com/design/human-interface-guidelines/buttons",
    updatedAt: new Date().toISOString(),
  };
  upsertHig(db, hig);

  // Seed Evolution
  const ev: SwiftEvolutionProposal = {
    id: "SE-0428",
    number: 428,
    title: "Resolve DistributedActor protocols",
    status: "Implemented",
    authors: ["Konrad Malawski"],
    reviewManager: "John Doe",
    implementation: ["https://github.com/apple/swift/pull/70727"],
    swiftVersion: "6.0",
    body: "This proposal clarifies how DistributedActor protocols are resolved across actor systems.",
    url: "https://github.com/apple/swift-evolution/blob/main/proposals/0428.md",
    updatedAt: new Date().toISOString(),
  };
  upsertEvolution(db, ev);

  // Seed Tutorial
  upsertTutorial(db, "swiftui", {
    identifier: { url: "doc://com.apple.SwiftUI/tutorials/SwiftUI", interfaceLanguage: "swift" },
    schemaVersion: { major: 0, minor: 3, patch: 0 },
    metadata: { title: "Introducing SwiftUI", category: "SwiftUI", role: "overview", estimatedTime: "4hr 25min" },
    sections: [],
    references: {},
  }, "Introducing SwiftUI. A declarative framework.", "https://developer.apple.com/tutorials/swiftui");

  // Seed Pathway
  const pw: Pathway = {
    id: "swiftui-fundamentals",
    title: "SwiftUI Fundamentals",
    description: "Intro track",
    category: "SwiftUI",
    steps: [{ order: 1, title: "Intro", kind: "session", url: sess.url }],
    sourceUrl: "internal",
    updatedAt: new Date().toISOString(),
  };
  upsertPathway(db, pw);

  rebuildFts(db);

  // Queries
  const years = listYears(db);
  assert.ok(years.length >= 2, "listYears");
  const topics = listTopics(db);
  assert.ok(topics.find((t) => t.topic === "SwiftUI"), "topics has SwiftUI");

  const { hits } = searchSessionsFts(db, `"SwiftUI"`, 10, 0);
  assert.ok(hits.length >= 1, "FTS sessions hit");
  assert.equal(hits[0]!.kind, "session");

  const pathHit = searchSessionsFts(db, `"Foundation Models"`, 10, 0);
  assert.ok(pathHit.hits.some((h) => h.id === "wwdc2025-286"), "Foundation Models session indexed");

  const higHit = searchHigFts(db, `"Buttons"`, 5, 0);
  assert.ok(higHit.hits.length >= 1, "HIG FTS");

  const evoHit = searchEvolutionFts(db, `"DistributedActor"`, 5, 0);
  assert.ok(evoHit.hits.length >= 1, "Evolution FTS");

  const se = getEvolution(db, "SE-0428");
  assert.equal(se?.number, 428, "getEvolution");
  const s1 = getSession(db, "wwdc2024-10150");
  assert.equal(s1?.title, "SwiftUI essentials");
  const t1 = getTutorial(db, "swiftui");
  assert.equal(t1?.title, "Introducing SwiftUI");
  const p1 = getPathway(db, "swiftui-fundamentals");
  assert.equal(p1?.steps.length, 1);
  assert.ok(listPathways(db).length >= 1);

  db.close();
  fs.unlinkSync(tmp);
  console.log("[smoke] all assertions passed");
}

main().catch((e) => { console.error("[smoke] FAIL", e); process.exit(1); });
