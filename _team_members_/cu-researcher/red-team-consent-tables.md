---
title: Red team of the two signed consent tables (D-059 routes, D-061 classes), M8-M9
created: 2026-11-08T01:27:07Z
modified: 2026-11-08T21:12:13Z
level: L1
version: 2.2.0
description: What the red team of the D-059 route matrix and the D-061 class table found on 7-8 November, which fixes it re-tested, and the methods the seat now follows.
status: unverified
grounded_in:
  - source: 'Linear CU-145, CU-171 and their children CU-187..CU-291 filed by cu-researcher'
  - source: 'pull requests - old #424, #425 (the sign-offs); this repository #12, #20, #23, #30, #40, #41, #43, #48, #51, #57, #63, #65, #68, #69, #73, #77, #125-#141'
  - source: 'cu-verifier live runs cited in _tests_/agent-core/consent-routes.test.mjs and sensitive-classes.test.mjs'
---

# Red team of the two signed consent tables

Both tables are executable on main: `consent-routes.test.mjs` (D-059) and `sensitive-classes.test.mjs` (D-061).
A closed row names cu-verifier's run or a D-number (D-064); an unrun row reads `open CU-n` or `todo CU-n`. D-059
has a second section judged through createAppPolicy as the loop calls it (P9 refusals, launch_code, CU-249).

## Gaps filed on 8 November

| Issue | Gap | State at 21:15Z |
|---|---|---|
| CU-230, 232, 234, 245, 249, 251, 254, 257, 258, 260, 261, 264, 265, 266, 285 | chords, typed secrets, Services, App Store, standing choices, URL secrets, outward actions, exclusions, link schemes, hidden characters, tax ids | Done |
| CU-252 | an Open of a script or bundle | reopened live (kind unknown on the stand-in); #139 judges a launchable name, #141 records the read |
| CU-253 | a chat app's Return sends | Verify; 'Type a new message' and trailing ellipses (#131) |
| CU-263 | a CAPTCHA is a plain click | In Progress |
| CU-279 | a localized terminal label | Todo |
| CU-283, CU-284 | a phone or street address in a URL | #125 queued |
| CU-286, 287, 288 | real-app wordings: Meet, Slack, Firefox; chat apps by kind; trials, codes by length, bookings, e-filing | Verify (#134, #135, #138) |
| CU-289 | saving a password or passkey, 'Never save' | #136 queued |
| CU-291 | joined phone names, acct= | Todo, High |

Red team of others' fixes added: a stuck modifier after the helper's watchdog exit, and a drag dropped by its
button-up, which cu-verifier caught and I missed (#128); trailing ellipses in compose names (#131); trial lengths
that fit only my examples (#138); a chat-app rule already on main, so a fix's real change was Telegram Desktop
(#135); a passkey left out of 'storing a credential' (#136).

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
