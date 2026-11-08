---
title: Human control claims
created: 2026-11-01T18:50:00Z
modified: 2026-11-01T18:50:00Z
level: L1
version: 1.0.0
description: What the human-control verifier claims - through the live view, a person pauses and resumes a run, takes over and acts while the agent waits, hands back, and stops it; the watch token cannot take over or act.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (human control row)
  - source: _tools_/live-view/INDEX.md
---

# Claims

The check is the person, using the live view's own HTTP surface (the requests its buttons send) with the tokens from
the URLs startRun hands an in-process harness. Evidence: the input recorder (D-012). The agent presses `odd-a`, the
person `odd-b`.

| # | Claim | Mutant it catches |
|---|---|---|
| H1 | The page carries the stable control ids and `data-state`; the event stream's hello has the state and `at` | - |
| H2 | Pause holds the agent (no press for 1.5 s); resume releases it | `pause-ignored` |
| H3 | The watch token cannot take over or send input; the control token cannot send input before a take-over | `input-without-takeover` |
| H4 | Take over stops the agent; the person's click lands on `odd-b`; hand back resumes the agent | `take-over-ignored`, `hand-back-ignored` |
| H5 | Stop ends the run `cancelled`; no press follows | - |

Not here: the page's buttons driven in a second browser. That needs both team browser slots at once (D-014), so it
waits until the full-suite batch is done.

## Read next

[`INDEX.md`](INDEX.md).
