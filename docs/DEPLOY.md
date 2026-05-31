# wwdc-mcp-server — Deploy runbook

## 1. Fix the stuck `.git` (one-time, Scott's local shell)

The sandbox that built this repo left behind a `.git/index.lock` the sandbox can't unlink
(SMB/Syncthing-synced folders disallow deletes from inside the sandbox). From **Scott's real
terminal** (not the sandbox):

```bash
cd ~/path/to/claw-repos/wwdc-mcp-server
rm -rf .git
git init -b main
git add -A
git -c user.name="Scott" -c user.email="jamonwidit@plushtrap.com" \
  commit -m "Initial commit — wwdc-mcp-server v0.1.0"
git remote add origin https://github.com/jabbertones-cloud/wwdcmcp-.git
```

If the GitHub repo doesn't exist yet, create it (private or public, empty, no README) at
https://github.com/jabbertones-cloud/wwdcmcp- then:

```bash
git push -u origin main
```

## 2. First-time install

```bash
npm install
npm run build
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

DB lands at `data/wwdc.db`.

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

Restart the client. The 15 tools (`wwdc_search`, `wwdc_get_session`, `wwdc_session_deep_link`,
`apple_doc_lookup`, …) should appear in the tool call trace.

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
session judgment metadata.

## 9. Evaluation harness

10 stable QA pairs live at `tests/evaluation.xml` for use with the MCP builder evaluation
harness. Example questions: which tool returns session chapter deep-links, which Ollama
model is used, default CHARACTER_LIMIT, default port.
