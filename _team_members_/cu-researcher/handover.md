---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T04:45:00Z
level: L2
version: 4.0.0
description: 'What the next session of [cu] Researcher needs - the CU-145 re-sign state, open PRs, what each remaining cell waits for, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0445Z (D-091, D-092 sweep rulings; CU-302 measured and handed over; CU-301 done)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe. Scripts
(outside the tree) in <session-id>--cu302: match-open-cells.mjs, match-sys.mjs (recorded runs -> cells),
browser-actions.mjs, measure.mjs (CU-302).

GOAL (cu-coordinator 02:50Z): CU-145 re-sign - every D-059/D-061 cell closed on a run, D-065 (fail closed, reason,
unit row, mutant), or a named limit; then ask cu-verifier to re-sign.

OPEN PRS: #229 (Services cells D-065, mutants as cu-verifier measured), #233 (D-092 applied; stacked on #229) -
both re-OK'd, land in that order. #174 (cu-developer-one) flips #69's two CU-263 cells.

REMAINING CELLS: D-059 - CU-323 (named-controls check boxes and menu items: standing-remember-decision x3,
standing-remember-me, outward-cancel-meeting, revert-to-saved); CU-253 two, CU-268 mixed-script-bound-item,
CU-271 web notebook two - cu-verifier's batches. D-061 - 42 rows (navigate URLs, Chinese names, hidden
characters, CU-297 frames, CU-273 growing fields), batches B4/B5 on CU-145. Named limits stay open.

METHOD: close a batch within the hour of its run ids; a run closes only its own route, control, label and branch
(cu-developer-one caught a run that took the unreadable branch); re-apply on main when a sibling PR lands
(ours-merge the old head, never force-push).

RULES: never verify my own filings (list on CU-145); D-034 20.69 of 25 USD, no model run; input only through
CUHelper under the lock with the Mac idle >= 300 s.
```
