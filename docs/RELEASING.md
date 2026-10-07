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
- The npm package is not yet published.
- Therefore the project is not ready to publish a valid official Registry entry yet.

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

After npm is live, install the official `mcp-publisher` CLI and generate metadata:

```bash
mcp-publisher init
```

The package entry should reference:

- registry type: npm
- identifier: `wwdc-mcp-server`
- the exact published package version
- transport: stdio

Do not add a remote Registry URL unless a stable, intentionally public Streamable HTTP endpoint exists. Local/self-hosted HTTP support by itself is not a public hosted service.

## 4. Validate before publishing

```bash
mcp-publisher validate
```

Then authenticate and publish according to the official Registry instructions.

Do not bypass namespace/package verification.

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
