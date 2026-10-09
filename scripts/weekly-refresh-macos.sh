#!/bin/bash
# Native M1 host refresh when Woodpecker is not active:
# UTC Monday 06:00 == Sunday 23:00 America/Phoenix (non-DST).
set -euo pipefail
# launchd's Background session does NOT inherit the interactive shell PATH.
# This is required by the observed 2026-10-09 exit=127 "node: command not found".
export PATH="/opt/homebrew/bin:$HOME/.local/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[weekly-ingest] required Node/npm runtime missing from the authorized host" >&2
  exit 69
fi
ROOT="$(cd -P "$(dirname "$0")/.." && pwd)"
DATA="$HOME/Library/Application Support/wwdc-mcp-server"
DB="$DATA/wwdc.db"
cd "$ROOT"
mkdir -p "$DATA"
if [ "$(readlink /etc/localtime)" != "/var/db/timezone/zoneinfo/America/Phoenix" ] || [ "$(date +%z)" != "-0700" ]; then
  echo "[weekly-ingest] refusing: host timezone is not America/Phoenix MST(-0700)" >&2
  exit 78
fi
if [ "$(git branch --show-current)" != "main" ] || [ -n "$(git status --porcelain)" ]; then
  echo "[weekly-ingest] refusing: installed main must be clean" >&2
  exit 78
fi
SHA="$(git rev-parse HEAD)"
if [ "$SHA" != "$(git rev-parse origin/main)" ]; then
  echo "[weekly-ingest] refusing: HEAD differs from fetched origin/main" >&2
  exit 78
fi
if [ ! -s "$DB" ]; then echo "[weekly-ingest] refusing: production DB missing" >&2; exit 78; fi
FREE_KB="$(df -Pk "$DATA" | awk 'NR == 2 {print $4}')"
if [ "$FREE_KB" -lt 2097152 ]; then
  echo "[weekly-ingest] refusing: <2GiB free" >&2
  exit 78
fi
echo "[weekly-ingest] start=$(date -u +%Y-%m-%dT%H:%M:%SZ) sha=$SHA db=$DB free_kb=$FREE_KB"
export WWDC_SKIP_EMBEDDINGS=1 WWDC_MCP_DB="$DB" WWDC_MCP_DATA_DIR="$DATA"
if [ "$#" -gt 0 ] && [ "$1" = "--check" ]; then
  echo "[weekly-ingest] check only: real database + MCP acceptance, no ingest"
  npm run verify:corpus -- "$DB" --require-all > "$DATA/weekly-refresh-check.json"
  WWDC_EXPECT_SHA="$SHA" node --import tsx scripts/verify-live-mcp.ts > "$DATA/weekly-mcp-primary-check.json"
  WWDC_EXPECT_SHA="$SHA" WWDC_LIVE_URL="http://127.0.0.1:8789" node --import tsx scripts/verify-live-mcp.ts > "$DATA/weekly-mcp-secondary-check.json"
  echo "[weekly-ingest] preflight real MCP acceptance passed"
  exit 0
fi
if [ "$#" -gt 0 ] && [ "$1" != "--run-now" ]; then
  echo "[weekly-ingest] invalid argument" >&2
  exit 64
fi
trap 'rc=$?; if [ "$rc" -ne 0 ]; then printf "%s exit=%s sha=%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc" "$SHA" > "$DATA/weekly-refresh-last-failure.txt"; fi' EXIT
# Apple source fetch, SQLite staged candidate, integrity + coverage gate,
# and transactional online backup promotion while real MCP readers are open.
node --import tsx scripts/refresh-corpus.ts --db "$DB" --source all
VERIFY_TMP="$DATA/weekly-refresh-verification.tmp"
npm run verify:corpus -- "$DB" --require-all > "$VERIFY_TMP"
mv "$VERIFY_TMP" "$DATA/weekly-refresh-verification.json"
# KeepAlive HTTP daemons automatically detect stamp changes and restart.
for PORT in 8797 8789; do
  OK=0
  for ATTEMPT in $(seq 1 15); do
    if [ "$PORT" = 8797 ]; then
      if WWDC_EXPECT_SHA="$SHA" node --import tsx scripts/verify-live-mcp.ts > "$DATA/weekly-mcp-8797.json" 2> "$DATA/weekly-mcp-8797.err"; then OK=1; break; fi
    else
      if WWDC_EXPECT_SHA="$SHA" WWDC_LIVE_URL="http://127.0.0.1:8789" node --import tsx scripts/verify-live-mcp.ts > "$DATA/weekly-mcp-8789.json" 2> "$DATA/weekly-mcp-8789.err"; then OK=1; break; fi
    fi
    echo "[weekly-ingest] port $PORT acceptance retry $ATTEMPT"
    sleep 5
  done
  if [ "$OK" -ne 1 ]; then
    echo "[weekly-ingest] live acceptance failed on port $PORT" >&2
    exit 1
  fi
done
node - "$DATA/weekly-refresh-verification.json" "$DATA/weekly-refresh-last-success.json" "$SHA" <<'JS'
const fs = require("node:fs");
const [inFile, outFile, releaseSha] = process.argv.slice(2);
const proof = JSON.parse(fs.readFileSync(inFile, "utf8"));
if (proof.ok !== true || proof.ingestSource !== "all") throw Error("incomplete verification");
const receipt = {
  ok: true, observedAt: new Date().toISOString(), releaseSha,
  corpusVersion: proof.corpusVersion, ingestedAt: proof.ingestedAt,
  counts: proof.counts, acceptancePorts: [8797, 8789],
  schedule: "Sunday 23:00 America/Phoenix = Monday 06:00 UTC",
  scheduler: "launchd-native fallback until Woodpecker server is operational",
};
fs.writeFileSync(outFile, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
JS
echo "[weekly-ingest] SUCCESS $(date -u +%Y-%m-%dT%H:%M:%SZ) sha=$SHA"
