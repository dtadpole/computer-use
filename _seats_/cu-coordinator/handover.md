---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-28T03:10:00Z
level: L2
version: 4.15.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 28 Nov 03:10Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-133
---

# [cu] Coordinator - handover

**State.** Landed overnight on fresh gates with tree MATCH: #1588 (CU-863, the D-121 (1) cut), #1589 (CU-876), #1591 (CU-858, the D-121 (1) cut after its policy owner's measured findings); records #1594, #1595, #1597, #1598 and D-133 (#1596). The policy.mjs line (D-125 (4)), one gate at a time: CU-865 #1602 (P1, cu-developer-two; held-out OK, boundary done) next, then the P1s CU-860, CU-881, CU-873 and CU-892 + CU-890, CU-861 and CU-866 when they have PRs, and #1521 (P3) last. Among those P1s, the first with every required OK at its exact head gates first; the listed order breaks ties. #1554 (CU-839, helper 0.2.77) keeps three OKs at 8117f15b1 for the 28 Nov slot: 06:20Z pre-run, 08:00Z merge, READBACK by 08:25Z.

**Rulings to know.** A fold's final round that still over- or under-asks gets no new round: the narrowest cut of the one rule, else a revert (D-121 (1)); cu-researcher rules introduced-or-not first (D-119 (2)). A pause needs every next window at least 30 minutes away (D-128). OK comments must not carry 'withdraw', 'hold' or 'NOT OK' in their header - the landing tool fails closed on them.

**Team health.** The disk-full stall ended with 784 worktrees pruned (22 GiB free); D-133 (#1596) has each seat remove its own clean worktrees at stand-down, keeping ignored private state until the successor confirms its copy. Overnight successions: coordinator, verifier, integrator and cu-developer-one (in flight).

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** A GHE route for reflection-tool feedback (default: the [hd] coordinator holds it); D-034: 20.69 of 21 USD spent (default: no model run); CUHelper Screen Recording; the step 4 session (CU-11, CU-119, CU-135); budget for CU-66; the Watchdog install; seats past 70 percent context (default keep 70).
