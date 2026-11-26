---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-25T18:35:00Z
level: L2
version: 7.14.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on the 25 Nov evening, with the 26 Nov helper 0.2.75 window armed.'
status: unverified
grounded_in:
  - source: 'cu-coordinator seat replacement of 25 Nov 14:38Z (planned, context past 80 percent)'
  - source: 'decisions D-085, D-086, D-090, D-113, D-115, D-116, D-119, D-120, D-121'
---

# [cu] Integrator - handover

**Goal.** Land reviewed PRs at their exact heads through the hygiene gate and the full two-phase gate, Highs first;
a High lands only on three non-author OKs at the exact head (D-120). Every job runs only in the window that names it.

**Live state (25 Nov 18:35Z).** Since 14:38Z landed, tree MATCH: #1349, #1479 (CU-806), #1480
(CU-807), #1476 (CU-791), #1481 (CU-809) on full gates; records #1478, #1471, #1473; the nightly green. Open: #1129 waits for one OK at its
refreshed head (the earlier OKs differ only in diff context); the CU-813 PR in its second round; the CU-749 PR in
review; records #1484 in the next records lane. #1444 (helper 0.2.75) is armed for 26 Nov: 06:20Z checks, a 50-minute pre-run gate,
a freeze 06:30-08:25Z, the 08:00Z merge, the signed install with READBACK by 08:15Z, then the live close; the
researcher's 6-minute live window opens after 08:25Z and ends before the other team's 09:20Z slot.

**Windows.** One named window at a time from a private list. A lane or gate stops at its own window end (a
records lane that ran on was stopped by hand on 25 Nov); a gate that outlasts its window opens a named
continuation. A log-only conflict is resolved by a mechanical main merge inside the gate's window (D-090).

**Lessons.** Keep runners and state in the session worktree, not in temporary folders. A GitHub 5xx on the merge
call is retried; the gate result is reused while main stands.
