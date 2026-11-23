---
title: Human control on a real display
created: 2026-11-02T08:29:12Z
modified: 2026-11-09T19:10:00Z
level: L1
version: 0.5.1
description: The local-input pause, what take over and hand back mean when the person shares the display with the agent, and how the live view watches a desktop run without becoming a target.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (human control row)
  - source: _designs_/system-architecture/live-control.md@0.8.4
  - source: Linear CU-342 (owner-input stand-in for owner-session rehearsals, approved design 0.2)
---

# Human control on a real display

## The local-input pause (human control row, R77, R89, R93)

A desktop run shares the owner's keyboard, pointer and screen. Two guards watch for the person:

| Guard | How | Grant |
|---|---|---|
| primary: the HID idle counter | read before every low-level step; input newer than our last synthetic event (beyond a small slack) is the person's ([Q-D1](open-questions.md)) | none |
| second: an active pass-through session tap | an event without the `CUSE` tag ([input and targets](input-and-targets.md)) | Accessibility; created only after the preflight, so it never prompts; Input Monitoring is not requested |

Either sends `localInput`; run control enters `paused` at once (sender `local_input`). The
helper posts the up events of anything it holds, drops the unposted steps, and takes no step screenshots while
paused; the interrupted action reports `skipped`, the rest of the batch the halt text.

| Rule | Why |
|---|---|
| `local_input` may only pause, never resume, stop or consent | a stray key must not do more than stop the agent |
| resume needs the person: the live view's Resume (control token) or `y` at the CLI's terminal | the agent never resumes itself |
| `autoResumeAfterIdleMs` is off; only the owner's config file can set it, never the caller or the model | resuming is the person's |
| the pause is armed before the first `global` input and stays armed for the run | no synthetic input without it (D-024) |

After a human resume the first input settles ([details](helper-protocol-details.md)). Paused time is not wall time. The test seam `simulateLocalInput {kind, via}` reports input
through either guard or posts a real untagged event; it can only pause a run.

### The owner-input stand-in (CU-342)

An owner-session rehearsal needs the owner's key press without the owner. `CU_STAND_IN_OWNER_INPUT` (turn numbers,
such as `3` or `3,9`) asks `cli.mjs run` for a labelled stand-in: after each named turn, agent core writes the note
`STAND-IN owner input (CU-342, an untagged pointer move): not the owner's` and calls `simulateLocalInput {kind: 'pointer', via: 'untagged'}` once (the seam posts one pointer move, so a rehearsal of H1 measures the pointer path; the owner's own key press is the key path) -
one real untagged event the guards detect exactly as they detect a person, so the pause it causes is the ordinary
local-input pause, with no branch of its own; the run header lists the turns. Only `cli.mjs run` reads the variable
(and `CU_DESKTOP_HOLD_TOKEN`) and hands runTask an explicit `standInTurns`; the loop, the driver and the MCP server read
neither, and no model action maps to the seam. Set, the run refuses to start, naming the variable and the gate, unless
every gate holds: the adapter cli.mjs built is the scripted one (by identity, never the `--model` text); `CU_HOME` is
set and is not the default `~/.computer-use` after resolving symlinks; `CU_DESKTOP_HOLD_TOKEN` is the token of the run
seat's own live hold (missing, malformed, expired, nested or another seat's refuses); consent is unattended; and the run
is `--env macos-desktop`. A driver without the seam fails the run before it starts. The hold token is a match, not a
secret: the lock file is readable by every seat and anyone can set CU_DESKTOP_SEAT; this stops a model run (which
cannot set env for cli.mjs) but is no isolation between seats.

## Take over and hand back

On the desktop, taking over needs no button: the person uses the Mac and the local-input pause holds the agent. The
live view's Take over still exists for a person watching from another device (`taken_over`);
Hand back (or Resume after a local pause) returns to `running` with the hand-back note, so the model knows the screen
may have changed. The browser's injected human input (`POST /input`) does not apply here ([Q-D7](open-questions.md)).

## Live view

It binds 127.0.0.1 only (a remote owner uses Screen Sharing), streams the helper's app-scoped `watch` frames at a
low rate while someone watches, and serves pause, resume, take over, hand back, stop and consent with the control token. Opened on the same Mac, its browser window is excluded by window ([app policy](app-policy.md)): never captured into
the agent's frame, never a target. When an unapproved or excluded app's window covers an action's point, the live view names it to
the person (`point_covered`, bundle id only, in every mode, kept through the ask) until the next completed action,
a pause, a take-over or the run's end; the model learns only that something covers the point (CU-38).

## Stop

Stop works as today: no new input after the current low-level step, held input released, the helper drops its
scope, the run ends `cancelled` with a final screenshot. Closing the socket or killing the driver has the same effect: without a live run the helper posts nothing.