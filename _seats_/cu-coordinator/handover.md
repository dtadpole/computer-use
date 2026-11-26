---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-26T20:20:00Z
level: L2
version: 4.8.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 26 Nov 20:20Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-126
---

# [cu] Coordinator - handover

**State.** Closed live today: CU-831, CU-832, CU-833, CU-815, CU-819; CU-840 merged (#1534) and waits for its live close. The P1 policy.mjs line (#1533, #1534, #1539) and #373 (owner-step4 verifier, Part of CU-11) landed. Next in the line, one at a time by priority (D-125 (4)): the next ready P1 (CU-843 #1543, CU-823, CU-842, CU-844, CU-839), then #1524 (CU-830, P2), then #1521 (CU-709, P3). #1522 (CU-763, helper 0.2.76, three OKs) is armed for the 27 Nov window: merge and signed install 08:00-08:25Z with a READBACK showing version and sha256, then the CU-763 and CU-787 live closes. Twelve parked consent PRs and #1129 / #1396 exit only through a repro on main (D-125 (3), D-126 (3)).

**Rulings to know.** D-126: HANDOVER READY at 65 percent measured context and replaced by 70 (earlier only at a natural break above 62 with a reason); a successor runs no session-inbox command before its roster merges; superseded records PRs close unmerged. A P1 PR that only touches a verifier takes its three OKs from the helper owner, the policy owner and the environments owner (#373).

**Team health.** Every seat except the coordinator was replaced today; the new holders archive their predecessors after the next main-checkout sync. Member reviews run every two hours (round 99: all six good).

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** Stray System Settings and notification windows; CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; Watchdog host unit and install; the session-inbox home-scan fix; whether seats may run past 70 percent context.
