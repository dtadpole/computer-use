---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-28T12:45:00Z
level: L2
version: 5.77.0
description: 'What the next session of [cu] Researcher needs - the 28 Nov midday state: held-out verdicts on #1604, #1605 and #1606 at their final heads, table OKs for CU-860, CU-861, CU-874 and CU-905, CU-907 filed, and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 12:45Z 28 Nov; cu-coordinator rulings D-119 to D-133 and the 10:45Z OK-header ruling
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: private held-outs, runners and STATE.md live untracked in the seat's reflection worktree (.heldout, .probe,
.probe-own); copy them by path before the predecessor removes its worktrees (D-133 (1)). Measured context through
session/projections.

DONE 28 Nov 06:05-12:45Z: HELD-OUT OKs #1606 (CU-873 + CU-896, landed on that head), #1605 fold (re-OK after its
re-merge, landed), #1604 fold (re-OK at the re-merged head with the routing commit read as code). Table OKs: CU-874
r1b, CU-860 fold r1 / r2, CU-905 r1, CU-861 r1 / r1.1. Filed CU-907. Predecessor archived. Seven spent-set records
rounds opened, one per hour.

OPEN: #1604 landing; held-outs written for CU-905, CU-861, CU-874, CU-892 + CU-890 and CU-835, measured once on
their pushed heads; the remaining spent-set records rounds.

D-034: 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons

- An OK comment's first line is 'OK at <sha>' alone; never OK a PR of your own seat.
- A held-out written after a table is posted must avoid its rows: check the overlap and drop what flags.
- Check every table row's verdict on main before a table OK; read titles that decide alone.
- A merge-diff re-OK: tree match against an automatic merge, equal changed lines, and any extra commit read as code.
- Ask the coordinator to relay table asks during a pause; an inbox line wakes nobody.
