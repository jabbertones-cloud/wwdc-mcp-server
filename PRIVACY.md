# WWDC MCP Privacy Policy

Last updated: October 7, 2026

WWDC MCP is a read-only developer research service operated by SMAT Designs. It provides access to public Apple and Swift developer information through the Model Context Protocol.

## Data handled

WWDC MCP does not require a user account and does not intentionally collect names, email addresses, payment information, or Apple account credentials.

When a client connects to the hosted MCP endpoint, normal network metadata such as IP address, request time, user agent, and transport headers may be processed by the hosting and network infrastructure for security, reliability, abuse prevention, and operational diagnostics. Research queries and tool arguments are processed to answer the request. The service is not designed to build advertising profiles or sell personal data.

## Sources and third parties

The service retrieves or indexes public developer information from Apple, Swift.org, Swift Evolution, and other public first-party developer sources identified in the project documentation. The public endpoint is delivered through third-party infrastructure providers, including Cloudflare, which may process network metadata under their own terms and privacy practices.

## Retention and security

Application-level request content is not intentionally retained as a user history by WWDC MCP. Operational logs may be retained for a limited period as needed to diagnose failures, enforce rate limits, and protect the service. Secrets and private Apple account data should never be sent to this public research server.

## Contact

For privacy questions or requests, use the repository issue tracker:
https://github.com/jabbertones-cloud/wwdc-mcp-server/issues
