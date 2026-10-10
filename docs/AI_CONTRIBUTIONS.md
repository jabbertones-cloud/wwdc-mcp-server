# AI-assisted contributions

AI-assisted development is welcome. The standard of evidence is the same regardless of who or what wrote the patch.

If an agent materially contributed to a change:

- the human submitter remains responsible for the patch;
- verify claims against source code, tests, Apple/Swift primary sources, or reproducible upstream behavior;
- distinguish observed facts from inference in the PR;
- do not paste private repository content, credentials, Apple account data, or proprietary prompts into public issues/PRs;
- do not accept generated tests that merely reproduce generated implementation assumptions;
- run the repository gates rather than claiming an agent “reviewed” the change;
- for Apple source drift, include the upstream URL/shape that changed;
- for security-sensitive changes, inspect trust boundaries manually.

Generated prose is not evidence. A successful agent run is not proof that a parser, source claim, release artifact, or remote deployment is correct.

Repository agents should read [AGENTS.md](../AGENTS.md) and [Agent Guide](AGENT_GUIDE.md).
