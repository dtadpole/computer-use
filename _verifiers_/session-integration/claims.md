---
title: Session integration claims
created: 2026-11-01T18:35:00Z
modified: 2026-11-02T08:34:00Z
level: L1
version: 1.2.0
description: What the session-integration verifier claims about the computer-use MCP server - a stdio tool surface with no approval path, no browser before a start, a scripted run completed over MCP with its screenshot returned, consent unanswerable by the caller, and a clean exit when the session closes.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (integration row)
  - source: _designs_/system-architecture/integration-surface.md
---

# Claims

The check plays the calling session over stdio, as DSH's stdio transport does. Evidence: the fixture (D-012), the
PNG bytes returned, the process table and the files on disk.

| # | Claim | Mutant it catches |
|---|---|---|
| I1 | `tools/list` gives exactly start, status, respond and control; respond takes only run_id, question_id and answer; control offers no take_over, hand_back or consent | `control-leaks-take-over` |
| I2 | Start-up launches no browser | - |
| I3 | A scripted run started over MCP completes visitor-badge (fixture verdict pass) and returns a 1440x900 PNG, the run directory, and no control URL | - |
| I4 | While a purchase waits for a person, the caller's approval is refused by name, an answer is refused, control consent and take_over are refused, and nothing is bought | `approval-not-refused-by-name` |
| I5 | Closing stdin ends the server; no Chrome and no profile remain | `no-exit-on-stdin-close` |
| I6 | A real headless DSH session (isolated home) calls start and status; the task passes; the final screenshot's bytes are in DSH's attachment store; the reply holds the badge code shown only in the screenshot; a trajectory link reached it | live, opt-in |
| I7 | A real headless heddle session (isolated home, the heddle plugin) does the same; heddle keeps no image, so its reply holding the badge code is the proof the screenshot arrived | live, opt-in |

**Recorded runs (2026-11-01, session model claude-sonnet-5-5):** I6 ran at 19:04 UTC, run 20261101T190415Z-005768,
fixture verdict pass, badge code matched, `node --test` pass 1 fail 0 in 12.8 s. I7 ran at 19:04 UTC on heddle
9cbeb6cd9, run 20261101T190425Z-83ffeb, fixture verdict pass, badge code matched, pass 1 fail 0 in 9.4 s. Build:
41580559f plus the badge-code change, which landed as 5e30916e2. The coordinator re-ran both at 2662d9a3e (D-023).

I6 and I7 bill the session model, so they run on demand (`live-*.mjs`), not in verify.sh. The badge code is
drawn at random when the badge is made and is in no run file, so only the screenshot can carry it.

## Read next

[`INDEX.md`](INDEX.md).
