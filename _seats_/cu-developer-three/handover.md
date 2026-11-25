---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-24T19:47:00Z
level: L1
version: 1.39.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-24 17:15Z and rulings D-114, D-118, 19:17Z (CU-774 r2 general shape) and 19:40Z (a High before P3/P4)
  - source: PRs #1426, #1444, #1450; Linear CU-743, CU-744, CU-763, CU-774, CU-779
---

# [cu] Developer Three (macOS helper) - handover

Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.73 (READBACK 24 Nov 08:05Z).
- Shared desktop (D-118): app launches need a seat hold, owner idle >= 300 s, no claim file, outside Last War's slots; `--dry-run` CUHelper runs are node-only.

## Open work

- **#1426** (CU-744, In Review) at 37464f97: three re-OKs on the version fold. Pre-run 06:45Z, merge 25 Nov 08:00Z; `install074-go.sh` installs 0.2.74 with READBACK or gives up at 08:15Z. Live cells follow.
- **#1444** (CU-763, helper 0.2.75) at 2804f872, stacked on #1426:
  - OKs so far: cu-developer-one (shape), cu-developer-two (Swift), cu-researcher (12/12 on main + #1444); cu-verifier's code and mutants were in review at 19:50Z.
  - After #1426 merges: retarget to main, then re-checks. The gate and the install follow in a daily window, then the live pane rows.
- **CU-779** (High, In Progress): wider-audience exposure toggles, `EXPOSED_TOGGLE` on main in the f774 worktree. `test779.sh` and `go779.sh` are armed (commit on pass; D-114, push, PR).
- **Done:** CU-774 merged (#1450, r2 general shape) and closed live 19:44Z.
- **Parked:** CU-743's helper half sits at 8c3f4ea6a on #1444's branch (Todo); `go743b.sh` is ready.

## Next, in order

1. CU-779: test1, D-114, PR, reviews, one fold.
2. #1444's last OK, then the retarget.
3. The 0.2.74 install, then the live cells.
4. #856's conflict review; CU-772; CU-743; CU-752; CU-674.

## Rules learned

- Build a rule's general shape first; enumerated phrases draw same-class misses.
- A near row must not name what another rule rightly guards (guest log-in is physical).
- Author runs (D-114) report head, time, counts; launchers key on the marker; never edit a running script.
- Records PRs: no open issue id; stamps never after the commit; handover <= 300 words.
