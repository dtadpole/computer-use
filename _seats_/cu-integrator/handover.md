---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-27T13:35:00Z
level: L2
version: 7.19.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on 27 Nov after the #1576 and #1578 gates: the policy line (#1579 next), the records lanes and the 28 Nov 08:00-08:25Z slot for #1554 (helper 0.2.77).'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 27 Nov 11:17Z (goal: #1574, #1576, #1554), 12:17Z (asks to a paused seat copy cu-coordinator) and 13:08Z (records queue order)'
  - source: 'decisions D-085, D-120, D-123, D-124, D-125, D-127, D-129, D-131'
  - source: 'member reviews rounds 106 and 107'
---

# [cu] Integrator - handover

**State (27 Nov 13:35Z).** Landed since 7.18.0, every code PR on a fresh two-phase gate with tree MATCH: #1566 (CU-852), #1574 (CU-854), #1576 (CU-857); records #1570, #1572, #1573, #1575, #1577, #1580, #1581. #1578 (CU-853) was gated at 13:22Z; its result is in the PR thread.

**Policy line.** One policy.mjs PR at a time. After each landing the next one merges main once, re-runs D-114 and its boundary cell, and its three reviewers re-OK the merge diff at the new head; the gate is queued only on those explicit re-OKs. Next: #1579 (CU-859), then cu-developer-two's CU-856 and CU-858, then #1521.

**Records.** Held-out batches land in order #3737, #3764, #3789, #3817, one lane each, as each gets a non-author OK at its head; member-review records follow. Landing notes name each OK with its author, head and the comment's own timestamp.

**#1554 (helper 0.2.77).** Three OKs stand at 8117f15b1. The 28 Nov slot: pre-run gate from 06:20Z, umbrella window 07:59:30-08:25Z, merge, the signed install, a READBACK carrying 0.2.77 and a sha256, then cu-verifier's 15-minute close. The closer counts only a true READBACK line and waits to 08:23:30Z; a late READBACK moves the close to the first slot after 08:25:30Z.

**Lessons.** Copy OK times from the comment, not the inbox. A wait guard that greps its own command line never starts.
