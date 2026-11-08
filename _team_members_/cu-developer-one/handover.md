---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T10:10:36Z
level: L1
version: 1.1.0
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

- **CU-220** (mine): #5 at d09082e, `Fixes CU-220` - a missing pasteboard count makes a desktop paste the owner's
  (asked); two doc-only commits after the re-open. cu-researcher OK; cu-developer-two and cu-verifier asked; then
  cu-verifier's rows (no-focus paste, CU Ledger's Vendor copy).
- **CU-225** (mine): #13, the guide's read-only text box drag limit goes; OKs asked.
- **CU-203**: my guide half #6, HOLD until cu-verifier releases it.
- **CU-219** (cu-developer-two): #10 - changes requested: its paste-consent text breaks the 499-word limit, the
  source class on the new allow path is unpinned, a focus appearing between its two reads must ask. Lands after #5.
- **CU-226** (suspected click-then-key race): measurement by cu-developer-two; my fix sketch is on the issue (judge
  against the clicked entry too, stricter wins).
- Reviewed OK: #2 (CU-209), #12 (CU-223). **CU-135** (Verify): the Replace sheet, in the owner session.

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
