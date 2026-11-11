---
title: Live rows
created: 2026-11-11T06:11:50Z
modified: 2026-11-11T06:19:25Z
version: 1.1.0
description: The live-row harness - press each row's control once on its own loopback page through the real loop and the real Chrome driver, decline every ask, and check the click, Return, Space and double-click cells against the ruled class.
grounded_in:
  - source: Linear CU-458 (the harness moves from a seat's /tmp into the repository)
  - source: _context_/team-operations/decision-log.yaml (D-005, D-014, D-106, D-109)
---

# Live rows

The harness the [cu] team used for the consent Highs' live second OKs and the landed-fix parity sweeps (10-11 Nov),
moved into the repository so every seat runs the same file. Judge-side: it imports agent core only through
[verify-kit's loadSut](../verify-kit/sut.mjs) (`CU_VERIFY_SUT`, else this tree).

| File | Owns |
|---|---|
| [rows.mjs](rows.mjs) | the row schema and `validateRows`, the page per row (`pageHtml`, UTF-8), page context (`rowUrl`: `path`, `suffix`, `host`; the row served at `/page/r<index>`), the modes (`modeSteps`), `cellCount`, `isInvalid` - pure |
| [sweep.mjs](sweep.mjs) | `node sweep.mjs --rows <rows.json> --out <results.json> --seat <seat> [--modes click,return] [--keep-runs]` - runs the rows, resumes, retries a cap-refused cell in place, stops for another seat's run or hold (D-106) with exit 3: run it again and it resumes. `--keep-runs` keeps each run's events.jsonl for a lead |
| [check.mjs](check.mjs) | `node check.mjs <results.json> <rows.json> [--modes=...]` - the done-check; exit 0 when there is no problem and nothing is missing |

## Rows

`{ id, name, expect, kind?, checked?, lines?, path?, suffix?, host?, title?, field?, select? }` - `expect` is the
ruled class, `a+b` for a row that asks two, or `free`. Kinds: button (default), input, div, checkbox, link (a real
URL), hash-link, js-link, span-link, aria-link (inert links, CU-472), row (a verb-less list item, CU-443). `lines`
renders the control's text one block per line (CU-473's two-line cards).

- **The id stays out of the URL.** The policy reads page context from the URL by substring, so an id in the path once
  gave a row a context it did not ask for ('call', 11 Nov). Each row is served at `/page/r<index>`; page context
  comes only from `path` ('/call/page/r3'), `suffix` ('#/call', '?page=call') or `host` ('call.localhost').
- **Expectations come from the stack below the PR** (D-109), and from the URL, never the title.

## Done-check

Cells = per row, one per mode, but no Return cell for link kinds, checkboxes and rows. The check holds when every
click asks exactly the classes of `expect` (an extra class is an over-ask and fails, as a missing one does; nothing,
for free), every other mode asks what the click asked, and no cell posted while an ask was declined.

## Running it

Announce `LIVE ROWS START #N` and `END #N` to cu-integrator for a High's rows (D-109 rule 3); one browser per seat;
never edit the rows or a script under a running sweep. Named limits: real-URL links are navigation; canvas-drawn
controls; desktop-only rows.
