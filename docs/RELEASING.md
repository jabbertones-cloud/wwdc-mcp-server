# Releasing WWDC MCP

WWDC MCP has three public distribution layers:

1. **GitHub Release** — source tag plus immutable release assets.
2. **Official MCP Registry** — primary discovery/install metadata, backed by a GitHub-hosted MCPB bundle.
3. **npm** — optional secondary distribution after the package is bootstrapped under an authenticated npm owner.

The Registry does **not** depend on npm.

## Current status

As of 2026-10-07:

- Registry namespace: `io.github.jabbertones-cloud/wwdc`
- Registry package type: `mcpb`
- GitHub release assets include:
  - `wwdc-mcp-server-X.Y.Z.tgz`
  - `WWDC-MCP-vX.Y.Z.mcpb`
- `.github/workflows/registry.yml` validates and publishes `server.json` with GitHub OIDC.
- `.github/workflows/publish.yml` verifies tag releases and publishes the Registry entry; npm publishing runs only when repository variable `ENABLE_NPM_PUBLISH=true`.
- npm is not required for Registry or Cursor distribution.

Registry versions are immutable. Never replace a published Registry version with different package bytes or a different SHA. If a published bundle is defective, issue a patch version and deprecate the bad version.

## 1. Preflight

From a clean checkout:

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
```

For changes that affect Apple source parsing, also run:

```bash
npm run test:live
```

Confirm:

- `package.json`, `package-lock.json`, runtime `SERVER_VERSION`, User-Agent, MCPB manifest, Cursor plugin version, and `server.json` all agree
- the 45-tool stdio and HTTP contracts pass
- no secrets, local databases, or private workspace files are packed
- README install claims match what is actually published

## 2. Build release assets

### npm-format GitHub release tarball

```bash
npm run build
npm pack
```

The tarball must expose both:

- `wwdc-mcp-server`
- `wwdc-mcp-ingest`

### MCPB

```bash
npm exec --yes --package=@anthropic-ai/mcpb -- \
  mcpb validate packaging/mcpb/manifest.json

npm exec --yes --package=@anthropic-ai/mcpb -- \
  mcpb pack packaging/mcpb WWDC-MCP-vX.Y.Z.mcpb

shasum -a 256 WWDC-MCP-vX.Y.Z.mcpb
```

Put the exact SHA-256 into `server.json`.

Do not rebuild the MCPB after locking its SHA unless you also update `server.json` to the newly built bytes.

## 3. Create the GitHub release

Tag the exact green release commit:

```bash
git tag -a vX.Y.Z -m "WWDC MCP vX.Y.Z"
git push origin vX.Y.Z
```

Create the GitHub Release and attach both immutable artifacts.

The MCPB launcher and Cursor config pin the matching GitHub release tarball. Because npm 12 blocks arbitrary remote tarballs by default, the launcher/config must use:

```text
--allow-remote=all
```

with the pinned GitHub release URL.

## 4. Runtime-test the published MCPB

Download the **published** MCPB release asset and initialize it over stdio. Do not treat schema validation alone as runtime proof.

At minimum verify:

- launcher starts
- MCP initialize returns the expected server name/version
- the package URL resolves
- npm 11 and npm 12 can install the pinned remote tarball
- no unexpected browser/account credentials are required

## 5. Publish the official MCP Registry entry

Validate:

```bash
mcp-publisher validate server.json
```

Then authenticate and publish:

```bash
mcp-publisher login github
mcp-publisher publish server.json
```

CI normally uses `github-oidc` instead.

Verify independently through the Registry REST API:

```text
GET https://registry.modelcontextprotocol.io/v0.1/servers/io.github.jabbertones-cloud%2Fwwdc/versions/X.Y.Z
```

Confirm:

- status = active
- isLatest = true
- package URL matches the GitHub Release MCPB asset
- `fileSha256` matches the uploaded bytes

## 6. Deprecate a bad Registry version

Registry metadata is immutable except lifecycle status. If a published version is defective:

```bash
mcp-publisher status \
  --status deprecated \
  --message "Superseded by vX.Y.Z: <reason>" \
  io.github.jabbertones-cloud/wwdc OLD.VERSION
```

Never replace an old release asset while leaving the Registry SHA unchanged.

## 7. Optional npm publication

npm remains optional.

The first npm publish requires an authenticated npm owner because trusted publishing cannot create a brand-new package. After that bootstrap:

1. configure npm Trusted Publishing for `jabbertones-cloud/wwdc-mcp-server`
2. pin the GitHub Actions workflow
3. keep `id-token: write`
4. avoid long-lived npm automation tokens
5. enable repository variable `ENABLE_NPM_PUBLISH=true` only after trusted publishing is working

Do not document `npx wwdc-mcp-server@latest` as supported until anonymous npm lookup/install succeeds.

## 8. Update public docs

After release verification:

- update README distribution status and versioned install examples
- update `CHANGELOG.md`
- update `docs/SOURCE-OF-TRUTH.md`
- update `docs/HANDOFF.md`
- update GitHub Release notes
- update Cursor plugin/config version
- update Apple Notes handoff

A successful build is evidence only for the tested layer. A release is complete only when the GitHub assets, Registry record, runtime handshake, docs, and intended client install path all agree.
