# Releasing WWDC MCP

This project has two public distribution layers:

1. npm package distribution.
2. MCP Registry metadata/discovery.

Publish in that order. The Registry points at artifacts; it does not replace them.

## Current status

As of 2026-10-07:

- GitHub source install works.
- `package.json` reserves npm package name `wwdc-mcp-server`.
- `package.json` carries `mcpName: io.github.jabbertones-cloud/wwdc`.
- `server.json` is checked in and version-locked to the npm artifact.
- `.github/workflows/publish.yml` publishes npm first, then authenticates to the official MCP Registry with GitHub OIDC and publishes the validated manifest.
- The npm package is not yet published. Before the first tag, configure npm Trusted Publishing for this GitHub repository and the `publish.yml` workflow; no long-lived npm token is required.

## 1. Preflight

From a clean checkout:

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
npm pack --dry-run
```

Confirm:

- package version matches the server version reported by `src/server.ts`
- the package tarball includes `dist/index.js`, README, changelog, and license
- no tests, local databases, secrets, or private workspace files are packed
- README install claims match what is actually published

## 2. Publish npm

Authenticate with npm using your normal secure maintainer workflow, then:

```bash
npm publish --access public
```

After publishing, verify the artifact exists from an unauthenticated environment before adding any `npx` quickstart to the README.

The expected future command is:

```bash
npx -y wwdc-mcp-server@latest
```

Do not document it as supported until that check passes.

## 3. Prepare MCP Registry metadata

The official MCP Registry requires the npm package to contain an `mcpName` matching the server name in `server.json`.

This repository already reserves:

```text
io.github.jabbertones-cloud/wwdc
```

`server.json` is committed and should be updated with every release. Its package entry references:

- registry type: npm
- identifier: `wwdc-mcp-server`
- the exact published package version
- transport: stdio

Do not add a remote Registry URL unless a stable, intentionally public Streamable HTTP endpoint exists. Local/self-hosted HTTP support by itself is not a public hosted service.

## 4. Validate before publishing

```bash
mcp-publisher validate
```

Tagging `vX.Y.Z` triggers `.github/workflows/publish.yml`, which verifies version parity, validates `server.json` against the official Registry, publishes npm, authenticates to the MCP Registry with GitHub OIDC, and then publishes the Registry entry. The first npm release currently requires the repository's `NPM_TOKEN` secret.

Do not bypass namespace/package verification.

### After the first npm release: prefer npm trusted publishing

npm's current guidance recommends OIDC trusted publishing for GitHub Actions instead of long-lived write tokens. Once the package exists on npm, configure this repository's `publish.yml` as the trusted publisher, allow direct `npm publish`, upgrade the workflow's npm CLI to a trusted-publishing-capable version, remove the `NPM_TOKEN` dependency, and keep `id-token: write`. Public GitHub Actions trusted publishing also produces npm provenance automatically.

## 5. Update public install docs

Only after npm and Registry verification succeed:

- add the `npx -y wwdc-mcp-server@latest` quickstart
- add npm + Registry badges/links
- add client configs that use `npx` where appropriate
- update `docs/SOURCE-OF-TRUTH.md`
- update `CHANGELOG.md`
- tag the exact release commit

## 6. Release proof

A release is complete only when all intended layers agree:

- GitHub source/tag
- `package.json` version
- runtime `SERVER_VERSION`
- npm artifact version
- MCP Registry version/namespace
- README install instructions

A successful local build does not prove the npm or Registry release is live. Verify each layer independently.

## Trusted Publishing preflight

Before creating the first public tag:

1. Create or claim the `wwdc-mcp-server` package on npm under the intended maintainer account if npm requires an initial package setup.
2. In npm package settings, add a **GitHub Actions** trusted publisher for repository `jabbertones-cloud/wwdc-mcp-server` and workflow `publish.yml`.
3. Keep GitHub Actions permission `id-token: write`; do not add a long-lived npm automation token.
4. Confirm the exact release candidate is green in CI, then create the matching `vX.Y.Z` tag.
5. Verify npm publication before MCP Registry publication. The workflow enforces that order.
