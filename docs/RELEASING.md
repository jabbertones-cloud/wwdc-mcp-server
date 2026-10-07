# Releasing WWDC MCP

WWDC MCP has three independent public distribution layers:

1. Hosted Streamable HTTP MCP.
2. Official MCP Registry discovery through server.json.
3. Optional package and plugin directories such as OpenAI and Cursor.

The official MCP Registry supports remote-only servers, so npm publication is optional and is not a prerequisite for Registry publication.

## 1. Preflight

From a clean checkout:

~~~bash
npm ci
npm run build
npm test
npm audit --audit-level=high
npm pack --dry-run
~~~

Verify the public endpoint:

~~~bash
curl -fsS https://fabric-origin.smatdesigns.com/wwdc/healthz
~~~

Expected properties include ok true, protocol streamable-http, authMode public-readonly, readOnly true, and a release SHA matching the intended deploy.

## 2. Validate Registry metadata

Install the official mcp-publisher and run:

~~~bash
mcp-publisher validate server.json
~~~

Registry identity:

~~~text
io.github.jabbertones-cloud/wwdc
~~~

Canonical remote:

~~~text
https://fabric-origin.smatdesigns.com/wwdc/mcp
~~~

## 3. Publish to the official MCP Registry

The repository workflow .github/workflows/publish-mcp.yml uses GitHub Actions OIDC, so it needs no long-lived Registry secret.

Create and push the release tag after the deployed endpoint is healthy:

~~~bash
git tag -a vX.Y.Z -m "WWDC MCP vX.Y.Z"
git push origin vX.Y.Z
~~~

The workflow validates the live public endpoint, validates server.json, authenticates with mcp-publisher login github-oidc, and publishes the Registry entry.

## 4. Frontier client and plugin distribution

plugin.json, mcp.json, the skills/wwdc-research onboarding skill, privacy and terms documents, and icon form the portable Agent Plugin package for ChatGPT, Codex, and Cursor. See docs/CLIENTS.md and docs/SUBMISSIONS.md.

Vendor directory approval is separate from MCP Registry publication. Never claim a marketplace listing is approved until that vendor confirms it.

## 5. Optional npm release

The npm package name remains wwdc-mcp-server. If npm distribution is desired later:

~~~bash
npm publish --access public
~~~

Then verify the package from an unauthenticated environment before adding an npx quickstart or a packages entry to server.json.

## 6. Release proof

A hosted release is complete when these agree:

- package.json version
- runtime SERVER_VERSION
- hosted /healthz version and exact Git SHA
- server.json version
- Git tag
- official MCP Registry version
- README and client installation instructions

A local green build alone is not release proof.
