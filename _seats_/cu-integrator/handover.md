---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-21T22:00:00Z
level: L2
version: 7.7.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 21 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s. Policy PRs need two non-author
OKs at one head and no open NOT OK there (D-093).

**Live state (21 Nov 22:00Z).** Code landed since 20 Nov 22:00Z: #1171, #1174, #1184, #1189, #1193, #1197, #1202,
#1208, #1209, #1214, #1217, #1218, #1224, #1230, #1237 and #1242, plus records #1175-#1244. Nightly a1fa51549 GREEN
(CU-653 closed). Records lane: #1246, #1247, then #1245. In review: #1248. Held for cu-coordinator (silent since
12 Nov): #1129 and #889 / #1000 (D-108 rule 1); the CU-585 unit #884 -> #894 -> #895, then #930 and #897; #843 ->
#846 -> #848; #853; #862.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, the records lane,
`reviewed.py`, `title-ids.py`. Each pass restores any missing tool from the mirror. To release a held code PR, drop
it from the holds file and list it in the code-release file.

**Lessons.** A host tmp cleanup near 08:00Z deletes tools and strips Info.plist from build caches (helper,
desktop-fixture); move a broken cache aside. About 26,000 leaked test folders in /tmp load the host (CU-674).
Seats ask a quiet window after nearly every merge: arm it before the run it follows ends, key it on the lane going
idle, and send a written 'STOP set' line. Write each sequence script fresh; a patched copy once compared a spliced
SHA. When cu-verifier closes an issue in the merge window, skip the title-id restore. Read every send line: only
`--from cu-integrator`.
