---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T19:30:00Z
level: L1
version: 1.12.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: Linear CU-341, CU-342, CU-349, CU-361, CU-367 (9 Nov)
  - source: owner-session-rehearsal.md (#370) and the one-page owner checklist (#324)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The seat's scripts live in the private seat folder (`tools/`).

## Live state

- Installed helper: 0.2.62 (main 3f1cd68, sha256 1586992b). 0.2.63 (#344, placeholder) installs once, right after
  it lands, from a queued job.
- CU-341: the rehearsal is done. R1 and R1b covered the control link; R1c covered H1 with CU-342's labelled stand-in, a
  pointer move. The checklist is on main (#324); the record #370 closes the issue.

## In flight

- #370 (Fixes CU-341, record), #371 (the stand-in labelled 'pointer'), #368 (Fixes CU-367, the loop refuses the
  stand-in for any model run), #344 (CU-349 helper half, 0.2.63) and #316 (Return pin) are reviewed or in review.
- CU-361 (layout label 'nearbyLabel', 0.2.64) is coded at 7660f19c, stacked on #344. Open its PR when #344 lands.
- After the 0.2.63 install: cu-verifier's placeholder fixture row, and the checklist's helper version line.

## Next

Land the above; then ask cu-coordinator for the next item.

## Rules learned

- The harness sets _VOLTA_TOOL_RECURSION, so the volta shim can resolve to Homebrew's node, which the boundary
  refuses. Scripts unset it, put `volta which node` first, and refuse any other node.
- After a requested main merge, leave the union-merged action log as git wrote it, so D-085 carries the OKs.
- Hold scripts export CU_DESKTOP_SEAT and release by token. Run the gate unpiped and push on exit 0. Defer builds and
  full suites during an announced gate phase 2.
