# Compatibility

WWDC MCP follows the Model Context Protocol and supports two transports.

| Surface | Status | Proof |
| --- | --- | --- |
| stdio | tested | deterministic SDK E2E + external MCP Inspector |
| Streamable HTTP, bearer | tested | HTTP E2E |
| Streamable HTTP, public read-only | tested | HTTP E2E |
| Node 22 | CI tested | GitHub Actions |
| Node 24 | CI tested | GitHub Actions |

## Client guidance

The README includes configuration examples for Codex, Claude Desktop/Code, VS Code, Cursor, Windsurf, Zed, and generic MCP clients.

Those examples mean **documented configuration**, not a claim that every client/version is continuously integration-tested. Client products change independently of this repository.

Protocol compatibility is independently checked with the official MCP Inspector CLI in CI. Client-specific regressions should include the client name/version and whether Inspector can still see all 45 tools.

## Capability expectations

A compatible client should be able to:

1. initialize the server;
2. list all 45 tools;
3. call tools with structured arguments;
4. display source-grounded text/JSON responses.

The server does not require a client to support mutation, browser automation, Apple login, or privileged local actions.

## Tested contract vs ecosystem examples

Keep these separate:

- **tested:** protocol/transport/runtime behavior proven in this repository;
- **documented:** client configuration we maintain;
- **ecosystem-compatible:** other MCP clients that implement the required protocol/transport.

Do not turn an unverified client logo/name into a compatibility guarantee.
