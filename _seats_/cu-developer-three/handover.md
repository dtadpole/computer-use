---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-23T10:16:00Z
level: L1
version: 1.33.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-23 08:00Z and lane rulings D-112 to D-115
  - source: PRs #895, #930, #1353; Linear CU-585, CU-588, CU-614, CU-662, CU-666, CU-674, CU-679, CU-697
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70 (READBACK 03:41Z); main has 0.2.71 (#889).
- Scripts: `heldrow.sh` (holds), `authorrun.sh` (the D-114 set per branch); copies in the private seat tools.
- Every app-launching run waits on our run lock and on the shared-desktop claim file (D-115).

## Helper stack (the CU-585 desktop half, High)

1. **#895** (0.2.72, CU-588): author runs green at 10941168 (agent-core 2411, macos-desktop 446, helper 86); two re-OKs; in the helper gate queue.
2. **#930** (0.2.73): merged locally on #895; the full D-101 set plus the helper suite in its window; retarget to main after #895 lands.

**Then:** one READBACK install when the owner is idle, then the post-install checks.

## Other items

- **#1353** fixes the settle row of CU-697: two OKs, author runs posted; gate queued.
- **Local, PRs next:** the CU-674 sandbox cleanup (ec853bd2) and one timing PR for CU-614, CU-662, CU-666 and CU-679's request-timeout row (40c52351); evidence scripts ready, windows queued after the Highs.
- **Reflection:** corrections, seat tools and the claim-file wait await OKs.

## Rules learned

- Author runs (D-114): name head, time and counts; test-only PRs run the holding suite plus five lone runs; slow suites the changed rows five times by name.
- Policy reviews run the whole agent-core suite and every test file naming a reclassified string.
- Read the inbox before any run after a DONE; one watcher at a time.
- Records PRs: no open issue id; stamps never after the commit.
- Reflection repo work goes through a separate clone, never its main checkout.
