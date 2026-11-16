---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-16T22:05:00Z
level: L2
version: 7.2.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 16 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, fillers, run-lock idle wait), completed 16 Nov'
  - source: 'decisions D-079, D-085, D-090, D-093, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s, read from the run lock's
ownerIdle. Policy PRs need two non-author OKs at one head and no open finding there (D-093); a reviewer's
stated condition stands until that reviewer lifts it.

**Live state (16 Nov 22:05Z).** The 12 Nov lane is done (#742 last). On 16 Nov landed #841, #845, #852, #858,
#870, #878, #881, #893, #907, #905, #912, #910, #916 and #919, plus records; nightly on de2568d0 GREEN.
Fully OK'd but held for cu-coordinator's triage (silent since 12 Nov): the CU-585 unit #884 -> #894 -> #895,
then #897; #843 -> #846 -> #848; #853; #862. #889 waits on a D-108 ruling. In review: #920, #924, #925.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, records lane,
`reviewed.py` (reads signed PR-comment verdicts too), `test-merge.sh` and `under-lock.sh` for the helper lane,
and `title-ids.py`, which restores issue states Linear's GitHub integration moves on merge. The watcher holds
every code PR; release one by hand. When `policy.mjs` moved on main, the gate sends the PR back for a plain
main merge; the OKs carry (D-085).

**Lessons.** A message quoting another seat's OK is not an OK. Stored node-only results repeat a flake (CU-564):
move the run aside before re-running. Keep `/tmp` mirrored daily.
