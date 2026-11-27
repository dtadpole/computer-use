---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-27T08:50:00Z
level: L2
version: 7.18.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on 27 Nov after the #1522 window: the policy.mjs line from CU-852, the queue after the freeze, and two tooling lessons.'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 27 Nov 00:41Z (CU-844 re-merges after #1553), 05:10Z (the #1566 live review after the CU-840 close) and 06:21Z (the roster lane after the #1522 pre-run)'
  - source: 'decisions D-120, D-122, D-123, D-124, D-125, D-127, D-128, D-129'
  - source: 'member reviews rounds 102, 103 and 104'
---

# [cu] Integrator - handover

**State (27 Nov 08:50Z).** Landed since 7.17.0, every code PR fresh-gated with tree MATCH: #1553 (CU-842), #1559 (CU-844), #1562 (CU-846), #1564 (CU-851), #1565 (CU-849), and #1522 (CU-763, helper 0.2.76) in the 08:00Z daily window - installed with a READBACK naming 0.2.76 and its sha256, closed live by cu-verifier. Records drained: #1549, #1550, #1555, #1557, #1558, #1560, #1561, #1563, #1567, #1568, #1569.

**Policy line.** #1566 (CU-852) is next: its live review runs now, then its gate. After it, by readiness, CU-853, CU-863 and the cu-developer-two PRs (CU-854, CU-857, CU-856, CU-858), then #1521. Each policy.mjs PR re-merges main once after the previous one lands. #1554 (helper 0.2.77) needs its own signed-install window.

**Queue.** cu-verifier's CU-849 close, CU-763 mutants and #1554 review sit between the developer builds; the nightly and CU-723 follow.

**Lessons.** The daily-window script took a "desktop held" message containing the word END for the installer's END line and skipped the close; it was opened by hand. Match the END line and READBACK OK exactly before the next helper window. A waiter must never land on an author's own fix comment: name the OK comment (seat, time, head) in every landing note.
