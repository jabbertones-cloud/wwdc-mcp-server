#!/usr/bin/env node
/**
 * wwdc-mcp-server stdio entry point.
 *
 * Use src/mcp-http.ts / npm run start:http for remote Streamable HTTP.
 */

import fs from "node:fs";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DB_PATH } from "./constants.js";
import { createWwdcServer, openWwdcDatabase, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  // better-sqlite3 fails on a missing parent directory; mkdir the DB's
  // parent too so a WWDC_MCP_DB pointing at a fresh volume path degrades
  // to a clean empty-corpus state (TL-020) instead of a fatal startup crash.
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // TL-020: record whether the DB volume pre-existed before openDb runs.
  // better-sqlite3 creates the file on open, so this is the only moment
  // the server can honestly distinguish "freshly created DB" (probable
  // missing volume / mis-pointed WWDC_MCP_DB) from "pre-existing index".
  const dbPreExisted = fs.existsSync(DB_PATH);
  const db = openWwdcDatabase();
  const server = createWwdcServer(db, { dbFreshlyCreated: !dbPreExisted });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[wwdc-mcp-server] ready version=${SERVER_VERSION} transport=stdio db=${DB_PATH}\n`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[wwdc-mcp-server] shutting down (${signal})\n`);
    try {
      await server.close();
    } catch {
      // Ignore transport shutdown races.
    }
    try {
      db.close();
    } catch {
      // Ignore database shutdown races.
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  process.stderr.write(
    `[wwdc-mcp-server] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exit(1);
});
