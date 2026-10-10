#!/usr/bin/env node
/**
 * wwdc-mcp-server stdio entry point.
 *
 * Use src/mcp-http.ts / npm run start:http for remote Streamable HTTP.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DB_PATH } from "./constants.js";
import { createWwdcServer, openWwdcDatabase, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const db = openWwdcDatabase();
  const server = createWwdcServer(db);

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
