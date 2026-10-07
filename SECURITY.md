# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
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

The MCP route **fails closed** with `503 auth_not_configured` unless one of these is configured:

- `WWDC_MCP_BEARER_TOKEN`
- `WWDC_MCP_BEARER_TOKEN_SHA256`

Requests without a valid bearer token return `401`.

For a deliberately public directory endpoint, set WWDC_MCP_PUBLIC_READONLY=1. In that mode, bearer authentication is not required, every exposed MCP tool remains read-only, and the HTTP entry point applies a per-client request limit controlled by WWDC_MCP_PUBLIC_RATE_LIMIT_PER_MINUTE (default 120 per minute). Public mode must be an explicit operator choice; without public mode or bearer credentials the MCP route still fails closed.

The built-in HTTP server does not terminate TLS. If you expose it beyond localhost, use a TLS reverse proxy, keep the bearer token secret, and restrict network access.

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

Ollama, when enabled, defaults to localhost.

## Deployment checklist

Before exposing HTTP remotely:

1. Choose one access mode: private bearer authentication, or explicit public-readonly mode for directory distribution.
2. Bind to localhost unless a reverse proxy requires otherwise.
3. Terminate TLS at the reverse proxy.
4. Do not log bearer secrets; for public mode, configure rate limits and reverse-proxy abuse controls.
5. Keep `/healthz` free of secrets.
6. Run `npm test` and `npm audit --audit-level=high`.
7. Verify the deployed commit identity through the health response when `WWDC_MCP_DEPLOYED_SHA` is configured.
