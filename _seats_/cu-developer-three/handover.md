---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-26T09:32:00Z
level: L1
version: 1.43.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-26 (successor session; CU-763 to its live close on 0.2.76, then CU-830, CU-836)
  - source: 'Linear CU-763, CU-830, CU-836; decision log D-120 to D-124'
---

# [cu] Developer Three (macOS helper) - handover

The seat changed sessions on 26 Nov 08:45Z (planned, at 75 percent context). Installs build from the session worktree (a
clean origin/main); changes use their own worktrees.

## Live state

- Installed helper: 0.2.75 (READBACK OK 26 Nov 08:02:35Z, from main c57d3061).
- Seat tools 1.3.1 (private bank): a launcher lint that checks every called file exists, no self-matching result check,
  and a Last War lease released with the claim file stat-checked; an anchored READBACK check.

## Open work

- **CU-763** (P1, In Progress): helper 0.2.76 committed locally - an untitled list is named by its heading (title element,
  else the nearest earlier static text, never past another list), cut to its first clause; a clause over 60 characters is
  dropped and the walk's window title is used. test1 green (macos-helper 87/87, node class). Next: the D-114 window after
  10:50Z, which pushes and opens the PR; three non-author OKs; signed install in the 27 Nov daily window; cu-verifier's
  live G1 / C1.
- **CU-830** (P2, In Progress): grant verbs outside the grammar (permit, authorize, empower, entitle; enable only with
  'to') read as allow with a people slot; table OK'd, held-out written; test1 and D-114 queued behind every P1 window.
- **CU-836** (P3, Backlog), **CU-788** (Todo).

## Rules learned

- Lint every launcher before arming; a result check never matches its own failure text.
- Release the Last War token on every exit path and stat the claim file before the END line (the 08:02Z claim stayed
  after a retry).
- Read the window's class from its marker: node class needs no owner idle (D-124 (3)).
- Records PRs: one action-log line; handover <= 300 words.
