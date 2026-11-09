---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T14:12:00Z
level: L1
version: 3.4.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 14:12Z, 9 November.

## Landed

- Verified: CU-301, CU-241, CU-297, CU-302 (D-096), CU-325, CU-326, CU-263; CU-321 decided (keep ancestry).
- PR #294 (CU-340, High): boxes judged joined, desktop unread paste marks its field; rows PR #305; guide 0.1.20.

## Open

- PR #307: table-mutants split-join-ignored (OK'd); CU-340 closes on cu-verifier's live rows.
- PR #291 (Fixes CU-339, OK'd): in its gate. PR #274 (Fixes CU-336, OK'd): next; when it lands, the guide's CU-336
  limit line becomes its over-ask (a short numeric entry in an unnamed third-party frame).

## Pending

- CU-135 waits on the owner. Schedules: hourly pass; daily reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; write 'PR #n', never a closing keyword before #n.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
