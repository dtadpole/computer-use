---
title: No app window - a run whose approved apps show no window
created: 2026-11-06T16:08:20Z
modified: 2026-11-06T23:17:42Z
level: L1
version: 0.2.4
description: What the helper, the driver and agent core do when no window of an approved app is on screen - a marked blank frame, a named stop at the first capture, a note to the model and a bound - instead of helper_lost.
status: unverified
grounded_in:
  - source: CU-98 (cu-verifier's false alarm, 2026-11-06 15.58-16.00 UTC - replayd rejects an empty window filter)
  - source: cu-developer-three's helper proposal and cu-verifier's acceptance list for CU-98
  - source: cu-researcher's red team N1-N6 and cu-developer-two's driver plan, 2026-11-06
---

# No app window (CU-98)

With no window of an approved app on screen, the capture's window list is empty; macOS refuses it, and today the run
ends in 0.2 s as `helper_lost` - the helper is not lost, and nothing says to open the app.

## The rule

| Part | What it does |
|---|---|
| helper (cu-developer-three) | an empty include list makes no ScreenCaptureKit call - never a display capture instead: a black frame, `windows: []`, `noAppWindow: true`; input stays refused, nothing approved being under any point |
| driver (cu-developer-two) | at a run's first capture, while `noAppWindow` (or an older helper's empty-filter refusal) holds, it re-captures every 500 ms for up to 5 s, then ends the run `EnvironmentError('no_app_window', message, {apps})` (bundle ids; agent core names them from its approvals); later captures carry `noAppWindow`; on an older helper (before 0.2.32) the failed capture already ends the link, so the start wait cannot apply and an app still opening ends `no_app_window` at once - mapped only on the exact refusal and the scope reply's evidence of no window. At `addApp` a blank frame (0.2.32) still confirms the frame's geometry; the stop belongs to the first screenshot, whose error ends the run (#247). The start wait runs once per run: once it has expired, any later capture still without a window - agent core's closing capture included - fails at once, so a closed app ends the run in about 5 s, not 10 (#262) |
| agent core (cu-developer-one, CU-99) | a `noAppWindow` observation is text only - the note and no image; its trajectory event has `noAppWindow: true`; 15 s with no approved window since the last capture that had one ends the run `no_app_window`; a start-app join failing `no_app_window` (or `helper_lost`, `display_changed`, `not_granted`) ends the run with it; a blank closing capture is marked too |
| live view (cu-developer-two) | says no window of the app is on screen instead of showing black; the server passes `noAppWindow` in the desktop facts it sends the page (#266, tested through the real server) |

The note: "No window of an approved app is on screen, so there is no screenshot; input cannot act. Wait if it is
opening; otherwise end and say so." Never `helper_lost`: the link stays usable.

## What the person sees and how runs are scored

The last line names the app, the likely causes - not running, its windows closed, minimized or hidden, on another Space
or display - and the fix: show it, then run again. A judge never takes a `noAppWindow` step as the final screen; a `no_app_window` row is an environment outcome, excluded with its reason - unless the model's own input came
right before the last streak's first blank capture (`precededByModelAction`), which makes it the model's outcome.

## Acceptance (cu-verifier)

- Helper: an empty include list makes no capture call and replies the blank frame (dry-run test; a display fallback
  fails it); a click at the blank frame's centre is refused with nothing posted (a mutant skipping the hit-test fails).
- Driver: a window within the 5 s wait runs normally; none ends `no_app_window` naming the apps (a restored
  `helper_lost` fails); the older helper's refusal maps the same.
- Agent core: the note reaches the model with no image; the event carries `noAppWindow`; 15 s without a window ends
  the run; a window resets it (each tested, with mutants).
- Live view names the missing window.
- Live, through CUHelper under a hold after the 0.2.32 install: CU Fixture closed ends `no_app_window` within the wait
  plus 2 s, no CUHelper left; CU Fixture open passes.
