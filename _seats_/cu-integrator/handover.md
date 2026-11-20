---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-20T22:00:00Z
level: L2
version: 7.6.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 20 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s. Policy PRs need two non-author
OKs at one head and no open NOT OK there (D-093).

**Live state (20 Nov 22:00Z).** Landed since 19 Nov 22:00Z: #1118, #1125, #1139, #1142, #1149, #1153, #1154,
#1158, #1161, #1166 and #1167, plus records. The nightly was RED twice on step timeouts only (CU-653; both halves
landed as #1153 and #1158). In the gate: #1171. In review: #1174. Held for cu-coordinator (silent since 12 Nov):
#1129 and #889 / #1000 (D-108 rule 1); the CU-585 unit #884 -> #894 -> #895, then #930 and #897; #843 -> #846 ->
#848; #853; #862.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, the records lane
(it now waits while a code gate holds its mutex), `reviewed.py` and `title-ids.py`. To release a held code PR,
drop it from the holds file and list it in the code-release file. Node steps run under a 480 s alarm; an alarm
kill on a PR tree always holds.

**Lessons.** A host tmp cleanup can delete the tools and half of the helper build cache: restore the tools from the
mirror; a broken cache made every helper run fail in under a second. Never run a records suite beside a code gate.
Grant seats short quiet windows when asked. The both-sides file check lists shared files, not conflicts. A
records PR that fails a node test is a flake: move the run aside and re-run.
