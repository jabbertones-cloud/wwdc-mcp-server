# Troubleshooting

Start by identifying which layer is failing: **install → server start → index → MCP connection → retrieval → live source → remote HTTP**.

## Server does not start

Check:

```bash
node --version
npm --version
npm run build
npm run health:native
```

WWDC MCP requires Node.js 22.14 or newer. `better-sqlite3` is a native dependency; if Node changed after installation, remove/reinstall dependencies with the supported Node version.

## Agent connects but results are empty

Check:

```text
Call wwdc_ingest_status and summarize which sources are populated and stale.
```

A connected MCP server is not the same thing as a populated knowledge index. Build the relevant corpus with the ingest commands in the README.

## Search works but semantic reranking does not

Core retrieval falls back to FTS. The local Transformers/ONNX model can download on first use.

To deliberately disable semantic reranking:

```bash
WWDC_SKIP_EMBEDDINGS=1 npm run start
```

If FTS results are good, the MCP is still usable.

## A current Apple page returns no/incorrect result

This may be **source drift**, not a general MCP failure.

1. capture the Apple/Swift source URL;
2. capture the exact tool/query;
3. run the relevant live-source test when appropriate;
4. open the **Apple source drift** issue template.

Do not “fix” upstream layout drift by inventing missing metadata.

## MCP client cannot see the server

First prove the server independently:

```bash
npm run build
npm run test:inspector
```

If Inspector sees 45 tools, the server/protocol path is healthy and the problem is likely client configuration.

Then verify that your client points at the correct absolute path and restart/reload the client after changing MCP configuration.

## Remote HTTP returns 503

That is expected when neither remote mode was explicitly selected.

Private:

```bash
WWDC_MCP_BEARER_TOKEN='<secret>' npm run start:http
```

Public read-only:

```bash
WWDC_MCP_PUBLIC_READ_ONLY=1 npm run start:http
```

Do not work around `503 auth_not_configured` by weakening the default.

## Remote HTTP returns 401

Private mode is active and the request is missing the correct bearer token. Do not put bearer tokens in issue reports, shell history, screenshots, or committed client config.

## Agent chose the wrong WWDC tool

Do not force users to memorize 45 tools. Tell the agent:

```text
Use WWDC MCP. Start with swift_app_audit for repo-level Apple work, then follow its suggested focused tools and strongest source evidence.
```

See [Agent Guide](AGENT_GUIDE.md) for task routing.

## Still stuck

Read [SUPPORT.md](../SUPPORT.md) and use the issue template for the failing layer. Security vulnerabilities belong in a private GitHub security advisory.
