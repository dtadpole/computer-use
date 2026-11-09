---
title: Red team of the two signed consent tables (D-059 routes, D-061 classes), M8-M9
created: 2026-11-08T01:27:07Z
modified: 2026-11-08T22:16:40Z
level: L1
version: 2.3.0
description: What the red team of the D-059 route matrix and the D-061 class table found on 7-8 November, which fixes it re-tested, and the methods the seat now follows.
status: unverified
grounded_in:
  - source: 'Linear CU-145, CU-171 and their children CU-187..CU-296 filed by cu-researcher'
  - source: 'pull requests - old #424, #425 (the sign-offs); this repository #12, #20, #23, #30, #40, #41, #43, #48, #51, #57, #63, #65, #68, #69, #73, #77, #125-#151'
  - source: 'cu-verifier live runs cited in _tests_/agent-core/consent-routes.test.mjs and sensitive-classes.test.mjs'
---

# Red team of the two signed consent tables

Both tables are executable on main: `consent-routes.test.mjs` (D-059) and `sensitive-classes.test.mjs` (D-061).
A closed row names cu-verifier's run or a D-number (D-064); an unrun row reads `open CU-n` or `todo CU-n`. D-059
has a second section judged through createAppPolicy as the loop calls it (P9 refusals, launch_code, CU-249).

## Gaps filed on 8 November

| Issue | Gap | State at 22:16Z |
|---|---|---|
| CU-230..266 (15), 283..288 | chords, typed secrets, Services, App Store, standing choices, URL secrets, outward actions, exclusions, link schemes, hidden characters, tax ids, URL phones and addresses, real-app wordings | Done |
| CU-253, 289, 293 | chat Return; saving a password or passkey; names judged in English only | Verify (#131, #136, #145) |
| CU-252 | an open of an unreadable selection | ruled 22:13Z: asks in any app |
| CU-279, 296 | an IDE terminal or console in another language | #146, #149 |
| CU-291, 294 | joined phone names, acct=; Chinese web words | #147, #151 |
| CU-292 | seven apps missing from the exclusions | policy on main (#143); helper floor #150 |
| CU-263 | a CAPTCHA is a plain click | In Progress |

Red team of others' fixes added: a stuck modifier, and a drag cu-verifier caught and I missed (#128); trial lengths
past my examples (#138); a passkey (#136); four Apple labels in #145 (回复, 清倒废纸篓, 丟到垃圾桶, Never Save's class);
the IDE shape refusing a field named like a terminal (#146, named); 控制台, a cloud dashboard, refused anywhere (#149,
scoped to IDEs); a configured checkout symlinked out of the home folder, admitted through the lexical route (#150).

## Methods this seat follows

- Probe through runTask before calling a hole live; a probe whose control does not ask is invalid. In the
  desktop-consent harness the focus goes in the world (world.focused) - desktopRun ignores a focus option.
- A gap gets its todo row at once (`not:allow` when the fix is undecided); the second lander flips it.
- A row must fail with its one distinguishing field removed; a fix may be driver-specific, so a row per driver.
- Key-rule test values are never all hex - the digest rule would mask the gap.
- A combined merge check runs the tests: two clean merges can still redeclare an identifier.
- Check live chords against macOS hotkeys and Services; verify a cited source myself.
- Documents change after the code lands; read a diff before a re-OK; read the inbox before every push.
- Commit before a detached test merge; never verify my own filings.
- Probe every name rule with real app wordings; keep an issue's rows to its scope; check a fix at its head.
- Read the code before an OK; gate a commit on its edit (run ids counted, 0 failures), not on tests alone.
- Take labels from an app's own localization files (vscode-loc, mozilla-l10n, Apple's guides in zh-cn and zh-tw).
- Trace every route of a check; a 'Fixes CU-n' PR must pass every todo pinned to CU-n.
