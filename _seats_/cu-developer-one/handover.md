---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-10T10:15:00Z
level: L1
version: 3.16.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 10:15Z, 10 November.

## Landed

- Closed live: CU-398, CU-400, CU-401, CU-402/405, CU-406, CU-382, CU-395; #394, #418, #459 on main.

## Open (Highs first)

- CU-408: #504 (payments) both OKs, lands first. CU-409: #505 (positions, lending, approvals) in review.
- Batch, main merged and OK'd: #447 #448 #450 #453 #462 #469 #477 #478 #417; then #497 (Bid), #501 (CU-407).
- Guide #392 (OK): add remote-desktop/VM viewers after #450/#453, then complete.
- Practice: read inbox bodies in full; OKs as signed PR comments; run long/browser steps under the run-lock file guard; name each hand-resolved hunk.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; chain every step with && (a failed merge must stop).
- Write 'PR #n', never a closing keyword before #n; read the inbox for a ruling before pushing to an OK'd PR.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
