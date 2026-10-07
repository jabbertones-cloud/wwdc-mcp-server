import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-http-"));
  const token = "wwdc-http-test-token";

  process.env.WWDC_MCP_DATA_DIR = dir;
  process.env.WWDC_MCP_DB = path.join(dir, "wwdc.db");
  process.env.WWDC_MCP_BEARER_TOKEN = token;
  process.env.WWDC_MCP_DEPLOYED_SHA = "http-test-sha";
  process.env.WWDC_MCP_PATH_PREFIX = "/wwdc/";
  delete process.env.WWDC_MCP_PUBLIC_READONLY;

  const { createHttpServer } = await import("../src/mcp-http.js");

  const server = createHttpServer();
  const base = await listen(server);

  const rootHealth = await fetch(`${base}/healthz`);
  assert.equal(rootHealth.status, 404);

  const health = await fetch(`${base}/wwdc/healthz`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as any;
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.version, "0.1.4");
  assert.equal(healthBody.protocol, "streamable-http");
  assert.equal(healthBody.authConfigured, true);
  assert.equal(healthBody.authMode, "bearer");
  assert.equal(healthBody.readOnly, true);
  assert.equal(healthBody.pathPrefix, "/wwdc");
  assert.equal(healthBody.endpoints.health, "/wwdc/healthz");
  assert.equal(healthBody.endpoints.mcp, "/wwdc/mcp");
  assert.equal(healthBody.release.sha, "http-test-sha");

  const unauthorized = await fetch(`${base}/wwdc/mcp`, {
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

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/wwdc/mcp`), {
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
  } finally {
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  process.env.WWDC_MCP_PUBLIC_READONLY = "1";
  process.env.WWDC_MCP_PUBLIC_RATE_LIMIT_PER_MINUTE = "3";
  delete process.env.WWDC_MCP_BEARER_TOKEN;

  const publicServer = createHttpServer();
  const publicBase = await listen(publicServer);

  try {
    const publicHealth = await fetch(`${publicBase}/wwdc/healthz`);
    assert.equal(publicHealth.status, 200);
    const publicHealthBody = (await publicHealth.json()) as any;
    assert.equal(publicHealthBody.authConfigured, true);
    assert.equal(publicHealthBody.authMode, "public-readonly");
    assert.equal(publicHealthBody.readOnly, true);
    assert.equal(publicHealthBody.publicRateLimitPerMinute, 3);

    const publicTransport = new StreamableHTTPClientTransport(new URL(`${publicBase}/wwdc/mcp`));
    const publicClient = new Client(
      { name: "wwdc-http-public-e2e", version: "0.0.1" },
      { capabilities: {} },
    );
    try {
      await publicClient.connect(publicTransport);
      const listed = await publicClient.listTools();
      assert.equal(listed.tools.length, 45);
    } finally {
      await publicClient.close().catch(() => undefined);
    }
  } finally {
    await new Promise<void>((resolve) => publicServer.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("[mcp-http] bearer and explicit public-readonly modes, prefixed route, 45-tool catalog pass");
}

main().catch((error) => {
  console.error("[mcp-http] FAIL", error);
  process.exit(1);
});
