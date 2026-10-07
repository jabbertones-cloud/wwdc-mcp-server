---
name: wwdc-setup
description: Initialize or refresh the local WWDC MCP Apple-source index.
---

# Set up WWDC MCP

1. Call `wwdc_ingest_status` first. Do not download work that is already current.
2. If the index is empty, initialize the high-value release corpus with the commands below. Run them one at a time and report failures instead of hiding them.

```bash
PKG="https://github.com/jabbertones-cloud/wwdc-mcp-server/releases/download/v0.2.0/wwdc-mcp-server-0.2.0.tgz"

npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source wwdc --year 2026
npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source docs
npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source hig
npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source evolution
npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source appstore
```

3. For broader historical research, add the full core corpus only when useful:

```bash
npm exec --yes --package="$PKG" -- wwdc-mcp-ingest --source all
```

4. Re-call `wwdc_ingest_status` and verify the expected sources and WWDC year coverage before research.
5. For normal Apple repo work, start with `swift_app_audit` after setup.
