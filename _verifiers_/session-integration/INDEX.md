---
title: Session integration verifier
created: 2026-11-01T18:28:53Z
modified: 2026-11-01T19:04:48Z
version: 1.1.0
description: Judges the ULTIMATE_GOAL integration row by playing the calling session over stdio against the computer-use MCP server - tool surface, no browser at start-up, a scripted run with its screenshot returned, consent unanswerable by the caller, clean exit - and proves it fails on three broken builds.
grounded_in:
  - source: _designs_/system-architecture/integration-surface.md
  - source: _context_/team-operations/decision-log.yaml (D-012, D-013)
---

# Session integration verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | one server over stdio: handshake, two scripted runs, the self-consent attempt, stdin close |
| [mutants.mjs](mutants.mjs) | `control-leaks-take-over`, `approval-not-refused-by-name`, `no-exit-on-stdin-close` |
| [live-dsh-session.mjs](live-dsh-session.mjs), [live-heddle-session.mjs](live-heddle-session.mjs) | on demand: a real DSH and heddle session in isolated homes (session model billed) |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, computer-use-mcp 81ac9151b, agent-core 6a4fd0877 | Verdict |
|---|---|
| first runs | 1, mine: Chrome processes that predated the server were counted as its leftovers. Only processes started during the test are judged now |
| the build, twice | 0, all 4 checks; the server's Chrome gone 0.1 to 0.6 s after exit |
| mutant proof | 3 of 3 caught, each by its own check |
| live sessions, heddle 9cbeb6cd9 | DSH and heddle each passed, 13 s and 9 s: tools called, task passed, badge code read off the screenshot |

## Read next

[`../INDEX.md`](../INDEX.md).
