---
title: Requirements for our computer use, action schema and agent loop
created: 2026-11-01T09:19:00Z
modified: 2026-11-01T09:56:55Z
level: L1
version: 1.2.0
description: Requirements R14 to R25, R54, R55 and R60 for the action schema and agent loop of a self-built computer-use system that matches ChatGPT behaviour
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: _context_/model-capabilities/ (gateway probes 2026-11-01)
  - source: _context_/team-operations/decision-log.yaml (D-008)
---

# Requirements, action schema and agent loop

Levels as defined in [environment and perception](implications-environment-and-perception.md).

## Action schema

| ID | Level | Requirement | From |
|---|---|---|---|
| R14 | MUST | Accept the OpenAI action set and fields: `click`, `double_click`, `drag`, `move`, `scroll`, `keypress`, `type`, `wait`, `screenshot` | [computer tool](api-computer-tool.md) |
| R15 | MUST | Normalise key and button names; raise on unsupported input instead of skipping it | [actions](api-action-handling.md) |
| R16 | MUST | Hold `keys` modifiers only for the duration of the mouse action | [actions](api-action-handling.md) |
| R17 | MUST | Use an internal superset schema with thin adapters: the Claude toolset (the only live path on our gateway) and the OpenAI GA tool (tested offline, since no `gateway-gpt` model receives images) | [comparison](comparison.md), [GPT models](../model-capabilities/gpt-models.md) |
| R18 | SHOULD | Offer a code-execution tool (`exec_js`) as an alternative path, evaluated through CDP `Runtime` in an isolated world (D-008) | [code execution](api-code-execution.md) |
| R54 | MUST | Claude adapter: declare `computer_toolset_20260801` only; dispatch on (`toolset_name`, `name`); answer every `tool_use` of a batch with `toolset_name: "computer"`; echo assistant content, thinking blocks included | [Claude tool](../model-capabilities/claude-computer-tool.md) |

## Agent loop

| ID | Level | Requirement | From |
|---|---|---|---|
| R19 | MUST | Execute batched actions once, in order, with no blind retries | [computer toolset](api-sdk-computer-toolset.md) |
| R55 | MUST | Stop a batch at the first failure or declined action and tell the model what ran and what did not (Claude: `is_error` plus the fixed halt text) | [confirmation](safety-confirmation-policy.md), [Claude tool](../model-capabilities/claude-computer-tool.md) |
| R20 | MUST | Answer each call with its `call_id` and continue the same conversation | [computer tool](api-computer-tool.md) |
| R21 | MUST | Pause on `pending_safety_checks`, ask the user, echo `acknowledged_safety_checks` | [computer tool](api-computer-tool.md) |
| R22 | MUST | Bound steps (default 20), time and cost; the last allowed step starts no effects | [computer toolset](api-sdk-computer-toolset.md) |
| R23 | MUST | End when no action call remains; separate answers, help requests and other tools; surface a clarifying question to the user; never end on an interim (`commentary`) message | [api](api-contract.md) |
| R60 | SHOULD | Keep screenshot history within limits without breaking the model's reasoning: on Claude 5.1 and later do not prune on the client (it invalidates thinking); stay at or below 20 images or 3,000 px a side, preferring server-side tool-result clearing once the gateway supports it (on 2026-11-01 it ignored `context_management`) | [Anthropic tool](comparison-anthropic-tool.md) |
| R24 | SHOULD | Accept user guidance appended at turn boundaries without restarting | [computer toolset](api-sdk-computer-toolset.md) |
| R25 | LATER | Durable checkpoints that resume only from completed boundaries after reconciliation | [computer toolset](api-sdk-computer-toolset.md) |

Continues in [safety and control](implications-safety-and-control.md).
