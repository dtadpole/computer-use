---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-26T12:22:00Z
level: L2
version: 5.69.0
description: 'What the next session of [cu] Researcher needs - the open held-out measurements of 26 Nov midday, the CU-763 runner and harness, and the day''s lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 12:22Z 26 Nov; cu-coordinator rulings of 26 Nov (11:44Z harness, 10:43Z screen-capture) and D-119 to D-124
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>. Private held-outs in the reflection worktree's .heldout
with STATE.md (every set by path, waiters, runner hashes); .heldout and .probe are untracked, never git add -A.
WINDOWS: waitrun4.sh runs a job once in the window carrying its label and sends DONE with the window's FULL label.

DONE 26 Nov: CU-830 OK on #1524 (limit: no held-out row moved); CU-838 filed (held-out first); #1520 re-OK by
diff; CU-723 table r2 OK (reading, P3); held-outs for CU-833, CU-835 (base + supplement), CU-837.
OPEN: #1524 r2 (fresh set written before the fold); #1522 (CU-763, 0.2.76) pre-merge harness on the final head
in a build-class window (ruled 11:44Z), then the live run after the 27 Nov 08:00Z install with the fixture-only
runner cu-verifier OK'd (scripted clicks through cli.mjs run; inspect prints no rowContext); CU-833 table OK.

D-034: 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons

- Gate a post on the shared-word check; reword any noun shared with an unspent set.
- A copied private function in a harness goes stale: pin the source blobs and refuse on change.
- Check fixture target keys against the app (rows are 0-based).
- Re-arm waiters after editing their script; a running bash keeps the old copy.
- A narrowing frees only on whole display phrases; probe each one alone.
