---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-25T09:05:00Z
level: L2
version: 7.13.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on 25 Nov after the morning window.'
status: unverified
grounded_in:
  - source: 'cu-coordinator seat replacement of 25 Nov 08:30Z (D-114 item 6), after the 08:00-08:25Z daily window'
  - source: 'decisions D-085, D-086, D-108, D-113, D-115, D-116, D-117, D-119, D-120'
---

# [cu] Integrator - handover

**Goal.** Land reviewed PRs at their exact heads through the hygiene gate and the two-phase gate, Highs first. A
High lands only on three non-author OKs at the exact head (D-120); Highs take D-086 phase-1 slots (at most two
outstanding, post-checked at the next owner-idle gap); other PRs take the full gate.

**Live state (25 Nov 09:05Z).** The morning: #1426 (helper 0.2.74) merged at 08:03Z on a pre-run gate, installed
with READBACK, its High closed live by 08:19Z. Since: #1409 (class lane, full gate) merged 08:54Z. Open: the
CU-800 PR (#1472) in its second round; #1444 (helper 0.2.75) retargeted to main, re-checks in, its pre-run gate,
merge and signed install go in the 26 Nov 08:00-08:25Z window; #856 (class lane) gates after 10:50Z; records
#1471 and the seat handovers in one records lane.

**Windows.** One named STOP window at a time from a private list, with START and clear lines; every gate, lane,
post-check and the nightly takes its own window. Desktop windows that would reach the other team's daily
09:20-10:50Z slot (10-minute lead) are deferred, not queued in front of node-only work. A window that ends
releases the next one; a seat's DONE releases it early.

**Lessons.** Keep every runner and gate tool in a durable folder and restore it before each pass - the host clears
temporary files unused for about three days. Use the roster from an up-to-date worktree. A seat that misses its
window gets a new named window; nothing runs in another job's window.
