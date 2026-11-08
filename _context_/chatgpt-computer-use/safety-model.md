---
title: OpenAI computer-use safety model overview
created: 2026-11-01T09:15:00Z
modified: 2026-11-01T09:38:00Z
level: L1
version: 1.1.0
description: Matrix of every documented safety and human-in-the-loop mechanism for OpenAI computer use, marking whether the model, OpenAI services or the application enforces it
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/agent-approvals-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/sandboxing/auto-review (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/controls (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
  - source: cdn.openai.com/operator_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf (fetched 2026-11-01)
---

# OpenAI computer-use safety model

Enforcer key: **M** model behaviour (training, instructions); **S** OpenAI service (monitors, review
models, API checks); **A** application or runtime code; **O** operating system; **P** admin policy.

| Mechanism | Enforcer | Where documented | Detail |
|---|---|---|---|
| Isolated browser or VM, allow-listed sites and actions | A (API); S (Work Cloud VMs) | [tcu], [wcs] | [isolation](safety-isolation-and-approvals.md) |
| Screen content treated as untrusted, never as permission | M, A | [tcu], [br] | [confirmation](safety-confirmation-policy.md) |
| 2026 GPT-6 Astra behaviour monitor that can pause tasks | S | [aas] | below |
| 2025 prompt-injection monitors that pause execution (Operator: 99% recall, 90% precision on 77 attempts) | S | [op-card] §4.6, [agent-card] §3.1.2.2 | [Operator](system-card-operator.md), [agent](system-card-chatgpt-agent.md) |
| Auto-review agent for escalation requests | S, A | [ar] | [isolation](safety-isolation-and-approvals.md) |
| dots action review: proceed, ask or hand off | S | [dots-ctl] | [confirmation](safety-confirmation-policy.md) |
| Agents API per-origin approval; no per-action confirmation | S, A | [agt] | [hosted](api-agents-hosted.md) |
| API `pending_safety_checks` needing acknowledgement | S, A | [ref], [drv] | [computer tool](api-computer-tool.md) |
| Confirmation at the point of risk by action class | M, A | [int], [br] | [confirmation](safety-confirmation-policy.md) |
| Hand-off and take over | A | [int], [br], [dots] | [confirmation](safety-confirmation-policy.md) |
| 2025 watch mode: pause when the user goes inactive or away in sensitive contexts (email, banking) | S, A | [op-card] §4.5, [agent-card] §3.1.2.4 | [Operator](system-card-operator.md), [agent](system-card-chatgpt-agent.md) |
| Per-app and per-site approvals | A, P | [cu], [ext], [mc] | [isolation](safety-isolation-and-approvals.md) |
| OS permissions (Screen Recording, Accessibility) | O | [cu] | [desktop](product-desktop-computer-use.md) |
| Locked-use safeguards | A, O | [cu] | [desktop](product-desktop-computer-use.md) |
| Phishing review before sign-in; secure credential form | S | [br] | [browsers](product-browsers.md) |
| Hard exclusions (terminals, ChatGPT itself, admin prompts) | A | [cu] | [desktop](product-desktop-computer-use.md) |
| Step, time, cost bounds; cancellation | A | [tcu], [drv] | [api](api-contract.md) |
| Outcome verification against real state | A | [tcu], [sample] | [api](api-contract.md) |
| Data retention of screenshots and audit records | S, P | [cu], [wcs] | [data](safety-data-and-audit.md) |

## Monitoring

GPT-6 Astra in Codex and ChatGPT Work monitors "potentially unsafe model behavior" asynchronously and can pause
a task after the triggering activity; it does not replace sandboxing, permissions or review [aas]. Users review
the findings before resuming; in Codex CLI and mobile, or under zero data retention, Modified Abuse Monitoring or
non-US residency, the task ends [aas]. Auto-review approval does not prevent a later pause [aas], and disabling
browser auto-review does not disable monitoring [mc]. The 2026 docs name neither an injection monitor nor watch
mode; they tell users to stay present for account, security, privacy, network, payment or credential settings
[cu].

## Division of labour

OpenAI puts controls in the application and environment, not only in model instructions; a model's request
to act is not user permission [tcu], [int]. **Inference:** for a self-built system
every row marked A is our responsibility; rows marked M are partly inherited from the model, and rows marked
S exist only in OpenAI-hosted products, though Auto-review's reviewer policy is open source [ar].

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[ref]: https://developers.openai.com/api/reference/resources/responses/methods/create
[cu]: https://learn.chatgpt.com/docs/computer-use
[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[dots]: https://learn.chatgpt.com/docs/dots/computers-and-apps
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[aas]: https://learn.chatgpt.com/docs/agent-approvals-security
[ar]: https://learn.chatgpt.com/docs/sandboxing/auto-review
[dots-ctl]: https://learn.chatgpt.com/docs/dots/controls
[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[sample]: https://github.com/openai/openai-cua-sample-app
[op-card]: https://cdn.openai.com/operator_system_card.pdf
[agent-card]: https://cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf
