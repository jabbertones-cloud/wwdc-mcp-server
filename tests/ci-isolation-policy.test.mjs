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

function assertHostedRelease(source, count) {
  const label = "    runs-on: macos-15";
  const proof = "- name: Verify isolated free macOS ARM64 runner";
  assert.equal(source.split(label).length - 1, count, "every release job uses standard hosted macOS");
  assert.equal(source.split(proof).length - 1, count, "every release job checks isolated runner");
  assert.doesNotMatch(source, /smat-m1|Tatsheens-Mini|self-hosted|macos-15-(?:large|xlarge)/i);
  assert.equal(source.split("RUNNER_ENVIRONMENT:-").length - 1, count);
  assert.equal(source.split("RUNNER_OS:-").length - 1, count);
  assert.equal(source.split("RUNNER_ARCH:-").length - 1, count);
  assert.equal(source.split('test "$(uname -m)" = "arm64"').length - 1, count);
  const sections = source.split(/(?=^  [a-z][a-z-]+:\n    (?:needs:|if:|runs-on:))/m);
  const jobs = sections.filter((chunk) => chunk.includes(label));
  assert.equal(jobs.length, count);
  for (const section of jobs) {
    assert.ok(section.indexOf(proof) >= 0);
    assert.ok(section.indexOf(proof) < section.indexOf("- uses: actions/checkout@v5"),
      "isolation check must precede untrusted release checkout");
    assert.match(section, /permissions:\n      contents: read/);
  }
}

test("release verify, registry, and optional npm publish use free isolated ARM64", () => {
  assertHostedRelease(release, 3);
  assert.match(release, /^  verify:$/m);
  assert.match(release, /^  registry:$/m);
  assert.match(release, /^  npm:$/m);
  assert.match(release, /needs: verify/g);
  assert.match(release, /vars\.ENABLE_NPM_PUBLISH == 'true'/);
  assert.match(release, /npm audit --audit-level=high/);
  assert.match(release, /test "\$TAG_VERSION" = "\$PACKAGE_VERSION"/);
  assert.match(release, /mcp-publisher login github-oidc/);
  assert.match(release, /mcp-publisher publish server\.json/);
  assert.match(release, /npm publish --access public/);
  assert.equal((release.match(/id-token: write/g) || []).length, 2);
});

test("manual MCP Registry publication retains pinned publisher and OIDC", () => {
  assertHostedRelease(registry, 1);
  assert.match(registry, /workflow_dispatch:/);
  assert.match(registry, /id-token: write/);
  assert.match(registry, /shasum -a 256 -c -/);
  assert.match(registry, /mcp-publisher validate server\.json/);
  assert.match(registry, /mcp-publisher login github-oidc/);
  assert.match(registry, /mcp-publisher publish server\.json/);
});

test("public workflows cannot fall back to M1 or larger paid runners", () => {
  for (const source of [ci, release, registry]) {
    assert.doesNotMatch(source, /runs-on:.*(?:self-hosted|macos-15-large|macos-15-xlarge)/i);
  }
  assertHostedRelease(release, 3);
  assertHostedRelease(registry, 1);
});


const releaseCanary = fs.readFileSync(path.join(root, ".github/workflows/release-runner-canary.yml"), "utf8");

test("manual release canary is isolated, read-only, and cannot publish", () => {
  assert.match(releaseCanary, /^name: Release runner read-only canary$/m);
  assert.match(releaseCanary, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(releaseCanary, /^  (?:push|pull_request|release|schedule):/m);
  assert.match(releaseCanary, /^    runs-on: macos-15$/m);
  assert.doesNotMatch(releaseCanary, /self-hosted|smat-m1|Tatsheens-Mini|macos-15-(?:large|xlarge)/i);
  assert.match(releaseCanary, /id-token: write/);
  assert.match(releaseCanary, /contents: read/);
  assert.match(releaseCanary, /persist-credentials: false/);
  assert.match(releaseCanary, /test "\$RUNNER_ENVIRONMENT" = "github-hosted"/);
  assert.match(releaseCanary, /test "\$RUNNER_ARCH" = "ARM64"/);
  assert.match(releaseCanary, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(releaseCanary, /git rev-parse HEAD/);
  assert.match(releaseCanary, /WWDC_RELEASE_CANARY_OIDC_ISSUER_AND_REPOSITORY_OK/);
  assert.match(releaseCanary, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(releaseCanary, /mcp-publisher_darwin_arm64\.tar\.gz/);
  assert.match(releaseCanary, /shasum -a 256 -c -/);
  assert.match(releaseCanary, /\/mcp-publisher" validate server\.json/);
  assert.match(releaseCanary, /node --test tests\/ci-isolation-policy\.test\.mjs/);
  assert.doesNotMatch(releaseCanary, /(?:mcp-publisher|npm)\s+publish(?:\s|$)/m);
  assert.doesNotMatch(releaseCanary, /mcp-publisher login github-oidc/);
});

test("release canary cannot become an automatic event or real publishing job", () => {
  assert.throws(() => {
    const tampered = releaseCanary.replace("  workflow_dispatch:", "  push:");
    assert.match(tampered, /^  workflow_dispatch:$/m);
  });
  assert.throws(() => {
    const tampered = releaseCanary.replace('"$work/mcp-publisher" validate server.json', '"$work/mcp-publisher" publish server.json');
    assert.match(tampered, /\/mcp-publisher" validate server\.json/);
  });
});
