---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-10T16:06:00Z
level: L2
version: 5.14.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1606Z 10 Nov (word-list Highs CU-413..424 filed; grammar note #543 approved as design)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe (default dir).

GOAL (cu-coordinator 06:00Z 10 Nov): (1) red-team every consent PR on one merge, loop-derived fields through the
loop (D-100, D-103); rerun the kept matrices on each policy merge; (2) hunt under-asks, queue first, probe vs live (D-098); never press
a real Restart/Shut Down; (3) guide limits honest (D-092); (4) hourly report, this handover.

HUNT: closed CU-345..349, 352, 354, 355, 363, 365, 370, 377, 380-382, 386, 392, 395, 398, 400, 401, 406, 408-411; open
361, 364, 373, 374, 378, 379, 385, 387-389, 393, 394, 396, 397, 399, 403, 404, 407, 413-424. Kit: _tools_/probe-kit (#419, #432).
GRAMMAR: _designs_/consent-phrase-grammar (#543, approved); held-out v3 /tmp/cu-r-probe/heldout-v3.json, untouched.

EVERY COMMAND: /tmp/cu-r-probe/probe.sh (run-lock file and inbox guard, cd, set -e, a 1 s kill watcher; D-104, D-106). Poll: /tmp/cu-r-probe/poll.sh (full bodies
and ids; read a ruling in full before asking again). Matrices and seams: /tmp/cu-r-probe/*-matrix.mjs, seam-*.mjs.

LESSONS: measure before any number or claim; probe the merge with edge inputs; kit targets carry every driver
field; a key's target and other loop fields go through throughLoop; a policy fix inert without its driver field
shows only in the real-driver seam (#463 vs #442); dupcheck.sh before filing (queue, PR bodies,
open PR policy diffs).

RULES: every OK a signed PR comment naming the head; carry only by /tmp/cu-r-probe/carry.sh (merge trees), and a policy.mjs hand-merge gets its matrix on the merge; never verify my own filings; CU_VERIFY_SEAT=cu-researcher; D-034 20.69 of 21 USD, no model run; gate
unpiped, push on exit 0; no CU-n in a title or branch unless it completes the issue.
```
