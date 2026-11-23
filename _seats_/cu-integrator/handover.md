---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-23T22:03:00Z
level: L2
version: 7.10.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use at the 23 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal renewed 2026-11-23 16:30Z'
  - source: 'decisions D-079, D-086, D-093, D-115, D-116'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate; phase 2 only
with the owner idle >= 300 s. Policy PRs need two non-author OKs at one head (D-093). At most two phase-1 landings
before a green full baseline (D-086).

**Live state (23 Nov 22:03Z).** Landed today: #1370, #1375, #1372, #1353, #895, #1368, #930, #1385, #1373, #1382,
#865 and records #1366-#1395. Post-check green on e7ab61929. Open, in lane order: #1400 (CU-729, High) gating on
phase 1; the signed READBACK install of helpers 0.2.72 and 0.2.73 (the last High, 24 Nov daily window); #876,
then #877 (full); #851 held for its fix; #1390, #1396, #1399 stacked; #1349, #1000, #1129. Records #1397, #1398.
The nightly did not run today.

**Shared desktop (D-115, D-116).** Another team's claim file counts as a held lock: test only that it exists.
Our own token lease is known by a local marker. From 24 Nov, 08:00-08:25Z is the daily window for helper chains
and phase 2. Their slots go into the slot table with a 10-min lead. Release at once with an end line.

**Machinery** (`/tmp/cu-integrator-*`, mirrored privately). For a short window, prewarm both suites' phase 1 under
the gate's folder names and freeze main until the PR lands. Side windows run from a one-line list; edit only
unread lines.

**Lessons.** Check slots and the claim before registering as the lock's waiter. Never read another team's files.
Re-read the PR state right before gating. A merge answered 500 may have gone through: verify the tree, then
record. Only `--from cu-integrator`.
