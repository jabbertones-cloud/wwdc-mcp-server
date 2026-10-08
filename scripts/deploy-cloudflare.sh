#!/usr/bin/env bash
set -euo pipefail

DB="${WWDC_MCP_DB:-.deploy-data/wwdc.db}"
WRANGLER="${WRANGLER:-wrangler}"
SHA="$(git rev-parse HEAD)"

git diff --quiet
git diff --cached --quiet
npm run build
npm test
npm run test:inspector
npm run verify:corpus -- "$DB" > /tmp/wwdc-corpus-proof.json
CORPUS_SHA256="$(node -e "const p=require('/tmp/wwdc-corpus-proof.json');process.stdout.write(p.sha256)")"

echo "[release] git_sha=$SHA"
echo "[release] corpus_sha256=$CORPUS_SHA256"
"$WRANGLER" deploy --var "DEPLOYED_SHA:$SHA" --var "CORPUS_SHA256:$CORPUS_SHA256"

curl --fail --silent --show-error https://wwdc-mcp.smatdesigns.com/healthz > /tmp/wwdc-live-health.json
node -e "const fs=require('fs');const h=JSON.parse(fs.readFileSync('/tmp/wwdc-live-health.json','utf8'));if(!h.ok||h.release?.sha!=='$SHA'||h.release?.corpusSha256!=='$CORPUS_SHA256')throw new Error('live release identity mismatch');console.log('[release] live health identity verified')"
