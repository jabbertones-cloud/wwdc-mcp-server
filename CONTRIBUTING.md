# Contributing to WWDC MCP

Contributions that improve Apple-source coverage, retrieval quality, parser resilience, MCP interoperability, security, and public documentation are welcome.

## Requirements

- Node.js `>=22.14.0`
- npm
- Local semantic embeddings use Hugging Face Transformers/ONNX; deterministic tests set `WWDC_SKIP_EMBEDDINGS=1` and do not download/run the model

## Setup

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm ci
npm run build
npm test
```

## Tests

Useful focused commands:

```bash
npm run smoke
npm run test:parse
npm run test:security
npm run test:e2e
npm run test:http
npm run test:search-regression
npm run test:package
npm run test:inspector
```

`npm test` runs the full deterministic suite. `npm run test:live` touches live public sources and should be used only when a change depends on current source behavior.

## AI-assisted work

AI-assisted contributions are welcome, but generated output is not evidence. Read [docs/AI_CONTRIBUTIONS.md](docs/AI_CONTRIBUTIONS.md) before submitting agent-authored or agent-assisted changes.

## Pull requests

- Keep changes focused and explain the user-facing behavior they alter.
- Run `npm run build` and `npm test` before submitting.
- If you change dependencies, run `npm audit --audit-level=high`.
- If you change the MCP tool surface, update the security manifest, stdio E2E test, HTTP E2E test, README, and changelog together.
- If you change a public installation, transport, version, year-range, or source claim, update all public docs that repeat it.
- Never add secrets, private notebooks, private repository paths, credentials, or production tokens to fixtures or examples.

## Adding or changing MCP tools

The current tool registrations live in `src/tools/index.ts` and are installed through `registerAllTools(...)`.

A tool change should include:

1. A clear name and description.
2. A bounded Zod input schema.
3. A read-only handler unless the project explicitly changes its security contract.
4. Response-size handling consistent with the existing format helpers.
5. Deterministic protocol coverage.
6. Manifest and documentation updates.

The public server currently exposes 45 read-only tools. Treat that count as a tested contract, not a hand-maintained marketing number.

## Ingest sources

Ingest entry points live under `src/ingest/` and are orchestrated by `src/ingest/run.ts`.

When updating an Apple parser:

- keep concurrency bounded
- preserve a stable, honest User-Agent
- tolerate source layout drift without silently inventing data
- add a fixture/regression test for the HTML or JSON shape that changed
- distinguish confirmed source behavior from inference in maintainer docs

## Security

Read `SECURITY.md` before changing network transports, authentication, retrieved-content handling, or trust metadata.

Report vulnerabilities through GitHub private security advisories rather than public issues.
