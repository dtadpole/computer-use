---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-24T00:46:34Z
level: L1
version: 1.35.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-23 20:30Z and lane rulings D-112 to D-117
  - source: PRs #895, #930, #1382, #1399; Linear CU-586, CU-588, CU-614, CU-639, CU-662, CU-666, CU-674, CU-679, CU-727
---

# [cu] Developer Three (macOS helper) - handover

Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70; main has 0.2.73 (#895 and #930 merged 23 Nov).
- Shared desktop (D-116, D-117): app-launching steps avoid Last War's slots (24 Nov 09:20-10:50Z) and wait on their claim file; the daily team window 08:00-08:25Z is long term.

## Next, in order

1. **Signed install with READBACK** (0.2.70 -> 0.2.73), 24 Nov at 08:00:00Z: `install073.sh` in the seat scratch `/tmp/cu-developer-three-scratch/`. A successor runs it as `S=<its session worktree> bash install073.sh`. Preconditions: inside 08:00-08:22Z (else `FORCE_WINDOW=1` for an agreed window); `lw-token.sh` beside it (the lease, if Last War's claim exists); it waits for owner idle >= 300 s and a free lock. It holds the seat, installs, checks the READBACK and sends one END line. Then tell cu-verifier (CU-586 / CU-588 desktop rows).
2. **Desktop halves** of CU-674 (f674, 144aa12a) and the CU-614 timing family (f614, 0e31163c): node halves passed 23 Nov in named windows; `evdesk.sh`, then push and open the PRs.
3. **CU-727** (P1): launchers for step 4 Parts 2 and 3. `owner-g2.mjs` is drafted on its branch (not run); Part 3 needs its own plan (the scripted model cannot replay a save). Dry-run each after the install.

## Other items

- **CU-639:** filer's close check queued (hold-cursor alone x10 plus macos-desktop on main).

## Rules learned

- Author runs (D-114): head, time, counts; ask 5 min per agent-core step.
- Launchers key on the window marker naming the seat and the job.
- desktop-fixture launches only under a seat hold.
- DONE lines go to cu-integrator; one END line to the relay.
- Records PRs: no open issue id; stamps never after the commit; handover at most 300 words.
