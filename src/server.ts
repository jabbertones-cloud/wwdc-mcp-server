import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "./constants.js";
import { migrate, openDb } from "./db/schema.js";
import { registerAllTools } from "./tools/index.js";

export const SERVER_NAME = "wwdc-mcp-server";
export const SERVER_VERSION = "0.2.0";

export function openWwdcDatabase(): DatabaseType {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = openDb(DB_PATH);
  migrate(db);
  return db;
}

export function createWwdcServer(db: DatabaseType): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerAllTools(server, db);
  return server;
}
