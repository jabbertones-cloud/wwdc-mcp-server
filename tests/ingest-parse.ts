#!/usr/bin/env tsx
/**
 * Ingest parser unit tests — pure HTML → WwdcSession transformation, no network.
 * Guards the og:title SEO-suffix cleanup (Bug #1) and the time parser.
 */

import assert from "node:assert/strict";
import { parseSessionPage } from "../src/ingest/wwdc.js";

function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

// --- Fixtures --------------------------------------------------------------

const info = { year: 2024, sessionNumber: "10068", url: "https://developer.apple.com/videos/play/wwdc2024/10068/" };

// Raw og:title exactly as Apple serves it — includes SEO suffix we want stripped.
const htmlWithSeoSuffix = `<!doctype html><html><head>
  <meta property="og:title" content="Bring your Live Activity to Apple Watch - WWDC24 - Videos - Apple Developer" />
  <meta property="og:description" content="Learn how Live Activities work on Apple Watch." />
  <meta name="keywords" content="Live Activities, Apple Watch, SwiftUI" />
</head><body><main></main></body></html>`;

const htmlWithJustAppleDevSuffix = `<!doctype html><html><head>
  <meta property="og:title" content="What's new in Swift - Apple Developer" />
</head><body></body></html>`;

const htmlClean = `<!doctype html><html><head>
  <meta property="og:title" content="SwiftUI essentials" />
  <meta property="og:description" content="Learn SwiftUI." />
</head><body></body></html>`;

const htmlWithChapters = `<!doctype html><html><head>
  <meta property="og:title" content="Demo - WWDC25 - Videos - Apple Developer" />
</head><body>
  <div class="chapters-list">
    <a class="chapter-link" data-start="0">Intro</a>
    <a class="chapter-link" data-start="00:02:10">Body</a>
    <a class="chapter-link" data-start="05:30">Wrap-up</a>
  </div>
</body></html>`;

// --- Tests -----------------------------------------------------------------

test("strips ' - WWDC24 - Videos - Apple Developer' suffix", () => {
  const s = parseSessionPage(htmlWithSeoSuffix, info);
  assert.equal(s.title, "Bring your Live Activity to Apple Watch");
});

test("strips bare ' - Apple Developer' suffix", () => {
  const s = parseSessionPage(htmlWithJustAppleDevSuffix, info);
  assert.equal(s.title, "What's new in Swift");
});

test("leaves already-clean titles alone", () => {
  const s = parseSessionPage(htmlClean, info);
  assert.equal(s.title, "SwiftUI essentials");
});

test("parses deep-link chapters in all time formats", () => {
  const s = parseSessionPage(htmlWithChapters, { ...info, year: 2025, sessionNumber: "999" });
  const secs = s.deepLinks.map((d) => d.seconds).sort((a, b) => a - b);
  assert.deepEqual(secs, [0, 130, 330]);
});

// Chapters extracted from 2024+ supplement <li> text
const htmlWith2024Chapters = `<!doctype html><html><head>
  <meta property="og:title" content="Demo - WWDC24 - Videos - Apple Developer" />
</head><body>
  <div class="supplement">
    <ul>
      <li>0:00 - Introduction</li>
      <li>1:07 - Review your Live Activity</li>
      <li>3:22 - Customize for Apple Watch</li>
      <li>6:02 - Keep it live</li>
      <li>Forum: App &amp; System Services</li>
      <li>Copy Code 1:28 - Existing Live Activity views struct DeliveryLiveActivity: Widget {}</li>
    </ul>
  </div>
</body></html>`;

test("parses 2024+ supplement <li> chapter format", () => {
  const s = parseSessionPage(htmlWith2024Chapters, info);
  // Should parse 4 real chapters, skipping "Forum:" line and "Copy Code" sample-code line
  assert.equal(s.deepLinks.length, 4, `expected 4 chapters, got ${s.deepLinks.length}`);
  assert.deepEqual(
    s.deepLinks.map((d) => d.seconds).sort((a, b) => a - b),
    [0, 67, 202, 362],
  );
  assert.equal(s.deepLinks.find((d) => d.seconds === 0)?.label, "Introduction");
  // URL should include ?time=
  for (const dl of s.deepLinks) assert.ok(dl.url.includes(`?time=${dl.seconds}`));
});

