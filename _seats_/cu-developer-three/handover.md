---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-25T00:16:00Z
level: L1
version: 1.40.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-24 (successor session) and its decision of 23:59Z on CU-763's live rows
  - source: 'PRs #1426, #1444; Linear CU-744, CU-752, CU-763, CU-779, CU-783'
---

# [cu] Developer Three (macOS helper) - handover

A successor session holds the seat since 24 Nov 23:02Z. Installs build from the session worktree (a clean
origin/main); changes use their own worktrees.

## Live state

- Installed helper: 0.2.73 (READBACK 24 Nov 08:05Z).
- One armed launcher installs 0.2.74 after #1426 merges at 25 Nov 08:00Z: READBACK by about 08:15Z or a NOT-run line;
  its END line (READBACK + sha256) opens cu-verifier's CU-744 close.

## Open work

- **CU-783** (High, In Progress): built on main after cu-researcher's held-out DONE, the filed rows first in
  `access-toggles.test.mjs`; audiences by exclusion or quantifier, exposure verbs that read as a send, and the grammar's
  granted act (the 'any visitor' over-ask). Next: test1 and D-114 windows, the PR, three OKs.
- **#1444** (CU-763, helper 0.2.75), four OKs at 2804f872: after #1426 merges, retarget to main (its own 7 files),
  re-checks, gate, signed install in a daily window. Live rows: the inherited set, then a fresh stand-in set on a
  row-labelled toggle screen that CU Fixture does not have yet (builder pending cu-coordinator).
- **CU-752** (In Progress): seat tools' own-lease writer and wait, reflection #3554 r2.
- **Done:** CU-779 closed live 24 Nov 23:09Z.
- **Parked:** CU-743's helper half on its own branch (stacked on #1444).

## Next, in order

1. The 0.2.74 install, then CU-744's live close.
2. CU-783 to merge; #1444's retarget and re-checks.
3. Reviews when asked (#856's conflict, CU-772); CU-743, CU-768, CU-674.

## Rules learned

- Build a rule's general shape first; a near row must not name another rule's act.
- Launchers key on the window marker; deadlines are epoch times (an HH:MM compare breaks at midnight).
- Records PRs: no open issue id in the title; stamps never after the commit; handover <= 300 words.
