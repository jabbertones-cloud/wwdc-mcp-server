#!/usr/bin/env bash
set -euo pipefail

# Exact-source, independently verified release of the PUBLIC, READ-ONLY WWDC MCP.
# This does not deploy AiSCent or touch any customer entitlements.
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
SOURCE_DB="$(printenv WWDC_MCP_DB 2>/dev/null || printf '%s' '.deploy-data/wwdc.db')"
STAGED_DB=".deploy-data/wwdc.db"
PROOF=".deploy-data/corpus-proof.json"
WRANGLER="$(printenv WRANGLER 2>/dev/null || printf '%s' 'wrangler')"
SHA="$(git rev-parse HEAD)"

git diff --quiet
git diff --cached --quiet
if [ ! -f "$SOURCE_DB" ]; then
  echo "[release] Missing source corpus: $SOURCE_DB" >&2
  exit 1
fi

npm run build
npm test
npm run test:inspector

# SQLite online backup is used instead of copying an active WAL database.
# The snapshot actually shipped in the container is the one verified below.
mkdir -p .deploy-data
WWDC_STAGE_SOURCE="$SOURCE_DB" WWDC_STAGE_OUTPUT="$STAGED_DB" node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
const source = path.resolve(process.env.WWDC_STAGE_SOURCE);
const target = path.resolve(process.env.WWDC_STAGE_OUTPUT);
if (source !== target) {
  const temporary = target + ".new-" + process.pid;
  const live = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await live.backup(temporary);
    fs.renameSync(temporary, target);
  } finally {
    live.close();
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
NODE

./node_modules/.bin/tsx scripts/verify-corpus.ts "$STAGED_DB" --require-all > "$PROOF"
CORPUS_SHA256="$(node -e 'const p=require("./.deploy-data/corpus-proof.json");if(!p.ok||!(/^[a-f0-9]{64}$/.test(p.corpusVersion)))process.exit(1);process.stdout.write(p.corpusVersion)')"
FILE_SHA256="$(node -e 'const p=require("./.deploy-data/corpus-proof.json");process.stdout.write(p.sha256)')"
# Bake exact release identity into the image so even documentation-only source
# changes trigger an ordinary Cloudflare Container rollout and a fresh start
# with the new Worker-provided environment variables.
WWDC_RELEASE_SHA="$SHA" WWDC_RELEASE_CORPUS_SHA256="$CORPUS_SHA256" node -e '
  const fs=require("node:fs");
  const sha=process.env.WWDC_RELEASE_SHA;
  const corpus=process.env.WWDC_RELEASE_CORPUS_SHA256;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || !/^[a-f0-9]{64}$/.test(corpus ?? "")) process.exit(1);
  fs.writeFileSync(".deploy-data/release.json", JSON.stringify({sourceSha:sha, corpusSha256:corpus})+"\\n");
'
echo "[release] source_git_sha=$SHA"
echo "[release] staged_database_file_sha256=$FILE_SHA256"
echo "[release] verified_logical_corpus_sha256=$CORPUS_SHA256"

# The MCP health response exposes the LOGICAL corpus digest, not the byte-level
# SQLite file digest. Never compare these two different types of hash.
"$WRANGLER" deploy --var "DEPLOYED_SHA:$SHA" --var "CORPUS_SHA256:$CORPUS_SHA256"

# Do not claim delivery until the actual public endpoint reports this exact
# release and the same digest of the corpus opened by the running MCP process.
# A brand-new Cloudflare Container can need several minutes to pull the image,
# open and hash the indexed SQLite corpus, and pass startup health checks.
# A 60-second fixed retry loop misclassified a successful deployment as failed.
# Keep the gate strict but use a bounded 10-minute cold-start allowance.
matched=0
deadline=$(($(date +%s) + 600))
attempt=0
while :; do
  attempt=$((attempt + 1))
  if curl --fail --silent --show-error --max-time 20 \
      https://wwdc-mcp.smatdesigns.com/healthz > .deploy-data/live-health.json &&
     WWDC_EXPECT_SHA="$SHA" WWDC_EXPECT_CORPUS_SHA256="$CORPUS_SHA256" node -e '
       const fs=require("node:fs");
       const h=JSON.parse(fs.readFileSync(".deploy-data/live-health.json","utf8"));
       if (!h.ok || h.release?.sha!==process.env.WWDC_EXPECT_SHA ||
           h.release?.corpusSha256!==process.env.WWDC_EXPECT_CORPUS_SHA256 ||
           h.corpus?.verified!==true || h.corpus?.needsRestart===true ||
           h.publicReadOnly!==true) process.exit(1);
     '; then
    matched=1
    break
  fi
  now=$(date +%s)
  if [ "$now" -ge "$deadline" ]; then
    echo "[release] cold-start deadline exceeded; production identity still unverified" >&2
    break
  fi
  echo "[release] waiting for exact-SHA and verified-corpus parity attempt=$attempt remaining_seconds=$((deadline - now))"
  sleep 10
done
if [ "$matched" != "1" ]; then
  echo "[release] BLOCKED: deployed health does not prove expected source and corpus" >&2
  exit 1
fi

# Real MCP calls through the public HTTPS origin, not local test fixtures.
WWDC_EXPECT_SHA="$SHA" WWDC_EXPECT_CORPUS_SHA256="$CORPUS_SHA256" \
  ./node_modules/.bin/tsx scripts/verify-public-mcp.ts
echo "[release] LIVE_ACCEPTED sha=$SHA corpus=$CORPUS_SHA256"
