# Historical documentation audit — June 2026

Updated for public-repo consistency: 2026-10-07

This file preserves the useful conclusions from an earlier June 2026 research pass. It is **not** the current source of truth and intentionally omits private notebook identifiers and internal-only project references.

For current public behavior, use the repository code, tests, package metadata, README, and `docs/SOURCE-OF-TRUTH.md`.

## What the June audit established

The earlier audit helped drive several capabilities that are now part of the public server:

- a broad Apple-source retrieval layer rather than WWDC title search alone
- `swift_app_audit` as the repo-level Apple-platform audit entry point
- conservative search judgment and caveats
- source-coverage metadata
- prompt-injection/content-safety handling for retrieved text
- a canonical trust surface through `wwdc_security_manifest`
- parser regression coverage for Apple source-layout changes
- stronger public documentation and package metadata

At the time of that audit, the project was still expanding from a much smaller tool surface. The current executable contract is **45 read-only MCP tools**, verified by the stdio and Streamable HTTP E2E tests.

## Current public facts that supersede the historical snapshot

As of 2026-10-07:

- default WWDC coverage includes 2020 through 2026
- runtime requirement is Node.js `>=22.14.0`
- stdio remains the default transport
- authenticated stateless Streamable HTTP is also supported
- `swift_app_audit` is one of the 45 canonical tools
- `wwdc_security_manifest` is the trust/attestation entry point
- the npm package is not yet published, so source checkout is the supported install path
- official MCP Registry publication should follow npm publication and package verification
- public repository code/tests, not an external notebook, determine release truth

## Durable recommendations from the earlier audit

These principles still apply:

1. **Lead with the developer outcome.** Explain why Apple developers need source-grounded context before listing every tool.
2. **Make retrieval evidence explicit.** Separate Apple/Swift source material from model inference.
3. **Treat retrieved text as untrusted.** Content can inform an answer but must never become an instruction channel.
4. **Prefer conservative confidence.** A broad platform hit is not the same as strong framework/API evidence.
5. **Test source drift.** When Apple changes public HTML or DocC shapes, add a regression fixture before declaring the parser fixed.
6. **Keep tool-count and transport claims executable.** Protocol tests should fail when public docs and implementation diverge.
7. **Optimize onboarding.** Public MCP adoption benefits from a clear quick start, client examples, concrete prompts, and truthful distribution status.

## Current verification

The current deterministic release gates are:

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
```

For source-layout changes, also run the smallest applicable live ingest check.

See:

- `README.md`
- `docs/SOURCE-OF-TRUTH.md`
- `docs/RELEASING.md`
- `SECURITY.md`
