#!/usr/bin/env tsx
/**
 * B2 anti-extraction regression (STD-QUOTA-1/4):
 * per-IP token-bucket rate limiting on the HTTP transport for tool CALLS.
 * Configured via WWDC_MCP_TOOL_CALL_RATE_CAPACITY /
 * WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE (read when the HTTP server
 * is created). Non-tool-call methods (initialize, tools/list) are not
 * charged. A throttled call gets an opaque 429 + Retry-After — the body
 * must not describe the bucket (no capacity / remaining / bucket keys).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-ratelimit-"));
  process.env.WWDC_MCP_DATA_DIR = dir;
  process.env.WWDC_MCP_DB = path.join(dir, "wwdc.db");
  process.env.WWDC_MCP_PUBLIC_READ_ONLY = "1";
  process.env.WWDC_MCP_TOOL_CALL_RATE_CAPACITY = "3";
  process.env.WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE = "3";

  const { createHttpServer } = await import("../src/mcp-http.js");
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const post = (body: unknown) => fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const toolCall = (id: number) => post({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "wwdc_list_years", arguments: {} },
  });

  try {
    // Capacity 3: the first three tool calls pass.
    for (let i = 1; i <= 3; i++) {
      const res = await toolCall(i);
      assert.equal(res.status, 200, `tool call ${i} within budget must pass (got ${res.status})`);
      await res.text();
    }
    // The fourth is throttled: opaque 429 + Retry-After, no bucket details.
    const throttled = await toolCall(4);
    assert.equal(throttled.status, 429, `tool call beyond budget must be 429 (got ${throttled.status})`);
    const retryAfter = Number(throttled.headers.get("retry-after"));
    assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1, "429 carries a numeric Retry-After >= 1");
    const bodyText = await throttled.text();
    for (const leak of ["capacity", "remaining", "bucket", "tokens"]) {
      assert.ok(!bodyText.toLowerCase().includes(leak), `429 body must be opaque (found "${leak}")`);
    }
    // Non-tool-call methods are not charged: tools/list still answers
    // even with the tool-call bucket exhausted.
    const list = await post({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} });
    assert.equal(list.status, 200, `tools/list must not be rate limited (got ${list.status})`);
    await list.text();

    console.log("[rate-limit-http] per-IP token bucket: 3 tool calls pass, 4th = opaque 429 + Retry-After, tools/list uncharged");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.WWDC_MCP_PUBLIC_READ_ONLY;
    delete process.env.WWDC_MCP_TOOL_CALL_RATE_CAPACITY;
    delete process.env.WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[rate-limit-http] FAIL", error);
  process.exit(1);
});
