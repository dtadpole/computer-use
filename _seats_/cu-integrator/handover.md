---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-26T08:25:00Z
level: L2
version: 7.15.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use during the 26 Nov helper 0.2.75 window.'
status: unverified
grounded_in:
  - source: 'cu-coordinator plan of 26 Nov 06:27Z (seat swap in the 09:20-10:50Z no-desktop span, context past 70 percent)'
  - source: 'decisions D-086, D-090, D-113, D-119, D-120, D-121, D-122, D-123'
---

# [cu] Integrator - handover

**Goal.** Land reviewed PRs at their exact heads through the hygiene gate and the full two-phase gate with a fresh
test run, P1 gates first; a P1 lands only on three non-author OKs at the exact head (D-120). Every job runs only in
the window that names it, under the seat's own label.

**Live state (26 Nov 08:25Z).** Overnight landed, tree MATCH: code #1489, #1498, #1499, #1500, #1502, #1504,
#1505, #1508, #1509; records #1490, #1492 to #1497, #1501, #1503, #1506, #1507. Closed live overnight include
CU-821, CU-824, CU-825, CU-828, CU-829. The 26 Nov window: #1444 (helper 0.2.75) passed its pre-run gate and
merged at 08:00Z, tree MATCH; the first install failed with a false readback, the retry read back 0.2.75 at 08:02Z;
CU-752 closed live, CU-763 stays open (a fixture toggle still acts unasked; its target carries no row context).
Queued: the researcher's CU-763 measurement, records lanes for #1510 and #1511, CU-831 and CU-832 builds (P1),
CU-709 resume, CU-723.

**Windows.** One named window at a time. A gate window enters the queue only once every required OK is at the
head. A gate that outlasts its window opens a named continuation; a records lane stops at its window end and is
re-queued longer with its partial results set aside. A log-only conflict is merged inside the gate's window
(D-090). The verifier's repro runs before a developer's test1; a fold's changed table rows need the researcher's
OK before its test1 (D-121).

**Lessons.** Keep runners and state in the session worktree. A watcher with a lifetime is restarted before it
ends. A window whose DONE uses another label runs to its end unless released by hand after the seat's DONE. Main
moving makes the next gate re-run main's baseline, so size lanes and gates for it.
