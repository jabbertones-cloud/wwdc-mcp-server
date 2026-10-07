# Releasing WWDC MCP

WWDC MCP has three public distribution layers:

1. Hosted Streamable HTTP MCP.
2. Official MCP Registry discovery.
3. Optional npm and vendor or frontier directories.

The hosted endpoint and remote Registry entry do not depend on npm.

## Current release identity

As of 2026-10-07:

- package and runtime version: 0.2.0
- MCP Registry name: io.github.jabbertones-cloud/wwdc
- public remote: https://fabric-origin.smatdesigns.com/wwdc/mcp
- Agent Plugin: plugin.json plus mcp.json
- icon: assets/wwdc-mcp-icon.svg
- npm package name is reserved but not yet published

## 1. Preflight

~~~bash
npm ci
npm run build
npm test
npm audit --audit-level=high
npm pack --dry-run
mcp-publisher validate server.json
~~~

Confirm package, runtime, lockfile, Registry metadata, and public endpoint all identify the same release.

## 2. Deploy the public remote

The public origin must run with:

~~~bash
WWDC_MCP_PUBLIC_READONLY=1
WWDC_MCP_PUBLIC_RATE_LIMIT_PER_MINUTE=120
WWDC_MCP_PATH_PREFIX=/wwdc
~~~

Verify:

~~~bash
curl -fsS https://fabric-origin.smatdesigns.com/wwdc/healthz
~~~

The response must report ok true, version 0.2.0, authMode public-readonly, readOnly true, and the intended release SHA.

## 3. Publish the official MCP Registry entry

server.json is remote-first and points at the public Streamable HTTP endpoint. The official MCP Registry supports remotes independently of npm packages.

.github/workflows/publish.yml:

- builds and tests the exact release
- validates server.json before any publication
- optionally publishes npm if NPM_TOKEN exists
- verifies the live public endpoint is directory-ready
- authenticates to the official MCP Registry with GitHub OIDC
- publishes the Registry metadata

Tag the exact deployed commit:

~~~bash
git tag -a v0.2.0 -m "WWDC MCP v0.2.0"
git push origin v0.2.0
~~~

The workflow can also be dispatched manually.

## 4. Optional npm distribution

If NPM_TOKEN is configured, the same release workflow publishes the npm package. If it is absent, npm publication is skipped and the remote Registry release continues.

Do not advertise npx -y wwdc-mcp-server@latest until the public npm artifact is independently verified.

After the first npm release, prefer npm trusted publishing with GitHub Actions OIDC instead of a long-lived write token. Once configured, keep id-token write permission and remove the NPM_TOKEN dependency. A later WWDC MCP release can add the live npm package back into the Registry packages array alongside remotes.

## 5. Frontier directories

plugin.json, mcp.json, skills/wwdc-research/SKILL.md, the icon, privacy policy, terms, support link, and review test cases are the portable package for ChatGPT, Codex, and Cursor. Claude and Grok can use the same remote endpoint directly.

See docs/CLIENTS.md and docs/SUBMISSIONS.md.

Vendor review is separate from source readiness. Never claim a vendor marketplace listing is approved until that vendor confirms it.

## 6. Release proof

A release is complete when the intended layers agree on:

- GitHub commit and tag
- runtime version
- public health version and exact SHA
- server.json version
- official MCP Registry version
- Agent Plugin version
- README and client setup

A local green build alone is not release proof.
