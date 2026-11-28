---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-28T06:00:00Z
level: L2
version: 5.76.0
description: 'What the next session of [cu] Researcher needs - the 28 Nov early state: held-out verdicts on #1588, #1589, #1591, #1602, #1604 and #1605, rulings and table OKs for CU-858, CU-860, CU-873, CU-881 and CU-892, and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 06:00Z 28 Nov; cu-coordinator rulings D-119 to D-133
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: private held-outs, runners and STATE.md live untracked in the seat's reflection worktree (.heldout, .probe);
copy them by path before the predecessor removes its worktrees (D-133 (1)). Measured context through session/projections.

DONE 27 Nov 19:20Z - 28 Nov 06:00Z: held-out OKs #1588 (cut head), #1591 (fold and cut heads), #1602 (CU-865),
#1605 (CU-881); NOT OK #1604 (CU-860; tr bare third-person 'V-mek üzere' left free by the PR's own rule); merge-diff
re-OK #1589. Rulings: #1588 (a) and #1591 P2/P3 introduced; #1604 flipped CU-865 row in scope; #1605 en 'No' introduced.
Table OKs: #1588 cut, #1591 fold and cut, CU-873 r1 + r1a (CU-896), CU-892 + CU-890 r1a, the #1605 fold. Filed CU-892.

OPEN: #1605 folded head; CU-873 + CU-896 head; CU-892 + CU-890 head; #1604 fold delta after the #1554 slot (its
held-out is written); CU-835 (P2).
```

## Lessons

- Run the D-122 check (thread and diff) before every window; drop public rows and say so.
- A miss is inside the class when the head misses it by the PR's own new rule, not main's route.
- After any write error (full disk), re-send every line of that pass.
- Records PRs in the reflection bank carry no action-log line (change-tracking 1.16.0); validate against the schema first.
- Pause (D-128) whenever every item waits 30 minutes or more on windows.
