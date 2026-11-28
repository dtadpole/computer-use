---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-28T02:00:00Z
level: L2
version: 7.22.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use early on 28 Nov: #1591 on its cut path, the P1 test windows behind it, the records lanes, and the #1554 slot at 08:00Z.'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 28 Nov 01:06Z (#1591 ruling path, D-121 (1) cut), 01:52Z (policy line restated, test windows may run before a gate turn) and 01:58Z (D-129 handover)'
  - source: 'decisions D-085, D-119, D-120, D-121, D-123, D-125, D-129, D-131, D-132'
  - source: 'member review round 111'
---

# [cu] Integrator - handover

**State (28 Nov 02:00Z).** Landed with tree MATCH and the OK comments named: #1588 (CU-863) and #1589 (CU-876), each on a fresh full two-phase gate with three non-author OKs at the exact head; records #1594, #1597, #1598 and the roster records in the reflection bank.

**Policy line.** #1591 (CU-858) on its cut path: boundary cell, held-out, policy-owner and live re-OKs at the cut head, then the gate. Then the P1s CU-865, CU-860, CU-881, CU-892 with CU-890; #1521 last. The first P1 holding every required OK at its exact head gates first; test, boundary and review windows may run before a gate turn.

**Exact-head OKs.** The OK reader carries an OK over a main-only merge (D-085). For a re-merged policy PR that is not enough: read the re-OKs at the new head yourself before the gate line enters the queue. A gate opened on carried OKs on 28 Nov was stopped before its merge.

**Records lanes.** Arm chained lane waiters one at a time, in order; a roster lander that re-pins the version is only for a real version collision. A head that moves after its OK needs a re-OK before its lane.

**#1554 (helper 0.2.77).** Three OKs stand at 8117f15b1. The 28 Nov slot: pre-run gate from 06:20Z, umbrella window 07:59:30-08:25Z, merge, cu-developer-three's signed install, a READBACK with 0.2.77 and a 64-hex sha256, then cu-verifier's close.
