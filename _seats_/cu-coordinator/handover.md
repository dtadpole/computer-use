---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-28T19:15:00Z
level: L2
version: 4.19.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 28 Nov 19:15Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-133
---

# [cu] Coordinator - handover

**State.** On the policy.mjs line (D-125 (4)) both P1 PRs are on their last D-121 (1) cut. #1615 (CU-892 + CU-890) round 2d drops one French contrast word that also cut Portuguese text. #1616 (CU-861) round 2e drops the later-match widening and its guard; its real asks moved to CU-923. If either head still over-asks, that PR reverts. Each then takes test1 + D-114, a push (remote head checked), three re-OKs and the gate. CU-905 and CU-874 wait for test1; then CU-907, CU-911, CU-912 (table OK), CU-919, CU-920, CU-921 and CU-923 (P1); #1521 last.

**Rulings to know.** Cut the rule that over-asks; never patch its guard, since an enumerated guard leaks per variant (D-119 (5)). A cut keeps no token that matches another language's text. Repros and builds that unblock a P1 go before closes; a ready P1 gate goes before records lanes. An OK comment's first line is the header alone. A push window's DONE is not a push.

**Team health.** Verifier, integrator and developer-three were replaced under D-129 between 17:26Z and 19:07Z, each with a clean stand-down (D-133). A model connection error at 18:04Z stopped five seats until revived.

**Private records.** The repository holding the private roster and records was replaced under its old name between 18:13Z and 18:35Z; the old one survives under a new name and carries the roster until the owner rules (interim ruling 18:39Z).

**Watchdog (CU-834).** Never run: needs the owner's host unit and service-runner install.

**Owner items (each with a default).** The private records home after the swap (default: the renamed repository); D-034: 20.69 of 21 USD spent (default: no model run); CUHelper Screen Recording; the step 4 session (CU-11, CU-119, CU-135); budget for CU-66; the Watchdog install; seats past 70 percent context (default keep 70).
