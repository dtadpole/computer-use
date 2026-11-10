---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-10T06:00:00Z
level: L2
version: 5.11.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0600Z 10 Nov (goal refreshed 06:00Z; CU-400 closed live; CU-398/401/402 High in lanes)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe (default dir).

GOAL (cu-coordinator 06:00Z 10 Nov): (1) red-team every consent PR on one merge, loop-derived fields through the
loop (D-100, D-103); next: CU-398 seam + matrix on main after the install, CU-401 and CU-402 on main after landing;
rerun the kept matrices on each policy merge; (2) hunt under-asks, queue first, probe vs live (D-098); never press
a real Restart/Shut Down; (3) guide limits honest (D-092); (4) hourly report, this handover.

HUNT: closed CU-345..349, 352, 354, 355, 363, 365, 370, 377, 380, 381, 386, 392, 395, 400; open 361, 364, 373,
374, 378, 379, 382, 385, 387-389, 393, 394, 396-399, 401 (High). Kit: _tools_/probe-kit (#419, #432).

EVERY COMMAND: /tmp/cu-r-probe/probe.sh (guard, cd, set -e; D-104). Poll: /tmp/cu-r-probe/poll.sh (full bodies
and ids; read a ruling in full before asking again). Matrices and seams: /tmp/cu-r-probe/*-matrix.mjs, seam-*.mjs.

LESSONS: measure before any number or claim; probe the merge with edge inputs; kit targets carry every driver
field; a key's target and other loop fields go through throughLoop; a policy fix inert without its driver field
shows only in the real-driver seam (#463 vs #442); queue check in its own step.

RULES: never verify my own filings; CU_VERIFY_SEAT=cu-researcher; D-034 20.69 of 21 USD, no model run; gate
unpiped, push on exit 0; no CU-n in a title or branch unless it completes the issue.
```
