---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-26T16:15:00Z
level: L2
version: 5.70.0
description: 'What the next session of [cu] Researcher needs - the 26 Nov afternoon state after the seat changed hands, the CU-763 live run still ahead, and the day''s lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 16:15Z 26 Nov; cu-coordinator rulings of 26 Nov (11:44Z harness, 10:43Z screen-capture) and D-119 to D-124
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; probe worktree <session-id>--probe. Private held-outs in the
reflection worktree's .heldout with STATE.md (every set by path, waiters, runner hashes); .heldout and .probe are
untracked and not ignored - never git add -A.
WINDOWS: waitrun4.sh runs a job once in the window carrying its label and sends DONE with the window's FULL label.

DONE 26 Nov afternoon: seat handed over 12:32Z. Held-out OKs: #1522 (CU-763 harness 5/6, miss -> CU-839), #1528
(CU-833 4/5 and r2 4/4; merged), #1533 (CU-815 2/5 vs 1/5, misses outside the table -> CU-842), #1534 (CU-840 5/5).
Table OKs with a bound: CU-833 fold, CU-815, CU-819, CU-823 (two rows shown in the table replaced, D-122 (3)).
Held-outs written first for CU-839, 840, 841, 842 and CU-788's non-people nouns.
OPEN: CU-763 live after the 27 Nov 08:00Z install (true READBACK first; the harness set, rows quoted then); #1524
(CU-830) r2 set on its final head after #1533 / #1534 land; node waiters CU-835, 823, 822, 819; tables for CU-835,
838, 837, 839 when posted.

D-034: 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons

- Gate a post on the shared-word check; reword any noun shared with an unspent set.
- A copied private function in a harness goes stale: pin the source blobs and refuse on change.
- A request stays unread until `read --done` with the token that same read printed.
- Do not quote a set's rows while a later run of the same set is still due.
- Goal rounds run back to back; when all that is left waits on others, say so early.
- Re-read the thread right before an OK; name its latest comment time and any NOT OK posted near it.
