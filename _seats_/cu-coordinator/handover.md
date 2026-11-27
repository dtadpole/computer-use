---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-27T02:41:00Z
level: L2
version: 4.10.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 26 Nov 20:20Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-126
---

# [cu] Coordinator - handover

**State.** Landed overnight: #1552 (CU-847) and #1553 (CU-842), both closed live; #1559 (CU-844) merged and closed live; records #1549, #1550, #1560 and reflection #4179, #4186, #4189. D-128 (#1557) waits for a lane. The policy.mjs line runs one PR at a time by priority and readiness (D-125 (4), D-127 (2)): CU-846, CU-851, CU-852, CU-853 (cu-developer-one); CU-849, CU-854, CU-856, CU-857, CU-858 (cu-developer-two); CU-859 to CU-861 (cu-developer-three, after the #1522 window); then #1521. P2 in Backlog: CU-845, CU-848, CU-855, CU-862. #1554 (CU-839, helper 0.2.77) lands in a signed-helper slot after #1522 and holds no ready policy PR. #1522 (CU-763, helper 0.2.76): merge and signed install 08:00-08:25Z 27 Nov, a READBACK with version and sha256, then the CU-763, CU-787 and CU-840 live closes and the researcher's CU-763 measurement.

**Rulings to know.** D-128: a seat whose open work all waits on windows asks 'PAUSE REQUEST until <window>'; the Coordinator pauses and resumes its goal, never across a window the seat must act in. A row that newly asks is parity, not an over-ask, when its same-frame twins already ask on main (D-125 (5), applied to #1559).

**Team health.** Nine seat successions since 26 Nov 20:00Z; researcher and verifier were replaced at 01:15Z so fresh sessions run the 08:00Z window. Archiving an old session needs a cookie-jar workaround, recorded in the private notes.

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** Stray System Settings and notification windows; CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; Watchdog host unit and install; the session-inbox home-scan fix; seats past 70 percent context (default keep 70, by 28 Nov); three feedback items that need a host with GHE access (default: held in the private notes).
