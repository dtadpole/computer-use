---
title: Requirements for our computer use, safety and human control
created: 2026-11-01T09:19:00Z
modified: 2026-11-01T09:56:55Z
level: L1
version: 1.2.0
description: Requirements R26 to R42 and R56 to R57, R61, R62 for consent, safety boundaries and watch, take over and stop controls of a self-built computer-use system
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/computers-and-apps (fetched 2026-11-01)
  - source: cdn.openai.com/operator_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf (fetched 2026-11-01)
  - source: ULTIMATE_GOAL.md (consent and safety row)
  - source: _context_/team-operations/decision-log.yaml (D-013)
  - source: _context_/model-capabilities/mcp-clients.md
---

# Requirements, safety and human control

Levels as defined in [environment and perception](implications-environment-and-perception.md).

## Safety and consent

| ID | Level | Requirement | From |
|---|---|---|---|
| R26 | MUST | Treat screen and tool content as untrusted; only the user's prompt grants intent | [confirmation](safety-confirmation-policy.md) |
| R27 | MUST | Enforce confirmation in the dispatcher per action, inside batches and scripts | [confirmation](safety-confirmation-policy.md) |
| R28 | MUST | Implement three levels: hand-off, confirm at action time, prompt pre-approval | [confirmation](safety-confirmation-policy.md) |
| R29 | MUST | Treat typing sensitive data or visiting URLs containing it as transmission needing consent, asked right before the typing | [confirmation](safety-confirmation-policy.md) |
| R30 | MUST | Approvals accept only explicit true, bind to the target, recheck at execution | [computer toolset](api-sdk-computer-toolset.md) |
| R31 | MUST | Store approvals by target (site, app, origin) and lifetime (once, turn, thread, always) | [isolation](safety-isolation-and-approvals.md) |
| R32 | MUST | Never let the agent drive our own agent UI, terminals or OS security prompts | [desktop](product-desktop-computer-use.md) |
| R33 | SHOULD | Collect credentials in a form outside model context; never in chat or logs; expire an unanswered request and never retry a submission automatically | [data](safety-data-and-audit.md) |
| R34 | MUST | On suspected prompt injection, phishing or an unexpected warning, stop, tell the user what looks suspicious and ask how to proceed (was SHOULD; the goal requires it) | [confirmation](safety-confirmation-policy.md) |
| R35 | LATER | An injection monitor, separate from the acting model, that checks every screenshot and pauses the run | [safety model](safety-model.md), [Operator card](system-card-operator.md) |
| R56 | SHOULD | Refuse high-risk task classes before acting, such as bank transfers and high-stakes decisions, as Operator and ChatGPT agent did | [Operator card](system-card-operator.md), [agent card](system-card-chatgpt-agent.md) |
| R61 | MUST | Consent comes only through a channel the calling model can neither answer nor relay, for example the live view with a control token the caller never holds, the terminal, or later DSH's approval gate in its default preset, one consequential action per call (D-013) | [MCP clients](../model-capabilities/mcp-clients.md) |
| R62 | SHOULD | Pending approvals survive a reconnect: rebuilt from current state, never resent automatically, a lost acknowledgement treated as unknown | [hosted](api-agents-hosted.md) |
| R36 | LATER | Reviewer agent for routine approvals, with a denial circuit breaker | [isolation](safety-isolation-and-approvals.md) |

## Human control

| ID | Level | Requirement | From |
|---|---|---|---|
| R37 | MUST | Live, authenticated, view-only stream of the agent's screen | [environments](comparison-environments.md) |
| R38 | MUST | Stop at any time; report what ran; stopping undoes nothing; declining one pending approval is not stopping the run, and each is its own control | [work and dots](product-work-and-dots.md), [hosted](api-agents-hosted.md) |
| R39 | MUST | Take over and return control; the agent waits while the user drives, takes no screenshots of what the user enters, and resumes from the prior workflow state, or re-plans from a fresh screenshot when it cannot | [work and dots](product-work-and-dots.md), [agent card](system-card-chatgpt-agent.md) |
| R40 | SHOULD | Pause automation when local user input is detected on the agent's display | [human control](product-human-control.md) |
| R41 | SHOULD | Watch mode: once a run reaches a sensitive site (email, banking), pause whenever the watcher goes inactive or leaves the view, for the rest of the run | [agent card](system-card-chatgpt-agent.md) |
| R57 | SHOULD | Notify the person when the run needs them: a confirmation, a question or a hand-off | [human control](product-human-control.md) |
| R42 | LATER | Annotations letting the user mark page elements for the agent | [browsers](product-browsers.md) |

Continues in [observability and evaluation](implications-observability-and-evaluation.md).
