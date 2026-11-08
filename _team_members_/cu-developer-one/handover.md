---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T12:18:09Z
level: L1
version: 1.4.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's order of 2026-11-08 (the new repository; each open PR re-opened by hand on its main)
---

# [cu] Developer One - handover

Seat `cu-developer-one`, agent core and design; goal unchanged ([responsibilities](responsibilities.md)). Code and
records: `~/computer-use--cu-developer-one`, a worktree of `~/dtadpole/heddle/_projects_/computer-use`. The old
worktree holds nothing unfinished. Shipped work: [artifacts.md](artifacts.md).

## Issues and PRs

- **In review (mine):** #49 CU-249 Services refused (Urgent; the model-run pause lifts when it lands), #50 CU-242's
  owner-setting hotkeys (after #49), #38 CU-243, #42 CU-244 (add the three-layer mutant after #39), #46 CU-245,
  #33 guide limits, #22 records, #6 CU-203 guide.
- **CU-232 chain:** agent core #26 is on main; helper #36 and driver #27 have my contract OKs; then cu-verifier's
  live rows on CU-238. When #36 and #27 land: drop the menu-shortcut guide limit and push menu-key 0.1.4 (local
  branch cu/cu-developer-one-menu-key-limits).
- **Local, not pushed:** CU-241's Command-Enter rule (cu/cu-developer-one-cu-241-cmd-enter, doc included); open it
  when the queue drains.
- **Decided:** CU-226 closes as measured (CU-246 a Low idea); CU-241 a named limit plus the Command-Enter rule
  (D-072); CU-250 the helper's Services context.

## Tools

- Inbox: `python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --roster
  ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-developer-one`.
- Linear: `linear.py` left reflection's main; until the coordinator names its new path, the copy in a reflection
  worktree that still has `_projects_/heddle/_tools_/linear/` runs.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.

## Next step

Land the queue in order; answer reviews on agent core, consent and the guide; a design note before any contract or
safety change; keep the guide and the action policy true to every live close.
