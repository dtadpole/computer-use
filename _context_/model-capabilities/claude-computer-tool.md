---
title: Anthropic computer tool through the Conclave gateway
created: 2026-11-01T09:32:00Z
modified: 2026-11-01T10:06:38Z
level: L1
version: 1.3.0
description: Which Anthropic computer-use tool versions the gateway's Messages route accepts per Claude model, and the call, result and error shapes confirmed live.
status: unverified
grounded_in:
  - source: 'gateway probes by cu-researcher, 2026-11-01 09.25-09.33 UTC (gateway-probe.py versions and roundtrip; batch, configs and beta-route probes), configs and function-tool probes 09.50 UTC, context-management probe 10.00 UTC, prompt-caching probe 10.15 UTC'
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: _projects_/heddle/_context_/model-endpoints/INDEX.md (finding I-7)
---

# Anthropic computer tool through the gateway

Route: `POST http://127.0.0.1:8088/v1/messages` with `x-api-key` and `anthropic-version: 2023-06-01`. Response ids
start `msg_vrtx_` and `toolu_vrtx_`. **Inference:** the backend is Claude on Google Cloud, where Anthropic documents
5.5 models as toolset-only [ant].

## Which version each model accepts

| Model | `computer_toolset_20260801` | `computer_20251124` + beta | `computer_20250124` + beta |
|---|---|---|---|
| model-a, claude-sonnet-5-5, claude-opus-5, claude-sonnet-5, claude-opus-4-8 | 200, a `screenshot` call | 400 | 400 |
| claude-opus-4-7, claude-sonnet-4-6, claude-sonnet-4-5 | 400 | 400 | 400 |

Each 400 reads `Input tag '<type>' found using 'type' does not match any of the expected tags`. On claude-opus-4-7
the beta versions stayed unreachable through the `anthropic-beta` header, `?beta=true` and a Vertex-style
`anthropic_beta` body field. Those three models therefore have no computer tool here, although Anthropic documents
them on the beta versions [ant]. The toolset needs no beta header and ignores a stray one. Its models also list
`browser_toolset_20260801` among the accepted tags.

## Shapes confirmed live (model-a)

| Check | Result |
|---|---|
| Call | `tool_use` with `name` = member, `toolset_name: "computer"`, `input` such as `{"coordinate":[902,610]}` |
| Batching | `left_click`, `wait {"duration":1}`, `screenshot` in one turn, unprompted |
| Result without `toolset_name` | 400: `a tool_result answering a member tool_use must carry the paired tool_use's toolset_name` |
| One block of a batch unanswered | 400: `tool_use ids were found without tool_result blocks immediately after` |
| `is_error: true` with the documented halt text | Accepted; the model replanned with `wait` and `screenshot` |
| `configs: {"zoom":{"enabled":false}}`; `disable_parallel_tool_use: true` | Accepted |
| `configs` disabling `hold_key`, `left_mouse_down`, `left_mouse_up` | Accepted; the model then lists only the other members; a key that is not a member gives 400 `Extra inputs are not permitted` |
| `display_width_px` on the toolset | 400: `Extra inputs are not permitted` |
| `context_management` with `clear_tool_uses_20250919`, with or without the beta header | 200 but ignored: input tokens unchanged (7,229) and no `context_management` in the response, so no server-side clearing (Q-R7) |
| Prompt caching | `cache_control` on the toolset entry and the last `tool_result` works: a repeat request read all 10,275 prefix tokens from the cache ([costs](live-run-costs.md)) |
| Thinking | A `thinking` block (empty text, a signature) arrives unrequested |
| Toolset overhead | 4,549 to 4,616 input tokens per request across the five models; Anthropic states about 4,500 [ant] |

## Consequences for the adapter

- Declare only the toolset; dispatch on the pair (`toolset_name`, `name`) [ant].
- Run blocks in order, stop at the first failure, and answer every block, the rest with the halt text [ant].
- Echo assistant content back unchanged, thinking blocks included.
- A model without the toolset needs a custom function tool, not an older version. Measured: a base64 PNG in that tool's
  `tool_result` reaches claude-opus-4-7 and claude-sonnet-4-6, which clicked (902, 611) and (901, 610) for a button
  centred at (903, 611).
- The gateway sends a Claude answer in one burst even when streamed ([I-7][endpoints]); a live view must not depend
  on token streaming.

[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[endpoints]: ../../../../_context_/model-endpoints/INDEX.md
