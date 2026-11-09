---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T01:49:49Z
level: L1
version: 2.6.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 01:50Z, 9 November.

## Landed tonight

#178 (CU-301 Urgent), #168 (CU-241), #175 (CU-297) - all verified live; #180, #166, #156 (records).

## Open PRs (OK'd heads)

- #184 (CU-300 policy half, ca6257c; #181 stacks on it) and #174 (Fixes CU-263, 8221ead): OK'd, waiting for phase 2 (D-086).
- CU-302 (High, D-088), OK'd pairs: #195 ea2d8dd (autofilled submit asks) with #200 (driver); #202 b7e04ed (D-089 refusal) with #204 7b3fa6e (CU-322: only inWebArea false is outside); then #205 and the helper half.
- #190 (guide 0.1.13); this handover.

## Pending

- CU-302 live rows by cu-verifier after landing; name the Cmd-L-with-no-focus over-block in the limits (cu-researcher).
- #198's todo cell flips in #202 if #198 lands first.
- #184 restores two sensitive-classes precisions after #43 lands (Shift/Option keys; grounded_in sources).
- Guide next: the CAPTCHA hand-off (#174) and the AutoFill/desktop-browser lines (CU-302) once landed; 497 of 499 words.
- CU-135 waits on the owner's step 4; CU-252 on the Finder-shape stand-in (#165).
- Schedules: hourly pass; daily Session reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
