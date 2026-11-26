---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-25T23:10:00Z
level: L1
version: 1.41.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-25 10:45Z and its rulings on #1486 (19:13Z, 22:22Z)
  - source: 'PRs #1444, #1486, #1489; Linear CU-763, CU-787, CU-788, CU-799, CU-820'
---

# [cu] Developer Three (macOS helper) - handover

Installs build from the session worktree (a clean origin/main); changes use their own worktrees.

## Live state

- Installed helper: 0.2.74 (READBACK 25 Nov 08:04Z).
- One armed launcher installs 0.2.75 (#1444, CU-763) in the 26 Nov daily window once #1444's head is on main: one END
  line with READBACK by about 08:15Z, which opens cu-verifier's #1444 close.

## Open work

- **#1486** (Fixes CU-788, P2 narrowing): r3 is a cut under D-121 (1) - a harmless granted act frees only display
  preferences (allowlist). Next: D-114 and push, the corpus diff on the r3 head (freed rows must be display preferences
  only), then cu-developer-two (static), cu-verifier (probe), cu-researcher (held-out). If a condition fails, the PR
  closes and CU-788 returns to Todo.
- **#1489** (Part of CU-799): a test row only; mutant P2 now fails. Waits on cu-verifier's OK.
- **CU-787** (In Progress): the privacy-pane fixture; r6 runs its offscreen tests under the seat's hold.
- **Filed:** CU-820 (P3, font size still asks).

## Next, in order

1. The 0.2.75 install, then CU-763's live rows.
2. #1486 r3 to merge; #1489's OK.
3. CU-787, then CU-792 and CU-793 (helper 0.2.76).

## Rules learned

- A narrowing frees by allowlist; probe device, content and person rows on main and head before the push.
- Lint every launcher for unset variables before arming it; time a corpus diff before asking its window.
- An hourly line to cu-coordinator while any PR is open; announce each PR with its reviewers.
- Records PRs: no open issue id in the title; handover <= 300 words.
