---
title: Mapping Claude's computer toolset to canonical actions
created: 2026-11-01T09:24:10Z
modified: 2026-11-06T15:24:26Z
level: L1
version: 0.8.7
description: How the claude-gateway adapter turns computer_toolset_20260801 member calls into canonical batches and results back, as the gateway was probed to accept, and the function-tool mode for models without the toolset.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/comparison-anthropic-tool.md@1.0.0
  - source: _context_/model-capabilities/ (0e266d82c, gateway probe 2026-11-01 09.25-09.33 UTC)
---

# Claude toolset to canonical

**Native mode ships first.** The gateway accepts `{ type: "computer_toolset_20260801" }` on model-a,
claude-sonnet-5-5, claude-opus-5, claude-sonnet-5 and claude-opus-4-8, with no beta header; it rejects every older
`computer_*` version on all its Claude models (researcher probe, 2026-11-01). `model-a` is an alias: its gateway id,
toolset flag and price live in the machine's local config (`_tools_/agent-core/local-config.mjs`), not in the code.

| Claude member (input) | Canonical |
|---|---|
| `left_click`, `right_click`, `middle_click` (`coordinate`, `text`) | `click`, `button` `left`, `right`, `wheel`; `text` modifiers become `keys` |
| `double_click`, `triple_click` | `double_click`, `triple_click` |
| `mouse_move` | `move` |
| `left_click_drag` (`start_coordinate`, `coordinate`) | `drag`, `path` of the two points |
| `scroll` (`scroll_direction`, `scroll_amount`) | `scroll`; 100 px per wheel click, down and right positive |
| `key` (`text` such as `ctrl+s`, `repeat`) | `keypress`, `keys` from `parseKeyCombo`, `repeat` 1 to 100 |
| `type`, `screenshot`, `zoom`, `cursor_position` | same name |
| `wait` (`duration` seconds) | `wait`, `duration_ms`; over 10 s is refused |
| `left_mouse_down`, `left_mouse_up` | `mouse_down`, `mouse_up` on desktop runs: a press, its moves, waits and release, in one batch, become one `drag` (CU-64) |
| `hold_key` | `{keys, duration_ms}` (`duration` in seconds, at most 10) where the desktop environment lists it (CU-64); no duration: refused, never guessed |

- **Batch.** One assistant message with k `tool_use` blocks becomes one canonical call, dispatched on
  (`toolset_name`, `name`), so a custom tool can never be mistaken for a member (R54); each action keeps its block id. Text blocks become the step's model summary. Assistant content,
  including the thinking block Opus 5.5 returns unasked, is echoed back verbatim.
- **Results.** Every block gets one `tool_result` carrying `toolset_name: "computer"`, in order, in the next user
  message; an unanswered block is a 400. The post-batch screenshot is an image block in the last result. Blocks after
  a stop get `is_error: true` with "Not executed: an earlier computer action in this turn failed."; refused,
  blocked and declined blocks get `is_error: true` with their code.
- **Extra tools.** Custom tools `escalate` (`reason`, `evidence`), `ask_user` (`question`, the `ask` stop) and, for
  browsers, `navigate` (`url`) sit beside the toolset; see [untrusted-content](untrusted-content.md).

## Function-tool mode

For models without the toolset on the gateway (claude-opus-4-7, claude-sonnet-4-6, claude-sonnet-4-5; images in its
`tool_result` were probed to work on the first two) and any other tool-calling model that receives images, which
excludes the gateway's GPT models: one custom tool `computer` whose `input_schema` is `{ actions: [canonical action] }`,
written from [action-schema](action-schema.md), with `escalate` beside it. One `tool_result` returns per-action lines
plus the screenshot.

## Wire facts the adapter owns

`POST {baseUrl}/messages`, `x-api-key` read from the key file per request, `anthropic-version: 2023-06-01`.
Images are base64 PNG and must already fit: at most 2576 px on the long edge and 4784 patches of 28 px; the
adapter declares `maxImage { maxLongEdge: 2576, maxTiles: 4784, tileSize: 28, maxWidth: 2000, maxHeight: 2000 }`
(the driver's `CLAUDE_IMAGE_LIMITS`), which also keeps frames under the stricter limit for more than 20 images. **Pruning spares thinking** ([long-task context](long-task-context.md)): on Claude 5.1 and later an edit invalidates
later thinking blocks (R60). The gateway ignores server-side tool-result clearing (`context_management`, probed 10.00 UTC). `zoom` is declared through
`configs: { zoom: { enabled: false } }` until the driver's region capture passes its tests (R12). The toolset costs
about 4,550 input tokens per request and a 1280x800 screenshot about 1,430; answers arrive in one burst.
