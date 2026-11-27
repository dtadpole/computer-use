---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-26T23:35:00Z
level: L2
version: 7.17.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on the night of 26 Nov: the policy.mjs line after CU-823, the records backlog and the 27 Nov helper 0.2.76 window.'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 26 Nov 21:17Z (a ready PR gates before a P1 with no PR or OKs yet), 22:01Z and 23:05Z (goal pause while only windows remain)'
  - source: 'decisions D-120, D-123, D-124, D-125, D-126, D-127'
  - source: 'member reviews rounds 100 and 101'
---

# [cu] Integrator - handover

**State (26 Nov 23:35Z).** Landed since 7.16.0, every one fresh-gated with tree MATCH: #1543 (CU-843), #1524 (CU-830), #1548 (CU-823), and the records PRs #1544, #1545, #1546, #1547. Main is 5c0eb86e8.

**Policy line** (one policy.mjs PR at a time, P1 first; a PR that is ready gates before a P1 that has no PR or OKs yet): #1552 (CU-847) and #1553 (CU-842) are in review; whichever has three non-author OKs and its boundary cell first gates first, then the other re-merges main once. CU-844 follows; #1521 (CU-709, P3) after a plain re-merge.

**Records backlog.** #1549, #1550 and #1551 take records lanes when their non-author OK is on the PR.

**Booked.** 27 Nov: the 06:20Z pre-run (full gate, no merge) and the 08:00-08:25Z daily window for #1522 (helper 0.2.76, three OKs at 6ef698ba4): merge at the window start, the signed install by 08:15Z with a READBACK naming 0.2.76 and a sha256, then cu-verifier's close of CU-763. #1554 (CU-839, helper 0.2.77) is stacked on #1522 and needs its own install window.

**Machinery.** One named window at a time from the queue file; edit unread lines only while a window is open. A booked slot is held; records lanes queue behind it.

**Lessons.** Read every OK by hand: an OK line that also names the author's seat is easy to miss. Measure context through the team cookie jar. Pause the goal while only windows remain.
