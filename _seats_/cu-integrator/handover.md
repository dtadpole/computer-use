---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-24T14:17:00Z
level: L2
version: 7.12.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use on the 24 Nov afternoon.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal set at the 24 Nov 09:05Z seat replacement (D-114 item 6)'
  - source: 'decisions D-085, D-086, D-090, D-113, D-114, D-115, D-116, D-117, D-118'
---

# [cu] Integrator - handover

**Goal.** Land reviewed PRs at their exact heads through the hygiene gate and the two-phase gate, Highs first.
Highs take D-086 phase-1 slots (at most two outstanding), each pair post-checked at the next owner-idle gap;
other PRs take the full gate.

**Live state (24 Nov 14:17Z).** Since 09:10Z: Highs #1428, #1422, #1431, #1434 (phase 1); #1432 (full gate,
the owner's step-4 launchers); records #1418-#1420, #1424, #1425, #1429, #1430, #1433, #1435, #1436; reflection
#3433, #3451, #3458, #3459. Three post-checks and the nightly green; D-086 outstanding 0. Open: CU-753 r2 (#1437),
CU-754, CU-766, CU-765 builds; the class pair #1409, #856 + #1396 (author main merges); #1426 (helper 0.2.74)
lands only with its signed install in the 25 Nov 08:00-08:25Z window, its gate pre-run from 06:45Z.

**Windows.** One named STOP window at a time from a private list, with START and clear lines; gates, records
lanes, the post-check and the nightly each take their own window. Queue review windows only after the author's
DONE names the pushed head. A release watcher clears a window early on its seat's DONE, matching whole labels.

**Lessons.** An over-ask a PR introduces is a regression and goes before landing (one fold). A lifted HOLD can
stay in the holds file as an auto-hold: release it by hand. Helper `--dry-run` runs are node-only work.
