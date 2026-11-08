---
title: Traceability to requirements R1 to R62
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.8.2
description: Which article of this design carries each requirement R1 to R62 of the ChatGPT computer-use study, in which milestone, and which requirements are adapted or deferred and why.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/implications-environment-and-perception.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-actions-and-loop.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-safety-and-control.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-observability-and-evaluation.md@1.0.0
---

# Traceability, R1 to R62

Requirement text is in the four `implications-*` articles of [the study](../../_context_/chatgpt-computer-use/INDEX.md),
as of its verified revision (b3ae00270). How each ULTIMATE_GOAL row is checked is in [goal-checks](goal-checks.md).

## Carried

| Article | Requirements | Milestone |
|---|---|---|
| [environment-driver](environment-driver.md), [environment-behaviour](environment-behaviour.md) | R1, R2, R3, R4, R8, R10 | M2 |
| [keys-and-coordinates](keys-and-coordinates.md) | R9, R10, R12, R15, R16 | M2 |
| [action-schema](action-schema.md), [anthropic-mapping](anthropic-mapping.md) | R14, R15, R17, R19, R20, R54, R55, R60 | M2 |
| [agent-loop](agent-loop.md), [run-outcomes](run-outcomes.md) | R19, R20, R22, R23, R55; R21, R24 | M2; M3 |
| [model-adapters](model-adapters.md) | R3, R17, R20, R21 | M2 |
| [action-policy](action-policy.md) | R27, R28, R29, R51; R56 | M3 |
| [site-filter](site-filter.md) | R2, R32, R51 | M2 (filter), M3 (`new_site` consent) |
| [consent-gate](consent-gate.md), [consent-authority](consent-authority.md), [run-tokens](run-tokens.md) | R21, R26, R28, R30, R31, R38, R61 | M3 (R61 through `tty` and `live`, D-013) |
| [untrusted-content](untrusted-content.md) | R26, R33, R34 | M3 |
| [live-control](live-control.md) | R37, R38, R39, R57, R62 | M3 |
| [trajectory](trajectory.md) | R43, R44, R45, R47; R46 | M2; M3 |
| fixture site, verifiers, task suite (cu-verifier) | R48, R49, R50, R51, R58 | M2 onward |

## Adapted or deferred

| ID | Disposition |
|---|---|
| R1 | Chrome over CDP, not Playwright (D-008); the study now words R1 that way |
| R5, R18 | Deferred past M3: the owner asked for screenshot-and-input computer use; `exec_js` through CDP `Runtime` may come later as a second action path |
| R6, R7, R40 | M5, only after owner approval (D-006); R40 needs a real display |
| R11 | Partial: `pageText` feeds the inspector; offering structured reads to the model waits for evaluation data |
| R12 | Claude's `zoom` stays disabled through `configs` until the driver's region capture passes its tests |
| R13, R25, R35, R36, R42, R52, R53, R59 | LATER, as the study marks them; R25 already has `attempted` and `completed` events, and the inspector is a first, synchronous step toward R35 |
| R41 | M3 candidate: the live view reports whether anyone is watching; once a run reaches a sensitive site, policy pauses whenever no one is, for the rest of the run |
| R31 | `thread` lifetime deferred: runs are independent in 0.x, and an MCP caller has no stable, human-verifiable session identity to bind an approval to; `batch` is R31's turn |
| R60 | The gateway ignores server-side tool-result clearing (Q-R7, probed); so no pruning and short runs |

Every MUST requirement is carried in M2, M3 or M4 or listed above with its reason.
