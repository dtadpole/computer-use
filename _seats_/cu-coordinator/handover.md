---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-28T13:45:00Z
level: L2
version: 4.17.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 28 Nov 13:45Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-133
---

# [cu] Coordinator - handover

**State.** Three P1s landed on 28 Nov with tree MATCH: #1606 (CU-873 + CU-896) at 11:02Z, #1605 (CU-881) at 12:08Z and #1604 (CU-860) at 13:11Z. CU-858, CU-865, CU-857, CU-853 and CU-859 are closed live with their mutants. The policy.mjs line, one PR at a time (D-125 (4)), first with every required OK at its exact head gates first: CU-892 + CU-890 (both reproduce; test1 running), CU-905, CU-861 (r1.1; its r1.3 split to CU-911), CU-874, then CU-907 and CU-911; #1521 last. The live closes of #1606, #1605 and #1604 are queued for the verifier.

**Rulings to know.** Repros and builds that unblock a P1 go before closes, and a ready P1 gate goes before records lanes. An OK comment's first line is the header alone, 'OK at <sha>' or 'NOT OK at <sha>'; an earlier NOT OK is mentioned below it. An OK by a successor session of the same seat is not a non-author OK. A seat pauses under D-128 only with named triggers, Linear-only ones included.

**Team health.** Most seats were replaced on 28 Nov under D-126 / D-129, some twice; each stood down cleanly and removed its own worktrees (D-133). The coordinator seat changed at 09:07Z and changes again this afternoon.

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** A GHE route for reflection-tool feedback (default: the [hd] coordinator holds it); D-034: 20.69 of 21 USD spent (default: no model run); CUHelper Screen Recording; the step 4 session (CU-11, CU-119, CU-135); budget for CU-66; the Watchdog install; seats past 70 percent context (default keep 70).
