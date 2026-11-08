---
title: Migration from computer-use-preview to the GA computer tool
created: 2026-11-01T09:18:00Z
modified: 2026-11-01T09:40:00Z
level: L1
version: 1.1.0
description: What changed between the legacy computer_use_preview tool and the GA computer tool in model, tool shape, action batching and truncation
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/reference/resources/responses/methods/create (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
---

# Migration from computer-use-preview

The guide's migration section asks you to "update the model, tool definition, and action handler" and gives
this four-row table [int]:

| | Preview integration | GA integration |
|---|---|---|
| Model | `computer-use-preview` | `gpt-6.1-sol` |
| Tool name | `{ type: "computer_use_preview" }` | `{ type: "computer" }` |
| Actions | One `action` on each `computer_call` | A batched `actions[]` array on each `computer_call` |
| Truncation | `truncation: "auto"` required | `truncation` not necessary |

The display declaration is not a row in that table. It is derived from two places. The legacy sample declares
`display_width`, `display_height` and `environment` on the tool [int]. The reference's GA tool object is
`Computer object { type }`, with no other field [ref].

Legacy request from the docs (shown in JavaScript, Python, Go, Java and Ruby) [int]:

```json
{ "model": "computer-use-preview",
  "tools": [{ "type": "computer_use_preview",
    "display_width": 1024, "display_height": 768, "environment": "browser" }],
  "input": "Check whether the Filters panel is open.",
  "truncation": "auto" }
```

The reference still lists the preview tool, with `environment` values `windows`, `mac`, `linux`, `ubuntu`,
`browser`, and keeps the single `action` field on `computer_call` alongside `actions` [ref].

The section ends after the legacy samples with one paragraph and no GA example: "Keep the preview path only to
maintain older integrations. For a new integration, follow the computer use guide. Your application still
supplies the environment and executes the actions" [int]. For the GA request and items, see
[computer tool](api-computer-tool.md).

## Handler changes

The migration section lists none of these. They are collected from other sections of the guides and from the
reference:

- Loop over `actions` in order instead of handling one `action` [int]. Stop before the first action that needs
  confirmation, as the consent section requires [int].
- Return one screenshot after the batch [tcu].
- If you downscale screenshots, remap the returned coordinates to the environment's space, as the screenshot
  section says [int].
- Mouse actions may carry `keys` for held modifiers [int]. Translate the key and button names as in
  [actions](api-action-handling.md).
- `pending_safety_checks` and `acknowledged_safety_checks` remain in the GA schema [ref]. The migration section
  does not mention safety checks.

**Inference:** for GPT-6 Astra, also evaluate moving from structured actions to the code-execution path that
OpenAI now recommends ([code execution](api-code-execution.md)).

[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[ref]: https://developers.openai.com/api/reference/resources/responses/methods/create
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
