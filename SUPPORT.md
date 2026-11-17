# AppDev Atlas support

AppDev Atlas is an independent Apple-platform research service by SMAT Designs, not affiliated with or endorsed by Apple or OpenAI. The public product support page is https://wwdcmcp.smatdesigns.com/support.

## Current release status and supported scope

**Reviewed:** November 17, 2026. The product's public name is **AppDev Atlas**; `wwdc` technical identifiers remain for compatibility.

- **Published ChatGPT plugin:** v0.2.6 at https://chatgpt.com/plugins/plugin_asdk_app_6ad90350c9fc8191abcbd6ccd10052c9
- **Proposed next plugin packaging:** v0.2.7 source metadata and two task-specific skills are merged but do not prove an OpenAI Platform upload, approval or rollout.
- **Read-only Apple research:** 45 tools covering Apple public documentation and WWDC research. No private App Store Connect account, Apple submission permissions or GitHub issue write access are granted by these tools.
- **Dated verification and troubleshooting:** https://github.com/jabbertones-cloud/wwdc-support/blob/main/docs/release-status-2026-11-17.md

A source commit or an installed MCP package version is not evidence that a user's ChatGPT listing, hosted server, or indexed Apple corpus is current. Verify the tool response and original Apple documentation for the specific question.

## Start with the failure layer

- **Install or connection problem:** include your MCP client, Node/npm version, AppDev Atlas release/version (legacy MCP package version is fine), and whether you use stdio or HTTP.
- **Wrong or missing Apple result:** include the source URL when known, the tool/query, and `wwdc_ingest_status`.
- **Apple site changed:** use the **Bug report** issue template and include the public source URL.
- **Security issue:** contact support@smatdesigns.com privately via the support page. Do not open a public issue.
- **App Store Connect account/release action:** that is outside this read-only knowledge server; use the appropriate App Store Connect tooling/AiSCent workflow.

Before opening an issue, try the 60-second connection check in the README and search existing issues.

Never post API keys, bearer tokens, signing credentials, private source code, customer data, or Apple account information.

## Public GitHub Issues and agent support

See [the AppDev Atlas support README](https://github.com/jabbertones-cloud/wwdc-support#readme) for FAQs, troubleshooting, and secure reporting guidance.

- **Public bug reports and feature requests:** https://github.com/jabbertones-cloud/wwdc-support/issues
- **Start a sanitized report:** https://github.com/jabbertones-cloud/wwdc-support/issues/new/choose
- **Agent protocol:** https://github.com/jabbertones-cloud/wwdc-support/blob/main/AGENT-GITHUB-ISSUES.md

Agents may use GitHub's **official MCP server** with the user's own GitHub authorization to search/read public issues, create requested bug reports, and comment on existing tickets. These operations are separate from this product's MCP login. No owner GitHub credential is embedded or delegated through the product. Before any public write, search for duplicates, remove secrets and customer data, and obtain the user's requested authorization. If the user's GitHub connection is unavailable, offer a redacted draft and the issue form link. Never claim that an issue or response was posted without a successful GitHub result.
