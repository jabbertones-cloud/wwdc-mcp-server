#!/usr/bin/env node
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createWwdcServer, openWwdcDatabase, SERVER_NAME, SERVER_VERSION } from "./server.js";

const HOST = process.env.WWDC_MCP_HTTP_HOST ?? process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.WWDC_MCP_HTTP_PORT ?? process.env.PORT ?? 8789);
const MAX_BODY_BYTES = Number(process.env.WWDC_MCP_MAX_BODY_BYTES ?? 1024 * 1024);
const DEPLOYED_SHA = (
  process.env.WWDC_MCP_DEPLOYED_SHA ??
  process.env.GIT_SHA ??
  ""
).trim();

const CORPUS_SHA256 = (process.env.WWDC_MCP_CORPUS_SHA256 ?? "").trim().toLowerCase();

function normalizePathPrefix(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || raw === "/") return "";
  const prefix = `/${raw.replace(/^\/+|\/+$/g, "")}`;
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/.test(prefix)) {
    throw new Error(`Invalid WWDC_MCP_PATH_PREFIX: ${raw}`);
  }
  return prefix;
}

function httpPaths() {
  const pathPrefix = normalizePathPrefix(process.env.WWDC_MCP_PATH_PREFIX);
  return {
    pathPrefix,
    healthPath: `${pathPrefix}/healthz`,
    mcpPath: `${pathPrefix}/mcp`,
  };
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(req: IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

function authConfigured(): boolean {
  return Boolean(
    process.env.WWDC_MCP_BEARER_TOKEN ||
      process.env.WWDC_MCP_BEARER_TOKEN_SHA256,
  );
}

function publicReadOnlyEnabled(): boolean {
  return process.env.WWDC_MCP_PUBLIC_READ_ONLY === "1";
}

function authorized(req: IncomingMessage): boolean {
  const token = bearer(req);
  if (!token) return false;

  const direct = process.env.WWDC_MCP_BEARER_TOKEN;
  if (direct && safeEqual(token, direct)) return true;

  const expectedHash = process.env.WWDC_MCP_BEARER_TOKEN_SHA256?.toLowerCase();
  if (expectedHash && /^[a-f0-9]{64}$/.test(expectedHash)) {
    const got = createHash("sha256").update(token).digest("hex");
    if (safeEqual(got, expectedHash)) return true;
  }
  return false;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("body_too_large");
      (error as Error & { status?: number }).status = 413;
      throw error;
    }
    chunks.push(part);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("invalid_json");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

export function createHttpServer() {
  const db = openWwdcDatabase();
  const { pathPrefix, healthPath, mcpPath } = httpPaths();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === healthPath) {
      if (req.method !== "GET") {
        json(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
        return;
      }
      json(res, 200, {
        ok: true,
        service: SERVER_NAME,
        version: SERVER_VERSION,
        protocol: "streamable-http",
        authConfigured: authConfigured(),
        publicReadOnly: publicReadOnlyEnabled(),
        pathPrefix: pathPrefix || null,
        endpoints: { health: healthPath, mcp: mcpPath },
        release: { sha: DEPLOYED_SHA || null, corpusSha256: /^[a-f0-9]{64}$/.test(CORPUS_SHA256) ? CORPUS_SHA256 : null },
      });
      return;
    }

    if (url.pathname !== mcpPath) {
      json(res, 404, { error: "not_found" });
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "method_not_allowed" }, { allow: "POST" });
      return;
    }

    const publicReadOnly = publicReadOnlyEnabled();

    if (!publicReadOnly && !authConfigured()) {
      json(res, 503, { error: "auth_not_configured" });
      return;
    }

    if (!publicReadOnly && !authorized(req)) {
      json(
        res,
        401,
        { error: "unauthorized" },
        { "www-authenticate": 'Bearer realm="WWDC MCP"' },
      );
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const status =
        typeof error === "object" && error && "status" in error
          ? Number((error as { status?: number }).status)
          : 400;
      json(res, Number.isFinite(status) ? status : 400, {
        error: error instanceof Error ? error.message : "invalid_request",
      });
      return;
    }

    const mcpServer = createWwdcServer(db);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    transport.onerror = (error) => {
      process.stderr.write(`[wwdc-mcp-server] HTTP transport error: ${error.message}
`);
    };

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      process.stderr.write(
        `[wwdc-mcp-server] HTTP request failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}
`,
      );
      if (!res.headersSent) {
        json(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      await mcpServer.close().catch(() => undefined);
    }
  });

  server.on("close", () => {
    try {
      db.close();
    } catch {
      // Ignore close races during shutdown.
    }
  });

  return server;
}

async function main(): Promise<void> {
  if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
    throw new Error(`Invalid WWDC_MCP_HTTP_PORT/PORT: ${String(PORT)}`);
  }

  const { mcpPath } = httpPaths();
  const server = createHttpServer();
  server.listen(PORT, HOST, () => {
    const address = server.address();
    const actualPort =
      typeof address === "object" && address ? address.port : PORT;
    process.stderr.write(
      `[wwdc-mcp-server] remote MCP ready at http://${HOST}:${actualPort}${mcpPath} (auth=${publicReadOnlyEnabled() ? "public-read-only" : authConfigured() ? "configured" : "missing"})
`,
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `[wwdc-mcp-server] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}
`,
    );
    process.exit(1);
  });
}
