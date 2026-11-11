---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-11T08:00:00Z
level: L1
version: 3.24.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 08:00Z, 11 November.

## Landed

- Closed or in Verify through CU-483: #609 #610 #613 #614 #617 #622 #623 #627 #630 #633 tonight; CU-479 closed.

## Open (Highs first)

- Lane: #640 (CU-485), #635 (CU-484), #642 (CU-486), #643 (CU-488 unit), then table PR 13 (CU-487, built).
- Merge main only when cu-integrator asks, never onto a PR holding the lane.
- Older classes are never lowered: name them for CU-429.
- After the lane: #523 (hand merge built), CU-462 (built), CU-432, CU-433, #558, the 0.2.70 seam.
- Guide #392: add remote-desktop/VM viewers after #450.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; chain every step with && (a failed merge must stop).
- Write 'PR #n', never a closing keyword before #n; read the inbox for a ruling before pushing to an OK'd PR.
- Check a claim in the code before sending it; run the full suite on the exact tree you push.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`); also the old store until REF #6167 merges them.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
