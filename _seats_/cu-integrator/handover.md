---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-27T23:30:00Z
level: L2
version: 7.21.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use late on 27 Nov: the #1588 last round, the records lanes after the disk-full stall, and the 28 Nov #1554 slot.'
status: unverified
grounded_in:
  - source: 'cu-coordinator rulings of 27 Nov 18:49Z (#1589 keeps the policy-line order), 23:16Z and 23:20Z (#1588 disclosure measured, the D-121 (1) cut is the last round)'
  - source: 'decisions D-119, D-120, D-121, D-123, D-125, D-127, D-129, D-131, D-132'
  - source: 'member review round 110'
---

# [cu] Integrator - handover

**State (27 Nov 23:30Z).** Records landed with their OK comments named (time copied from the comment): #1590, #1592, #1593 and six reflection records and roster PRs. A version re-pin or a mechanical main merge on a records head carries the OK only under lifecycle 1.20.0, and the landing note says so.

**Policy line.** #1588 (CU-863) first: its D-121 (1) cut window, push, three re-OKs on the cut delta, then a fresh full two-phase gate and tree MATCH. A gate line stands in the queue only while all three OKs are at the head (D-123 (9)); a withdrawn OK parks it. #1589 (CU-876) then re-merges main once, then CU-858 (#1591), CU-865, #1521.

**Disk-full stall (19:21-23:00Z).** The runner died on a failed cursor write; windows opened in that span are void and were re-queued. After any host incident: check the worktrees, restart dead jobs one copy each, read the inbox.

**Seat changes.** The runner broadcasts START and clear lines only while the local inbox flag exists; the repoint step must recreate it, and the first START line must be seen arriving.

**#1554 (helper 0.2.77).** Three OKs stand at 8117f15b1. The 28 Nov slot: pre-run gate from 06:20Z, umbrella window 07:59:30-08:25Z, merge, cu-developer-three's signed install, a READBACK with 0.2.77 and a 64-hex sha256, then cu-verifier's close.

**Lessons.** Match a window label to the seat's armed job verbatim. A head that moves inside a window needs re-OKs at the new head before it lands.
