---
title: Anthropic computer toolset wire shapes
created: 2026-11-01T09:40:39Z
modified: 2026-11-01T09:40:39Z
level: L1
version: 1.0.0
description: Exact JSON for a computer_toolset_20260801 request, its 17 members and inputs, a tool_use batch and the tool_result shapes for success, image, error and halt
status: unverified
grounded_in:
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference (fetched 2026-11-01)
  - source: _context_/model-capabilities/claude-computer-tool.md (gateway probes 2026-11-01)
---

# Anthropic computer toolset wire shapes

From [ant] unless marked. Our gateway accepted these shapes on model-a [gateway]; which version each
model takes is in [Anthropic tool](comparison-anthropic-tool.md).

## Request

Headers `content-type: application/json`, `x-api-key`, `anthropic-version: 2023-06-01`; no `anthropic-beta`.

```json
{"model":"model-a","max_tokens":4096,
 "tools":[{"type":"computer_toolset_20260801","configs":{"zoom":{"enabled":false}},"cache_control":{"type":"ephemeral"}}],
 "messages":[{"role":"user","content":"Save a picture of a cat to my desktop."}]}
```

`configs` (per member `enabled`, `defer_loading`) and `cache_control` are optional; the minimal entry is
`{"type":"computer_toolset_20260801"}`. The entry rejects `name`, `display_width_px`, `display_height_px`,
`display_number` and `enable_zoom` with `invalid_request_error` and cannot share a request with another tool named
`computer` [ant]. It also refuses `strict`, `input_examples` and a `tool_choice` naming the toolset or a member
[toolref]. `disable_parallel_tool_use: true` in `tool_choice` limits Claude to one block per turn.

## Members

All 17 are enabled by default. Coordinates are full-screenshot pixels, also after `zoom`.

| Member | `input` |
|---|---|
| `screenshot`, `cursor_position`, `left_mouse_down`, `left_mouse_up` | `{}` |
| `zoom` | `region: [x0, y0, x1, y1]` |
| `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click` | `coordinate?`; `text?` modifiers `shift`, `ctrl`, `alt`, `super` or `+`-joined |
| `left_click_drag` | `start_coordinate`, `coordinate`, `text?` |
| `mouse_move` | `coordinate` |
| `scroll` | `scroll_direction` (`up`, `down`, `left`, `right`), `scroll_amount` (wheel clicks), `coordinate?`, `text?` |
| `type` | `text` |
| `key` | `text` such as `Return`, `ctrl+s`; `repeat?` 1 to 100 |
| `hold_key`, `wait` | `duration` in seconds, at most 300; `hold_key` also `text` |

## Batch from Claude

The response has `stop_reason` `tool_use`:

```json
{"role":"assistant","content":[
 {"type":"tool_use","id":"toolu_01HqCF3nJ4Vzr8sTkPZ2wxYA","name":"left_click","toolset_name":"computer","input":{"coordinate":[640,60]}},
 {"type":"tool_use","id":"toolu_01Ppr3sZ3TnE9m6VUu4RyH2K","name":"type","toolset_name":"computer","input":{"text":"pictures of cats"}},
 {"type":"tool_use","id":"toolu_01Xf5W1sD8Q9aBcJ7kLmN2pQ","name":"screenshot","toolset_name":"computer","input":{}}]}
```

## Results

Run the blocks in order and answer every one in the next `user` message, matched by `tool_use_id`, each echoing
`"toolset_name": "computer"`; content may be only `text` and `image`:

```json
{"role":"user","content":[
 {"type":"tool_result","tool_use_id":"toolu_01HqCF3nJ4Vzr8sTkPZ2wxYA","toolset_name":"computer","content":[{"type":"text","text":"OK"}]},
 {"type":"tool_result","tool_use_id":"toolu_01Ppr3sZ3TnE9m6VUu4RyH2K","toolset_name":"computer","content":[{"type":"text","text":"OK"}]},
 {"type":"tool_result","tool_use_id":"toolu_01Xf5W1sD8Q9aBcJ7kLmN2pQ","toolset_name":"computer",
  "content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgo..."}}]}]}
```

A failed action (from "Handle errors") and a later block of the same batch, which gets the exact halt text (from
"Batch actions"):

```json
{"type":"tool_result","tool_use_id":"toolu_01A09q90qw90lq917835lq9","toolset_name":"computer","is_error":true,
 "content":"Error: Failed to capture screenshot. Display may be locked or unavailable."}
{"type":"tool_result","tool_use_id":"toolu_01Xf5W1sD8Q9aBcJ7kLmN2pQ","toolset_name":"computer","is_error":true,
 "content":"Not executed: an earlier computer action in this turn failed."}
```

- `cursor_position` answers in text such as `X=512, Y=384`. A withheld or unimplemented member, or coordinates
  outside the display, get `is_error: true`.
- A result without `toolset_name`, or a block left unanswered, fails the request; the gateway's 400 messages are
  in [gateway].
- Images must already fit the model limit (2,576 px long edge, 4,784 visual tokens); oversized ones are rejected.
- A batch that does not end with `screenshot` may get an extra `image` block on its last result.
- Earlier versions differ: one tool named `computer`, the action in `input.action`, no `toolset_name`.

[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[toolref]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference
[gateway]: ../model-capabilities/claude-computer-tool.md
