---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-26T16:40:00Z
level: L2
version: 4.7.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 26 Nov 16:40Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-125
---

# [cu] Coordinator - handover

**Why now.** The holder reached about 60 percent context after six seat replacements; it hands over early (D-124 (6)).

**State.** Closed live today: CU-831, CU-832, CU-833. Open P1 in the policy.mjs line (D-108, D-125 (4)): #1533 (CU-815, three OKs) then #1534 (CU-840, the boundary hint length; should merge before the CU-763 close), then #1524 (CU-830, P2) and #1521 (CU-709, P3). #1522 (CU-763, helper 0.2.76, three OKs) merges in the 27 Nov 08:00-08:25Z window; signed install with a true READBACK, then the CU-763 and CU-787 live closes. Next P1 builds: CU-819, CU-823, CU-842 (cu-developer-one), CU-839 (cu-developer-three). Twelve parked consent PRs exit only through a repro on main (D-125 (3)).

**Rulings to know.** D-125: skipped desktop cells under owner activity, harness pre-merge OKs for signed-helper PRs, the parked-PR exit, policy.mjs order by priority, parity of same-frame twins.

**Team health.** All seven seats were replaced today; the researcher and the verifier hand over again near 65 percent. Seats hand over at 60-65 percent, not 70. Never run session-inbox send with a roster that does not name your session: it then scans home folders and raises macOS privacy prompts (26 Nov 15:30Z).

**Watchdog (CU-834).** It has never run: this Mac has no service-runner agent and no host unit; both steps are the owner's.

**Owner items (each with a default).** Close stray System Settings and notification windows; allow CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; coordinator goal resume or cap; Watchdog host unit and install; the session-inbox home-scan fix.
