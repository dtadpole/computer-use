---
title: Live-control protocol
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.8.1
description: The run-control states and commands - pause, resume, take over, hand back, stop, consent, guide - their semantics in the loop, the event stream, and the local HTTP transport the live view serves.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/implications-safety-and-control.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-isolation-and-approvals.md@1.0.0
---

# Live-control protocol

`agent-core` owns the state machine (`createRunControl()` in `control.mjs`); cu-developer-two's live view
serves it over HTTP. Every controller in the [consent gate](consent-gate.md) speaks through the same object. The
driver receives it as `control` and gates its own input with `agentMayAct()` (true only in `running`) and
`humanMayAct()` (only in `taken_over`), a second gate behind the loop's checkpoints; `stop` aborts the run's signal.

## States and commands

States: `running`, `paused`, `taken_over`, `awaiting_consent`, `finished`.

| Command | From | Effect |
|---|---|---|
| `pause` | `running` | the loop waits at its next checkpoint; an action in flight completes |
| `resume` | `paused` | continues |
| `take_over` | `running`, `paused`, `awaiting_consent` | pauses the loop, enables `environment.humanInput`; the agent sends no input, and nothing is captured while the person drives: no step screenshot, no trajectory frame, no screencast recording, though the live view still shows the person their screen (R39) |
| `hand_back` `{ note }` | `taken_over` | disables human input; the button tells the person the agent sees the screen from then on; capture resumes, and the next model input carries a fresh screenshot, "the user took control and may have changed the page" and the note |
| `stop` `{ reason }` | any but `finished` | ends the run `cancelled` ([outcomes](run-outcomes.md)); undoes nothing (R38) |
| `consent` `{ id, approved, lifetime }` | `awaiting_consent` | answers the pending request |
| `guide` `{ text }` | any but `finished` | queues user guidance for the next model input (R24) |

A `handoff` decision enters `taken_over` itself, with the reason shown to the person. A command not allowed in the
current state, or not allowed to its sender, is refused with the state and the reason, never queued silently. Each
command is recorded as a `control` event with its source, never with a token. Which sender may issue which command
is [run-tokens](run-tokens.md).

## Events

`state`, `step` (step number, summary, actions with decisions), `consent_request`, `consent_resolved`, `notice`
(blocked request, popup, dialog, inspector hit, "a person is needed"), `finished` (the result). Screen frames come
separately from `environment.startScreencast` and are never recorded. A (re)connected stream starts with the current
state and every pending request, rebuilt from the run; answers are never resent, and an answer whose
acknowledgement was lost counts as unknown until the state shows it (R62). The watch page signals a pending
consent, question or hand-off visibly and audibly (R57).

## Transport (live view, M3)

- HTTP on `127.0.0.1`, a random port, never another interface. Every request carries the run's view or control
  token ([run-tokens](run-tokens.md)); the CLI prints both URLs on its terminal once (R37).
- `GET /events` is a Server-Sent Events stream; `POST /control` takes `{ "command": ..., ...fields }` and answers
  `{ ok, state }` or `{ ok: false, state, error }`; `GET /screen` streams frames; `GET /runs/<run-id>` is the replay.
- The watch page is view-only until `take_over`; mouse and keys then go to `humanInput`, and only then.
- While a run is live, `lib.mjs` hands its in-process caller the view and control URLs, so a verifier drives the
  live view as a person would (D-012).
- The live view's own port is on the policy's fixed deny list, so the agent can never drive its controls (R32).
