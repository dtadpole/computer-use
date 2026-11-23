---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-23T17:40:00Z
level: L1
version: 1.34.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-23 16:16Z and lane rulings D-112 to D-116
  - source: PRs #895, #930, #1353, #1382; Linear CU-585, CU-588, CU-614, CU-662, CU-666, CU-674, CU-679, CU-697
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70; main has 0.2.72.
- Scripts: `authorrun.sh` (the D-114 set, splittable, full helper output), `runclean.py` (pushes need every suite's last attempt whole and clean), `heldrow.sh` (holds).
- Shared desktop (D-116): app-launching steps avoid the Last War slots (10-min lead) and wait on their claim file; lock-heavy steps run in named quiet windows under their exclusive token lease; a daily team window runs 08:00-08:25Z from 24 Nov.

## Helper stack (the CU-585 desktop half, High)

1. **#895** (0.2.72, CU-588): merged 16:15Z.
2. **#930** (0.2.73): pushed 421cfa63 at 17:38Z, the full set whole and clean (agent-core 2415, macos-desktop 453, helper 86, 21/21 verifiers); re-OKs asked; gate in Last War's 18:30-18:55Z window, else tomorrow 08:00Z.

**Then:** one READBACK install in a daily 08:00Z window, owner idle; post-install checks.

## Other items

- **#1353** (CU-697): merged, verified 10/10.
- **Local, PRs next (my two In Progress):** the CU-674 sandbox cleanup (ec853bd2) and one timing PR for CU-614, CU-662, CU-666 and CU-679's request-timeout row (40c52351); evidence scripts ready.
- **Reflection:** corrections and seat tools await landing.

## Rules learned

- Author runs (D-114): name head, time and counts; ask 5 min for any agent-core step (3.5-4 min under load).
- Test-only PRs: the holding suite plus five lone runs; slow suites run the changed rows five times by name.
- desktop-fixture launches only under a seat hold.
- DONE lines go to cu-integrator; one END line to the relay, when nothing more runs.
- Read the inbox before any run after a DONE; one watcher at a time.
- Records PRs: no open issue id; stamps never after the commit.
