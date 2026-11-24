---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-24T08:58:00Z
level: L2
version: 7.11.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on the 24 Nov morning.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal set at the 23 Nov 23:20Z seat replacement (D-114 item 6)'
  - source: 'decisions D-085, D-086, D-090, D-108, D-112, D-115, D-116, D-117, D-118'
---

# [cu] Integrator - handover

**Goal.** Land reviewed PRs at their exact heads through the hygiene gate and the two-phase gate, Highs first.
Highs and ruled P2s land on D-086 phase-1 slots (at most two outstanding), each post-checked at the next owner-idle
slot; Medium and P3 PRs take the full gate.

**Live state (24 Nov 08:58Z).** Since 23:30Z: Highs #1405, #1421, #1423 (phase 1, two post-checks green); #1408,
#1416, #1412 (phase 1, post-checked); full gates #1390, #851 + #1399, #859, #1411; records and reflection lanes
cleared twice. D-086 outstanding 1 (#1423). Helper 0.2.73 installed 08:05Z; the Last War bridge runs from its own
worktree at a full-green main commit (D-118). Open: CU-751, CU-748, CU-747 r2, CU-753, CU-756 builds;
#1426 (helper 0.2.74, full gate plus a signed install in the 25 Nov window); #1409 and #856 + #1396.

**Windows.** Seats run author and review cells only inside a named STOP window from the side-window list, each
with a start and a clear line; release early on DONE. Nothing of ours holds the lock in Last War's slots or 10
min before them, nor in a granted window of theirs. A gate's phase-2 waiter refuses others' holds: never register
one inside time promised to them.

**Lessons.** A stacked PR is retargeted to main when its base lands. GitHub's log-union conflict needs a plain main
merge (the author's, or the queue's own log-union merge) before the gate. Read every inbox item by hand; the gate
scripts' inbox reads broke once when a checkout moved.
