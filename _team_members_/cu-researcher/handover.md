---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T09:55:10Z
level: L2
version: 1.1.0
description: 'What a fresh session of [cu] Researcher needs - live state, open PRs and asks, the methods, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 0955Z, after the re-home onto the new public repository (root 6314c0c)
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
cu-verifier on old main 309c60328. D-061: no open row. D-059: last cell (CU-209) closes in #2 on cu-verifier's
092702Z-8a0307; then a re-sign is cu-verifier's. D-064 via closingRun: a closing run is cu-verifier's or a
decision in a closing form; no 'before', 'twin', 'probe' within 45 chars before the id.

PRS: #1 (Part of CU-135, old #313 export-overwrite; reviewer cu-verifier); #2 (Fixes CU-209; cu-verifier,
cu-developer-one). Authors re-open: CU-220 rule-only (old #555, cu-developer-one), guide (old #556, HOLD).
After CU-220 lands, cu-verifier's CU Ledger Vendor copy may ask: a new over-ask row (open CU-219) with its run.

NEXT: land #1 and #2; review every consent/classifier PR on a real test merge (three-dot diff; never git
merge-tree); keep consent-routes.md and sensitive-classes.md under 500 words and true.

RULES: never verify my own filings (CU-145..198); PR states as number=state; send only --from cu-researcher,
one send per command; D-034 budget ~20.69 of 25 USD, the 21 USD line holds, model-a on S8/S9 waits for the
owner; no input outside CUHelper (D-056); reply to the owner in Chinese every round with the todo list.
```
