#!/usr/bin/env node
/**
 * wwdc-mcp-server entry point.
 *
 * Transport: stdio (for local use by Claude Code / Claude Desktop / skills).
 * Startup: open SQLite, run migrations, register all tools, connect.
 */

import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DB_PATH, DATA_DIR } from "./constants.js";
import { openDb, migrate } from "./db/schema.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // better-sqlite3 fails on a missing parent directory; mkdir the DB's
  // parent too so a WWDC_MCP_DB pointing at a fresh volume path degrades
  // to a clean empty-corpus state (TL-020) instead of a fatal startup crash.
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // TL-020: record whether the DB volume pre-existed before openDb runs.
  // better-sqlite3 creates the file on open, so this is the only moment
  // the server can honestly distinguish "freshly created DB" (probable
  // missing volume / mis-pointed WWDC_MCP_DB) from "pre-existing index".
  const dbPreExisted = fs.existsSync(DB_PATH);
  const db = openDb(DB_PATH);
  migrate(db);

  const server = new McpServer({
    name: "wwdc-mcp-server",
    version: "0.1.0",
  });

  registerAllTools(server, db, { dbFreshlyCreated: !dbPreExisted });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stderr logging is permitted for stdio servers.
  process.stderr.write(`[wwdc-mcp-server] ready (db=${DB_PATH})\n`);

  // Keep process alive; close db on SIGTERM/SIGINT.
  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[wwdc-mcp-server] shutting down (${signal})\n`);
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  process.stderr.write(`[wwdc-mcp-server] fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
