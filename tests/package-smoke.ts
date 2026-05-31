#!/usr/bin/env tsx
/**
 * Package smoke test — validates npm package metadata before release.
 *
 * This catches the common MCP server failure mode where package.json points the
 * `bin` field at dist/index.js but the packed artifact does not include it.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  name: string;
  bin?: Record<string, string>;
  files?: string[];
};

assert.equal(pkg.name, "wwdc-mcp-server");
assert.ok(pkg.bin?.["wwdc-mcp-server"], "package bin must expose wwdc-mcp-server");

const binPath = path.join(ROOT, pkg.bin["wwdc-mcp-server"]);
assert.ok(fs.existsSync(binPath), `bin target missing: ${pkg.bin["wwdc-mcp-server"]}`);
assert.match(fs.readFileSync(binPath, "utf8").slice(0, 80), /^#!\/usr\/bin\/env node/);

const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const [pack] = JSON.parse(raw) as Array<{ files: Array<{ path: string }> }>;
const files = new Set(pack.files.map((file) => file.path));

assert.ok(files.has("dist/index.js"), "packed artifact must include dist/index.js");
assert.ok(files.has("README.md"), "packed artifact must include README.md");
assert.ok(files.has("LICENSE"), "packed artifact must include LICENSE");
assert.ok(![...files].some((file) => file.startsWith("tests/")), "packed artifact should not include tests");

console.log("[package-smoke] npm package metadata and packed files look good");
