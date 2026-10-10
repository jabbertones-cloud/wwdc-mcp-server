# Architecture and trust model

WWDC MCP is intentionally a **knowledge server**, not an Apple-account automation server.

```text
Apple / Swift public sources
          |
          v
 bounded ingest + parsers
          |
          v
 SQLite / FTS5 local index ---- optional local ONNX reranking
          |
          v
 45 read-only MCP tools
      |             |
    stdio     Streamable HTTP
                    |
              TLS / edge controls
              when internet-facing
```

## Why this shape

### Local index instead of live-searching everything

WWDC transcripts and related Apple sources benefit from deterministic, low-latency full-text retrieval. A local SQLite/FTS5 index also lets the server expose ingest freshness rather than pretending every result is current.

Some tools intentionally use live public sources when that is the stronger source of truth, such as `apple_doc_lookup`.

### Retrieval before generation

Core search does not require a hosted LLM. The server retrieves evidence and returns source URLs, snippets, metadata, caveats, and next-tool suggestions. The consuming agent does the final reasoning.

Local semantic reranking is optional. If its model is unavailable, retrieval falls back to FTS instead of failing the whole server.

### Read-only by design

The 45-tool contract retrieves and analyzes Apple/Swift knowledge. It cannot submit builds, modify App Store Connect, edit a repository, or run commands from retrieved pages.

That boundary limits blast radius and makes the server safe to expose in explicit public-read-only mode behind appropriate edge controls.

### Retrieved content is untrusted

Apple pages, forum content, transcripts, and other indexed text are **data**, not an instruction channel. The security manifest and content-safety tripwire exist so agents can preserve that distinction.

A consuming agent should never grant retrieved text higher privilege than the user's request or its own execution policy.

## Freshness model

There are three different notions of “current”:

1. **Indexed sources** — freshness is visible through `wwdc_ingest_status`.
2. **Live public lookups** — depend on upstream availability and parser compatibility.
3. **Server/release identity** — package/runtime/Registry metadata are tested for parity; HTTP deployments can expose the deployed SHA through `/healthz`.

Do not collapse those into a single “up to date” claim.

## Failure philosophy

The server prefers:

- FTS fallback over semantic-search outage;
- explicit low-confidence/caveat metadata over invented certainty;
- parser errors over silently fabricated fields;
- fail-closed HTTP configuration over accidental exposure;
- bounded responses over invalid/truncated JSON;
- source-linked evidence over uncited summaries.

## Product boundary

WWDC MCP answers **“What does current Apple/Swift evidence say?”**

A coding agent can use that evidence to propose code. Separate tools control whether code is edited.

AiSCent is a separate product for App Store Connect execution and release workflows. WWDC MCP should not absorb account mutation merely to become a larger MCP.
