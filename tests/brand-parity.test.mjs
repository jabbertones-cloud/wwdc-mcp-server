import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const json = (f) => JSON.parse(read(f));

test("public AppDev Atlas branding preserves immutable technical identities", () => {
  const plugin = json("openai-public-plugin/plugin.json");
  const registry = json("server.json");
  const bundle = json("packaging/mcpb/manifest.json");
  const pkg = json("package.json");
  assert.equal(plugin.name, "wwdc-apple-developer");
  assert.equal(plugin.interface.displayName, "AppDev Atlas");
  assert.equal(registry.name, "io.github.jabbertones-cloud/wwdc");
  assert.equal(registry.title, "AppDev Atlas");
  assert.equal(bundle.name, "wwdc-mcp");
  assert.equal(bundle.display_name, "AppDev Atlas");
  assert.equal(pkg.name, "wwdc-mcp-server");
  assert.equal(bundle.support, "https://github.com/jabbertones-cloud/wwdc-support/issues");
  assert.equal(pkg.bugs.url, bundle.support);
});

test("active support and MCP agent instructions do not present the old brand", () => {
  const files = [
    "src/server.ts", "src/aiscent-handoff.ts", "src/tools/index.ts",
    "src/mcp-http.ts", "docs/ARCHITECTURE.md", "docs/COMPATIBILITY.md",
    "docs/DISTRIBUTION.md", "docs/SKILL-WIRING.md", "docs/TROUBLESHOOTING.md",
    ".github/copilot-instructions.md", ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/bug_report.md",
  ];
  for (const name of files) {
    assert.doesNotMatch(read(name), /WWDC MCP/, name);
    assert.match(read(name), /AppDev Atlas/, name);
  }
});
