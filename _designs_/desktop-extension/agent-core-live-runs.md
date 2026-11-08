---
title: Agent-core changes from the live runs
created: 2026-11-05T19:06:51Z
modified: 2026-11-06T10:13:32Z
level: L1
version: 0.4.24
description: The agent-core changes landed in dtadpole/computer-use from the CU-8 evaluation and the live checks around it, each with its rule, live evidence and pull request.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/agent-core-follow-ups.md@0.4.1
  - source: _context_/team-operations/decision-log.yaml (D-043, CU-8 accepted)
---

# Agent-core changes from the live runs

Each came from a live finding, landed with unit tests in `_tests_/agent-core/` and carries its Linear issue; PRs are
`dtadpole/computer-use`'s.

| Change | Rule | Live finding | PR |
|---|---|---|---|
| check before repeating | after a data-changing action, check its result before repeating; if unsure, say so | CU-10 payment recorded twice (CU-24) | #17 |
| control link off stderr | the live view's control URL prints only to a terminal; otherwise `control-link <runId>` (CU-27) | CU-12 | #24 |
| failure reason | a failed action records the environment's message as `detail` (CU-35) | CU-8 drag row | #38 |
| order references | 'Order #4344' or 'Order details' names a record, not a purchase; the verb still confirms (CU-40) | CU-8 scroll-find | #43 |
| values the task names | typed tokens in the task text are not `sensitive_data`; other values still ask (CU-42) | CU-8 send-message | #45, #56 |
| how an app was named | `new_app` requests carry `appNamedBy`; an unapproved or excluded app at the point raises `point_covered`; the model hears only that a window covers it (CU-38) | Typeless overlay, stale system alert | #47, #74, #108 |
| outcome line | a last line `OUTCOME: done\|partial\|not_done`, carried as `outcome`; the fixture still decides (CU-21) | CU-8 judge errors | #52 |
| settle before the screenshot | after an input batch, re-capture every 100 ms until two comparisons match, capped at 1 s; `settle {ms, capped}` on the observation (CU-43) | menu fade: 760-805 ms, menu closed 4/4 | #53 |
| file panels | a target `hostedBy` the panel service: every commit is `file_choice`, asked each time with the path when known; Quick Look, menus, drag out, file operations and protected paths blocked (CU-39) | CU-8 export-file | #57 |
| no app named on refusal | the helper's covered-point refusal reaches the model as a neutral sentence; the trajectory's `coveredBy` and the notice keep the bundle id; an unverifiable point records `unverified` (its process, never a title) (CU-47) | CU-46 retest, Q-D15 regression | #80, #98, #106 |
| panel marker, undescribed targets | `panel` 'save' or 'open' gets the `file_choice` rules like `hostedBy`; `panel` 'unknown' or an owner-only target is asked each time, never pre-approved (CU-39); the request names the kind (CU-50) | in-process save panel | #83, #118 |
| panel destination | a typed path is resolved and checked, `..` refused, a protected path blocked as typed; an unknown folder is asked (`folderKnown` false) | #65 red team | #91 |
| read-only inspect | `cli.mjs inspect` describes the element at screen points under the lock, no input or model | CU-39 live proof | #90 |
| protected places in a panel | in a marked panel, shortcuts and clicks into protected places are refused (D-047) | CU-39 folder measurement | #101 |
| truthful release | a stopped drag records `released {at, cancelledDrag, atPress}` and `effectUncertain`; unless released at the press point, the model is told the drop may have happened (CU-45) | CU-44 live half | #73 |
| transient retries | an unverified or front-app pre-post refusal is retried once after 150 ms while input is allowed, a leaked capture twice, nothing else; each recorded; a front-app refusal that stays tells the model to click the approved app (CU-56, CU-82) | batch refusal; 0.2.28 activation race | #124, #185 |

## Read next

[File panels](file-panels.md) holds the `file_choice` design.
