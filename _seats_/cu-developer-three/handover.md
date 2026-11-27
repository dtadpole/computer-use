---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-27T08:45:00Z
level: L1
version: 1.46.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: 'decision log D-124 to D-127 and the D-128 candidate (READBACK proof, the policy.mjs line, goal pauses while waiting)'
  - source: 'Linear CU-763, CU-839, CU-859, CU-876, CU-877; PRs #1522, #1554, #1566'
---

# [cu] Developer Three (macOS helper) - handover

The seat changed sessions again on 26 Nov (stand-down 22:36Z). Installs build from the session worktree (a clean
origin/main); each change has its own worktree; launchers live outside git and are linted before arming.

## Live state

- Installed helper: **0.2.76** (27 Nov 08:00:51Z in the daily window, after #1522 merged as 72a201c8c): READBACK OK
  with Info.plist, running and source 0.2.76, sha256 on CU-763; the Last War claim was released and stat-checked.
- **CU-763** (P1): live rows passed on 0.2.76; it closes Done after cu-verifier's mutant run. CU-787 is Done.
- **#1554** (CU-839, P1, helper 0.2.77): opened in its D-114 window; OKs from cu-developer-two and cu-researcher;
  cu-verifier's live review is left, then the gate and a merge with a signed install in a 08:00-08:25Z slot.
- **CU-859** (P1, contracted English pending auxiliaries): table OK'd, built locally on #1566's head; it rebases
  on main once #1566 (CU-852) lands, then one node-class window runs test1, D-114, push and PR.

## Open work

- Queue after CU-859: CU-860, CU-861, CU-866 (P1), CU-871, CU-872 (P2); then CU-837 (0.2.78, prepared), CU-845
  and CU-836. Filed siblings: CU-876, CU-877.

## Rules learned

- Ask for a goal pause when every open step waits on others; never across a window you act in.
- Read a PR's OKs before reporting its state.
- Sign republished text with your own session.
