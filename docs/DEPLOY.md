# wwdc-mcp-server — Deploy runbook

## 1. Fix a stuck Git index lock (one-time, Scott's local shell)

If a previous process left behind `.git/index.lock`, remove only that lock file.
Do not remove `.git`; that deletes local repository history and branch state.
From **Scott's real terminal** (not the sandbox):

```bash
cd ~/path/to/claw-repos/wwdc-mcp-server
rm -f .git/index.lock
git status
```

If the local checkout is corrupt, make a fresh clone beside it and copy only
uncommitted working files after review:

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git wwdc-mcp-server-clean
```

## 2. First-time install

```bash
npm install
npm run build
npm run health:native        # verifies better-sqlite3 native addon loads
ollama pull nomic-embed-text   # enables semantic search; FTS-only if skipped
```

## 3. Ingest

```bash
npm run ingest:all              # full sweep (~15–30 min first run)
npm run ingest:wwdc -- --year 2024 --year 2025
npm run ingest:tutorials
npm run ingest:hig
npm run ingest:evolution -- --limit 50
```

DB lands at:

- macOS default: `~/Library/Application Support/wwdc-mcp-server/wwdc.db`
- Linux default: `~/.local/share/wwdc-mcp-server/wwdc.db`
- override: `WWDC_MCP_DB=/absolute/path/to/wwdc.db`

## 4. Register with Claude Code / Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json` (or your Claude Code MCP config):

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/wwdc-mcp-server/dist/index.js"],
      "env": {
        "OLLAMA_BASE": "http://127.0.0.1:11434",
        "OLLAMA_EMBED_MODEL": "nomic-embed-text",
        "WWDC_MCP_DB": "/ABSOLUTE/PATH/TO/wwdc-mcp-server/data/wwdc.db"
      }
    }
  }
}
```

Restart the client. The 45 canonical tools (`wwdc_search`, `wwdc_get_session`,
`wwdc_session_deep_link`, `apple_doc_lookup`, `swift_app_audit`,
`apple_swift_book_get`, `appstore_guidelines_search`, `wwdc_security_manifest`, …) should appear in the tool call trace.

## 5. Wire into the 6 target skills

Paste the block from `docs/SKILL-WIRING.md` near the top of each of:

- `/Users/<you>/.claude/skills/ios-swift-builder/SKILL.md`
- `/Users/<you>/.claude/skills/swift-ios-dev/SKILL.md`
- `/Users/<you>/.claude/skills/veritap-ios-builder/SKILL.md`
- `/Users/<you>/.claude/skills/game-center-ios/SKILL.md`
- `/Users/<you>/.claude/skills/screenshot-notes-ios/SKILL.md`
- `/Users/<you>/.claude/skills/deep-linking/SKILL.md`

(Sandbox builds don't have write access to `.claude/skills/`, which is why this step is manual.)

## 6. Scheduled re-ingest

```cron
# Daily sweep
0 6 * * * cd /abs/path/to/wwdc-mcp-server && npm run ingest:all

# WWDC week burst — uncomment during the conference
# */30 * * * 1-5 cd /abs/path/to/wwdc-mcp-server && npm run ingest:wwdc
```

## 7. Verify

```bash
npm run build                   # TypeScript strict typecheck
npm test                        # smoke + parse + MCP e2e + package smoke
npm audit --audit-level=high
npx tsx tests/wwdc-live.ts      # live pipeline: discover + ingest 3 sessions
```

## 8. MCP response controls

Current public release supports richer `wwdc_search` filters for session year ranges, topics,
platforms, transcript presence, judgment metadata, and output detail level. `wwdc_get_session`
supports transcript character caps plus toggles for chapters, sample code, related docs, and
session judgment metadata. Use these source tools with app specs, OSS benchmark patterns,
and patent/opportunity radar outputs for broader app-improvement workflows.
For Swift/SwiftUI/macOS/iOS app work, call `swift_app_audit` before code changes to gather
WWDC, HIG, tutorial, and Swift Evolution context plus validation steps.

## 9. Evaluation harness

10 stable QA pairs live at `tests/evaluation.xml` for use with the MCP builder evaluation
harness. Example questions: which tool returns session chapter deep-links, which Ollama
model is used, default CHARACTER_LIMIT, default port.
