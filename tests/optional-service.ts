#!/usr/bin/env tsx
/**
 * Unit tests for the optional-service degradation helper
 * (src/services/optional-service.ts): cached probe, null-safe access,
 * one-time caveat, and reset-and-retry. Offline; no real services.
 */

import assert from "node:assert/strict";
import { OptionalService } from "../src/services/optional-service.js";

async function main(): Promise<void> {
  // 1) Successful init: resolved once, then served from cache.
  {
    let inits = 0;
    const svc = new OptionalService({
      name: "test-ok",
      init: async () => {
        inits++;
        return { ok: true };
      },
    });
    assert.equal(svc.availability, null, "verdict unknown before first probe");
    assert.deepEqual(await svc.get(), { ok: true });
    assert.equal(await svc.isAvailable(), true);
    assert.deepEqual(await svc.get(), { ok: true });
    assert.equal(inits, 1, "init runs once; the resource is cached");
    assert.equal(svc.availability, true);
    console.log("  ok  successful init is cached after the first probe");
  }

  // 2) Failing init: null-safe, caveat exactly once, verdict sticks.
  {
    let inits = 0;
    const caveats: string[] = [];
    const svc = new OptionalService({
      name: "test-down",
      init: async () => {
        inits++;
        throw new Error("connection refused");
      },
      onUnavailable: (message) => caveats.push(message),
    });
    assert.equal(await svc.get(), null, "get() never throws");
    assert.equal(await svc.isAvailable(), false);
    assert.equal(await svc.get(), null);
    assert.equal(inits, 1, "a failed init is not retried implicitly");
    assert.deepEqual(caveats, ["connection refused"], "caveat emitted exactly once");
    assert.equal(svc.availability, false);
    console.log("  ok  failing init degrades to null with a single caveat");
  }

  // 3) Reset clears the verdict: a flaky service can recover.
  {
    let attempts = 0;
    const svc = new OptionalService({
      name: "test-flaky",
      init: async () => {
        attempts++;
        if (attempts === 1) throw new Error("not yet");
        return "up";
      },
      onUnavailable: () => {},
    });
    assert.equal(await svc.get(), null);
    svc.reset();
    assert.equal(svc.availability, null, "reset returns the verdict to unknown");
    assert.equal(await svc.get(), "up", "init is retried after reset");
    assert.equal(attempts, 2);
    console.log("  ok  reset clears the verdict and allows retry");
  }

  // 4) Bounded access: a slow init must not hang the caller. Timing out
  // neither marks the service unavailable nor cancels the load — once
  // init finishes in the background, the verdict is cached and later
  // calls pick the resource up. (Regression: wwdc_search's first-run
  // embedding probe blocked a fresh user's search on the model load.)
  {
    let inits = 0;
    const svc = new OptionalService({
      name: "test-slow",
      init: async () => {
        inits++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return "ready";
      },
    });
    const started = Date.now();
    assert.equal(await svc.getBounded(25), null, "bounded probe times out to null");
    assert.ok(Date.now() - started < 200, "bounded probe returns before init completes");
    assert.equal(svc.availability, null, "a timeout does not mark the service unavailable");
    assert.equal(await svc.get(), "ready", "the background load still completes and caches");
    assert.equal(inits, 1, "the in-flight init is shared, not restarted");
    assert.equal(await svc.getBounded(25), "ready", "cached resource is served immediately");
    console.log("  ok  bounded probe times out without cancelling or poisoning the load");
  }

  console.log("[optional-service] all tests passed");
}

main().catch((e) => {
  console.error("[optional-service] FAIL", e);
  process.exit(1);
});
