/**
 * CLI: re-derive apple_docs availability fields from archived raw_json.
 * Usage: tsx scripts/repair-availability.ts <path-to-wwdc.db>
 * Exits non-zero when the corpus was repaired but NOT re-stamped
 * (see src/ingest/repair-availability.ts for the stamp discipline).
 */
import Database from "better-sqlite3";
import { migrate } from "../src/db/schema.js";
import { repairAvailability } from "../src/ingest/repair-availability.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: repair-availability <path-to-wwdc.db>");
  process.exit(2);
}
const db = new Database(path);
migrate(db);
const result = repairAvailability(db);
db.close();
console.log(JSON.stringify(result, null, 2));
if (!result.stamped) process.exit(1);
