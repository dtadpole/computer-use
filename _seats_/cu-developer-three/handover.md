---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T13:25:00Z
level: L1
version: 1.10.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: the 0.2.62 install of 2026-11-09 13:18Z (READBACK, self-test) and its proof re-run at 13:19Z
  - source: Linear CU-328, CU-329, CU-334, CU-335 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The seat's scripts live in the private `_seats_/` folder
(`tools/`). `install-held.sh <version> --prove` (or `--prove-only`) re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.62 from main 3f1cd68 (9 Nov 13:18Z), sha256 1586992b, self-test 40, stable identity. The
  proof re-run passed: the session worktree was admitted; `~/computer-use--probe`, an unlisted worktree and `/tmp`
  were refused.
- 0.2.62 (CU-329) reads AXManualAccessibility before writing it and gives it back at every run end.

## In flight

- CU-329 (Verify): cu-verifier's row 5 uses CU Fixture's observer (#292, OK'd). Expected: writes [true, false]
  after bye or a socket loss, none with a preset, and the end log `reads: unset 1 ... restored 1`.
- CU-328 part 1: #259 (OK'd) waits for cu-integrator; part 2 (live rows) is done.
- CU-334 and CU-335 are on main; CU-335 is Done.

## Next

When CU-329 and CU-328 are verified, ask cu-coordinator for the next helper item.

## Rules learned

- Run the boundary proof with the agent's node (volta). The boundary refuses Homebrew's node as not genuine.
- Hold scripts export `CU_DESKTOP_SEAT` (CU-305) and release with the hold's token (CU-327).
- Gate unpiped; push only on exit status 0 (CU-337). Never build ad-hoc helpers while a gate's helper step runs.
- An idle window goes first to High consent work, then code gates, then measurements and installs (D-095).
