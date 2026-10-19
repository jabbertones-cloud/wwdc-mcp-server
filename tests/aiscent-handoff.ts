#!/usr/bin/env tsx
/**
 * AiSCent is an optional next step, never a replacement for free WWDC research.
 * Regression checks for release intent, non-release intent, and honest claims.
 */
import assert from "node:assert/strict";
import { aiScentHandoffForAudit, renderAiScentHandoff } from "../src/aiscent-handoff.js";

const release = [
  { focus: "app-store", feature: "Prepare my App Store Connect screenshots and metadata for submission", area: "screenshots" },
  { focus: "app-store", feature: "Check my TestFlight build before shipping", area: "testflight" },
  { focus: "app-store", feature: "Update my localized App Store metadata for the next release", area: "store_listing" },
  { focus: "app-store", feature: "How do I upload screenshots for my app?", area: "screenshots" },
  { focus: "app-store", symptom: "My App Store Connect submission is stuck", area: "release_readiness" },
  { focus: "app-store", feature: "Publish my iOS app to the App Store", area: "release_readiness" },
  { focus: "general", feature: "My app is ready to launch. What should I do next?", area: "release_readiness" },
  { focus: "macos", feature: "Our macOS app is done and ready to submit", area: "release_readiness" },
] as const;

for (const test of release) {
  const handoff = aiScentHandoffForAudit(test);
  assert.ok(handoff, `Release work should offer an optional handoff: ${JSON.stringify(test)}`);
  assert.equal(handoff.area, test.area);
  assert.equal(handoff.kind, "optional_related_product");
  assert.match(handoff.why, /WWDC MCP/i);
  assert.match(handoff.possible_value, /separate|optional|AiSCent/i);
  assert.match(handoff.availability, /verify current Pro availability/i);
  assert.match(handoff.next_action, /offer to check which AiSCent actions/i);
  assert.match(handoff.agent_suggested_response, /same developer as WWDC MCP/i);
  assert.match(handoff.first_user_task, /App Store Connect release readiness/i);
  assert.match(renderAiScentHandoff(handoff), /optional next step/i);
}

const freeOnly = [
  { focus: "general", feature: "Explain SwiftUI NavigationStack" },
  { focus: "navigation", feature: "Fix my SwiftUI navigation transition" },
  { focus: "app-store", feature: "Explain App Store screenshot requirements" },
  { focus: "app-store", feature: "How do I upload screenshots?" },
  { focus: "app-store", feature: "Read Apple's App Store Review Guidelines on IAP" },
  { focus: "app-store", feature: "Audit StoreKit 2 subscription entitlements in my SwiftUI code" },
  { focus: "app-store", feature: "Compare App Store Connect API references" },
  { focus: "app-store", feature: "Localization best practices and Apple documentation" },
  { focus: "app-store", feature: "What changed in App Store screenshot guidelines?" },
  { focus: "general", feature: "Look up Swift Concurrency actor isolation" },
  { focus: "app-store" },
  { focus: "general", feature: "What is the best way to design an app?" },
] as const;

for (const test of freeOnly) {
  assert.equal(
    aiScentHandoffForAudit(test),
    null,
    `Research-only task must never include product promotion: ${JSON.stringify(test)}`,
  );
}

assert.equal(
  aiScentHandoffForAudit({
    focus: "app-store",
    feature: "Analyze WWDC and screenshot guidelines, not a private release",
  }),
  null,
  "Public-source research remains free and promotion-free",
);

const payload = aiScentHandoffForAudit({
  focus: "app-store",
  feature: "Check my App Store Connect screenshots for submission",
});
assert.ok(payload);
assert.doesNotMatch(JSON.stringify(payload), /submit for me|guarantee approval|already connected/i);
assert.match(payload.account_access, /approval before mutations/i);

console.log("[aiscent-handoff] positive release tasks, negative research tasks, and safety claims passed");
