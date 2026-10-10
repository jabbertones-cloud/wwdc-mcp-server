# Apple public-source ingestion notes

**Last verified against implementation:** 2026-10-07

This file documents the public Apple/Swift source shapes that `wwdc-mcp-server` currently relies on. It is a maintainer guide, not an Apple API contract. Apple can change public HTML and DocC JSON at any time, so parser behavior must be protected by fixtures and regression tests.

## Current source map

| Source | Current strategy | Notes |
| --- | --- | --- |
| WWDC year index | HTML | Enumerate links matching `/videos/play/wwdc{YYYY}/{ID}/` |
| WWDC session page | HTML | Parse metadata, transcript text, chapters, sample-code links, related docs |
| Apple tutorials | Public DocC JSON | Walk tutorial JSON beginning at known seeds |
| Apple Developer Documentation | Public DocC JSON | Crawl configured framework/module seeds |
| Human Interface Guidelines | Public Apple content | Ingest into local searchable HIG records |
| Swift Evolution | GitHub/raw GitHub | Proposal index + proposal bodies |
| Swift language reference | `docs.swift.org` DocC JSON | Ingest Swift Book chapters |
| App Store Review Guidelines | Public Apple page | Parse searchable guideline sections |
| Optional release notes/forums | Public web sources | Separate enrichment commands |

## WWDC coverage

The default source configuration currently includes:

```text
2020, 2021, 2022, 2023, 2024, 2025, 2026
```

The year list lives in `src/constants.ts`. Callers can override it by repeating `--year`:

```bash
npm run ingest:wwdc -- --year 2025 --year 2026
```

### Session discovery

The implementation fetches:

```text
https://developer.apple.com/videos/wwdc{YYYY}/
```

and extracts links matching the public session pattern:

```text
/videos/play/wwdc{YYYY}/{SESSION_ID}/
```

No private Apple API or account credential is required.

### Session page parsing

The parser in `src/ingest/wwdc.ts` currently extracts:

- title
- description
- topics / keyword fallback
- platforms when present
- speakers
- duration when present
- transcript text
- sample-code links
- related Apple documentation links
- video metadata when exposed
- chapter timestamps and deep links

### Transcripts

No separate transcript API is assumed.

For modern pages, the parser prefers individual:

```css
#transcript .sentence
.transcript .sentence
```

This avoids UI chrome that can live inside the larger transcript container.

If sentence spans are absent, the parser falls back to transcript containers such as `#transcript`, `.transcript`, or `.video-transcript`.

### Chapters

The parser supports several public page shapes:

1. Modern `a.jump-to-time[data-start-time]` anchors.
2. Legacy chapter anchors using `data-start` / `data-time`.
3. Supplemental list items whose text begins with `M:SS` or `H:MM:SS`.

Generated deep links preserve the canonical Apple session URL and add `?time=SECONDS`.

### Sample code and related docs

Session links ending in `.zip`, linking to `/sample-code/`, or pointing at GitHub are recorded as sample-code references. Apple links containing `/documentation/` are stored as related docs.

## Apple tutorials

The tutorial ingest uses public DocC JSON under patterns such as:

```text
https://developer.apple.com/tutorials/data/tutorials/{slug}.json
```

Do not assume a single fixed schema forever. Keep traversal bounded and preserve source errors.

## Apple Developer Documentation

The project also ingests public DocC JSON for configured Apple framework/module seeds. The current seed list lives in `src/constants.ts` and includes major Apple frameworks plus App Store Connect API documentation.

`apple_doc_lookup` is different from local indexed retrieval: it intentionally performs a live lookup against public Apple documentation.

## Swift Evolution

Proposal enumeration uses the public `apple/swift-evolution` repository and raw proposal content. The ingest layer should tolerate GitHub content responses that arrive either as decoded JSON or a JSON string.

## App Store Review Guidelines

The public guidelines page is parsed into searchable sections. Treat a retrieved section as source evidence, but do not imply that this community project predicts or guarantees App Review outcomes.

## Politeness and resilience

The HTTP client is intentionally conservative:

- bounded concurrency
- retries
- request timeout
- stable, honest User-Agent

Maintain these properties when adding new sources.

Do not add browser impersonation, credential scraping, hidden Apple endpoints, or account-authenticated crawling merely to increase coverage.

## Parser maintenance rule

When Apple changes a page shape:

1. Capture the smallest representative fixture that demonstrates the change.
2. Update the parser.
3. Add a regression test.
4. Run the deterministic suite.
5. Run the smallest live ingest that proves the public source still works.
6. Update this file only for behavior actually verified in code/source.

## Relevant implementation files

- `src/constants.ts`
- `src/ingest/run.ts`
- `src/ingest/wwdc.ts`
- `src/ingest/tutorials.ts`
- `src/ingest/docs.ts`
- `src/ingest/hig.ts`
- `src/ingest/evolution.ts`
- `src/ingest/swiftbook.ts`
- `src/ingest/appstore.ts`
- `tests/ingest-parse.ts`
- `tests/ingest-live.ts`
