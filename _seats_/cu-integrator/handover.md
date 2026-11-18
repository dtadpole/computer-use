---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-18T22:00:00Z
level: L2
version: 7.4.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 18 Nov evening.'
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

**Live state (18 Nov 22:00Z).** Landed since 17 Nov 22:00Z: #1020, #1025, #1030, #1033, #1038, #1043, #1048,
#1057 and #1059 (the last, CU-628), plus records; the nightly on bebe9d58 GREEN (node 3530/3530). Fully OK'd
but held for cu-coordinator (silent since 12 Nov): the CU-585 unit #884 -> #894 -> #895, then #930 and #897;
#843 -> #846 -> #848; #853; #862; and #889 and #1000, which wait on the D-108 rule-1 ruling (narrowings).

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, records lane,
`reviewed.py` (signed PR-comment verdicts; D-085 carry behind a D-079 merge), and `title-ids.py`, which
restores issue states Linear's GitHub integration moves on merge. The watcher holds every code PR; release one
by hand and list it in the code-release file so the watcher leaves it between tries. The gate announces PHASE 2
WAITING, START and END itself.

**Lessons.** A message quoting another seat's OK is not an OK. Ask authors not to push between GATE START and
MERGED: a moved head stops the gate. A records PR that fails a node test on its merge tree is a flake: move the
node-only run aside and re-run (the proxy test was CU-630, fixed by #1057). A records title that names an
issue moves it on merge; `title-ids.py` restores it.
