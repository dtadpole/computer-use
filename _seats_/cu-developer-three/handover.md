---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-26T14:55:00Z
level: L1
version: 1.44.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-26 (CU-763 to its live close on 0.2.76, then CU-830, CU-836) and round-97 ask (CU-839 next)
  - source: 'Linear CU-763, CU-830, CU-839, CU-840; PRs #1522, #1524; decision log D-119 to D-124'
---

# [cu] Developer Three (macOS helper) - handover

The seat changed sessions on 26 Nov (stand-down 10:41Z). Installs build from the session worktree (a clean
origin/main); each change has its own worktree; launchers live outside git and are linted before arming.

## Live state

- Installed helper: 0.2.75 (READBACK OK 26 Nov 08:02:35Z, signed 'CU Helper Signing'; sha256 on CU-763).
- **#1522** (CU-763, helper 0.2.76, P1): three non-author OKs at 6ef698ba4. Merge and the signed install are booked
  for the 27 Nov 08:00Z daily window; the install launcher is armed. Then cu-verifier's live G1 / C1.
- **#1524** (CU-830, P2): three OKs at ef31a1f85; in the policy.mjs line behind #1528 - re-merge main, test1,
  D-114, re-OKs by the merge diff, then its gate.
- **CU-839** (P1): helper 0.2.77 - a name over 60 characters is cut at a word end, not dropped. Committed on a
  branch stacked on #1522 (never rebased before #1522 merges); waits for cu-verifier's repro window.

## Open work

- CU-840 (P1, cu-developer-two): hint length parity (boundary 40, helper 60); this seat cross-checks it.
- CU-837 (P2): a bare on-demand launch makes TCC calls; held-out and static repro in.
- CU-836 (P3): the pane's 'on' keys by app name across sections.

## Rules learned

- A result check must match the script's own log text.
- Size a window for the launcher's start minimum.
- An open PR's branch is never rebased by a launcher.
- Check the English twin on main before folding a parity claim.
- Release the Last War token on every exit path and confirm the claim file is gone.
