# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| current `main` / 0.2.1 | Yes |
| 0.1.x | Yes |

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability.

Use a GitHub private security advisory:

`https://github.com/jabbertones-cloud/wwdc-mcp-server/security/advisories/new`

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation.

## Security model

### Local stdio is the default

The normal server entry point uses MCP stdio. It does not open a network listener.

### Remote HTTP is opt-in

`npm run start:http` starts the same 45-tool server over stateless Streamable HTTP.

Defaults:

- host: `127.0.0.1`
- port: `8789`
- health: `GET /healthz`
- MCP: `POST /mcp`
- maximum request body: 1 MiB

The MCP route **fails closed** with `503 auth_not_configured` unless one of these deployment modes is explicitly configured:

- private bearer mode: `WWDC_MCP_BEARER_TOKEN` or `WWDC_MCP_BEARER_TOKEN_SHA256`
- public read-only mode: `WWDC_MCP_PUBLIC_READ_ONLY=1`

In private mode, requests without a valid bearer token return `401`. Public mode changes authentication only; it exposes the same tested 45 read-only tools and does not add mutation capabilities.

The built-in HTTP server does not terminate TLS. If you expose it beyond localhost, use a TLS edge/reverse proxy. Keep bearer tokens secret in private mode. For public mode, add edge rate limiting, abuse monitoring, and deployment-SHA verification.

Tool calls on the HTTP transport are additionally rate limited in-process: a per-IP token bucket charges only `tools/call` requests (1 unit per call, 5 for `swift_app_audit`), with defaults of 120 units burst and 120 units/minute refill, tunable via `WWDC_MCP_TOOL_CALL_RATE_CAPACITY` / `WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE`. Throttled calls receive an opaque `429` with `Retry-After` and no bucket details. Buckets key on the socket address unless `WWDC_MCP_TRUST_PROXY_HEADERS=1` is set (only behind a trusted ingress that sets `cf-connecting-ip`, such as the Cloudflare Worker deployment).

`swift_app_audit` output is coarsened: the summary reports a `readiness_band` (high / medium / low) and the coarse `readiness` verdict — it no longer returns a `confidence` field, and audit session hits no longer embed per-hit judgment/confidence objects.

The same coarsening covers every other judgment surface (W3): `wwdc_search` per-hit and overall judgments report a `relevance_band`, `wwdc_get_session` reports a `coverage_band`, and `apple_swift_pattern_find` reports an `evidence_band` — no tool returns a `confidence` field. Raw ranking scores (BM25 / vector) are internal ordering signals only: the JSON serialization boundary strips any `score` or `confidence` key at any depth, so no tool payload carries a raw numeric score.

`WWDC_MCP_PATH_PREFIX` can mount the routes under a prefix such as `/wwdc`.

### Retrieved content is untrusted

The project ingests public web content. Retrieved text is evidence for an agent, not an instruction channel.

The tool surface includes:

- `content_safety` metadata on search responses
- `wwdc_security_manifest` for the canonical tool list, manifest hash, read-only posture, and prompt-injection handling
- security tests that exercise malicious-content detection

Do not add behavior that executes shell commands, follows instructions embedded in retrieved pages, or turns source text into privileged actions.

### Network behavior

Ingest can fetch public Apple Developer pages, Swift Evolution content, Swift documentation, and optional forum/release-note sources. `apple_doc_lookup` is a live public Apple documentation lookup.

No Apple Developer account credentials are required or stored.

Semantic reranking runs locally through `@huggingface/transformers` using `nomic-ai/nomic-embed-text-v1.5`. Model files may be downloaded from Hugging Face on first use and are cached locally; set `WWDC_SKIP_EMBEDDINGS=1` to disable that path.

`session-summaries` is an optional, explicit external-API lane. When `ANTHROPIC_API_KEY` is configured, it sends bounded WWDC session titles, topics, descriptions, and transcript excerpts to Anthropic for generated summaries. Do not enable that source if those inputs must remain local.

## Deployment checklist

Before exposing HTTP remotely:

1. Choose one explicit mode: private bearer auth or public read-only.
2. For private mode, generate a strong bearer token and do not log it.
3. Bind to localhost unless the edge/container topology requires otherwise.
4. Terminate TLS at the edge/reverse proxy.
5. For public mode, enable rate limiting and abuse monitoring at the edge.
6. Keep `/healthz` free of secrets.
7. Run `npm test` and `npm audit --audit-level=high`.
8. Verify the deployed commit identity through the health response when `WWDC_MCP_DEPLOYED_SHA` is configured.
9. Verify `tools/list` still returns exactly 45 read-only tools.
