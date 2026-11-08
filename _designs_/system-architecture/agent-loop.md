---
title: Agent loop semantics
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.5.1
description: The order in which one run observes, asks the model, validates, applies policy, executes and records, and where it yields to a human.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-contract.md@1.0.0
  - source: _context_/chatgpt-computer-use/api-sdk-computer-toolset.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-actions-and-loop.md@1.0.0
---

# Agent loop

`runTask(options)` in `agent-core/loop.mjs` returns a [run result](run-outcomes.md). Options: `task` (text plus an opaque `meta`, copied into `run.json`), `environment` (launched by
the caller with the adapter's `maxImage` as `frame`), `model`, `policy`, `controller`, `control`, `bounds`, `signal`,
`preApprovals`, `runDir`.

1. **Open.** Create the run directory, refuse a script whose frame differs from `environment.frame`, take
   screenshot 0.
2. **First request.** `model.next` with the task and screenshot 0. Screenshot-first models may still ask for a
   `screenshot`; it is answered without touching the UI.
3. **Checkpoint.** Before every model request and every action: bounds, `signal`, and the
   [run control](live-control.md) state. Pause and take-over wait here; stop ends the run.
4. **Classify the turn.** `final`, `ask`, `escalate`, `refusal` or `length` end the run
   ([outcomes](run-outcomes.md)), unless an attended controller answers `ask` with text, which continues the loop.
   Interim narration (a `commentary` message) never ends the run (R23).
5. **Validate** the whole batch ([schema](action-schema.md)). A refusal skips to step 8 with nothing executed.
6. **Safety checks.** Provider `pendingSafetyChecks` go to the [consent gate](consent-gate.md); anything but an
   explicit approval of every check ends the run `declined` (R21). Inspector hits (step 8) and `escalate` calls
   follow [untrusted-content](untrusted-content.md) and end `escalated` unless a person chooses to continue.
7. **Execute in order.** For each action: [policy](action-policy.md) decides `allow`, `confirm`, `block` or
   `handoff`. `allow` calls `environment.perform` in frame pixels and keeps its `ActionEffect`. `confirm` asks the
   gate and rechecks the target, then executes; a decline stops the batch. `block` stops the batch.
   `handoff` gives the human control until hand-back. A driver error stops the batch as `failed`. Remaining actions
   become `skipped`; nothing is retried (R19, R27).
8. **Observe.** One screenshot after the batch (R8), `pageText` for the
   [inspector](untrusted-content.md), and as notes the effects and events since the last step (blocked requests,
   popups, an open dialog with its text and how to answer it).
9. **Record** the step ([trajectory](trajectory.md)), then `model.next` with `callId`, results, screenshot, notes,
   acknowledged checks and any queued user guidance (R20, R24). Go to 3.

## Invariants

- The model sees the outcome of every action it asked for, including refused, skipped and declined ones, so it
  never assumes an effect that did not happen (R23).
- Effects start only in step 7. A stop never undoes an executed action; the result says what ran (R38).
- Only the controller's explicit `true` approves; nothing the model or the page says can (R26, R30).
- Every pointer position the loop sends is remembered, which answers `cursor_position` without the driver.
- The loop holds no vendor wire format and no CDP call: those stay in adapters and drivers.
