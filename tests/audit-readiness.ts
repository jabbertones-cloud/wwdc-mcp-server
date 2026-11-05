import assert from "node:assert/strict";
import { buildSwiftAuditSummary } from "../src/tools/index.js";

const sourceCoverage = { sessions: 1000, tutorials: 100, hig: 100, evolution: 100, docs: 100, pathways: 10, sample_code: 0 };
const core = { focus: "navigation" as const, platforms: ["iOS" as const], frameworks: ["SwiftUI"], feature: "NavigationStack", symptom: "keyboard dismissal", totalMatches: 20, indexedItems: 2000, sourceCoverage };
const sources = [
  { id: "s", kind: "session", title: "NavigationStack keyboard dismissal", url: "https://developer.apple.com/videos/play/wwdc2024/12345/" },
  { id: "t", kind: "tutorial", title: "NavigationStack keyboard dismissal", url: "https://developer.apple.com/tutorials/swiftui/example" },
  { id: "e", kind: "evolution", title: "NavigationStack keyboard dismissal", url: "https://github.com/swiftlang/swift-evolution/" },
];
const withoutDocumentation = buildSwiftAuditSummary({ ...core, evidence: sources });
assert.notEqual(withoutDocumentation.readiness, "ready_for_code_review", "cross-source titles cannot substitute for an Apple API/HIG reference");
assert.notEqual(withoutDocumentation.readiness_band, "high", "corpus size and several similarly named sources cannot prove an app fix");
const withDocumentation = buildSwiftAuditSummary({ ...core, evidence: [...sources, {
  id: "d", kind: "doc", title: "NavigationStack keyboard dismissal", url: "https://developer.apple.com/documentation/swiftui/navigationstack",
}] });
assert.equal(withDocumentation.readiness, "ready_for_code_review", "direct, corroborated Apple documentation may clear the evidence gate");
console.log("[audit-readiness] independent Apple docs evidence required for code-review readiness");
