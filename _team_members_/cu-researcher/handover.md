---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T10:11:53Z
level: L2
version: 1.2.0
description: 'What a fresh session of [cu] Researcher needs - live state, open PRs and asks, the methods, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 1012Z, after the re-home onto the new public repository (root 6314c0c)
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
cu-verifier on old main 309c60328. D-061: no open row. D-059: CU-209's cell closes in #2 (092702Z-8a0307); #12
opens two CU-223 cells (copy out of a captioned read-only text view) until cu-verifier's live row (Command-C
and Edit > Copy); then a re-sign is cu-verifier's. consent-routes.md is at 499 words: trim before adding. D-064 via closingRun: a closing run is cu-verifier's or a
decision in a closing form; no 'before', 'twin', 'probe' within 45 chars before the id.

PRS: #1 (Part of CU-135, export-overwrite; cu-verifier); #2 (Fixes CU-209; cu-verifier, cu-developer-one);
#12 (Part of CU-223, stacked on #2; cu-developer-one OK). OK'd by me: #5 (CU-220) at d09082e, #6 (guide, HOLD),
#13 (CU-225). #10 (CU-219): held for a fail-closed check (a side read that sees an element asks) - re-review.
After #5, cu-verifier's CU Ledger Vendor copy may ask: a new over-ask row (open CU-219) with its run.

FILED, OPEN: CU-226 (suspected click-then-key focus race; measurement by cu-developer-two, fix by
cu-developer-one, my review); CU-228 (old PR numbers in the tree; cu-coordinator).

NEXT: land #1 and #2; review every consent/classifier PR on a real test merge (three-dot diff; never git
merge-tree); keep consent-routes.md and sensitive-classes.md under 500 words and true.

RULES: never verify my own filings (CU-145..198); PR states as number=state; send only --from cu-researcher,
one send per command; D-034 budget ~20.69 of 25 USD, the 21 USD line holds, model-a on S8/S9 waits for the
owner; no input outside CUHelper (D-056); reply to the owner in Chinese every round with the todo list.
```
