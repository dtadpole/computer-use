---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-27T08:05:00Z
level: L2
version: 4.11.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 27 Nov 08:05Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-128
---

# [cu] Coordinator - handover

**State.** Landed tonight after 02:45Z: #1562 (CU-846), #1564 (CU-851) and #1565 (CU-849) - CU-846 and CU-851 closed live, CU-849's live close follows the CU-840 close; records #1557 (D-128), #1558, #1561, #1563, #1567. The policy.mjs line runs one PR at a time by priority and readiness (D-125 (4), D-127 (2)): #1566 (CU-852, fold head a93d043c7; cross-check and held-out OK, live review after the CU-840 close), then CU-853, CU-863 (cu-developer-one), CU-854, CU-856, CU-857, CU-858, CU-865, CU-873 (cu-developer-two), CU-859 to CU-861 and CU-866 (cu-developer-three), then #1521. P2 waits in Backlog. #1522 (CU-763, helper 0.2.76): merged 08:00:21Z and installed signed at 08:00:51Z with READBACK OK (0.2.76); cu-verifier's #1522 close (CU-763, CU-787) and CU-840 close follow, then cu-researcher's CU-763 live run after 08:25Z. #1554 (helper 0.2.77) lands in a later signed-helper slot.

**Rulings to know.** D-128 is on main: a seat whose work all waits on windows asks 'PAUSE REQUEST until <window or event>'; the Coordinator pauses and resumes it, never across a window it must act in. A seat whose measured context would cross 65 percent inside a window it must act in is replaced at its last natural break before that window, even below 62 percent (to be recorded as D-129).

**Team health.** Four seat successions since 02:41Z (developer-one, developer-two, verifier, coordinator); each old session archived by its successor.

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** Stray System Settings and notification windows; CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; Watchdog host unit and install; the session-inbox home-scan fix; seats past 70 percent context (default keep 70, by 28 Nov); three feedback items that need a host with GHE access (default: held in the private notes).
