---
title: Canonical action schema
created: 2026-11-01T09:24:10Z
modified: 2026-11-06T10:34:51Z
level: L1
version: 0.2.2
description: The canonical computer actions - OpenAI's GA computer_call actions with their exact field names, four marked extensions, batch validation and the per-action result.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-computer-tool.md@1.0.0
  - source: _context_/chatgpt-computer-use/api-action-handling.md@1.0.0
  - source: _context_/chatgpt-computer-use/comparison.md@1.0.0
---

# Canonical action schema

The canonical action is OpenAI's GA action object, field for field ([computer tool](../../_context_/chatgpt-computer-use/api-computer-tool.md)).
Adapters translate vendor shapes into it; the loop, policy, trajectory and drivers see nothing else (R14, R17).

| `type` | Required | Optional |
|---|---|---|
| `click` | `x`, `y`, `button` (`left`, `right`, `wheel`, `back`, `forward`) | `keys` |
| `double_click` | `x`, `y` | `keys` |
| `drag` | `path`: 2 to 100 `{ x, y }` | `keys`; a point's `holdMs` (1 to 10,000), from a press agent core composed (CU-64) |
| `move` | `x`, `y` | `keys` |
| `scroll` | `x`, `y`, `scroll_x`, `scroll_y` (pixels, signed) | `keys` |
| `keypress` | `keys`: non-empty array | `repeat` (extension field, 1 to 100, default 1) |
| `type` | `text`: non-empty string | - |
| `wait` | - | `duration_ms` (extension field, 0 to 10000, default 1000) |
| `screenshot` | - | - |

**Extensions**, which OpenAI does not define, reach the loop only from an adapter whose vendor or tool set offers them:

| `type` | Fields | Why |
|---|---|---|
| `triple_click` | `x`, `y`, `keys` | Claude's `triple_click` |
| `zoom` | `region`: `[x0, y0, x1, y1]` | R12; returns an image, the coordinate frame is unchanged |
| `cursor_position` | - | Claude's member; answered by the loop from the last pointer position |
| `navigate` | `url` (absolute `http` or `https`) | headless pages have no address bar; a new origin is `confirm` class `new_site` |

## Validation (before anything runs)

The whole batch is validated first. One malformed or unsupported action refuses **the whole batch**: no action
runs, each gets `refused` with a code, and the model receives the results with a fresh screenshot (R15, R19).

- Unknown `type`: `unsupported_action`. Missing or ill-typed required field: `malformed`.
- `x`, `y`, path points: finite numbers, rounded to integers, inside the environment's frame, else `out_of_bounds`.
- Keys: normalised by [keys-and-coordinates](keys-and-coordinates.md); an unknown name is `unsupported_key`.
- More than 20 actions in one call: `batch_too_large`. Unknown extra fields are ignored and logged.
- An extension the active adapter did not declare: `unsupported_action`.

## Result per action

`{ index, type, status, code?, message? }`, where `status` is `done`, `refused` (validation), `blocked` (policy),
`declined` (human), `handed_off`, `skipped` (an earlier action stopped the batch) or `failed` (driver error).
Results are returned to the model in order with the call's id; nothing is retried (R19, R20).
