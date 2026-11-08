---
title: Model adapter interface
created: 2026-11-01T09:24:10Z
modified: 2026-11-06T09:48:59Z
level: L1
version: 0.6.2
description: The interface between the loop and a model - one session per run, a turn in canonical form, usage and cost - and the three adapters - claude-gateway, responses and scripted.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-computer-tool.md@1.0.0
  - source: _context_/chatgpt-computer-use/api-contract.md@1.0.0
  - source: _context_/team-operations/decision-log.yaml (D-007)
  - source: _context_/model-capabilities/ (0e266d82c, gateway probe 2026-11-01 09.25-09.33 UTC)
---

# Model adapters

An adapter hides one wire protocol; the loop sees only canonical turns. It exports
`{ id, capabilities, open(options) }`. `capabilities` declares `maxImage` (any of the driver's `fitScale` limits: `maxWidth`, `maxHeight`,
`maxLongEdge`, `maxPixels`, `maxTiles` with `tileSize`; handed to the environment as `frame`), the [extensions](action-schema.md) it may emit and whether it reports provider safety checks.

`open({ instructions, task, frame, tools, signal })` returns a session; `frame` is the environment's frame (width,
height in frame pixels), `tools` says whether `navigate` is offered (browsers). The session has two members:

- `next(input)`. Input `{ screenshot, callId, results, acknowledgedSafetyChecks, userText, notes }`, any part
  optional; the first call carries the task and the initial screenshot.
- `transcript()`. The redacted conversation, images replaced by trajectory references.

`next` returns a **turn**:

| Field | Meaning |
|---|---|
| `call` | `{ callId, actions, pendingSafetyChecks }` or null |
| `escalation` | `{ reason, evidence }` when the model called `escalate`, else null |
| `message` | the model's text: narration beside a call, or the final answer |
| `stop` | `call`, `final`, `ask` (the model asks the user), `escalate`, `refusal`, `length` |
| `usage` | `{ inputTokens, outputTokens, cacheReadTokens, costUsd }`; `costUsd` null if no price is configured |

Adapters retry a model request at most twice on 429 or 5xx, never an action. They hold no environment state:
a conversation can be replayed, a browser cannot (R3).

## The three adapters

| Adapter | Wire | Tested by |
|---|---|---|
| `claude-gateway` | Anthropic Messages on the Conclave gateway, `http://127.0.0.1:8088/v1`; native `computer_toolset_20260801` first, function-tool mode for models without it ([mapping](anthropic-mapping.md)); live evidence on model-a (a local-config alias: its real id and price stay in `~/.config/computer-use/config.json`) and claude-sonnet-5-5. Key read per request from `~/.heddle/keys/conclave.api.key`, never logged (D-007) | recorded wire fixtures offline; small capped live runs |
| `responses` | OpenAI Responses: `tools: [{ type: "computer" }]`, `computer_call` with `actions` (or legacy `action`) and `pending_safety_checks`; replies `computer_call_output` with `call_id`, a `computer_screenshot` at `detail: "original"` and `acknowledged_safety_checks`, chained by `previous_response_id` or full input replay | recorded fixtures shaped like the GA tool only: no gateway model sees images and `/v1/responses` is a Chat facade; a live run needs a direct OpenAI key, an owner decision the setup session has asked |
| `scripted` | none: plays a script | every core suite and offline verifier |

## Scripted model

A script is JSON: `{ "frame": { "width": 1440, "height": 900 }, "turns": [ ... ] }`; the run refuses a script whose frame differs from the environment's, since its coordinates would miss - except a
desktop frame showing the same region in points at another backing scale (`--simulate-scale`), where every
coordinate is mapped by the frames' ratio (CU-81). Each turn is one of
`{ "actions": [...], "safetyChecks": [...] }`, `{ "final": "text" }`, `{ "ask": "text" }` or
`{ "escalate": { "reason", "evidence" } }`, played in order; running past the end is an `error` outcome.
A turn may carry `usage` (to test `max_cost` offline) and `delayMs` (to test `max_time`). `lib.mjs` also accepts
a function `(input) => turn`, so a verifier's harness can aim at the target boxes the fixture publishes to it, never
through the agent's browser or the model's input. Each adapter exports a pure `parseTurn(wire)` for wire fixtures.
