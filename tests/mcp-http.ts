import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-http-"));
  const token = "wwdc-http-test-token";

  process.env.WWDC_MCP_DATA_DIR = dir;
  process.env.WWDC_MCP_DB = path.join(dir, "wwdc.db");
  process.env.WWDC_MCP_BEARER_TOKEN = token;
  process.env.WWDC_MCP_DEPLOYED_SHA = "http-test-sha";

  const { createHttpServer } = await import("../src/mcp-http.js");
  const server = createHttpServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as any;
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.version, "0.1.3");
  assert.equal(healthBody.protocol, "streamable-http");
  assert.equal(healthBody.authConfigured, true);
  assert.equal(healthBody.release.sha, "http-test-sha");

  const unauthorized = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "unauthorized-test", version: "0.0.1" },
      },
    }),
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate") ?? "", /Bearer/);

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  });
  const client = new Client(
    { name: "wwdc-http-e2e", version: "0.0.1" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const listed = await client.listTools();
    assert.equal(listed.tools.length, 45);
    assert.ok(listed.tools.some((tool) => tool.name === "wwdc_search"));
    assert.ok(listed.tools.some((tool) => tool.name === "wwdc_security_manifest"));

    const manifest = (await client.callTool({
      name: "wwdc_security_manifest",
      arguments: { format: "json" },
    })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    assert.ok(!manifest.isError);
    const text = (manifest.content ?? [])
      .map((item) => item.text ?? "")
      .join("\n");
    const payload = JSON.parse(text);
    assert.equal(payload.tool_count, 45);
    assert.ok(payload.tools.includes("wwdc_search"));

    console.log("[mcp-http] auth, initialize, 45-tool catalog, and tool call pass");
  } finally {
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[mcp-http] FAIL", error);
  process.exit(1);
});
