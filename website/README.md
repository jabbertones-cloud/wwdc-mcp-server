# AppDev Atlas public site

Public name: AppDev Atlas. Technical MCP server identifiers and the existing
https://wwdc-mcp.smatdesigns.com/mcp URL are intentionally unchanged to
preserve existing agent connections and source links.

Site origin: the existing independent Cloudflare Pages project wwdcmcp,
production deployment c0e3f83c-287f-427b-9e0b-ea704a83e09c.
This directory preserves its four HTML routes and original demo asset,
retrieved on 2026-11-04, then revises customer-facing name, affiliation,
platform requirements, and contact links.

Before release: validate plugin packaging; inspect 512px and 256px icons,
check demo for outdated branding, then run exact-branch preview.
Deploy only with the account authorized for the wwdcmcp Pages project:

    npx wrangler@4 pages deploy website --project-name wwdcmcp --branch main

Acceptance: homepage, privacy, terms, support, demo.mp4 all return HTTP 200;
visible name is AppDev Atlas; no independent claims imply affiliation.
Do not deploy the MCP service as part of this branding change.

Rebuild demo: /usr/bin/python3 scripts/build-appdev-atlas-demo.py from repo root, then run ffmpeg concat pipeline in the runbook. Do not commit generated .demo-frames.
