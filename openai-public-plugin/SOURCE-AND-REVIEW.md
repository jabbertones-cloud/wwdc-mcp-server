# WWDC public plugin submission source

This directory mirrors the existing public WWDC plugin, rather than the historical `chatgpt-direct-plugin` private package.

- Original 0.2.5 uploaded-package candidate: `wwdc-openai-plugin-0.2.5-root-optimized.zip`.
- Original archive SHA-256: `b723b89af3a6bfbb536a8fcf6c8b5e7735b618eecf0134ba7416b5aaf45252c6`.
- Current OpenAI plugin ID: `plugin_asdk_app_6ad90350c9fc8191abcbd6ccd10052c9`.
- Current dashboard release: **0.2.5, In review, not published** as verified October 29, 2026.
- Candidate source version in this directory: **0.2.6, not uploaded, not submitted**.
- Keep existing review intact; update that same plugin only after OpenAI permits a new version.
- The previous 0.2.5 ZIP had a reviewer case asking `apple_api_availability` for `NavigationStack`, but direct lookup returned no rows on October 29. The 0.2.6 candidate uses a tested App Store Review guideline lookup instead.
- No changes to the WWDC MCP runtime, auth, endpoint, tool descriptions, annotations, or corpus.
- `plugin.json` and `.agent-plugin/plugin.json` deliberately match exactly.
- `README.txt` and `SUBMISSION.json` in the previously uploaded archive were not fully synchronized; new canonical source omits stale submission-state metadata from the upload ZIP.

Run `node scripts/validate-wwdc-openai-plugin.mjs` and `node scripts/build-wwdc-openai-plugin.mjs` before uploading.
