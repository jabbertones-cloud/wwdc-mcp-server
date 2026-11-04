# AppDev Atlas public plugin submission source

This directory mirrors the existing public WWDC plugin, rather than the historical `chatgpt-direct-plugin` private package.

- Original 0.2.5 uploaded-package candidate: `wwdc-openai-plugin-0.2.5-root-optimized.zip`.
- Original archive SHA-256: `b723b89af3a6bfbb536a8fcf6c8b5e7735b618eecf0134ba7416b5aaf45252c6`.
- Current OpenAI plugin ID: `plugin_asdk_app_6ad90350c9fc8191abcbd6ccd10052c9`.
- Previous dashboard release: **0.2.5, Changes required, not published** as verified November 4, 2026.
- Candidate source version in this directory: **0.2.6, not uploaded, not submitted**. Public-facing name and package name are AppDev Atlas; existing URL and tools remain backward-compatible.
- Create or revise the same rejected public plugin from the updated ZIP. Do not create a duplicate plugin if the dashboard can revise the rejected submission.
- The previous 0.2.5 ZIP had a reviewer case asking `apple_api_availability` for `NavigationStack`, but direct lookup returned no rows on October 29. The 0.2.6 candidate uses a tested App Store Review guideline lookup instead.
- No changes to the WWDC MCP runtime, auth, endpoint, tool descriptions, annotations, or corpus.
- `plugin.json` and `.agent-plugin/plugin.json` deliberately match exactly.
- `README.txt` and `SUBMISSION.json` in the previously uploaded archive were not fully synchronized; new canonical source omits stale submission-state metadata from the upload ZIP.

Run `node scripts/validate-wwdc-openai-plugin.mjs` and `node scripts/build-wwdc-openai-plugin.mjs` before uploading.

## Trademark review repair, November 4, 2026

- Rejection text: plugin name and/or description may imply affiliation with OpenAI, ChatGPT, or a third party or use potentially trademarked terms.
- Public display name and package name: AppDev Atlas, independently published by SMAT Designs.
- Subtitle and all 38 localized descriptions reworked; WWDC remains only as a factual name of the sourced conference sessions.
- New icon has no third-party words or logo. New demo uses AppDev Atlas, not WWDC for ChatGPT.
- Existing MCP endpoint, 45 read-only tools and identifiers are preserved; website, privacy, terms and support pages use AppDev Atlas and explicit third-party independence disclaimer.
- New ZIP must be rebuilt after any artwork changes; verify by SHA-256 and live check before dashboard upload.
