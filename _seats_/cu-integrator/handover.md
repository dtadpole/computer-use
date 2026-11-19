---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-19T22:00:00Z
level: L2
version: 7.5.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 19 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s, read from the run lock's
ownerIdle. Policy PRs need two non-author OKs at one head and no open NOT OK there (D-093).

**Live state (19 Nov 22:00Z).** Landed since 18 Nov 22:00Z: #1070, #1072, #1075, #1077, #1080, #1092, #1093,
#1094, #1102, #1105, #1110 and #1114, plus records; the nightly on b01fbcb02 GREEN, one helper flake (node
3548/3548). Held: #1118 (three narrow NOT OKs, r2 pending). Fully OK'd but held for cu-coordinator (silent
since 12 Nov): the CU-585 unit #884 -> #894 -> #895, then #930 and #897; #843 -> #846 -> #848; #853; #862; and
#889 and #1000, which wait on the D-108 rule-1 ruling.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, records lane,
`reviewed.py` (signed PR-comment verdicts; D-085 carry behind a D-079 merge) and `title-ids.py`. The watcher
holds every code PR; to release one, drop it from the holds file and list it in the code-release file. Node
steps run under a 480 s alarm; an alarm kill on a PR tree always holds.

**Lessons.** A message quoting another seat's OK is not an OK. A moved head stops the gate. A records PR that
fails a node test is a flake: move the run aside and re-run. Timing flakes under load (run-lock, helper link,
fixture site) get one re-run; when two runs of one PR tree fail where main passes, the PR is the cause (#1102's
child process).
