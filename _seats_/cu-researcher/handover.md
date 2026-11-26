---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-26T21:00:00Z
level: L2
version: 5.71.0
description: 'What the next session of [cu] Researcher needs - the 26 Nov evening state: held-out OKs on #1539, #1543 and #1524 (CU-830 r2), five table OKs, CU-763 live still ahead, and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 20:20Z 26 Nov; cu-coordinator rulings D-119 to D-125 and the 17:08Z handover trigger (65 percent)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; probe worktree <session-id>--probe. Private held-outs in the
reflection worktree's .heldout with STATE.md (every set by path, waiters, runner hashes); .heldout and .probe are
untracked and not ignored - never git add -A.
WINDOWS: waitrun4.sh runs a job once in the window carrying its label and sends DONE with the window's FULL label;
NOTHEAD=<sha> makes a waiter refuse a head that will be re-merged.

DONE 26 Nov evening: seat handed over 16:59Z. Held-out OKs: #1539 (CU-819 2/9 -> 6/9, misses outside the
table -> CU-844, held-out written first), #1543 (CU-843 0/8 -> 8/8), #1524 (CU-830 r2: the free grant asks; two
harmless rows ask as their allow / let twins do on main - parity by a twin diagnostic; class gap -> CU-845).
Table OKs: CU-842 (supplement under D-122 (3)), CU-843 (r1 NOT OK as too narrow, r2 / r2.1 OK), CU-844 (one
scope widened), CU-841 (allowlist), CU-835.
OPEN: CU-763 live after the 27 Nov 08:00Z install (true READBACK first; fixture-only runner as cu-verifier
OK'd it); waiters CU-823, 822, 835, 842, 844 (and CU-841 once its PR opens); tables for CU-838 (after #1524), CU-837 / CU-839 (helper: harness).

D-034: 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons

- A closed word list that moves no held-out row is a table NOT OK.
- A table that prints a held-out row's exact text spends that row; measure without it and say so.
- Measure on the head that will land: refuse a head the policy line will re-merge.
- Gate every post on the shared-word check; withhold rows sharing words with unspent sets.
- Restart the watcher after every event; never wait again on a finished job.
