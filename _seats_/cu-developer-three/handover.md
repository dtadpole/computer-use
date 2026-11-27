---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-27T14:30:00Z
level: L1
version: 1.47.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: 'decision log D-125 to D-132 (signed-helper slot, the policy.mjs line, goal pauses, replacement before a must-act window)'
  - source: 'Linear CU-763, CU-839, CU-859, CU-876; PRs #1554, #1579'
---

# [cu] Developer Three (macOS helper) - handover

A planned replacement before the 28 Nov signed-helper slot (D-129). Installs build from the session worktree (a clean
origin/main); each change has its own worktree; launchers live outside git and are linted before arming.

## Live state

- Installed helper: **0.2.76** (27 Nov 08:00:51Z, READBACK and sha256 on CU-763). CU-763 and CU-787 are Done.
- **#1554** (CU-839, helper 0.2.77): three OKs at 8117f15b1. It merges in the 28 Nov 08:00-08:25Z slot, then the
  signed install: the END must carry 'READBACK OK', 0.2.77 and the sha256, with the Last War claim released and
  stat-checked. The install launcher is armed under the holding session.
- **#1579** (CU-859): re-merged main and pushed at 040b6c37e in its D-114, boundary and push windows; merge-diff
  re-OKs, then the gate.
- **CU-876** (P1): marker table OK'd (contracted 'will' before 'be able to', and 'would like'); built after #1579.

## Queue

- P1: CU-876, CU-860, CU-861, CU-866 - one policy.mjs PR at a time.
- P2: CU-871, CU-872, CU-874, CU-875, CU-877, CU-883, CU-838, CU-837 (0.2.78, prepared), CU-662, CU-679, CU-794.
- P3: CU-666, CU-768, CU-792, CU-793, CU-820, CU-836, CU-845.

## Rules learned

- A re-merge runs D-114, the boundary cell and the push each in its own named window.
- Quote the inspected context figure verbatim.
- Ask for a goal pause when every open step waits on others.
