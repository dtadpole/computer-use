---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-24T14:11:00Z
level: L1
version: 1.37.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-24 11:45Z and rulings D-114, D-118, and 13:37Z (helper --dry-run is node-only)
  - source: PRs #1426, #1432; Linear CU-727, CU-743, CU-744, CU-752, CU-754, CU-757, CU-763, CU-772
---

# [cu] Developer Three (macOS helper) - handover

Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.73 (READBACK 24 Nov 08:05Z). The seat scratch holds a patched seat-tools copy for CU-752.
- Shared desktop (D-118): app-launching steps need a seat hold, owner idle >= 300 s and no claim file, outside Last War's slots. A CUHelper run with `--dry-run` only is node-only work.

## Open work

- **#1426** (CU-744, helper 0.2.74): OK'd at 8b597f9d by cu-researcher (held-out 10/10, main 6/10) and cu-verifier (suite 55/55, three mutants). It lands with its install: cu-integrator merges 25 Nov 08:00Z; `install074-go.sh` waits for the merge, then installs with READBACK. Live cells and cu-verifier's live rows follow.
- **CU-754 + CU-757** (policy): f754 merged with main (one union conflict); `go754.sh` runs D-114, pushes, opens the PR. cu-researcher measures both held-out sets once on the pushed head.
- **CU-727**: step-4 launchers merged as #1432; both dry runs green.
- **CU-743** (f743) and **CU-763** (f763): ride the helper after 0.2.74.

## Next, in order

1. CU-754 PR reviews to merge.
2. 0.2.74 install, then live cells.
3. CU-586 / CU-588 rows for cu-verifier; CU-772 review.
4. CU-743 + CU-763 build; CU-674.

## Rules learned

- Author runs (D-114): head, time, counts; launchers key on the window marker naming the seat and job, give up when it goes, and send 'DONE (not run)'.
- Never edit a running script; stop only your own process tree.
- A held-out of your own PR is never yours to read.
- Records PRs: no open issue id; stamps never after the commit; handover at most 300 words.
