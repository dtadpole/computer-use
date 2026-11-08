---
title: gateway-gpt models through the Conclave gateway
created: 2026-11-01T09:32:00Z
modified: 2026-11-01T09:32:00Z
level: L1
version: 1.0.0
description: What the gateway's gateway-gpt models accept for computer use - images, the OpenAI computer tool and the Responses route - and what that means for the Responses-shaped adapter.
status: unverified
grounded_in:
  - source: 'gateway probes by cu-researcher, 2026-11-01 09.29-09.31 UTC (gateway-probe.py gpt; Responses input variants; custom-tool round trip)'
  - source: _projects_/heddle/_context_/team-operations/decision-log.yaml (D-052, Conclave /v1/responses is not a Responses passthrough)
---

# gateway-gpt models through the gateway

Models: gpt-6.1-sol, gpt-5.6-sol, gpt-6-luna, gpt-5.6-luna, gpt-5.5. Bearer and `x-api-key` both authenticate.

| Probe | Result |
|---|---|
| Text on `/v1/chat/completions` | 200, `ready` |
| `image_url` data URL, no detail, `high` or `original` (gpt-6.1-sol, gpt-5.5) | 200, but the answer is "NO IMAGE" and the prompt costs 36 tokens: the image is dropped |
| Image block on `/v1/messages`, all five models | 200, "NO IMAGE" |
| Screenshot in a `tool_result` for a custom `computer` tool | The model asked for another screenshot or clicked a guess, (1125, 734) for a button centred at (903, 611) |
| Chat with `tools: [{"type": "computer"}]` | The tool is dropped silently; the model answers in prose |
| `/v1/responses` with `input` as a string, a message list or typed items | 400: `One of "input" or "previous_response_id" or 'prompt' or 'conversation' must be provided.` |
| `/v1/responses` with `messages` | 200, a Chat Completions-shaped body |
| `/v1/messages` with the Claude toolset | 400: `Invalid type for 'tools[0].name'` |

## Verdict

No `gateway-gpt` model can see a screenshot through this gateway, and neither OpenAI computer tool (`computer`,
`computer_use_preview`) is reachable. The Responses route is a Chat Completions façade that ignores `input`, which
agrees with [hd] D-052.

## Consequences

- The Responses-shaped adapter that `ULTIMATE_GOAL.md` names cannot run live on this Mac. Build it against recorded
  fixtures shaped like [the GA tool](../chatgpt-computer-use/api-computer-tool.md) and test it offline; a live check
  needs a direct OpenAI key, which is the owner's decision through the coordinator.
- **Inference:** GPT models can still fill text-only roles, for example a reviewer that judges a proposed action from
  its arguments and the page text.
- The gateway's `/v1/models` lists only six ids, so it is not a catalogue of what the gateway serves.
