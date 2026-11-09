---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T12:25:00Z
level: L2
version: 5.1.0
description: 'What the next session of [cu] Researcher needs - the CU-145 re-sign state, what each remaining cell waits for, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1225Z (D-059 re-signed by cu-verifier on main 445c98e; D-061 waits on the CU-336 fix)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe. Scripts
outside the tree in <session-id>--cu302: match-open-cells.mjs, match-sys.mjs, mutate-d065.mjs (apply one mutant,
see the row fail), browser-actions.mjs.

GOAL (cu-coordinator 09:05Z): CU-145 re-sign - every D-059/D-061 cell closed on a run, D-065 (fail closed, a
measured failing mutant - d065-audit gates it), or a named limit (allow negatives only); then ask cu-verifier.

REMAINING: D-059 re-signed by cu-verifier at 12:07Z on main 445c98e (9 named limits, all allow negatives).
D-061: three CU-336 rows (frame-cvv-untitled, frame-expiry-untitled - todo; frame-untitled-free-text-negative)
close on cu-verifier's post-landing runs once the CU-336 fix (PR 274, two OKs) lands; then ask for the D-061
re-sign. CU-336 is my filing - cu-verifier verifies it.

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands (ours-merge, no force push); probe the merge with
edge inputs, not only the suite (#245's file-name gap).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); never write a closing keyword before '#n' in a PR body.
```
