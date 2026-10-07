#!/usr/bin/env tsx
/**
 * Package smoke test — validates npm + MCP Registry release metadata before release.
 *
 * This catches common public-MCP failures: a missing executable in the tarball,
 * a drifted Registry namespace, or package metadata that no longer matches the
 * supported runtime.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SERVER_VERSION } from "../src/server.js";
import { USER_AGENT } from "../src/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  name: string;
  mcpName?: string;
  bin?: Record<string, string>;
  files?: string[];
  engines?: { node?: string };
  publishConfig?: { access?: string };
  version: string;
};

assert.equal(pkg.name, "wwdc-mcp-server");
assert.equal(pkg.mcpName, "io.github.jabbertones-cloud/wwdc");
assert.equal(pkg.engines?.node, ">=22.14.0");
assert.equal(pkg.publishConfig?.access, "public");
assert.equal(pkg.version, SERVER_VERSION, "package and runtime versions must match");
assert.ok(USER_AGENT.includes(`wwdc-mcp-server/${pkg.version}`), "User-Agent must match package version");

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8")) as {
  version?: string;
  packages?: Record<string, { version?: string }>;
};
assert.equal(lock.version, pkg.version, "lockfile version must match package version");
assert.equal(lock.packages?.[""]?.version, pkg.version, "lockfile root package version must match package version");

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "server.json"), "utf8")) as {
  name: string;
  version: string;
  description: string;
  remotes?: Array<{ url?: string; type?: string }>;
  packages?: Array<{ identifier?: string; version?: string; transport?: { type?: string } }>;
};
assert.equal(registry.name, pkg.mcpName, "Registry name must match package mcpName");
assert.equal(registry.version, pkg.version, "Registry version must match package version");
assert.ok(registry.description.length <= 100, "Registry description must be <= 100 characters");
assert.equal(registry.remotes?.[0]?.url, "https://fabric-origin.smatdesigns.com/wwdc/mcp", "Registry remote URL must match the public MCP endpoint");
assert.equal(registry.remotes?.[0]?.type, "streamable-http", "Registry remote must use Streamable HTTP");
if (registry.packages?.length) {
  assert.equal(registry.packages[0]?.identifier, pkg.name, "Registry npm identifier must match package name");
  assert.equal(registry.packages[0]?.version, pkg.version, "Registry package version must match package version");
  assert.equal(registry.packages[0]?.transport?.type, "stdio");
}
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
assert.ok(files.has("CHANGELOG.md"), "packed artifact must include CHANGELOG.md");
assert.ok(files.has("LICENSE"), "packed artifact must include LICENSE");
assert.ok(![...files].some((file) => file.startsWith("tests/")), "packed artifact should not include tests");

console.log("[package-smoke] npm artifact, runtime, lockfile, User-Agent, and remote MCP Registry metadata agree");
