#!/usr/bin/env tsx
/**
 * TL-194 regressions — the deprecation index must not contradict the SDK.
 *
 * Live defect (wwdc-live-05, 2026-10-28): for UIGraphicsBeginImageContext
 * the tools said "not deprecated" / "not found" / no replacement, while
 * Apple's own DocC says deprecated (iOS 27.0) in favor of
 * UIGraphicsImageRenderer. Root causes covered here:
 *  1. Availability parsing existed only in a backfill whose queue
 *     (`deprecated IS NULL`) could never select a real row (schema default
 *     is 0) — the processed state must be an explicit checked marker.
 *  2. DocC symbol titles carry signature suffixes
 *     ("UIGraphicsBeginImageContext(_:)"); bare-name lookups must match.
 *  3. A per-symbol miss on a populated index rendered as "not deprecated"
 *     (TL-034 fixed only the empty-index case; PR #25's rule is that a
 *     miss is never "not deprecated"). Four states must stay distinct:
 *     deprecated / checked-not-deprecated / indexed-but-unchecked /
 *     not-indexed.
 *  4. Replacement extraction must understand Apple's
 *     "Replace usage of X with Y" phrasing, not just a leading "Use".
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { openDb, migrate } from "../src/db/schema.js";
import {
  upsertAppleDoc,
  getApiDeprecation,
  getApiAvailability,
  findApiReplacement,
  extractReplacementCandidate,
} from "../src/db/queries.js";
import {
  parseAvailability,
  bareSymbolName,
} from "../src/ingest/availability.js";
import { selectUncheckedDocs } from "../src/ingest/deprecation-backfill.js";
import { createWwdcServer } from "../src/server.js";
import type { AppleDocPage } from "../src/types.js";

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "fixtures", "docc-uigraphicsbeginimagecontext.json"),
    "utf8",
  ),
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("ok -", name);
}

// ---------- 1. The shared availability parser on Apple's real DocC ----------

check("parser: real deprecated C function parses to deprecated + version + replacement", () => {
  const a = parseAvailability(FIXTURE);
  assert.equal(a.deprecated, true);
  assert.equal(a.deprecatedAt, "27.0");
  // All-platforms minimum (the parser's established semantics): watchOS
  // lists introducedAt 1.0 for this API; iOS lists 2.0. Version-aware
  // comparison — a lexicographic sort would also mishandle e.g. 9.0 vs 13.0.
  assert.equal(a.introducedAt, "1.0");
  assert.ok(a.deprecatedMessage?.includes("UIGraphicsImageRenderer"));
});

check("parser: clean symbol parses to not deprecated", () => {
  const a = parseAvailability({
    metadata: { platforms: [{ name: "iOS", introducedAt: "13.0" }] },
  });
  assert.equal(a.deprecated, false);
  assert.equal(a.introducedAt, "13.0");
  assert.equal(a.deprecatedAt, null);
});

// ---------- 2. Bare-name matching for signature-bearing titles ----------

check("bareSymbolName strips the DocC signature suffix", () => {
  assert.equal(bareSymbolName("UIGraphicsBeginImageContext(_:)"), "UIGraphicsBeginImageContext");
  assert.equal(bareSymbolName("UIGraphicsEndImageContext()"), "UIGraphicsEndImageContext");
  assert.equal(bareSymbolName("UIView"), "UIView");
});

// ---------- 3/4. Seeded DB: four states + matching + replacement ----------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-tl194-"));
const db = openDb(path.join(tmpDir, "test.db"));
migrate(db);
const now = new Date().toISOString();

function docPage(partial: Partial<AppleDocPage> & { id: string; title: string }): AppleDocPage {
  return {
    modules: ["UIKit"],
    platforms: ["iOS"],
    url: `https://developer.apple.com/documentation/${partial.id}`,
    abstract: "",
    body: partial.title,
    topicSections: [],
    references: [],
    rawJson: "{}",
    updatedAt: now,
    ...partial,
  };
}

// The TL-194 row exactly as the fixed ingest would store it: signature
// title, parsed availability, checked at ingest.
upsertAppleDoc(db, docPage({
  id: "uikit/uigraphicsbeginimagecontext(_:)",
  title: "UIGraphicsBeginImageContext(_:)",
  symbolKind: "func",
  deprecated: 1,
  introducedAt: "2.0",
  deprecatedAt: "27.0",
  deprecatedMessage:
    "Replace usage of UIGraphicsBeginImageContext with UIGraphicsImageRenderer.",
  deprecatedCheckedAt: now,
}));
// A checked, not-deprecated symbol.
upsertAppleDoc(db, docPage({
  id: "uikit/uiview",
  title: "UIView",
  symbolKind: "class",
  deprecated: 0,
  introducedAt: "2.0",
  deprecatedCheckedAt: now,
}));
// An indexed but never-checked symbol (pre-fix row shape: defaults only).
upsertAppleDoc(db, docPage({
  id: "uikit/uialertview",
  title: "UIAlertView",
  symbolKind: "class",
}));

check("deprecation: bare name matches the signature-titled deprecated row", () => {
  const r = getApiDeprecation(db, "UIGraphicsBeginImageContext");
  assert.equal(r.state, "deprecated");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].deprecated_at, "27.0");
});

check("availability: bare name finds the signature-titled row", () => {
  const rows = getApiAvailability(db, "UIGraphicsBeginImageContext");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deprecated, 1);
  assert.equal(rows[0].deprecated_at, "27.0");
});

check("replacement: deprecated row yields the replacement candidate", () => {
  const { deprecation } = findApiReplacement(db, "UIGraphicsBeginImageContext");
  assert.equal(deprecation.length, 1);
  assert.equal(
    extractReplacementCandidate(deprecation[0].deprecated_message),
    "UIGraphicsImageRenderer",
  );
  assert.equal(
    extractReplacementCandidate("Use UIGraphicsImageRenderer instead."),
    "UIGraphicsImageRenderer",
  );
});

check("deprecation: checked + clean renders the not_deprecated state", () => {
  const r = getApiDeprecation(db, "UIView");
  assert.equal(r.state, "not_deprecated");
});

check("deprecation: indexed but unchecked is unknown, never not_deprecated", () => {
  const r = getApiDeprecation(db, "UIAlertView");
  assert.equal(r.state, "unknown_unchecked");
});

check("deprecation: absent symbol on a populated index is unknown_not_indexed", () => {
  const r = getApiDeprecation(db, "UINoSuchSymbolAnywhere");
  assert.equal(r.state, "unknown_not_indexed");
});

check("backfill eligibility: only the unchecked row is selected", () => {
  const rows = selectUncheckedDocs(db, 100);
  assert.deepEqual(rows.map((r) => r.id), ["uikit/uialertview"]);
});

// ---------- Tool-level: the sentence an agent would read ----------

async function toolText(name: string, args: Record<string, unknown>): Promise<string> {
  const server = createWwdcServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tl194-test", version: "0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const r = await client.callTool({ name, arguments: args });
    const content = (r as any).content as Array<{ type: string; text?: string }>;
    return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  } finally {
    await client.close();
  }
}

const absentText = await toolText("apple_api_deprecation", { api_name: "UINoSuchSymbolAnywhere" });
check("tool: absent symbol never renders the 'not deprecated' verdict", () => {
  assert.ok(!absentText.includes("— not deprecated"), absentText.slice(0, 200));
  assert.ok(absentText.includes("unknown"), absentText.slice(0, 200));
});

const depText = await toolText("apple_api_deprecation", { api_name: "UIGraphicsBeginImageContext" });
check("tool: the TL-194 question renders deprecated + replacement", () => {
  assert.ok(depText.includes("— deprecated"), depText.slice(0, 200));
  assert.ok(depText.includes("UIGraphicsImageRenderer"), depText.slice(0, 400));
});

const cleanText = await toolText("apple_api_deprecation", { api_name: "UIView" });
check("tool: checked clean symbol still renders 'not deprecated'", () => {
  assert.ok(cleanText.includes("— not deprecated"), cleanText.slice(0, 200));
});

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\ndeprecation-honesty: ${passed} checks passed`);
