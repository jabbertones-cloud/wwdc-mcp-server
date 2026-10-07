# wwdc-mcp-server deployment guide

## 1. Requirements

- Node.js `>=22.14.0`
- npm
- Optional: Ollama for semantic reranking

As of 2026-10-07 the npm package is not published, so deploy from a GitHub checkout.

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm ci
npm run build
npm run health:native
```

Optional semantic search:

```bash
ollama pull nomic-embed-text
```

Without Ollama, FTS5 keyword search still works.

## 2. Ingest

Core corpus:

```bash
npm run ingest:all
```

WWDC26-only refresh:

```bash
npm run ingest:wwdc -- --year 2026
```

Multiple years:

```bash
npm run ingest:wwdc -- --year 2025 --year 2026
```

Default data locations:

- macOS: `~/Library/Application Support/wwdc-mcp-server/wwdc.db`
- Linux: `~/.local/share/wwdc-mcp-server/wwdc.db`
- override: `WWDC_MCP_DB=/absolute/path/to/wwdc.db`
- data-root override: `WWDC_MCP_DATA_DIR=/absolute/path/to/data`

`ingest:all` covers the core WWDC/tutorial/pathway/HIG/Swift Evolution/Apple docs/Swift Book/App Store sources. Optional release-note, forum, summary, graph, and deprecation enrichment is invoked through `npm run ingest -- --source ...`; see the README.

## 3. Default stdio deployment

Point an MCP client at:

```text
node /ABSOLUTE/PATH/TO/wwdc-mcp-server/dist/index.js
```

Example:

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

The built server should expose exactly 45 read-only tools.

## 4. Remote Streamable HTTP

Generate a secret and start the HTTP entry point:

```bash
export WWDC_MCP_BEARER_TOKEN="$(openssl rand -hex 32)"
export WWDC_MCP_HTTP_HOST=127.0.0.1
export WWDC_MCP_HTTP_PORT=8789
export WWDC_MCP_DEPLOYED_SHA="$(git rev-parse HEAD)"
npm run start:http
```

Routes:

- `GET /healthz`
- `POST /mcp`

The MCP route returns `503 auth_not_configured` if neither `WWDC_MCP_BEARER_TOKEN` nor `WWDC_MCP_BEARER_TOKEN_SHA256` is set.

For a deliberately public read-only directory endpoint:

~~~bash
export WWDC_MCP_PUBLIC_READONLY=1
export WWDC_MCP_PUBLIC_RATE_LIMIT_PER_MINUTE=120
export WWDC_MCP_HTTP_HOST=127.0.0.1
export WWDC_MCP_PATH_PREFIX=/wwdc
npm run start:http
~~~

Public-readonly mode intentionally omits bearer authentication, keeps the existing read-only tool surface, and enforces a per-client rate limit. Keep TLS termination and reverse-proxy abuse controls in front of the origin.

The server is stateless at the MCP transport layer: each HTTP request receives a fresh MCP server/transport instance while sharing the local SQLite database.

### Shared reverse proxy path

```bash
export WWDC_MCP_PATH_PREFIX=/wwdc
```

Routes become:

- `GET /wwdc/healthz`
- `POST /wwdc/mcp`

Forward the prefix unchanged.

### Internet exposure

The Node HTTP server does not provide TLS. If remote access is required, terminate TLS at a reverse proxy and keep the origin private where possible. Treat bearer tokens as secrets.

## 5. Scheduled ingest

Regular daily refresh:

```cron
0 6 * * * cd /abs/path/to/wwdc-mcp-server && npm run ingest:all
```

During WWDC week, a tighter WWDC-only refresh can pick up newly published sessions:

```cron
*/30 * * * 1-5 cd /abs/path/to/wwdc-mcp-server && npm run ingest:wwdc -- --year 2026
```

Adjust the year when future conferences arrive.

## 6. Verification

Before deployment:

```bash
npm run build
npm test
npm audit --audit-level=high
```

The deterministic suite covers:

- SQLite/FTS smoke checks
- ingest parsers
- security manifest and content-safety behavior
- stdio MCP protocol
- search regressions
- npm package shape
- authenticated Streamable HTTP MCP protocol

For source-layout changes, also run the smallest applicable live ingest test.

## 7. Health and release identity

When `WWDC_MCP_DEPLOYED_SHA` or `GIT_SHA` is configured, `/healthz` returns the deployment SHA alongside service name, version, protocol, auth state, path prefix, and endpoint paths.

Use that value to prove which commit is live rather than assuming a process restart deployed the intended build.
