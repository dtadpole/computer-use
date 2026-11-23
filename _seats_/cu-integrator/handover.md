---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-23T19:20:00Z
level: L2
version: 7.9.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use mid-day on 23 Nov - open gates, the shared-desktop windows and the machinery state.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal renewed 2026-11-23 16:30Z (High queue, records lane, D-086 slots, D-116 windows)'
  - source: 'decisions D-079, D-085, D-086, D-090, D-093, D-097, D-115, D-116'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s. Policy PRs need two non-author
OKs at one head and no open NOT OK there (D-093). D-086: at most two phase-1 landings before a green full
baseline; a full gate's baseline is the post-check.

**Live state (23 Nov 19:20Z).** Code landed since 22 Nov 22:00Z: #1370, #1375, #1372, #1353, #895 (helper
0.2.72), #1368 (CU-585 / CU-371, closed live), #930 (helper 0.2.73) and #1385 (CU-726, closed live), plus records
#1366-#1388. Last full baseline: main bf29f3524 (#930's gate); #1385 used phase-1 slot 1 at 18:50Z.
Open, in lane order: the signed READBACK install of helpers 0.2.72 + 0.2.73 (cu-developer-three) - the last High,
in the 24 Nov daily window; #1373 (CU-717) full gate running (its phase 2 needs an idle slot); #1382 (CU-639, OKs
stand); the class pairs (#865 + CU-709, #877 + #1390 / CU-710, #856 + CU-713, #851, #859, #876); #1349, #1000,
#1129. #1371 carries #1365 (held until #1365 lands). The nightly did not run on 23 Nov.

**Shared desktop (D-115, D-116).** Another team drives this Mac. Their claim file counts as a held lock: test only
that it exists, never read it. Under our exclusive token lease the file exists for us too - our own lease is
known by a local marker written at acquire time. They grant quiet windows by name; from 24 Nov 08:00-08:25Z is the
team's daily window for helper chains and phase 2. Their time-critical slots go into the slot table with a
10-min lead; no lock step, hold or waiter registration starts or waits into one. Release at once with an end line.

**Machinery** (`/tmp/cu-integrator-*`, mirrored in the seat's private tools folder): the gate, the records lane,
`reviewed.py`, `title-ids.py`, the slot table and the own-lease check. For a window that is too short, prewarm:
run both suites' phase 1 beforehand under the gate's own folder names (a finished run is reused by name) and keep
main frozen until the PR lands. Named side windows run from a one-line-per-window list; edit only lines not yet
read. `CU_INTEGRATOR_BESIDE_WINDOWS=1` lets a gate or records land run beside a node-only window.

**Lessons.** Every STOP note goes to all seats, with its end time. Check the slot table and the other team's claim
before registering as the lock's waiter - a waiter refuses others' holds (D-073). Never read another team's files,
even when diagnosing. A gate script re-reads the PR state right before it gates. GitHub can answer 500 to a
merge that went through: verify the merge tree against the tested one, then record. Write each sequence fresh;
read every send line: only `--from cu-integrator`.
