---
title: Red team of the two signed consent tables (D-059 routes, D-061 classes), M8-M9
created: 2026-11-08T01:27:07Z
modified: 2026-11-08T13:44:58Z
level: L1
version: 2.1.0
description: What the red team of the D-059 route matrix and the D-061 class table found on 7-8 November, which fixes it re-tested, and the methods the seat now follows.
status: unverified
grounded_in:
  - source: 'Linear CU-145, CU-171 and their children CU-187..CU-266 filed by cu-researcher'
  - source: 'pull requests - old #424, #425 (the sign-offs); this repository #12, #20, #23, #30, #40, #41, #43, #48, #51, #57, #63, #65, #68, #69, #73, #77'
  - source: 'cu-verifier live runs cited in _tests_/agent-core/consent-routes.test.mjs and sensitive-classes.test.mjs'
---

# Red team of the two signed consent tables

Both tables are executable on main: `consent-routes.test.mjs` (D-059) and `sensitive-classes.test.mjs` (D-061).
A closed row names cu-verifier's run or a D-number (D-064); an unrun row reads `open CU-n` or `todo CU-n`. D-059
has a second section judged through createAppPolicy as the loop calls it (P9 refusals, launch_code, CU-249).

## Gaps filed on 8 November

| Issue | Gap | State at 13:45Z |
|---|---|---|
| CU-230, CU-234 | modified paste and Space/Backspace chords unjudged | fixed, every cell closed live |
| CU-232 | a chord firing a menu item judged by its keys | helper 0.2.52 installed; driver #27 next |
| CU-245, CU-257 | secrets typed unasked (spaced SSN, PEM, JWT; API tokens) | CU-245's value rows closed live; #61 in review |
| CU-249, CU-251 | Services and owner-setting hotkeys allowed | refused (#49, #50) |
| CU-252, CU-254 | a menu Open of a script; App Store installs | helper #70, driver #66; #58 |
| CU-253 | a chat app's Return sends | fixed (#52) |
| CU-258 | Always Allow, Don't ask again allowed | #64 in review |
| CU-260 | a secret in a navigate URL leaves unasked | High; fix queued |
| CU-261 | calls, meetings, invitation replies, posts, merges allowed | High; fix queued |
| CU-263 | a CAPTCHA is a plain click | P2 |
| CU-264 | Disk Utility, Activity Monitor not excluded | High; fix queued |
| CU-265 | facetime:, tel: links unjudged | P2 |
| CU-266 | a zero-width space or look-alike hides a word or value | High; fix queued |

Red team of others' fixes added: hidden duplicate key equivalents (#36), the bound-item precedence (CU-256 - only
one enabled app item wins), an iframe-body editor (CU-241), price and free-trial buttons (#58), wording variants
(#64), an app bundle read as a folder (#70), a card in a URL path kept as a named limit (CU-260).

## Methods this seat follows

- Probe through runTask before calling a hole live; a probe whose control does not ask is invalid.
- A gap gets its todo row at once (`not:allow` when the fix is undecided); the second lander flips it.
- A row must fail with its one distinguishing field removed; a fix may be driver-specific, so a row per driver.
- Key-rule test values are never all hex - the digest rule would mask the gap.
- A combined merge check runs the tests: two clean merges can still redeclare an identifier.
- Check live chords against macOS hotkeys and Services; verify a cited source myself.
- Documents change after the code lands; read a diff before a re-OK; read the inbox before every push.
- Commit before a detached test merge; never verify my own filings.
