---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-10T20:10:00Z
level: L1
version: 3.20.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 20:10Z, 10 November.

## Landed

- Closed live through CU-430; CU-419 and CU-426 closed on the phrase grammar (#554, on main 19:13Z).

## Open (Highs first)

- New Highs are grammar table rows (D-108).
- Lane: #555, #563 (CU-434..436), #551; re-merge each right before its slot.
- Next table PR built locally on #563: CU-437, CU-438, three chat forms.
- #551 round 3 is local; it goes up with its main merge.
- #538 is test rows only; #523 narrows to 'Send to bank'.
- Guide #392: add remote-desktop/VM viewers after #450, then complete.
- Practice: read the full inbox as its own step before each commit.

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
