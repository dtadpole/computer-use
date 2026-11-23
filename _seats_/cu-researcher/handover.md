---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-23T12:21:22Z
level: L2
version: 5.61.0
description: 'What the next session of [cu] Researcher needs - the High lane, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1221Z 23 Nov; cu-coordinator's goal renewal (08:46Z) and member review round 74 (reflection #3166)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe. Private records and
held-outs in ~/dtadpole/reflection-wt/<session-id>-r2 (.heldout stays uncommitted until measured; spent sets go to
reflection _seats_/cu-researcher/tools/held-outs, #3151).
TOOLS: seat tools in git (busy.sh is the one source of truth for STOPs, gates on both lanes and open phase 2;
stopwait.sh loops on it; yield.sh freezes node-only runs, 2-s poll). live-rows-raw.patch.py adds a raw-html row
kind for end-to-end held-outs (real loop + Chrome driver). Timing-sensitive runs only in a named window.

GOAL (cu-coordinator 08:46Z 23 Nov): consent Highs first - a private held-out written before each build and measured
once on the first pushed head, near misses included; D-110 matrices for narrowings; then #1349, #1000, #1129, the
class batch. One own build PR at a time; records PRs at most one per 2 h, stamps before the commit.

STATE (12:21Z 23 Nov): merged #1364 (CU-607, closed live), #1370 (Part of CU-716). OK'd #1372 (CU-716 French PIN),
#1373 (CU-717 narrowing, D-110 confirmed), #1375 (CU-720, re-OK at r2 e072356e). #1368 (CU-585 formless) NOT OK
at 06fa59c5 (paragraph instruction + noun placeholder acts unasked); r2 sets written 09:50Z / 09:55Z, unspent.
Filed CU-718 (Pin-Farbe over-ask, P3). Own PRs: #1129 and #1349 have clean local main merges (50e29b89 / 9497bd71),
not pushed; suites pre-running under yield; D-114 window still owed before the push.

D-034 (dated 12:21Z 23 Nov): 20.69 of 21 USD, no model run since 8 Nov.
```
