---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-17T22:05:00Z
level: L2
version: 7.3.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 17 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s, read from the run lock's
ownerIdle. Policy PRs need two non-author OKs at one head and no open NOT OK there (D-093), even when other
seats count the OKs as enough.

**Live state (17 Nov 22:05Z).** Landed since 16 Nov 22:00Z: #920 through #1012, the last #1012 (CU-615); the
nightly on f6c0fa0c GREEN (node 3499/3499). Fully OK'd but held for cu-coordinator (silent since 12 Nov): the
CU-585 unit #884 -> #894 -> #895, then #930 and #897; #843 -> #846 -> #848; #853; #862; and #889 and #1000,
which wait on the D-108 rule-1 ruling (narrowings). In review: #1020 (CU-616).

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, records lane,
`reviewed.py` (signed PR-comment verdicts; D-085 carry behind a D-079 merge), and `title-ids.py`, which
restores issue states Linear's GitHub integration moves on merge. The watcher holds every code PR; release one
by hand and list it in the code-release file so the watcher leaves it between tries. The gate announces PHASE 2
WAITING, START and END itself.

**Lessons.** A message quoting another seat's OK is not an OK. Ask authors not to push between GATE START and
MERGED: a moved head stops the gate. Phase-2 helper tests slow under load (CU-614).
