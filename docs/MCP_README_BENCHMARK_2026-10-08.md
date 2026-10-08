# WWDC MCP: high-adoption MCP README benchmark

Research snapshot: 2026-10-08. Star counts change. Comparison is of repository documentation patterns, **not** evidence that stars were caused by any particular README feature.

| Donor | Useful pattern | WWDC MCP application |
| --- | --- | --- |
| [Context7](https://github.com/upstash/context7) | Show failure without source grounding, success with source grounding; install CTA and version guidance | Add a reproducible, honestly labeled before/after example using real tool output and a precise Apple citation; avoid fabricated hallucination screenshots |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Clear first prompt, tool reference, troubleshooting, design principles | Surface a verified first-run transcript and a task-first troubleshooting map |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Explain when MCP vs CLI/skills is appropriate | Clarify WWDC MCP's role as retrieval/evidence, not a compiler, code editor, App Store Connect operator or guarantee of Apple approval |
| [GitHub MCP Server](https://github.com/github/github-mcp-server) | Concrete use cases, local/remote choices, auth/security guidance, toolsets | Keep install modes honest; add task-based tool recipes, avoid listing all 45 tools above the first successful answer |
| [MCP reference servers](https://github.com/modelcontextprotocol/servers) | Prominent reference-vs-production and security boundary notes, registry navigation | Preserve Apple non-affiliation and trust limits; link Registry entry and verified release |

## Priority improvements

1. **Demonstrate the result:** short screen capture with actual `wwdc_ingest_status` and `swift_app_audit` output, links to original Apple sources, elapsed time, and a visible caveat when the index is incomplete. No fabricated before/after.
2. **One clear install path per audience:** Registry/MCPB when client-supported; local clone/build/ingest for privacy; remote only after independently proven live. Add a real first-question success check to each.
3. **Task-first navigation:** 'Modernize SwiftUI', 'check an API replacement', 'find WWDC transcript timestamp', 'check review guidance'. Each should specify tool chain, input, expected evidence, and limitation.
4. **Agent quickstart:** small copyable project rule, AGENTS.md, Cursor/Copilot links; avoid implying these instructions are automatically loaded by every chat client.
5. **Trust and coverage:** show source freshness, ingestion completeness, read-only boundary, heuristic injection checks, and difference between indexed evidence and live Apple lookups.
6. **Troubleshooting:** empty local index, incompatible Node, model download unavailable, no matching transcript, client configuration failure, remote authentication. Add diagnostics before asking users to file issues.
7. **Localization:** translate the high-value getting-started and troubleshooting pages with reviewed technical terminology, not bulk machine translations.
8. **Discovery:** keep one canonical project README, useful metadata, Registry links, meaningful releases, a concise social preview and legitimate directory submissions; no star-bait or artificial backlinks.

## Acceptance gates

- New-user test: from a clean machine, obtain one real cited Apple-source answer; measure steps and failures.
- Power-user test: demonstrate three distinct tools and a known missing-source/weak-evidence path.
- Agent test: run one prompt on at least two actual MCP clients and verify they cite retrieved source rather than inventing it.
- Distribution test: independently verify each advertised install command, asset, version, and URL.
- Safety test: no claim that heuristic scanning prevents all prompt injection; no Apple affiliation claim.
- SEO/discovery test: working README links, Registry metadata, release links, and no contradictory tool counts or architectures.

Do not claim this benchmark caused stars or conversion; measure adoption after implementing and testing the changes.
