---
title: ChatGPT and OpenAI computer use study
created: 2026-11-01T09:19:00Z
modified: 2026-11-02T09:00:19Z
version: 1.2.0
description: Entry point to a sourced study of how OpenAI computer use works across products and APIs, for building our own system
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: cdn.openai.com/operator_system_card.pdf and the ChatGPT agent system card (fetched 2026-11-01)
  - source: 'claim-by-claim verification of every article by cu-researcher, 2026-11-01'
---

# ChatGPT and OpenAI computer use

How OpenAI computer use works: products, API contract, safety model, Anthropic comparison, and requirements
for our own system. Start with the four overviews. Every article was re-checked claim by claim against its
sources on 2026-11-01; measured model limits are in [model capabilities](../model-capabilities/INDEX.md).

| Article | Answers |
|---|---|
| [product-surfaces](product-surfaces.md) | Overview of every surface |
| [product-history](product-history.md) | Operator, ChatGPT agent, Atlas |
| [system-card-operator](system-card-operator.md) | Operator card: controls, rates, benchmarks |
| [system-card-chatgpt-agent](system-card-chatgpt-agent.md) | Agent card: watch, takeover, rates |
| [product-human-control](product-human-control.md) | Watch, take over, notify, stop |
| [product-desktop-computer-use](product-desktop-computer-use.md) | Desktop plugin, locked use |
| [product-browsers](product-browsers.md) | Built-in, cloud, extension browsers |
| [product-work-and-dots](product-work-and-dots.md) | Cloud and local execution |
| [product-capture-features](product-capture-features.md) | Record & Replay, Appshots |
| [api-contract](api-contract.md) | Overview: paths, loop invariants |
| [api-computer-tool](api-computer-tool.md) | Item and field shapes |
| [api-action-handling](api-action-handling.md) | Keys, buttons, scaling |
| [api-code-execution](api-code-execution.md) | `exec_js`, `exec_py` |
| [api-sdk-computer-toolset](api-sdk-computer-toolset.md) | Computer driver contract |
| [api-sdk-browser-toolset](api-sdk-browser-toolset.md) | Browser driver contract |
| [api-agents-hosted](api-agents-hosted.md) | Hosted Agents API browser |
| [api-migration](api-migration.md) | Preview to GA |
| [safety-model](safety-model.md) | Overview: mechanism matrix |
| [safety-confirmation-policy](safety-confirmation-policy.md) | Consent levels |
| [safety-isolation-and-approvals](safety-isolation-and-approvals.md) | Isolation, approval scopes |
| [safety-data-and-audit](safety-data-and-audit.md) | Retention, credentials, audit |
| [comparison](comparison.md) | Overview: OpenAI versus Anthropic |
| [comparison-anthropic-tool](comparison-anthropic-tool.md) | Claude tool versions |
| [comparison-anthropic-wire-shapes](comparison-anthropic-wire-shapes.md) | Claude toolset JSON |
| [comparison-environments](comparison-environments.md) | Environments, Mac fit |
| [implications-environment-and-perception](implications-environment-and-perception.md) | R1 to R13 |
| [implications-actions-and-loop](implications-actions-and-loop.md) | R14 to R25, R54, R55, R60 |
| [implications-safety-and-control](implications-safety-and-control.md) | R26 to R42, R56, R57, R61, R62 |
| [implications-observability-and-evaluation](implications-observability-and-evaluation.md) | R43 to R53, R58, R59 |
| [implications-desktop-scope-and-perception](implications-desktop-scope-and-perception.md) | R63 to R78, desktop (D-024) |
| [implications-desktop-action-and-safety](implications-desktop-action-and-safety.md) | R79 to R97, desktop (D-024) |

## Primary sources, accessed 2026-11-01

ChatGPT docs: [computer-use], [browser], [chrome-extension], [permission-modes], [sandboxing],
[dots-computers], [work-local-security], [work-cloud-security], [cloud-local-access], [record-and-replay],
[appshots], [managed-configuration]. System cards: [operator-card], [agent-card]. API docs: [tools-computer-use], [integration], [sdk-drivers],
[agents-api], [responses-reference], [cua-sample-app], [learn-llms], [dev-llms]. Anthropic:
[claude-computer-use], [claude-quickstarts]. Partners: [stagehand], [browser-use], [e2b]. Press:
[gigazine-operator], [gigazine-agent], [enterpriseaiworld], [deepnoodle-operator], [deepnoodle-atlas], [trustvector].

openai.com and help.openai.com answer HTTP 403; their pages are cited as Internet Archive captures. Every
docs page above serves full markdown when `.md` is appended to its URL.

[computer-use]: https://learn.chatgpt.com/docs/computer-use
[operator-card]: https://cdn.openai.com/operator_system_card.pdf
[agent-card]: https://cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf
[browser]: https://learn.chatgpt.com/docs/browser
[chrome-extension]: https://learn.chatgpt.com/docs/chrome-extension
[permission-modes]: https://learn.chatgpt.com/docs/permission-modes
[sandboxing]: https://learn.chatgpt.com/docs/sandboxing
[dots-computers]: https://learn.chatgpt.com/docs/dots/computers-and-apps
[work-local-security]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[work-cloud-security]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[cloud-local-access]: https://learn.chatgpt.com/docs/enterprise/cloud-local-access
[record-and-replay]: https://learn.chatgpt.com/docs/extend/record-and-replay
[appshots]: https://learn.chatgpt.com/docs/appshots
[managed-configuration]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[tools-computer-use]: https://developers.openai.com/api/docs/guides/tools-computer-use
[integration]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[sdk-drivers]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[agents-api]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[learn-llms]: https://learn.chatgpt.com/llms.txt
[dev-llms]: https://developers.openai.com/llms.txt
[claude-computer-use]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[responses-reference]: https://developers.openai.com/api/reference/resources/responses/methods/create
[cua-sample-app]: https://github.com/openai/openai-cua-sample-app
[claude-quickstarts]: https://github.com/anthropics/claude-quickstarts/tree/main/computer-use-demo
[stagehand]: https://docs.stagehand.dev/v4/integrations/agent-frameworks/openai-cua-toolset-quickstart
[browser-use]: https://docs.browser-use.com/open-source/customize/integrations/openai
[e2b]: https://docs.e2b.dev/agents/openai-computer-use
[gigazine-operator]: https://gigazine.net/gsc_news/en/20250124-openai-operator-browser-automation
[gigazine-agent]: https://gigazine.net/gsc_news/en/20250718-chatgpt-agent-released
[enterpriseaiworld]: https://www.enterpriseaiworld.com/Articles/News/News/OpenAI-Unveils-ChatGPT-agent-Bringing-Agentic-Capabilities-to-the-Masses--170662.aspx
[deepnoodle-operator]: https://deepnoodle.ai/atlas/timeline/2025-01-23-openai-operator
[deepnoodle-atlas]: https://deepnoodle.ai/atlas/timeline/2025-10-21-chatgpt-atlas
[trustvector]: https://trustvector.dev/agents/chatgpt-agent
