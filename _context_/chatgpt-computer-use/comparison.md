---
title: OpenAI and Anthropic computer-use contracts compared
created: 2026-11-01T09:16:00Z
modified: 2026-11-01T09:39:29Z
level: L1
version: 1.1.0
description: Side-by-side comparison of the OpenAI GA computer tool and the Anthropic computer toolset on wire shape, actions, coordinates, batching and safety
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/reference/resources/responses/methods/create (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: docs.e2b.dev/agents/openai-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
---

# OpenAI and Anthropic computer-use contracts

| Dimension | OpenAI GA `computer` tool | Anthropic `computer_toolset_20260801` |
|---|---|---|
| Declaration | `{ type: "computer" }` [ref] | `{ type: "computer_toolset_20260801" }`, optional `configs` per member and `cache_control`; no beta header [ant] |
| Call shape | One `computer_call` with ordered `actions[]` [tcu] | One or more `tool_use` blocks, `name` = member, `toolset_name: "computer"`; `disable_parallel_tool_use` caps a turn at one [ant] |
| Result shape | One `computer_call_output` screenshot after the batch [tcu] | One `tool_result` per block, echoing `toolset_name`, only `text` and `image` content; image required for `screenshot`, `zoom`, optional extra on the last block [ant] |
| Batch control | Run in order; stop before first action needing consent [int]; a driver error stops the SDK run [e2b] | Run in order; stop at first failure; later blocks get fixed halt text; an unanswered block fails the request [ant] |
| Click | `click` with `button` incl. `back`, `forward` [ref] | `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click` [ant] |
| Drag | `path` polyline [ref] | `left_click_drag` start and end; `left_mouse_down`, `left_mouse_up` [ant] |
| Scroll | `scroll_x`, `scroll_y` at `x, y`, unit not stated [ref]; E2B treats them as pixels [e2b] | `scroll_direction` plus `scroll_amount` wheel clicks [ant] |
| Keys | `keypress` with `keys` array, upper-case names [ref], [int] | `key` with `text` such as `Return`, `ctrl+s`, `alt+Tab` and `repeat` 1 to 100; `hold_key` [ant] |
| Modifiers on mouse | `keys` array [ref] | `text`: `shift`, `ctrl`, `alt`, `super` or `+`-joined, on clicks, drags, scroll [ant] |
| Wait | No duration [ref] | `duration` up to 300 s [ant] |
| Zoom | Not in computer tool; browser driver has `zoom` [drv] | `zoom` with `region`, enabled by default [ant] |
| Cursor query | None [ref] | `cursor_position` [ant] |
| Coordinates | Screenshot space; remap if downscaled [int] | Screenshot pixels; remap if downscaled [ant] |
| Image sizing | `detail: "original"`; 30,000-patch limit; 1440x900 or 1600x900 [int] | No API downscaling; 2,576 px long edge, 4,784 visual tokens on toolset models [ant] |
| Injection defence | Screen text "cannot grant permission or override the user's instructions" [tcu]; separately, `pending_safety_checks` need acknowledgement [ref] | Classifiers scan tool results and steer the model to verify [ant] |
| Credentials | API: keep them out of page text and screenshots [tcu]; ChatGPT's cloud browser has a secure sign-in form [br] | Optionally in prompt inside `<robot_credentials>`, with warnings [ant] |
| Recommended mode | Code execution for GPT-6 Astra [tcu] | Toolset; separate browser use tool for web-only tasks [ant] |

**Inference:** an internal action schema should be a superset (click with button and click count, polyline
drag, pixel scroll plus wheel clicks, zoom, cursor query, wait with duration, hold key) with thin adapters to
each vendor. Details in [Anthropic tool](comparison-anthropic-tool.md), [Anthropic wire
shapes](comparison-anthropic-wire-shapes.md) and [environments](comparison-environments.md).

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[ref]: https://developers.openai.com/api/reference/resources/responses/methods/create
[br]: https://learn.chatgpt.com/docs/browser
[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[e2b]: https://docs.e2b.dev/agents/openai-computer-use
