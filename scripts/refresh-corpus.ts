#!/usr/bin/env node
/**
 * Safe recurring corpus refresh.
 *
 * The active SQLite database is never a work-in-progress. Ingestion happens
 * on an independently backed-up candidate, verification happens there, and
 * only then is the complete candidate promoted through SQLite's online
 * backup API. This uses an SQLite transaction on the existing database inode,
 * avoiding dangerous WAL/shm collisions when MCP readers have DB handles open.
 * A failed or interrupted ingest leaves the active DB untouched.
 *
 * --db FILE (default WWDC_MCP_DB or DATA_DIR/wwdc.db)
 * --source SOURCE (default all)
 * --year YYYY (optional WWDC-only incremental refresh)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { DB_PATH } from "../src/constants.js";
import { CORPUS_CONTENT_TABLES, getLatestCorpusVersion, hashCorpusContent } from "../src/db/corpus.js";

const argv = process.argv.slice(2);
function arg(flag: string, fallback?: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? fallback : argv[index + 1];
}
const target = path.resolve(arg("--db", DB_PATH)!);
const source = arg("--source", "all")!;
const year = arg("--year");
if (!/^[a-z-]+$/.test(source) || (year && !/^20[0-9][0-9]$/.test(year))) {
  throw new Error("invalid source or year");
}
const baseDir = path.dirname(target);
fs.mkdirSync(baseDir, { recursive: true });
const lockFile = path.join(baseDir, ".wwdc-refresh.lock");
const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
const candidate = path.join(baseDir, ".wwdc-refresh-" + stamp + "-" + process.pid + ".db");
const backup = target + ".previous";
let lockFd: number | undefined;

function tableCounts(db: Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of CORPUS_CONTENT_TABLES) {
    counts[table] = Number((db.prepare("SELECT count(*) AS n FROM " + table).get() as {n: number}).n);
  }
  return counts;
}
function database(name: string): Database {
  const db = new Database(name, { readonly: true, fileMustExist: true });
  if (db.pragma("integrity_check", { simple: true }) !== "ok") {
    db.close();
    throw new Error("integrity_check failed on " + name);
  }
  return db;
}
function checkCandidate(name: string, baseline: Record<string, number>): void {
  const db = database(name);
  try {
    const version = getLatestCorpusVersion(db);
    if (!version) throw new Error("candidate has no corpus stamp");
    if (version.ingestSource !== source) throw new Error("stamp source mismatch");
    const digest = hashCorpusContent(db);
    if (version.version !== digest || version.contentSha256 !== digest)
      throw new Error("corpus content identity mismatch");
    const years = db.prepare("SELECT year,count(*) AS n FROM sessions GROUP BY year").all() as Array<{year:number,n:number}>;
    for (let year = 2020; year <= 2026; year++) {
      if (!years.some((r) => r.year === year && r.n > 0))
        throw new Error("missing WWDC " + year);
    }
    const counts = tableCounts(db);
    const required = ["sessions", "tutorials", "hig_entries", "evolution", "apple_docs", "swift_book", "appstore_guidelines"];
    for (const table of required) {
      if (!counts[table]) throw new Error("required source empty " + table);
    }
    for (const table of required) {
      const old = baseline[table] ?? 0;
      if (old > 0 && counts[table]! < Math.floor(old * 0.95)) {
        throw new Error("coverage regression " + table + " " + old + " -> " + counts[table]);
      }
    }
    const checkedSources = source === "all"
      ? ["wwdc","tutorials","pathways","hig","evolution","docs","swiftbook","appstore"]
      : [source];
    for (const name of checkedSources) {
      const result = version.sources[name];
      if (!result || !result.lastRunAt || !result.lastSuccessAt || result.errors > 0 || result.itemsIngested <= 0) {
        throw new Error("source did not complete successfully: " + name + ": " + JSON.stringify(result ?? null));
      }
      const recent = Date.parse(result.lastRunAt);
      if (!Number.isFinite(recent) || recent < startedAt - 60000)
        throw new Error("source did not refresh this run: " + name);
    }
    console.log("[refresh] verified version=" + version.version + " stamp=" + version.stampId +
      " sessions=" + version.sessionCount + " years=" + version.wwdcYears +
      " source=" + source + " counts=" + JSON.stringify(counts));
  } finally {
    db.close();
  }
}
const startedAt = Date.now();
async function main(): Promise<void> {
  // Fail closed on another refresh. An interrupted job leaves this small marker,
  // recoverable explicitly after checking that no other job is active.
  try {
    lockFd = fs.openSync(lockFile, "wx", 0o600);
  } catch (err) {
    // Recover abandoned locks after real process termination. On Docker
    // workers, only a lock older than the configured 1-hour max run plus
    // a safety window is reclaimed across differing host namespaces.
    let stale = false;
    try {
      const prior = JSON.parse(fs.readFileSync(lockFile, "utf8")) as {
        pid?: number; hostname?: string; startedAt?: string;
      };
      const ageMs = Date.now() - Date.parse(prior.startedAt ?? "");
      if (prior.hostname === os.hostname() && Number.isInteger(prior.pid)) {
        try { process.kill(prior.pid!, 0); } catch (error: any) {
          if (error?.code === "ESRCH") stale = true;
        }
      }
      if (Number.isFinite(ageMs) && ageMs > 4 * 3600000) stale = true;
    } catch { /* malformed lock requires explicit intervention */ }
    if (!stale) throw new Error("active or indeterminate refresh lock: " + lockFile);
    console.warn("[refresh] reclaimed a verified stale lock");
    fs.unlinkSync(lockFile);
    lockFd = fs.openSync(lockFile, "wx", 0o600);
  }
  fs.writeSync(lockFd, JSON.stringify({ pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString(), candidate }) + "\n");
  console.log("[refresh] active=" + target + " source=" + source + " stage=" + candidate);
  let baseline: Record<string, number> = {};
  if (fs.existsSync(target)) {
    const active = database(target);
    try {
      baseline = tableCounts(active);
      // SQLite's online backup gives a consistent snapshot even when WAL
      // readers are active, without unlinking the database beneath them.
      await active.backup(candidate);
    } finally { active.close(); }
  }
  const cli = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const args = ["src/ingest/run.ts", "--source", source];
  if (year) args.push("--year", year);
  const result = spawnSync(cli, args, {
    cwd: process.cwd(), stdio: "inherit", env: {
      ...process.env, WWDC_MCP_DB: candidate, WWDC_MCP_DATA_DIR: baseDir,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("ingestion exited " + result.status);
  if (process.env.WWDC_TEST_INTERRUPT_AFTER_INGEST === "1") {
    throw new Error("injected interruption: candidate not promoted");
  }
  checkCandidate(candidate, baseline);
  // Ensure the candidate is a single self-contained SQLite file for promotion.
  const prepared = new Database(candidate);
  try {
    const check = prepared.pragma("wal_checkpoint(TRUNCATE)") as Array<{busy:number}>;
    if (check[0]?.busy) throw new Error("candidate WAL checkpoint busy");
    const mode = prepared.pragma("journal_mode=DELETE", { simple: true });
    if (mode !== "delete") throw new Error("cannot finalize standalone candidate");
  } finally { prepared.close(); }
  if (fs.existsSync(candidate + "-wal")) throw new Error("candidate WAL persisted after checkpoint");
  if (fs.existsSync(target)) {
    // Take a separate consistent recovery image of the last known-good corpus.
    const active = database(target);
    try {
      const pendingBackup = backup + ".new-" + process.pid;
      await active.backup(pendingBackup);
      // Never delete the previous rollback file before a new backup exists.
      fs.renameSync(pendingBackup, backup);
    } finally { active.close(); }
  }
  // SQLite explicitly warns that renaming/unlinking an open WAL database
  // can corrupt the DB when readers share WAL/journal filenames. Use its
  // online backup API to promote the candidate as one SQLite transaction.
  // Existing MCP readers remain on the SAME inode; an updated corpus stamp
  // triggers their clean restart through the HTTP service's version watcher.
  const sourceDb = new Database(candidate, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(target);
  } finally { sourceDb.close(); }
  console.log("[refresh] PROMOTED via sqlite-backup path=" + target + " backup=" + (fs.existsSync(backup) ? backup : "none"));
  const promoted = database(target);
  try {
    const v = getLatestCorpusVersion(promoted);
    if (!v || v.version !== hashCorpusContent(promoted)) throw new Error("promoted identity mismatch");
    console.log("[refresh] CONFIRMED version=" + v.version + " stamp=" + v.stampId);
  } finally { promoted.close(); }
  // Avoid retaining 200MB+ successfully promoted candidates every week.
  fs.unlinkSync(candidate);
}
try {
  await main();
} catch (err) {
  console.error("[refresh] FAILED (active DB preserved unless PROMOTED already logged):", err);
  process.exitCode = 1;
} finally {
  if (lockFd !== undefined) {
    fs.closeSync(lockFd);
    try { fs.unlinkSync(lockFile); } catch { /* leave evidence */ }
  }
  // Keep failed candidates for operator diagnosis; never automatically promote them.
}
