---
title: Red team of the two signed consent tables (D-059 routes, D-061 classes), M8-M9
created: 2026-11-08T01:27:07Z
modified: 2026-11-08T12:51:21Z
level: L1
version: 2.0.0
description: What the red team of the D-059 route matrix and the D-061 class table found on 7-8 November, which fixes it re-tested, and the methods the seat now follows.
status: unverified
grounded_in:
  - source: 'Linear CU-145, CU-171 and their children CU-187..CU-257 filed by cu-researcher'
  - source: 'pull requests - old #424, #425 (the sign-offs); this repository #12, #20, #23, #30, #40, #41, #43, #48, #51, #57'
  - source: 'cu-verifier live runs cited in _tests_/agent-core/consent-routes.test.mjs and sensitive-classes.test.mjs'
---

# Red team of the two signed consent tables

Both tables are executable on main: `consent-routes.test.mjs` (D-059) and `sensitive-classes.test.mjs` (D-061).
A closed row names cu-verifier's run or a D-number (D-064); an unrun row reads `open CU-n` or `todo CU-n`. D-059
has a second section judged through createAppPolicy as the loop calls it (P9 refusals, launch_code, CU-249).

## Gaps filed on 8 November

| Issue | Gap | State at 12:50Z |
|---|---|---|
| CU-230 | a paste chord with Shift or Option skipped the paste checks | Done, every cell closed live |
| CU-234 | Shift/Option-Space and modified Backspace unjudged | fixed (#31), every cell closed live |
| CU-232 | a chord firing a menu item judged by its keys | #26 in; helper and driver landing |
| CU-245, CU-257 | secrets typed unasked (spaced SSN, PEM, JWT; API tokens) | #46 in; CU-257 rows open |
| CU-249, CU-251 | Services and owner-setting hotkeys allowed | refused (#49, #50) |
| CU-252, CU-254 | a menu Open of a script; App Store installs | fixes in review |
| CU-253 | a chat app's Return sends | fix #52 in review |

Red team of others' fixes added: hidden duplicate key equivalents (#36), the bound-item precedence (CU-256), an
iframe-body editor the Command-Enter rule cannot see (CU-241), price and free-trial buttons (#58).

## Methods this seat follows

- Probe through runTask (the desktop-consent harness, elements as `{rect, element}`) before calling a hole live;
  a probe whose control does not ask is invalid (CU-243, CU-244).
- A gap gets its todo row at once; an undecided fix gets `not:allow`; whichever of row and fix lands second flips it.
- Check every live row's chords against macOS hotkeys and Services before it runs (#45's Dock-hiding chord).
- A document changes after the code it describes lands.
- Commit before any detached test merge; fetch PR refs with `+` after a force push.
- A todo row must discriminate: it fails with its one distinguishing field removed.
- Review on the three-dot diff and a real test merge, never git merge-tree.
- Read PR states as `number=state`; never verify my own filings.
