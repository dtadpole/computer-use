---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T14:20:00Z
level: L1
version: 1.11.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: the 0.2.62 install of 2026-11-09 13:18Z and cu-verifier's CU-329 row 5 (13:37-13:53Z)
  - source: Linear CU-328, CU-329, CU-341, CU-342, CU-343, CU-344 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The seat's scripts live in the private seat folder (`tools/`).
`install-held.sh <version> --prove` (or `--prove-only`) re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.62 from main 3f1cd68 (9 Nov 13:18Z), sha256 1586992b, self-test 40, stable identity, the
  boundary proof valid. CU-329 is Done: cu-verifier saw AXManualAccessibility given back live after bye and after a
  socket loss, and left alone when already on.
- CU-328 is Done: `cli.mjs inspect` prints `inWebArea` as passed, and `--focused` reads the focus.

## In flight

- CU-341 (In Progress): rehearse the owner session on 0.2.62 with labelled stand-ins, then a one-page owner
  checklist. Plan 0.1 is approved. R1 (live-probe: the control sequence and the watch link) is queued for an idle
  window. R1b drives owner-step4 with a scripted control client and records cu-verifier's evidence (1)-(8). R3 (the
  CU-203 prompt) runs last because a timeout starts a 5-minute backoff.
- Gaps filed: CU-342 (owner-input stand-in, design line first, four consent conditions), CU-343 (G2 script) and
  CU-344 (Part 3 by script, Low).

## Next

Finish R1-R3, then the checklist PR. Then ask cu-coordinator for the next item.

## Rules learned

- Run the boundary proof with the agent's node (volta); the boundary refuses Homebrew's node as not genuine.
- Hold scripts export `CU_DESKTOP_SEAT` (CU-305) and release with the hold's token (CU-327).
- Run the gate unpiped and push only on exit status 0, never `--no-verify` (CU-337). Never build ad-hoc helpers while
  a gate's helper step runs.
- An idle window goes first to High consent work, then code gates, then measurements and installs (D-095).
