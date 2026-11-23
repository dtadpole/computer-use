---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-22T22:00:00Z
level: L2
version: 7.8.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 22 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s. Policy PRs need two non-author
OKs at one head and no open NOT OK there (D-093).

**Live state (22 Nov 22:00Z).** Code landed since 21 Nov 22:00Z: #1255, #1260, #1265, #1266, #1271, #1276, #1280,
#1287, #1295, #1299, #1300, #1304, #1310, #1315 and #1326, plus records #1249-#1330. Nightly be7bf758f GREEN.
Held: #1331 (its CU-650 control row needs the new ruling). Records lane: #1332, #1333. Held for cu-coordinator
(silent since 12 Nov): #1129 and #889 / #1000 (D-108 rule 1); the CU-585 unit #884 -> #894 -> #895, then #930
and #897; #843 -> #846 -> #848; #853; #862.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, the records lane,
`reviewed.py`, `title-ids.py`. Each pass restores any missing tool from the mirror. Keep sequence scripts and their
logs outside /tmp. A run folder's `tests.log` holds the full failing assertion.

**Lessons.** Every STOP note goes to all seats, with its end time; never set one in the same second another
clears. Announce a HOLD as you announce a merge. To stop a gate, kill its lock waiter (pid in `waiter.out`) too.
Leaked /tmp test folders (CU-674) load the host and fail timing tests (settle, helper R4; CU-697): remove the old
ones and re-run records-only holds. A host tmp cleanup near 08:00Z can strip tools and build caches; gate after
it. Write each sequence fresh; read every send line: only `--from cu-integrator`.
