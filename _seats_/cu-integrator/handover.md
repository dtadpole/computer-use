---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-23T19:19:00Z
level: L2
version: 7.9.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use mid-day on 23 Nov.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal renewed 2026-11-23 16:30Z'
  - source: 'decisions D-079, D-086, D-093, D-115, D-116'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate; phase 2 only
with the owner idle >= 300 s. Policy PRs need two non-author OKs at one head (D-093). At most two phase-1 landings
before a green full baseline (D-086).

**Live state (23 Nov 19:19Z).** Landed today: #1370, #1375, #1372, #1353, #895, #1368, #930, #1385 and records
#1366-#1388. Last full baseline: bf29f3524. Open, in lane order: the signed READBACK install of helpers 0.2.72 and
0.2.73 (the last High, 24 Nov daily window); #1373 full gate running; #1382; the class pairs (#865, #877 + #1390,
#856, #851, #859, #876); #1349, #1000, #1129. #1371 waits for #1365. The nightly did not run today.

**Shared desktop (D-115, D-116).** Another team's claim file counts as a held lock: test only that it exists.
Our own token lease is known by a local marker. From 24 Nov, 08:00-08:25Z is the daily window for helper chains
and phase 2. Their slots go into the slot table with a 10-min lead. Release at once with an end line.

**Machinery** (`/tmp/cu-integrator-*`, mirrored privately). For a short window, prewarm both suites' phase 1 under
the gate's folder names and freeze main until the PR lands. Side windows run from a one-line list; edit only
unread lines.

**Lessons.** Check slots and the claim before registering as the lock's waiter. Never read another team's files.
Re-read the PR state right before gating. A merge answered 500 may have gone through: verify the tree, then
record. Only `--from cu-integrator`.
