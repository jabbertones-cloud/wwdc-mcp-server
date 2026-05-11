# How to wire wwdc-mcp-server into Scott's skills

This server is designed to be called from these skills:

- `ios-swift-builder`
- `swift-ios-dev`
- `veritap-ios-builder`
- `game-center-ios`
- `screenshot-notes-ios`
- `deep-linking`

Add the following block near the top of each SKILL.md (or in their "References" section).

```markdown
## Authoritative Apple source (wwdc-mcp-server)

Before answering any WWDC-adjacent question, consult the `wwdc-mcp-server` MCP tools:

1. **Search** — call `wwdc_search` with the topic. Use `kinds: ["session","tutorial","hig","evolution"]` for a hybrid sweep.
2. **Detail** — for a promising hit, call `wwdc_get_session`, `apple_tutorial_get`, or `apple_swift_evolution_get`.
3. **Deep-link** — when citing a specific chapter or timestamp, use `wwdc_session_deep_link` so the user can jump straight to it.
4. **Sample code** — `wwdc_list_session_code` exposes every zip/repo Apple linked from a session page.
5. **Freshness** — call `wwdc_ingest_status` if the question is about a recent WWDC that may not yet be indexed.

All tool names use `wwdc_` or `apple_` prefixes, so they never collide with other MCP servers.
```

## MCP config for Claude Code / Claude Desktop

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/ABS/PATH/TO/wwdc-mcp-server/dist/index.js"],
      "env": {
        "OLLAMA_BASE": "http://127.0.0.1:11434",
        "OLLAMA_EMBED_MODEL": "nomic-embed-text",
        "WWDC_MCP_DB": "/ABS/PATH/TO/wwdc-mcp-server/data/wwdc.db"
      }
    }
  }
}
```

## First-run checklist

1. `cd wwdc-mcp-server && npm install && npm run build`
2. `ollama pull nomic-embed-text` (or skip for FTS-only mode)
3. `npm run ingest:all` (takes ~15–30 min on first run)
4. Point your MCP client at `dist/index.js` and restart Claude Code / Desktop.
5. Test: ask a SwiftUI question; the tools should appear in the call trace.

## Fit with existing skills

- **ios-swift-builder** references WWDC liquid-glass and Foundation Models sessions — point these lookups at `wwdc_search`.
- **game-center-ios** cites GameKit + push notification topics; use `apple_doc_lookup` for live framework references.
- **deep-linking** tracks Universal Links, App Clips, NFC-tap flows — search `kinds=["session","hig"]` for canonical coverage.
- **veritap-ios-builder** (NFC) routes to the same Universal Links sessions; `wwdc_session_deep_link` lets you cite a chapter.
- **screenshot-notes-ios** asks about Vision framework + CoreML; `wwdc_search` + `apple_tutorial_get` covers it.
- **swift-ios-dev** handles signing/provisioning — call `apple_doc_lookup` with `documentation/xcode/...` paths.
