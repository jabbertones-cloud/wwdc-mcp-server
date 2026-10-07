# Connect WWDC MCP to frontier clients

Public Streamable HTTP endpoint:

~~~text
https://fabric-origin.smatdesigns.com/wwdc/mcp
~~~

No API key is required for the public read-only endpoint. The hosted endpoint is rate-limited. For private or high-volume use, run the server locally or deploy your own instance.

## ChatGPT

WWDC MCP is packaged as an Agent Plugin for ChatGPT and Codex in this repository using plugin.json and mcp.json.

For direct custom MCP setup, create a custom MCP server/plugin in ChatGPT and use:

~~~text
https://fabric-origin.smatdesigns.com/wwdc/mcp
~~~

The server is remote HTTPS and uses Streamable HTTP, so no local tunnel is required.

## Claude Code

~~~bash
claude mcp add --transport http --scope user wwdc https://fabric-origin.smatdesigns.com/wwdc/mcp
claude mcp list
~~~

Then use /mcp in Claude Code to confirm the connection.

For Claude Desktop or web surfaces that support custom remote connectors, add the same public MCP URL.

## Cursor

User-level ~/.cursor/mcp.json:

~~~json
{
  "mcpServers": {
    "wwdc": {
      "url": "https://fabric-origin.smatdesigns.com/wwdc/mcp"
    }
  }
}
~~~

This repository is also an Agent Plugin and is structured for Cursor Marketplace review.

## Codex

CLI:

~~~bash
codex mcp add wwdc --url https://fabric-origin.smatdesigns.com/wwdc/mcp
codex mcp list
~~~

Or add to ~/.codex/config.toml:

~~~toml
[mcp_servers.wwdc]
url = "https://fabric-origin.smatdesigns.com/wwdc/mcp"
~~~

The root Agent Plugin package can also be installed by plugin-capable OpenAI surfaces.

## Grok

Grok Build CLI:

~~~bash
grok mcp add --transport http wwdc https://fabric-origin.smatdesigns.com/wwdc/mcp
grok mcp doctor wwdc
~~~

Or add to ~/.grok/config.toml:

~~~toml
[mcp_servers.wwdc]
url = "https://fabric-origin.smatdesigns.com/wwdc/mcp"
~~~

On grok.com, open Connectors, choose New Connector, then Custom, and use the public MCP URL above.

## Suggested agent instruction

~~~text
Use WWDC MCP for Apple platform questions before relying on remembered API, HIG, App Review, availability, deprecation, or WWDC details. Cite the first-party sources it returns.
~~~
