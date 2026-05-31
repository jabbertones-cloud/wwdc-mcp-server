# Contributing

## Getting started

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm install
npm run build
npm run smoke
```

## Running tests

```bash
npm test          # smoke + parse + e2e (no Ollama required)
npm run test:live # live ingest — requires Ollama running locally
```

## Pull requests

- Keep PRs focused. One feature or fix per PR.
- Run `npm run build` and `npm test` before submitting.
- Update the README if you add or change MCP tools.

## Adding MCP tools

Tools live in `src/tools/`. Each tool must:
1. Export a `ToolDefinition` with name, description, and input schema.
2. Have a corresponding handler in `src/index.ts`.
3. Be covered by at least a smoke test in `tests/smoke.ts`.

## Adding ingest sources

Ingest sources live in `src/ingest/`. Each source exports a `run()` function
that populates the SQLite database via `src/db/`.

## Reporting bugs

Open a GitHub issue with steps to reproduce, expected behavior, and actual behavior.
Include your Node version (`node --version`) and whether Ollama is running.
