---
title: computer-use verifiers
created: 2026-11-01T09:33:46Z
modified: 2026-11-09T13:47:48Z
version: 2.34.1
description: The computer-use project's _verifiers_ type folder - one runnable claim per folder, bound to the rows of ULTIMATE_GOAL.md, each exiting 0 holds, 1 fails, 3 unjudged.
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0
  - source: _seats_/cu-verifier/responsibilities.md@1.0.0
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
---

# `_verifiers_`

Each instance holds `INDEX.md`, `claims.md`, `check*.mjs` and `verify.sh`, run through browser-use's
[verify runner](../_vendor_/browser-use/_tools_/verify-runner/INDEX.md) (vendored from reflection's browser-use, CU-3): exit 0
holds, 1 fails, 3 could not be judged; a skip is never a pass. Each M2+ verifier also lists `mutants.mjs`, broken
builds that [`prove-failing.mjs`](../_tools_/verify-kit/INDEX.md) shows it fails on. Owner: cu-verifier.

| Instance | ULTIMATE_GOAL row | State, on build 842b12c06 unless named |
|---|---|---|
| [`fixture-site/`](fixture-site/INDEX.md) | evaluation: 35 tasks and 14 injection pages, each machine-checkable | holds, 56 checks |
| [`browser-environment/`](browser-environment/INDEX.md) | environment | holds; 4 of 4 mutants caught |
| [`perception-mapping/`](perception-mapping/INDEX.md) | perception | holds; 3 of 3 mutants caught |
| [`action-contract/`](action-contract/INDEX.md) | action contract | holds; 4 of 4 mutants caught |
| [`agent-loop/`](agent-loop/INDEX.md) | agent loop: Claude, Responses and scripted adapters | holds; 5 of 5 mutants caught |
| [`consent-safety/`](consent-safety/INDEX.md) | consent and safety | holds; 3 of 3 mutants caught |
| [`human-control/`](human-control/INDEX.md) | human control | holds; 4 of 4 mutants caught |
| [`trajectory-replay/`](trajectory-replay/INDEX.md) | trajectory | holds; 3 of 3 mutants caught |
| [`session-integration/`](session-integration/INDEX.md) | integration | holds; 3 of 3 mutants caught |
| [`evaluation-suite/`](evaluation-suite/INDEX.md) | evaluation: unattended runs, rates per model and build | holds on the recorded results; two broken record sets give 1 |

Desktop (ULTIMATE_GOAL 2.0, D-024):

| Instance | ULTIMATE_GOAL 2.0 row | State |
|---|---|---|
| [`desktop-consent/`](desktop-consent/INDEX.md) | consent and safety: approvals, start apps asked before the first capture, exclusions, system-wide chords refused (P9), clipboard chords allowed (D-031), consequential actions, terminal panels, tty consent never from a pipe, pre-approvals bound to their app | holds, 10 checks; 11 of 11 mutants |
| [`desktop-agent-loop/`](desktop-agent-loop/INDEX.md) | agent loop: malformed batches post nothing; bounded in steps and time; cancellable | holds through runs on the fake helper, 4 checks; 4 of 4 mutants |
| [`desktop-trajectory/`](desktop-trajectory/INDEX.md) | trajectory privacy: no out-of-scope titles, secure text redacted, mapping recorded, secrets scrubbed from the files, the result and onEvent | holds, 6 checks; 3 of 3 mutants |
| [`desktop-integration/`](desktop-integration/INDEX.md) | integration: startRun returns screenshot and replayable trajectory; unclean and symlinked starts; clean re-exec; DSH's MCP tool offers desktop runs and refuses what no caller may ask | holds, 9 checks; 8 of 8 mutants |
| [`desktop-human-control/`](desktop-human-control/INDEX.md) | human control: local input only pauses, and leaves no stop behind a consent wait; a person resumes, stops, takes over and hands back; the live view streams frames, its view link only watches; apps are approved there by the control link only | holds through runs on the fake helper, 10 checks; 10 of 10 mutants |
| [`desktop-helper-protocol/`](desktop-helper-protocol/INDEX.md) | environment and consent: the helper speaks protocol 0.2 | holds, 18 checks on the fake helper and CUHelper 0.2.0 |
| [`desktop-helper-boundary/`](desktop-helper-boundary/INDEX.md) | environment: the helper's D-029 peer boundary, indicator, one helper, no lingering | unjudged until CUHelper 0.2.0 (#184); 4 of 4 on #184 |
| [`desktop-helper-dryrun/`](desktop-helper-dryrun/INDEX.md) | action contract, consent, human control, trajectory on the real helper's rules: tags, global points, point re-check, release of held input, no unapproved pixels in a capture, the masked menu bar, the settle after a resume (dry run) | holds, 10 checks; 10 of 10 mutants |
| [`desktop-fixture/`](desktop-fixture/INDEX.md) | evaluation: CU Fixture tasks machine-checkable, injection screens register | holds offscreen, 45 checks (25 tasks, 12 injection screens, two apps, input evidence, layout) |
| [`desktop-perception/`](desktop-perception/INDEX.md) | perception: screenshot points map back within one point (scale 1, Retina, secondary display) | holds on the driver and fake helper, 12 checks; 5 of 5 mutants caught |
| [`desktop-action-contract/`](desktop-action-contract/INDEX.md) | action contract: GA actions as helper events, refusals by name | holds on the driver and fake helper, 9 checks; 7 of 7 mutants caught; batch half after C5 |

```bash
_verifiers_/fixture-site/verify.sh
```

## Read next

[`../INDEX.md`](../INDEX.md).
