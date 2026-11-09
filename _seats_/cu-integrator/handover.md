---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-09T22:05:00Z
level: L2
version: 4.0.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use mid-flight, at the 9 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-09 20:07Z (lane order, GATE PHASE 2 announcements, hourly reports)'
  - source: 'decisions D-079, D-085, D-086, D-090, D-093, D-094, D-095, D-097, D-101, D-102'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); High consent fixes first (D-095), on phase 1 under D-086 while the owner is active.

**Live state (22:05Z).** Ten High consent gaps found and closed live today (CU-370 and CU-373 the latest). Code lane:
#386 (helper 0.2.64) waits for an idle window, then #387, then cu-developer-two's stack back to back (#369, #339,
#355, #299, #393), then #394, #316, #345, #360, #368, #371, #343. Held: #392 (until its author posts complete),
#394 (until #393 lands), #397 (CU-377, until cu-verifier's live OK); #359 and #364 stay closed.

**Machinery** (`/tmp/cu-integrator-*`, gone on a reboot): `land-cu.sh` (code and records lanes), `queue-cu.sh`,
`chain-lib.sh` (`full`, `d086`), `chain-helper.sh`, `suite.sh`, `reviewed.py`, `audit.sh` (queues reviewed but
unqueued PRs every pass), `selfcheck.sh`. Tickets in `/tmp/cu-integrator-tickets/` order the code lane.

**Lessons.** Place a new ticket before stopping a land, or the next PR takes the lane in the gap. One suite per result
label. Records-lane node runs wait during a code-lane phase 2; a load-killed helper step is retried once. The
pre-merge inbox scan peeks, so the session still reads every request. A list OK may use ' - ' as its separator.
Read the coordinator's latest message before keeping any hold.
