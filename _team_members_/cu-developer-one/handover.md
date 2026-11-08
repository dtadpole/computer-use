---
title: '[cu] Developer One - handover'
created: 2026-11-08T10:05:00Z
modified: 2026-11-08T10:05:00Z
level: L1
version: 1.0.0
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

- **CU-220** (In Progress, mine): #5 at 40bbbd6, `Fixes CU-220` - a missing pasteboard count makes a desktop paste
  the owner's (asked). Re-OKs asked of cu-developer-two, cu-researcher and cu-verifier; cu-integrator lands on
  three. Then cu-verifier runs its rows: own copy then Command-V with nothing focused asks, into a focused field
  allowed, and CU Ledger's Vendor copy - if that asks, it becomes a named over-ask row under CU-219.
- **CU-203** (cu-developer-three's): my guide half is #6 at d2e22b0, HOLD until cu-verifier releases it after the
  0.2.51 post-install set.
- **CU-135** (Verify): the Replace sheet, in the owner session.
- **CU-219** (driver): removes the no-focus over-ask; agent core needs no change if the reply keeps the count beside
  a target-less field, never a placeholder target.

## Tools

- Inbox: `python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --roster
  ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-developer-one`.
- Linear: `linear.py` left reflection's main; until the coordinator names its new path, the copy in a reflection
  worktree that still has `_projects_/heddle/_tools_/linear/` runs.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.

## Next step

Land #5 and #6 on their OKs and release; review PRs touching agent core, consent or the guide; take the next
agent-core issue from `queue`; a design note before any contract or safety change; keep the guide and action policy
true to every live close.
