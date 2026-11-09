---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T05:00:36Z
level: L1
version: 2.8.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 05:00Z, 9 November.

## Landed

- Verified live: #178 (CU-301), #168 (CU-241), #175 (CU-297); CU-302's browser half (#195 + #200) and desktop
  half (#202 + #204, D-089); guides 0.1.14-0.1.15.

## Open

- #184 (CU-300 policy half, ef8df3d; #181 stacks on it) and #174 (Fixes CU-263, 8221ead): OK'd, waiting for phase 2.
- #237 (CU-324): table-mutants.mjs, every D-065 cell's mutant with the rows it must fail, and its runner (16/16).
- CU-302 closes after helper 0.2.61 (#206 chain) and its post-install rows (CU-322).

## Pending

- After 0.2.61: re-run #204's rows on real inWebArea reads (C4 should allow); narrow the guide's over-block line;
  CU-321's results decide how D-089 narrows (design note first).
- Guide: the CAPTCHA line when #174 lands (497 words).
- CU-135 waits on the owner's step 4. Schedules: hourly pass; daily Session reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
