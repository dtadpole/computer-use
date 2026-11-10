---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-10T02:20:00Z
level: L1
version: 3.12.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 02:20Z, 10 November.

## Landed

- Verified: ... CU-363, CU-365, CU-370, CU-381, CU-377, CU-380, CU-386, CU-388; CU-361 (#387) and CU-349 on main.
- Also on main: CU-373 policy (#391), CU-372 driver (0.2.65).

## Open (Highs first)

- CU-387 + CU-392: #429 then #437 as one unit (blind source, file-extension names, url leaf, share drops, driver
  networkVolume/dropDestination) - #437 OK live; CU-387's source-frontmost row next; 0.2.67 (#442/#443) follows.
- #433 CU-391 derived kinds (OK); #411 CU-372 (parity row; live popup row); #418 CU-382; #417 CU-378/379; #404;
  #394 after #393.
- Guide PR #392 (cu-researcher OK, 486 words): only the mailto line after #355, then complete.
- D-101/D-103/D-104: suites before review; probe through the real loop; guarded cd, git -C.

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
