# Siri/App Intents runtime verification probe

## Purpose
Fresh runtime proof for the current WWDC MCP before using it as the Apple evidence engine for Siri/App Intents and TheSandlot modernization.

## Exact source
- Baseline `main`: `6bbc9133a22b020f907498079ab8f76b1ba38eb9`
- Probe head: `3ba6a2c24cafef99563bc5555b391f49bfdc3eb2`
- PR: #11
- Runtime code changed: **no**; probe adds this verification record only.

## Fresh CI result — 2026-09-27
GitHub Actions run `36325444520` completed successfully on both supported Node runtimes:

### Node 22.x — PASS
- dependency install
- TypeScript build
- native `better-sqlite3` open/query proof
- smoke suite
- ingest parser suite
- MCP protocol E2E / real stdio handshake
- package smoke
- `npm audit --audit-level=high`

### Node 24.x — PASS
- dependency install
- TypeScript build
- native `better-sqlite3` open/query proof
- smoke suite
- ingest parser suite
- MCP protocol E2E / real stdio handshake
- package smoke
- `npm audit --audit-level=high`

## What this proves
The current WWDC MCP codebase builds and executes its MCP protocol path successfully on clean hosted runners with its native SQLite dependency on both Node 22 and Node 24.

## What this does not prove yet
- TheSandlot compatibility with current App Intents APIs.
- macOS/Xcode/Siri runtime behavior.
- real Siri phrase -> AppIntent -> domain request execution.
- current Apple-device authorization/confirmation UX.

Those remain the next Apple lane once a Mac execution path is available.
