---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-28T09:00:00Z
level: L2
version: 4.16.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 28 Nov 09:00Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-133
---

# [cu] Coordinator - handover

**State.** #1602 (CU-865) merged 03:55Z and #1554 (CU-839, helper 0.2.77) merged 08:00Z with a true READBACK; CU-839, CU-863 and CU-876 are verified. The policy.mjs line (D-125 (4)): the first P1 with every required OK at its exact head gates first, in tie order #1604 (CU-860, folding a tr and a pt item after its held-out NOT OK), #1605 (CU-881, fold pushed; three re-OKs next), #1606 (CU-873 + CU-896; held-out and policy-owner OKs in, verifier live review in its window), CU-892 + CU-890 (waiting for repros); CU-861, CU-866 and #1521 after. New follow-ups CU-897 to CU-905 are triaged.

**Rulings to know.** Builds before closes in the queue before the 06:30Z freeze; a fold waits until after the helper slot when its author must carry the install. An OK header reads 'OK at <sha>' or 'NOT OK at <sha>' only - 'No OK' or 'OK #N at' are misread. An OK by a successor session of the same seat is not a non-author OK. No PR appends to the reflection action log (change-tracking 1.16.0); commits carry Actor, Session and Reason trailers.

**Team health.** Every seat was replaced on 28 Nov under D-126 / D-129 (coordinator, verifier, integrator, researcher and the three developers); the developer-one and developer-three successors are in one roster PR. Every replaced seat stood down cleanly and removed its own worktrees (D-133).

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** A GHE route for reflection-tool feedback (default: the [hd] coordinator holds it); D-034: 20.69 of 21 USD spent (default: no model run); CUHelper Screen Recording; the step 4 session (CU-11, CU-119, CU-135); budget for CU-66; the Watchdog install; seats past 70 percent context (default keep 70).
