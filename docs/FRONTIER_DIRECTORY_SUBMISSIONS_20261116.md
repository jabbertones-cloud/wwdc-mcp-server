# AppDev Atlas — frontier app directory submission kit (2026-11-16)

## Scope and truth

This repo is already public; the production MCP is `https://wwdc-mcp.smatdesigns.com/mcp` and the legal/help website is `https://wwdcmcp.smatdesigns.com/`. These distribution files do not alter the MCP server, user authorization, Apple APIs, or ChatGPT publication. A manifest is NOT directory approval, a host-certified tool execution, or a verified submission.

## Claude Directory

Use the existing public read-only remote MCP with the **single remote MCP** submission path at https://claude.ai/directory/manage/new. Alternatively submit this GitHub repository as a Claude plugin bundle; it includes `.claude-plugin/plugin.json` and `.mcp.json`.

- Listing: **AppDev Atlas**
- Publisher: **SMAT Designs**
- One-liner: **Check WWDC, Swift, Apple APIs, design guidance, and App Review with cited sources.**
- Description: Independent Apple-platform research and app audits for coding agents. Searches WWDC20–WWDC26 sessions, Swift documentation, interface guidance, API history, and App Store Review Guidelines; source-grounded answers. All 45 hosted MCP tools are read-only.
- MCP: https://wwdc-mcp.smatdesigns.com/mcp
- Privacy: https://wwdcmcp.smatdesigns.com/privacy
- Terms: https://wwdcmcp.smatdesigns.com/terms
- Support: https://wwdcmcp.smatdesigns.com/support
- Source: https://github.com/jabbertones-cloud/wwdc-mcp-server
- First test prompt: **Use AppDev Atlas to audit a SwiftUI NavigationStack app for iOS 18+; cite Apple sources and list the unverified assumptions.**
- Other test: **Find WWDC26 sessions relevant to StoreKit 2 subscriptions, with timestamps and Apple links.**
- Negative: **Attempt to submit my app to App Store Connect.** Expected: no write/submit tool, explain read-only boundary.

## Gemini CLI extension gallery

At repo root, `gemini-extension.json` points to the existing Streamable HTTP MCP and `GEMINI.md` supplies task-routing instructions. Verify with current Gemini CLI before tagging. Add repository topic `gemini-cli-extension` and tag a release only after an actual remote tool call and extension validation. Google's gallery crawls public repos with that topic and a root manifest. No new server is necessary.

## Grok Build marketplace

The `.mcp.json` remote-HTTP config follows the marketplace's official Vercel donor pattern. For a remote-source xAI marketplace PR, pin this public repository to its exact full commit SHA and update the generated plugin index per xAI's published scripts. Do not enable GitHub Actions. Submit the PR to https://github.com/xai-org/plugin-marketplace.

## Cursor marketplace

Existing `.cursor-plugin/plugin.json` and `mcp.json` remain unchanged; Cursor review is at https://cursor.com/marketplace/publish. Existing stdio installer is independent of this new hosted-MCP packaging. Test an actual first-user install, not just manifest parsing.

## Verified vs unverified

- Verified on 2026-11-16: hosted `/healthz`, Privacy, and Terms URLs returned HTTP 200 on the authorized SMAT M1 host.
- Not yet verified for these NEW packages: Gemini install/discovery/model call, Grok install/discovery/model call, new Claude reviewer/account eligibility, Cursor marketplace approval.
- Publication is external approval and must not be reported until the store shows a listing.
- Do not add GitHub Actions; use SMAT M1 local/independent checks only.

Sources: Anthropic [plugin portal](https://claude.com/resources/articles/build-plugins-for-claude), [Gemini gallery](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/releasing.md), [xAI marketplace](https://github.com/xai-org/plugin-marketplace), [Cursor plugins](https://cursor.com/docs/plugins).
