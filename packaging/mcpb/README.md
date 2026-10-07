# WWDC MCP MCPB packaging

This directory is the maintained source for the portable MCP Bundle wrapper used by the official MCP Registry.

The bundle itself is intentionally tiny. It does **not** mirror Apple content and it does **not** duplicate the full WWDC MCP dependency tree. Instead, the Node launcher starts the immutable v0.2.1 GitHub release package through npm and preserves stdio.

Requirements:

- Node.js >=22.14.0
- npm available on PATH
- network access on first package install
- the normal WWDC MCP local-index requirements documented in the repository README

Build:

```bash
npm exec --yes --package=@anthropic-ai/mcpb -- mcpb validate packaging/mcpb/manifest.json
npm exec --yes --package=@anthropic-ai/mcpb -- mcpb pack packaging/mcpb WWDC-MCP-v0.2.1.mcpb
```

After packing, compute SHA-256, upload the asset to GitHub release v0.2.1, update `server.json`, validate with `mcp-publisher`, and publish.
