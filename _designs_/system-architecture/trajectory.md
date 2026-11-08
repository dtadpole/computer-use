---
title: Trajectory format
created: 2026-11-01T09:24:10Z
modified: 2026-11-07T16:11:11Z
level: L1
version: 0.4.2
description: The run directory outside git - header, step-indexed event lines, screenshots by hash - with redaction, retention and how a run is replayed.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/safety-data-and-audit.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-observability-and-evaluation.md@1.0.0
---

# Trajectory format (`cu-trajectory/v1`)

Every run writes `$CU_HOME/runs/<run-id>/`, mode 700, never inside git. `run-id` is
`<UTC yyyymmddThhmmssZ>-<6 hex>`.

| File | Content |
|---|---|
| `run.json` | header: `schema`, `runId`, task (redacted) and its opaque `meta` (such as fixture task id and seed), adapter and model, environment kind, `frame`, bounds, policy summary, `build` `{ commit, dirty }`, `startedAt`; rewritten at the end with the [result](run-outcomes.md) |
| `events.jsonl` | one JSON object per event, appended and flushed as it happens |
| `screenshots/step-NNNN.png` | the observation after step N; `zoom-NNNN-K.png` for zooms |
| `transcript.json` | the adapter's redacted conversation, images replaced by screenshot paths |

## Events

Every line has `seq`, `t` (ISO time), `step` and `kind`.

| `kind` | Fields |
|---|---|
| `model_turn` | `callId`, `stop`, `message` (the model summary), `actions`, `pendingSafetyChecks`, `usage`, `latencyMs` |
| `action` | `index`, `action`, `site`, `decision`, `class`, `rule`, `status`, `code`, `effect` (the driver's `ActionEffect`), `attempted`, `completed`, `durationMs`, and `target`, the element the action was judged on: on the browser `{ origin, role }` (the target's frame origin) with `name` only when the site filter allowed that origin when the action was judged (CU-182), on the desktop `{ origin, role }` (the bundle id) with `name` only inside the approved scope ([trajectory privacy](../desktop-extension/trajectory-privacy.md)); never a value. Inside the scope a name can itself carry content (a mail row named by its subject): the same trade-off on both drivers, accepted so a run can be read |
| `consent` | the request and the answer, who answered, `waitMs` |
| `control` | a live-control command, its source and the state change |
| `observation` | screenshot path and `sha256`, `url`, inspector hits, environment notes |
| `end` | the result |

`attempted` is written before the driver call and `completed` after it, so an interrupted run shows which actions
may have taken effect (R47). Usage and latency per request serve R45.

## Redaction (R44)

- `type.text` into `credential` or `sensitive_data` targets is stored as `[redacted, N chars]`; secret placeholders
  stay placeholders.
- No API key, header or key-file content is ever written; adapters log status codes and usage only.
- Screenshots live only in the run directory: never in git, the action log, an inbox message or a general log. A
  verifier that needs one reads it from the run directory and does not copy it into the tree.

## Retention and replay

The CLI keeps the newest 50 runs or 14 days, whichever keeps more, and `cli.mjs prune` applies it; tests use a
temporary `CU_HOME`. `cli.mjs replay <run-id>` prints the step timeline as text; the live view serves
`/runs/<run-id>` as a screenshot timeline with each step's actions, decisions and summary (R46). The trajectory link
returned to a caller is the run directory path plus that URL when the live view is up.
