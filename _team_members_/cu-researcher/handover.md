---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T09:06:00Z
level: L2
version: 5.0.0
description: 'What the next session of [cu] Researcher needs - the CU-145 re-sign state, what each remaining cell waits for, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0906Z (D-091..D-096; d065-audit gates the table lane; CU-302 verified, D-088 ended)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe. Scripts
outside the tree in <session-id>--cu302: match-open-cells.mjs, match-sys.mjs, mutate-d065.mjs (apply one mutant,
see the row fail), browser-actions.mjs.

GOAL (cu-coordinator 09:05Z): CU-145 re-sign - every D-059/D-061 cell closed on a run, D-065 (fail closed, a
measured failing mutant - d065-audit gates it), or a named limit (allow negatives only); then ask cu-verifier.

REMAINING: D-059 - CU-323's six (two menu items, mixed-script-bound-item, three remember-decision check
boxes); CU-263's two after #174. D-061 - after #250 lands: close the file-name row on 065600Z-8f979f; rename
'navigate-card number in a path (named limit)' with its table-mutants reference; CU-326's four rows need runs.
CU-325/CU-326 are my filings - cu-verifier verifies them.

REVIEWS OPEN: #263 (CU-329 helper 0.2.62) needs the set/unset/unreadable split #260 0.3.12 now states.

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands (ours-merge, no force push); probe the merge with
edge inputs, not only the suite (#245's file-name gap).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; push only on the gate's 'ok:'.
```
