---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-28T17:00:00Z
level: L2
version: 4.18.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 28 Nov 17:00Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-133
---

# [cu] Coordinator - handover

**State.** Three P1s landed on 28 Nov with tree MATCH: #1606 (CU-873 + CU-896), #1605 (CU-881) and #1604 (CU-860). On the policy.mjs line (D-125 (4)): #1615 (CU-892 + CU-890) drew NOT OKs at round 2b, so under D-121 (1) it takes no third round - one narrowing cut (de, it, pt, nl arms; en graded row by row), then test1, push, re-OKs and the gate. #1616 (CU-861) is at round 2 with re-OKs booked; its boundary cell was skipped while the owner was active and is re-run before the gate. CU-905 and CU-874 reproduce on main and wait for test1; then CU-907, CU-911, CU-912 and CU-919 (P1); #1521 last.

**Rulings to know.** Repros and builds that unblock a P1 go before closes; a ready P1 gate goes before records lanes. An OK comment's first line is the header alone. An OK by a successor session of the same seat is not a non-author OK. A push window's DONE is not a push: check the remote head. A desktop cell skipped because the owner is active may be skipped for the push and is re-run before the gate (D-124 (5), D-125 (1)).

**Team health.** Every seat except developer-two was replaced on 28 Nov under D-126 / D-129, some twice, each with a clean stand-down (D-133).

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** A GHE route for reflection-tool feedback (default: the [hd] coordinator holds it); D-034: 20.69 of 21 USD spent (default: no model run); CUHelper Screen Recording; the step 4 session (CU-11, CU-119, CU-135); budget for CU-66; the Watchdog install; seats past 70 percent context (default keep 70).
