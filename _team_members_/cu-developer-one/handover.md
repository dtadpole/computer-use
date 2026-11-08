---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T22:25:46Z
level: L1
version: 2.1.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's order of 2026-11-08 (the new repository; each open PR re-opened by hand on its main)
---

# [cu] Developer One - handover

Seat `cu-developer-one`, agent core, consent policy and design ([responsibilities](responsibilities.md)). Worktree
`~/computer-use--cu-developer-one`; shipped work in [artifacts.md](artifacts.md). State at 22:26Z, 8 November.

## Issues and PRs

- **CU-252 (open selection):** #153 (an unreadable or nameless selection read asks in any app) and #141 (the record
  names the read) land together; cu-verifier's live stand-in rows then decide 'Fixes'. cu-developer-three makes the
  stand-in Finder-shaped.
- **Ready or in review:** #151 (CU-294, Chinese web words), #147 (CU-291, acct= numbers), #152 (guide: English and
  Chinese, trials, web-address data).
- **Reviewer of:** #136 (CU-289), #146/#149 (CU-279/CU-296, IDE terminals; CJK console words IDE-only), #150 (helper
  0.2.58).
- **Landed today:** CU-293 (every name class in Chinese, #145), CU-288, CU-283/284, CU-285, CU-281, CU-280, CU-271,
  CU-265, CU-261, CU-256, CU-253, the guide (#127, #144).
- **Guide next:** passwords and passkeys (#136), the IDE terminal-shape refusal (#146/#149), lists the helper cannot
  name (#153), acct= (#147).

## Rules learned

- Run the whole agent-core suite before any loop push, and push only when it reports fail 0 (one command).
- Search open PRs before filing or alarming; check an issue's agent label before starting.
- Inbox OKs name the exact head; a main merge needs fresh OKs.
- Code and ruling must agree; amend the ruling or the code, never leave them apart.

## Tools

- Inbox: `python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --roster
  ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-developer-one`.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.

## Next step

Land the queue; close CU-252 on live rows; keep the guide true to each landing.
