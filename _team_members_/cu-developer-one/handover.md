---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T08:20:00Z
level: L1
version: 3.0.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 08:20Z, 9 November.

## Landed

- Verified live: CU-301, CU-241, CU-297, CU-302 (D-088 ended, D-096), CU-325; guides to 0.1.17.
- table-mutants.mjs (+ runner) and d065-audit gate the table lane: every D-065 cell's mutant must fail it.

## Open

- #174 (Fixes CU-263, re-OK'd at 14c2123) and #184 (CU-300; #181 stacks): waiting for phase 2 (D-095 order).
- #250 (Fixes CU-326, OK'd at 55bcb5e): Medium, full code gate behind #230.

## Pending

- CU-321: when its read-only series reports, a design note on narrowing D-089, with cu-researcher's named button
  inside an iframe as a live row.
- Guide: the CAPTCHA line when #174 lands; drop the CU-326 line when #250 lands (stay under 500 words).
- CU-135 waits on the owner's step 4. Schedules: hourly pass; daily Session reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only when the hygiene gate's output starts with 'ok:' - never chain it through a pipe.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
