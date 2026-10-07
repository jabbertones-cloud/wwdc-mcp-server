# WWDC MCP distribution and submission matrix

Last updated: 2026-10-07

| Surface | Package or endpoint | Submission path |
| --- | --- | --- |
| Official MCP Registry | server.json to public Streamable HTTP remote | GitHub Actions OIDC via .github/workflows/publish-mcp.yml |
| ChatGPT | Agent Plugin plugin.json plus mcp.json | OpenAI plugin dashboard and public directory review |
| Codex | Same Agent Plugin plus direct codex mcp add | Shared OpenAI plugin directory plus direct MCP config |
| Claude | Public remote HTTP MCP | Claude custom connector and directory submission where eligible |
| Cursor | Agent Plugin plus public remote HTTP MCP | Cursor Marketplace publisher with this public repository |
| Grok | Public remote HTTP MCP | Custom MCP connector or Grok Build CLI |

## Public-review assets already in the repository

- public HTTPS Streamable HTTP endpoint
- square scalable icon
- privacy policy
- terms of service
- support URL
- Agent Plugin manifest
- MCP configuration
- OpenAI review test cases
- official MCP Registry metadata
- automated Registry publisher workflow
- client setup instructions

## Human or account-bound final gates

Some vendor directories require the publisher to sign in, confirm publisher identity, accept current marketplace terms, or provide a reviewer demo recording. Those actions are separate from source-code readiness. Do not represent a directory listing as approved until the vendor confirms it.
