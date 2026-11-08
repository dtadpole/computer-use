---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T10:26:20Z
level: L2
version: 1.3.0
description: 'What a fresh session of [cu] Researcher needs - live state, open PRs and asks, the methods, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 1027Z, after the re-home onto the new public repository (root 6314c0c)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: one worktree ~/computer-use--cu-researcher; a branch per change from origin/main
(cu/cu-researcher-<topic>); never edit the main checkout (the DSH working directory). Code and records land
here by PR through cu-integrator. Old history is private (computer-use-history): re-apply by hand, never push
an old branch. PR numbers restarted at #1; old numbers below are marked "old".

PUBLIC: run the public-hygiene gate over origin/main..HEAD before every push (it must print ok); no home path,
name, e-mail, internal model id (alias model-a), host, session id, private address or key-shaped literal
(build test values from _tests_/fixture-shapes/shapes.mjs). Tool paths live in the goal, not here.

TABLES (mine): D-059 _tests_/agent-core/consent-routes.test.mjs, D-061 sensitive-classes.test.mjs; signed by
cu-verifier on old main 309c60328. D-061: no open row. D-059: CU-209 closes in #2 (092702Z-8a0307); #12 opens
two CU-223 cells and #20 a CU-232 todo cell until fixes and cu-verifier's live rows; the re-sign waits for
CU-230's cells (cu-coordinator). consent-routes.md is at 499 words: trim before adding. D-064 closingRun: a
closing run is cu-verifier's or a decision in a closing form; no 'before', 'twin', 'probe' near the id.

PRS: #1 (Part of CU-135; cu-verifier), #2 (Fixes CU-209; both OKs, landing), #12 (Part of CU-223, after #2),
#20 (Part of CU-232: a chord firing a menu item judged by its keys only). OK'd by me: #6 (guide, HOLD), #10
(CU-219) at 94d0577, #13 (CU-225, after CU-223's row), #16 (CU-228), #17 (CU-230, URGENT) at 92f0867. #5 landed.
After #5, cu-verifier's CU Ledger Vendor copy may ask: a new over-ask row (open CU-219) with its run.

OPEN WORK: the Shift/Option/Control variant sweep of every chord the D-059 table judges, reported on CU-145
(cu-coordinator, 10:20Z) - browser raw Command-Option-Shift-V is its first item. CU-226 (click-then-key race):
measurement #18 by cu-developer-two, fix by cu-developer-one, my review. Live runs outside the fixture apps hold
until CU-230 is verified.

NEXT: review every consent/classifier PR on a real test merge (three-dot diff; never git merge-tree); re-read
the inbox before every push; search CU-145/CU-171 children before filing an Urgent.

RULES: never verify my own filings (CU-145..198); PR states as number=state; send only --from cu-researcher,
one send per command; D-034 budget ~20.69 of 25 USD, the 21 USD line holds, model-a on S8/S9 waits for the
owner; no input outside CUHelper (D-056); reply to the owner in Chinese every round with the todo list.
```
