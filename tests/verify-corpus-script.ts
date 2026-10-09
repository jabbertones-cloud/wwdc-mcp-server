#!/usr/bin/env tsx
/**
 * Real CLI parse/launch guard. Unlike a TypeScript build that excludes
 * scripts/, this executes scripts/verify-corpus.ts in Node, so a malformed
 * source file cannot leave CI green.
 *
 * On an absent database the expected outcome is its explicit missing-corpus
 * error. A parser, resolver, or module startup failure is NEVER acceptable.
 * Live corpus acceptance independently executes the script on a real DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const absent = path.join(os.tmpdir(), "wwdc-verify-absent-" + process.pid + ".db");
assert.equal(fs.existsSync(absent), false, "probe database must be missing");
const launched = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/verify-corpus.ts", absent, "--require-all"],
  { cwd: process.cwd(), timeout: 15000, encoding: "utf8" },
);
assert.equal(launched.status, 1, "missing corpus must fail closed");
assert.match(launched.stderr, /corpus missing:/, "script must parse and run");
assert.doesNotMatch(launched.stderr, /TransformError|Syntax error|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/, "CLI startup must work");
console.log("[verify-corpus-script] CLI parsed; missing corpus fails with intended error");
