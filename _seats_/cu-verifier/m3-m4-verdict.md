---
title: M3 and M4 acceptance verdict
created: 2026-11-01T18:43:34Z
modified: 2026-11-01T18:43:34Z
level: L1
version: 1.0.0
description: cu-verifier's independent verdict on milestones M3 (consent and safety, human control, trajectory) and M4 (integration) at build 842b12c06 - every verifier holds and fails on every broken build, with what stays open.
status: unverified
grounded_in:
  - source: _verifiers_/INDEX.md
  - source: _context_/team-operations/decision-log.yaml (D-012, D-020)
---

# M3 and M4 verdict: accepted

The code under test is build `842b12c06`, clean. Every verifier ran on it in one sequence, judged only from the
fixture, the input recorder, the process table, PNG bytes and the filesystem (D-012).

| Row | Verifier | Checks | Mutants caught |
|---|---|---|---|
| consent and safety (M3) | [consent-safety](../../_verifiers_/consent-safety/INDEX.md) | 6 of 6: five tasks approved, declined and unattended, plus the site filter | 3 of 3 |
| human control (M3) | [human-control](../../_verifiers_/human-control/INDEX.md) | 5 of 5: pause, take over with a person's click, hand back, stop, watch-token limits | 4 of 4 |
| trajectory (M3) | [trajectory-replay](../../_verifiers_/trajectory-replay/INDEX.md) | 3 of 3: secret absent from every file, replay matches the page, SIGKILLed run reads back | 3 of 3 |
| integration (M4) | [session-integration](../../_verifiers_/session-integration/INDEX.md) | 4 of 4: four tools and no approval path, a run with its screenshot, self-consent refused, clean exit | 3 of 3 |

The M2 verifiers and the fixture still hold on the same build: 5, 2, 13, 6 and 56 checks.

**Fixed in my own checks on the way:** a refused launch had looked like a failure; leftover processes from other
runs were counted; mutants lacked live-view and ran from `/tmp`'s link path. No defect was found in the code under
test.

**Open, not blocking:**

- The live page's buttons driven from a second browser need both team slots (D-014). The HTTP surface the buttons
  use is verified.
- A DSH or heddle session of my own. cu-developer-two's proofs stand (a388befb7, 50521b8d2); my check plays the
  calling session over the same stdio protocol.
- The full-suite fixture findings (effects not shown on three pages, disclaimed answers scored false-success) are
  being fixed separately.

## Read next

[`artifacts.md`](artifacts.md).