test("dedupes chapters found in both legacy anchors and supplement li", () => {
  const mixed = `<!doctype html><html><head><meta property="og:title" content="M" /></head><body>
    <div class="chapters-list">
      <a class="chapter-link" data-start="0">Intro</a>
    </div>
    <div class="supplement"><ul>
      <li>0:00 - Intro</li>
      <li>5:00 - Later</li>
    </ul></div></body></html>`;
  const s = parseSessionPage(mixed, info);
  assert.equal(s.deepLinks.length, 2, `expected 2 unique chapters, got ${s.deepLinks.length}`);
});

test("derives canonical id from year + session number", () => {
  const s = parseSessionPage(htmlClean, info);
  assert.equal(s.id, "wwdc2024-10068");
  assert.equal(s.url, info.url);
});

test("captures topics from meta keywords fallback", () => {
  const s = parseSessionPage(htmlWithSeoSuffix, info);
  // Topics come from meta keywords comma-split
  assert.ok(s.topics.includes("Live Activities"));
  assert.ok(s.topics.includes("Apple Watch"));
});

// 2025+ jump-to-time anchor format (<a class="jump-to-time" data-start-time="N">)
const htmlWith2025Chapters = `<!doctype html><html><head>
  <meta property="og:title" content="Demo - WWDC25 - Videos - Apple Developer" />
</head><body>
  <ul class="no-bullet chapter-list">
    <li class="chapter-item" data-start-time="0">0:00 - <a class="jump-to-time" href="?time=0" data-start-time="0">Introduction</a></li>
    <li class="chapter-item" data-start-time="125">2:05 - <a class="jump-to-time" href="?time=125" data-start-time="125">Overview</a></li>
    <li class="chapter-item" data-start-time="330">5:30 - <a class="jump-to-time" href="?time=330" data-start-time="330">Details</a></li>
    <li class="chapter-item" data-start-time="761">12:41 - <a class="jump-to-time" href="?time=761" data-start-time="761.0">Wrap-up</a></li>
  </ul>
  <div id="transcript">
    <span class="sentence">Hi, I'm Erik.</span>
    <span class="sentence">Today we discuss SwiftUI.</span>
  </div>
</body></html>`;

test("parses 2025+ jump-to-time chapter anchors", () => {
  const s = parseSessionPage(htmlWith2025Chapters, { ...info, year: 2025, sessionNumber: "999" });
  assert.equal(s.deepLinks.length, 4, `expected 4 chapters, got ${s.deepLinks.length}`);
  assert.deepEqual(
    s.deepLinks.map((d) => d.seconds).sort((a, b) => a - b),
    [0, 125, 330, 761],
  );
  assert.equal(s.deepLinks.find((d) => d.seconds === 0)?.label, "Introduction");
  assert.equal(s.deepLinks.find((d) => d.seconds === 761)?.seconds, 761); // float data-start-time floored
});

test("extracts transcript from .sentence spans, skipping UI chrome", () => {
  const s = parseSessionPage(htmlWith2025Chapters, { ...info, year: 2025, sessionNumber: "999" });
  assert.equal(s.transcript, "Hi, I'm Erik. Today we discuss SwiftUI.");
});

test("dedupes jump-to-time anchors and supplement li (2025 overlap)", () => {
  const overlap = `<!doctype html><html><head><meta property="og:title" content="M" /></head><body>
    <ul class="chapter-list">
      <li class="chapter-item" data-start-time="0">0:00 - <a class="jump-to-time" data-start-time="0">Introduction</a></li>
      <li class="chapter-item" data-start-time="125">2:05 - <a class="jump-to-time" data-start-time="125">Overview</a></li>
    </ul>
    <div class="supplement"><ul>
      <li>0:00 - Introduction</li>
      <li>2:05 - Overview</li>
    </ul></div></body></html>`;
  const s = parseSessionPage(overlap, info);
  assert.equal(s.deepLinks.length, 2, `expected 2 unique chapters, got ${s.deepLinks.length}`);
});

// Done
if (process.exitCode) {
  console.error("[ingest-parse] some tests FAILED");
  process.exit(1);
}
console.log("[ingest-parse] all parser tests passed");
