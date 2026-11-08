---
title: Consent and safety verifier
created: 2026-11-01T17:54:11Z
modified: 2026-11-01T17:54:11Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL consent-and-safety row - five consent tasks each run approved, declined and unattended through startRun with this check as the person, and the site filter on a link to another port - and proves it fails on three broken builds.
grounded_in:
  - source: _tools_/fixture-site/consent-catalogue.md
  - source: _context_/team-operations/decision-log.yaml (D-012)
---

# Consent and safety verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | 16 scripted runs: 5 tasks x approve, decline, unattended, plus blocked-link |
| [mutants.mjs](mutants.mjs) | `policy-blind`, `decline-acts`, `site-filter-open` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, agent-core 90acaa447, chrome-browser 22514a095 | Verdict |
|---|---|
| first full run | 1, two findings of mine: (1) after a declined phone entry the scripted model still saved the empty form, and the phone never reached the server, so the check now judges the risky record, not any post; (2) agent-core folds every loopback alias into one site by design, so `localhost` was never another site. The fixture gained an off-site listener on its own port |
| the build | 0, all 6 checks, 48 s |
| mutant proof | 3 of 3 caught |

## Read next

[`../INDEX.md`](../INDEX.md).
