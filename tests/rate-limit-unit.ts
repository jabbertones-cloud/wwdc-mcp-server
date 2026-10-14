#!/usr/bin/env tsx
/**
 * Unit coverage for the per-IP token bucket (src/rate-limit.ts):
 * weighted costs, per-key isolation, continuous refill, and the
 * opaque-decision contract (a denial carries a retry delay and
 * nothing about the bucket's shape).
 */
import assert from "node:assert/strict";
import {
  PerIpToolCallRateLimiter,
  toolCallCost,
  AUDIT_TOOL_COST,
} from "../src/rate-limit.js";

// Weighted costs: only tools/call is charged; the audit oracle costs more.
assert.equal(toolCallCost({ method: "tools/list", params: {} }), 0);
assert.equal(toolCallCost({ method: "initialize", params: {} }), 0);
assert.equal(toolCallCost({ method: "tools/call", params: { name: "wwdc_search" } }), 1);
assert.equal(toolCallCost({ method: "tools/call", params: { name: "swift_app_audit" } }), AUDIT_TOOL_COST);
assert.equal(
  toolCallCost([
    { method: "tools/call", params: { name: "wwdc_search" } },
    { method: "tools/call", params: { name: "swift_app_audit" } },
    { method: "ping" },
  ]),
  1 + AUDIT_TOOL_COST,
);
assert.equal(toolCallCost(undefined), 0);
assert.equal(toolCallCost("not json-rpc"), 0);

// Bucket behaviour with a controllable clock.
let now = 1_000_000;
const limiter = new PerIpToolCallRateLimiter({
  capacity: 10,
  refillPerSecond: 1, // 1 unit/sec
  now: () => now,
});
assert.equal(limiter.check("203.0.113.1", 10).allowed, true, "full bucket admits a cost-10 call");
const denied = limiter.check("203.0.113.1", 1);
assert.equal(denied.allowed, false, "empty bucket denies");
assert.equal(denied.retryAfterSeconds, 1, "retry-after is the time to earn the deficit (ceil, min 1)");
assert.deepEqual(
  Object.keys(denied).sort(),
  ["allowed", "retryAfterSeconds"],
  "a denial exposes nothing about bucket shape",
);
// A different IP has its own bucket.
assert.equal(limiter.check("203.0.113.2", 10).allowed, true, "buckets are per-IP");
// Refill: +5 seconds earns 5 units — a cost-5 audit passes, a second doesn't.
now += 5_000;
assert.equal(limiter.check("203.0.113.1", AUDIT_TOOL_COST).allowed, true, "refill restores budget");
assert.equal(limiter.check("203.0.113.1", 1).allowed, false, "refill is continuous, not a reset");
// Free methods never consume.
assert.equal(limiter.check("203.0.113.1", 0).allowed, true);

console.log("[rate-limit-unit] weighted costs, per-IP buckets, refill, opaque denial pass");
