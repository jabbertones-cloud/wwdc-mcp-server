import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cwd = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(cwd, "..");
const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const release = fs.readFileSync(path.join(root, ".github/workflows/publish.yml"), "utf8");
const registry = fs.readFileSync(path.join(root, ".github/workflows/registry.yml"), "utf8");

function assertIsolation(source) {
  assert.match(source, /^\s*runs-on: macos-15$/m);
  assert.doesNotMatch(source, /runs-on:.*(?:self-hosted|macos-15-xlarge|macos-15-large)/i);
  assert.match(source, /test "\$\{RUNNER_ENVIRONMENT:-\}" = "github-hosted"/);
  assert.match(source, /test "\$\{RUNNER_OS:-\}" = "macOS"/);
  assert.match(source, /test "\$\{RUNNER_ARCH:-\}" = "ARM64"/);
  assert.match(source, /test "\$\(uname -m\)" = "arm64"/);
  assert.ok(source.indexOf("Verify isolated free macOS ARM64 runner") < source.indexOf("actions/checkout@v4"));
  assert.match(source, /run: npm ci/);
  for (const command of ["npm run build", "npm test", "npm run test:inspector", "npm audit --audit-level=high"]) {
    assert.ok(source.includes(command), "must preserve mandatory gate " + command);
  }
}

test("public WWDC PR CI runs only on isolated standard macOS ARM64", () => {
  assertIsolation(ci);
});

test("reject hosted paid/larger or persistent runner regression", () => {
  for (const label of ["[self-hosted, macOS, ARM64, smat-m1, wwdc-ci]", "macos-15-xlarge", "ubuntu-latest"]) {
    assert.throws(() => assertIsolation(ci.replace("runs-on: macos-15", "runs-on: " + label)));
  }
});

test("reject loss of early isolation authority proof", () => {
  assert.throws(() => assertIsolation(ci.replace("RUNNER_ENVIRONMENT:-}", "WRONG_ENVIRONMENT:-}")));
});

test("protected release/publish/registry still uses exact named physical M1", () => {
  const expected = "runs-on: [self-hosted, macOS, ARM64, smat-m1, wwdc-ci]";
  const count = (source) => source.split(expected).length - 1;
  assert.equal(count(release), 3);
  assert.equal(count(registry), 1);
  assert.equal(count(ci), 0);
  assert.match(release, /smat-m1-wwdc-ci/);
  assert.match(registry, /smat-m1-wwdc-ci/);
});
