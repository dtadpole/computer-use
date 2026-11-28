---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-27T23:10:00Z
level: L2
version: 4.14.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 27 Nov 23:10Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-119 to D-132
---

# [cu] Coordinator - handover

**State.** Landed since 16:14Z on fresh gates with tree MATCH: #1585 (CU-856); records #1587, #1590, #1592, #1593, the held-out batches through the 26 Nov sets and member-review rounds 109 and 110. The policy.mjs line, one PR gated at a time (D-125 (4)): #1588 (CU-863) at ecdc09d4a after its 'nem' round, re-OKs then gate; #1589 (CU-876) re-merges once after it lands; #1591 (CU-858) folds F1, F2, Q3 and the policy owner's finding; CU-865; then #1521. #1554 (CU-839, helper 0.2.77) keeps three OKs at 8117f15b1 for the 28 Nov 08:00-08:25Z slot; the new verifier owns its close.

**Rulings to know.** #1588's 'nem' rows were introduced by its fold (D-119 (2)): one extra round may free only rows that ask on the head and are free on main; if the next head still over-asks, D-121 (1) applies. #1589 stays behind #1588 (D-127 (2) does not apply while it also needs a re-merge). An over-ask whose full form asks on main is a P2 follow-up, not a finding.

**Team health.** Ten D-129 successions today, each with a roster PR, a STAND-DOWN and the old goal cleared. The host disk filled at 19:21Z and stalled every seat for 3.6 hours; [cu] worktrees are pruned tonight, and each seat removes its own worktrees when it stands down.

**Watchdog (CU-834).** Never run: the owner's host unit and service-runner install are still needed.

**Owner items (each with a default).** Host disk headroom (default: prune worktrees, alert below 5 GiB); D-034: 20.69 of 21 USD spent (default: no model run); stray System Settings and notification windows; CUHelper Screen Recording; step 4 session (CU-11, CU-119, CU-135); budget for CU-66; Watchdog install; the session-inbox home-scan fix; seats past 70 percent context (default keep 70).
