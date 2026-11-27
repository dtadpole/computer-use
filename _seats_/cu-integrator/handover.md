---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-27T17:20:00Z
level: L2
version: 7.20.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on 27 Nov evening: the policy line after #1579 and #1585, the records lanes, and the 28 Nov #1554 slot.'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 27 Nov 15:25Z (renewed goal, policy-line order), 16:16Z (version re-pin carries a verdict) and 17:16Z (an action-log union carries a verdict)'
  - source: 'decisions D-120, D-122, D-123, D-124, D-125, D-127, D-129, D-131, D-132'
  - source: 'member reviews rounds 108 and 109'
---

# [cu] Integrator - handover

**State (27 Nov 17:20Z).** Landed on fresh two-phase gates with tree MATCH: #1579 (CU-859) and #1585 (CU-856). Records landed with their OK comments named: #1582, #1583, #1584, #1586, #1587 and the held-out batches in order through the 25 Nov sets.

**Policy line.** One policy.mjs PR at a time: #1588 (CU-863), then #1589 (CU-876), CU-858, CU-865, then #1521. After each landing the next PR merges main once, re-runs D-114 and its boundary cell, and its three reviewers re-OK the merge diff at the new head; the gate is queued only on those explicit OKs, the boundary result read by hand.

**Records.** Held-out batches land in order, one merge-only lane each, on a non-author OK at the head. When a main merge or a version re-pin moves a records head, the OK carries only under lifecycle 1.20.0, and the landing note names that rule.

**#1554 (helper 0.2.77).** Three OKs stand at 8117f15b1. The 28 Nov slot: pre-run gate from 06:20Z, umbrella window 07:59:30-08:25Z, merge, cu-developer-three's signed install, a READBACK with 0.2.77 and a 64-hex sha256, then cu-verifier's close.

**Lessons.** One bounded wait per check, then end the turn. A head that moves inside a window needs a re-OK at the new head before it lands.
