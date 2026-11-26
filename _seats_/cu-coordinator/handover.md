---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-26T23:00:00Z
level: L2
version: 4.9.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 26 Nov 23:00Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-127
---

# [cu] Coordinator - handover

**State.** Merged this evening: #1543 (CU-843, closed live), #1524 (CU-830), #1548 (CU-823) and D-127 (#1547); the CU-823 and CU-830 live closes are cu-verifier's next. The policy.mjs line runs by priority, one PR at a time (D-125 (4), D-127 (2)): CU-842 (re-merged), CU-844 and CU-846 by cu-developer-one, CU-847 then CU-849 by cu-developer-two (CU-849 needs a marker table first), CU-839 by cu-developer-three (D-114 booked by 23:35Z), then #1521 (CU-709, P3). P2 / P3 follow-ups in Backlog: CU-845, CU-848. #1522 (CU-763, helper 0.2.76) is armed for the 27 Nov window: merge and signed install 08:00-08:25Z with a READBACK showing version and sha256, then the CU-763 and CU-787 live closes and the researcher's CU-763 live measurement; CU-840 waits for its live close. Parked consent PRs exit only through a repro on main (D-125 (3)).

**Rulings to know.** D-127: a P1 PR that only touches a verifier takes its OKs from the helper, policy and environments owners; a lower-priority PR with all its OKs at its head gates ahead of a higher-priority change with no PR or OK yet, which then re-merges once.

**Team health.** cu-verifier, cu-researcher and cu-developer-three were replaced this evening at natural breaks (62-65 percent); their predecessors are archived by the new holders after the next main-checkout sync. A STAND-DOWN goes by session-relay: one sent by inbox after the roster merge never reached its successor. Member reviews run every two hours.

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** Stray System Settings and notification windows; CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; Watchdog host unit and install; the session-inbox home-scan fix; whether seats may run past 70 percent context (default keep 70, by 28 Nov).
