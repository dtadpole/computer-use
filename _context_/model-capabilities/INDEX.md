---
title: Model capabilities for computer use
created: 2026-11-01T09:32:00Z
modified: 2026-11-01T10:06:38Z
version: 1.4.0
description: 'What the models the [cu] team can call accept for computer use, measured by small probes of the local Conclave gateway on 2026-11-01, and which consent channel the DSH and heddle MCP clients offer.'
grounded_in:
  - source: 'gateway probes by cu-researcher, 2026-11-01 09.25-09.33 UTC, POST to 127.0.0.1 port 8088 (/v1/messages, /v1/chat/completions, /v1/responses), about 50 small calls, re-run by gateway-probe.py beside this file'
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: 'DSH 0.2.1-rc.2 and heddle 8dbdcf83 MCP client source, read 2026-11-01'
---

# Model capabilities

Instance of [`_context_`](../INDEX.md). What the models on the Conclave gateway (`127.0.0.1:8088`, key per D-007)
accept for computer use, measured on 2026-11-01 between 09:25 and 09:33 UTC.

| File | Answers |
|---|---|
| [claude-computer-tool](claude-computer-tool.md) | Which Anthropic computer tool versions the gateway accepts; wire shapes and errors |
| [claude-images](claude-images.md) | Screenshot size, count, token cost and click accuracy |
| [gpt-models](gpt-models.md) | What the `gateway-gpt` models accept |
| [mcp-clients](mcp-clients.md) | Whether DSH and heddle support MCP elicitation, and the human-only consent channel that exists |
| [dsh-approval-modes](dsh-approval-modes.md) | Which DSH approval modes reach a person, and what a consent plugin can learn |
| [live-run-costs](live-run-costs.md) | What a live run costs on Opus and Sonnet, with and without prompt caching |
| [gateway-probe.py](gateway-probe.py) | Re-runs the probes (standard library; `versions`, `roundtrip`, `limits`, `gpt`) |

## Verdict

- **Claude:** computer use works only through `computer_toolset_20260801`, on model-a, claude-sonnet-5-5,
  claude-opus-5, claude-sonnet-5 and claude-opus-4-8.
- **GPT:** no image reaches any `gateway-gpt` model and no OpenAI computer tool is reachable, so they cannot drive a
  screen through this gateway.
- **MCP consent:** neither client supports elicitation; DSH's approval gate reaches a person only in its default
  `ask` mode (rejects under `danger-full-access`; ACP can approve without a person).

A row here is a measurement on that date, not a guarantee: re-run `python3 gateway-probe.py versions` after a
gateway change, in the background, because a group makes up to 24 calls of up to 60 s each.

## Read next

[claude-computer-tool](claude-computer-tool.md).
