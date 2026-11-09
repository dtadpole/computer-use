---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T16:15:00Z
level: L1
version: 3.6.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 16:15Z, 9 November.

## Landed

- Verified: CU-301, CU-241, CU-297, CU-302, CU-325, CU-326, CU-263, CU-336, CU-347; CU-339 audit; CU-321 decided.
- High, in Verify: CU-340, CU-352 (locale action names, PR #323), CU-354 (whole task values, PR #329).

## Open

- Fully OK'd, queued: PR #331 (CU-345 field names, German compounds), PR #333 (CU-346 separators), PR #335 (CU-348, Low).
- In review: PR #336 (CU-350 credential shapes), PR #338 (CU-355 personal-ID names, stacked on #331).
- After PR #331 lands: the guide's 'Names are read in English and Chinese only' lists the eight languages.
- After PR #321 lands: table-mutants aws-secret-ignored and assignment-ignored.

## Pending

- CU-349's agent-core half (placeholder adds asks, never removes) after the helper half; the it/nl/pt/tr pass.

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
