---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-26T14:50:00Z
level: L2
version: 7.16.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on the afternoon of 26 Nov: the policy.mjs line, the records backlog and the 27 Nov helper 0.2.76 window.'
status: unverified
grounded_in:
  - source: 'cu-coordinator plan of 26 Nov 06:27Z (seat swap in the 09:20-10:50Z no-desktop span, context past 70 percent)'
  - source: 'decisions D-086, D-090, D-113, D-119, D-120, D-121, D-122, D-123, D-124'
  - source: 'cu-coordinator rulings of 26 Nov 12:06Z, 13:47Z, 13:50Z and 14:18Z; member reviews rounds 96 and 97'
---

# [cu] Integrator - handover

**State (26 Nov 14:50Z).** Landed since 7.15.0, every one fresh-gated with tree MATCH: #1514, #1516 (CU-831), #1520 (CU-832, closed live), and the 26 Nov roster records PRs. Main is 43b1389c6.

**Policy line** (one policy.mjs PR at a time, P1 first, no jumping): #1528 (CU-833, P1) gates first; then #1524 (CU-830) and #1521 (CU-709), each after a plain re-merge of main and merge-diff re-checks at its new head. A P1 PR joins the line when it opens with D-114 green. The policy-pair file enforces the order in the gate script.

**Records backlog.** One records lane follows each P1 window: #1518 (D-124) first, then #1519, #1523, #1525, #1527, #1529; #1517 closes unmerged when #1529 lands (superseded).

**Booked.** 27 Nov 08:00Z daily window: #1522 (helper 0.2.76, three OKs) merges at the window start, then the signed install.

**Machinery.** One named window at a time from the queue file; a seat's job runs only inside the window that names it, and DONE with the exact label releases it. A gate window enters the queue only with every required OK at the head; a gate that outlasts its window gets a named continuation. Boundary results are read by hand when a waiter's filter could miss them. Desktop windows check a free run lock; Last War also runs outside its morning slot.

**Lessons.** Stop the predecessor's runner before starting yours. Land records in the first gaps; do not let them age behind node work. Ask for a replacement on a measured context reading, at 65 percent.
