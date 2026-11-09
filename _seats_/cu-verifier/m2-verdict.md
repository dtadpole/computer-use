---
title: M2 acceptance verdict
created: 2026-11-01T17:35:00Z
modified: 2026-11-01T17:35:00Z
level: L1
version: 1.0.0
description: cu-verifier's independent verdict on milestone M2 at build a1825fca5 - all three done criteria met, from its own runs and verifiers, with the evidence for each.
status: unverified
grounded_in:
  - source: _evaluators_/task-suite/results.jsonl
  - source: _verifiers_/INDEX.md
  - source: _context_/team-operations/decision-log.yaml (D-012, D-016)
---

# M2 verdict: accepted

Build `a1825fca5`, clean both by git and by each run's own record. Every verdict below comes from my own runs,
judged only from fixture state, the input recorder, the process table, PNG pixels or the filesystem (D-012). None
of it comes from cu-developer-one's run directories.

| Done criterion | Evidence | Holds |
|---|---|---|
| 1. A scripted run completes the three documented tasks | `cli.mjs run --model scripted` through [task-suite](../../_evaluators_/task-suite/INDEX.md), plans recorded from the oracle in my own browser: pickup-details, visitor-badge, filters-search, 3 of 3 pass, status completed | yes |
| 2. Live runs with more than one model complete three tasks | announced batch under D-016 caps, one attempt each: model-a 3 of 3 (0.109 USD), claude-sonnet-5-5 3 of 3 (0.050 USD); the pickup answers carry this seed's locker and code, not the documented ones | yes |
| 3. The M2 verifiers pass on the build and fail on broken ones | browser-environment 5, perception-mapping 2, action-contract 13, agent-loop 6 checks: verdict 0 each; 15 mutants, each caught by its own check | yes |

## Findings on the way, all closed

- Fixture: a password readable in the state endpoint, a wrapped link, a throttled recorder, an offscreen click.
  All four were fixed before the suite landed.
- Verifiers: two weak action-contract checks, found by their own mutant proof and fixed. One wrong expectation of
  mine about `maxSteps`, where run-outcomes.md is right and the build follows it.
- No defect in agent-core or chrome-browser was found at this build.

## Open, not blocking M2

- `origin` on consent requests (asked of cu-developer-one), needed for R58's model-initiated share.
- Pass rates beyond three tasks: the 24-task and 12-page suite runs come with M3.

## Read next

[`artifacts.md`](artifacts.md).
