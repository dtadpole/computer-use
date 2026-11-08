---
title: Desktop human control claims
created: 2026-11-02T10:18:03Z
modified: 2026-11-05T13:36:17Z
level: L1
version: 0.5.0
description: What the desktop-human-control verifier claims before the grant - local input pauses a run and can never resume or stop it; only a person resumes, stops, takes over and hands back; the live view streams frames and its view link only watches.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (human control row)
  - source: _designs_/desktop-extension/human-control.md@0.3.4
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| H1 | Local input part-way through a click pauses the run (sender local_input); nothing more reaches the helper; the record holds the input's kind only | no-pause-request |
| H2 | Local input cannot resume, stop or take over the run | local-input-resumes |
| H3 | A person's resume brings the run back: the next action reaches the helper and the run completes | stop-never-clears |
| H4 | A person's stop while paused ends the run cancelled, with nothing more sent | - |
| H5 | A person watches live: the view link's /screen streams the desktop run's frames (the helper's watch) | no-screencast |
| H6 | The control link takes over: the agent sends nothing; remote input is refused (out of scope by design, Q-D7) with nothing sent; hand back resumes the agent | acts-while-taken-over |
| H7 | The view link only watches: it cannot take over or send input | view-can-take-over |
| H8 | A new app is approved in the live view by the control link only: the view link cannot answer the new_app question; the control link approves it once and the click goes through | view-can-consent |
| H9 | Local input while a consent question waits leaves no driver stop behind: approved and resumed, the run acts again (both clicks reach the helper) and completes (#263) | stop-outlives-wait |
| H10 | After a person resumes, only the first input asks the helper to settle (settleMs, design 0.4.2); the run's first input and later ones do not; the run completes | settle-every-input, no-settle-after-resume |

Local input comes from the fake helper's localInputAfter quirk, as the real helper's guards report it; the live half -
a real key press pausing a run in CU Fixture, judged from its input log - follows the owner's grant.

## Read next

[INDEX.md](INDEX.md).
