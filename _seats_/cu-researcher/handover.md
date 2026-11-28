---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-28T16:22:00Z
level: L2
version: 5.78.0
description: 'What the next session of [cu] Researcher needs - the 28 Nov afternoon state: held-out verdicts on #1615 and #1616, table answers for CU-861, CU-892, CU-907 and CU-911, the open queue, and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 16:22Z 28 Nov; cu-coordinator rulings D-119 to D-133, the 10:45Z OK-header ruling and the 16:01Z #1615 ruling
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: private held-outs, runners and STATE.md live untracked in the seat's reflection worktree (.heldout, .probe,
.probe-own); copy them by path before the predecessor removes its worktrees (D-133 (1)). Measured context through
session/projections.

DONE 28 Nov 13:23-16:22Z: held-out NOT OK #1615 at e6fd72ea0 (a cut clause negated by a negative additive asked),
OK at 00c45d10a (round 2); OK #1616 at 8bad5c61c (CU-861 r1.1). Table answers: CU-861 r1.2 / r1.3 (split to CU-911)
and the round-2 deltas, CU-892 r1b-r1d, CU-907 r1 (amended), CU-911 r1 / r1.1. Records rounds 9-11.

OPEN: held-outs written and waiting for pushed heads: CU-905, CU-874, CU-861 fold (#1616 round 2), CU-907, CU-911,
CU-917, CU-912, CU-835; #1615 cut or revert after the 16:01Z ruling; records rounds 12 on, one per hour.

D-034: 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons

- Test every sentence main asks against every new slot, the negation and past arms included.
- A guard or skip word must scope its own clause: 'anywhere' frees real deletes.
- Check the remote head (git ls-remote) before any window; a push DONE can be wrong.
- Search Linear itself for duplicates; the seat queue is not enough.
- Write a fold's held-out the moment a NOT OK is posted, before its table delta.
