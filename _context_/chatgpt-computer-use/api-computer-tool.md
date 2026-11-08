---
title: Responses API computer tool items and fields
created: 2026-11-01T09:14:00Z
modified: 2026-11-01T09:40:00Z
level: L1
version: 1.1.0
description: Exact request, computer_call, action and computer_call_output shapes of the GA Responses computer tool, with examples copied from the docs
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/reference/resources/responses/methods/create (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: docs.e2b.dev/agents/openai-computer-use (fetched 2026-11-01)
---

# Responses API computer tool

Request: `tools: [{ type: "computer" }]`. The reference shows `type` as the tool's only field [ref]. OpenAI's
computer-tool samples use `gpt-6.1-sol` [tcu]; E2B's samples use `gpt-6-luna` [e2b].

## `computer_call`

| Field | Type | Source |
|---|---|---|
| `id`, `call_id` | string | [ref] |
| `pending_safety_checks` | array of `{ id, code, message }`; only `id` is required, while `code` and `message` are "optional string or null" | [ref] |
| `status` | `in_progress`, `completed`, `incomplete` | [ref] |
| `actions` | ordered list; the reference calls it "Flattened batched actions" | [ref] |
| `action` | optional single action. The reference only says "A click action", although the field holds the whole action union. One `action` per call is the preview shape | [ref], [tcu-int] |

## Actions

| `type` | Fields | Source |
|---|---|---|
| `click` | `button` (`left`, `right`, `wheel`, `back`, `forward`), `x`, `y`, optional `keys` | [ref] |
| `double_click` | `x`, `y`, `keys` | [ref] |
| `drag` | `path` of `{ x, y }`, optional `keys` | [ref] |
| `move` | `x`, `y`, optional `keys` | [ref] |
| `scroll` | `x`, `y`, `scroll_x`, `scroll_y`, optional `keys` | [ref] |
| `keypress` | `keys` (array of strings) | [ref] |
| `type` | `text` | [ref] |
| `wait`, `screenshot` | none besides `type` | [ref] |

Batched call [tcu]:

```json
{ "output": [ { "type": "computer_call", "call_id": "call_002",
    "actions": [
      { "type": "click", "button": "left", "x": 405, "y": 157 },
      { "type": "type", "text": "penguin" } ],
    "status": "completed" } ] }
```

Screenshot-first call [tcu-int]: `"actions": [ { "type": "screenshot" } ]`.

## `computer_call_output`

```json
{ "type": "computer_call_output", "call_id": "call_abc123",
  "output": { "type": "computer_screenshot",
    "image_url": "data:image/png;base64,<base64 bytes here>",
    "detail": "original" } }
```

The item is sent with `previous_response_id` and the same `tools` [tcu].

Request-side schema [ref]:
- `output` has exactly the fields `type`, `file_id` and `image_url`.
- Optional item fields are `id`, `acknowledged_safety_checks` (`{ id, code, message }`) and `status`
  (`in_progress`, `completed`, `incomplete`).

Response-side schema [ref]:
- `status` is "completed" or "incomplete" or "failed" or "in_progress".
- The item adds an optional `created_by`.

`detail` appears in the guide examples but in none of the reference's screenshot schemas. The Go and Java
samples attach it as an extra field [tcu]. The `low|high|auto|original` enum (default `auto`) belongs to
`input_image`, the type used on the code-execution path [ref].
`include: ["computer_call_output.output.image_url"]` returns image URLs in the output [ref].

**Inference:** the guide says your integration "must communicate what did and did not run before asking the
model to continue" [tcu-int]. `computer_call_output` has no text field for that, so a batch cut short needs
another channel, such as a following input message.

## Safety checks

Echo approved checks in `acknowledged_safety_checks` [ref].

SDK helpers:
- They must explicitly approve every pending check before any action runs. "A missing or declined callback
  stops the run" [drv].
- Calls passed to Node's `ComputerToolset.execute()` may omit `pending_safety_checks`. The callbacks then
  receive "an empty checklist" [drv].
- The guides' SDK samples stop on any pending check [tcu], [tcu-int].

No current source (guides, reference, E2B) enumerates `code` values; the reference says only "The type of the
pending safety check" [ref]. **Inference (unverified):** 2025 preview docs named codes such as
`malicious_instructions`, `irrelevant_domain` and `sensitive_domain`.

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[tcu-int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[ref]: https://developers.openai.com/api/reference/resources/responses/methods/create
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[e2b]: https://docs.e2b.dev/agents/openai-computer-use
