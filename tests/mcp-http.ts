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
  process.env.WWDC_MCP_PATH_PREFIX = "/wwdc/";

  const { SERVER_INSTRUCTIONS, SERVER_VERSION } = await import("../src/server.js");
  const { createHttpServer } = await import("../src/mcp-http.js");
  const server = createHttpServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const rootHealth = await fetch(`${base}/healthz`);
  assert.equal(rootHealth.status, 404);

  const health = await fetch(`${base}/wwdc/healthz`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as any;
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.version, SERVER_VERSION);
  assert.equal(healthBody.protocol, "streamable-http");
  assert.equal(healthBody.authConfigured, true);
  assert.equal(healthBody.publicReadOnly, false);
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
    assert.equal(client.getServerVersion()?.version, SERVER_VERSION);
    assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);

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

    console.log("[mcp-http] prefixed route, auth, version/instructions, 45-tool catalog, and tool call pass");
  } finally {
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  delete process.env.WWDC_MCP_BEARER_TOKEN;
  process.env.WWDC_MCP_PUBLIC_READ_ONLY = "1";
  process.env.WWDC_MCP_PATH_PREFIX = "";
  const publicServer = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    publicServer.once("error", reject);
    publicServer.listen(0, "127.0.0.1", resolve);
  });
  const publicAddress = publicServer.address();
  assert.ok(publicAddress && typeof publicAddress === "object");
  const publicBase = `http://127.0.0.1:${publicAddress.port}`;

  const publicHealth = await fetch(`${publicBase}/healthz`);
  assert.equal(publicHealth.status, 200);
  const publicHealthBody = (await publicHealth.json()) as any;
  assert.equal(publicHealthBody.authConfigured, false);
  assert.equal(publicHealthBody.publicReadOnly, true);

  const publicTransport = new StreamableHTTPClientTransport(
    new URL(`${publicBase}/mcp`),
  );
  const publicClient = new Client(
    { name: "wwdc-http-public-e2e", version: "0.0.1" },
    { capabilities: {} },
  );
  try {
    await publicClient.connect(publicTransport);
    assert.equal(publicClient.getServerVersion()?.version, SERVER_VERSION);
    const listed = await publicClient.listTools();
    assert.equal(listed.tools.length, 45);
    console.log("[mcp-http] explicit public-read-only mode allows anonymous 45-tool MCP access");
  } finally {
    await publicClient.close().catch(() => undefined);
    await new Promise<void>((resolve) => publicServer.close(() => resolve()));
  }

  delete process.env.WWDC_MCP_PUBLIC_READ_ONLY;
  const closedServer = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    closedServer.once("error", reject);
    closedServer.listen(0, "127.0.0.1", resolve);
  });
  const closedAddress = closedServer.address();
  assert.ok(closedAddress && typeof closedAddress === "object");
  const closedBase = `http://127.0.0.1:${closedAddress.port}`;
  const closed = await fetch(`${closedBase}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "fail-closed-test", version: "0.0.1" },
      },
    }),
  });
  assert.equal(closed.status, 503);
  await new Promise<void>((resolve) => closedServer.close(() => resolve()));
  console.log("[mcp-http] no auth and no public flag remains fail-closed");

  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error("[mcp-http] FAIL", error);
  process.exit(1);
});
