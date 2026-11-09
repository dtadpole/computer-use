---
title: Owner checklist - the owner session (step 4, G2, the Replace chain)
created: 2026-11-05T17:25:00Z
modified: 2026-11-09T15:00:00Z
level: L1
version: 0.4.0
description: 'One page for the owner - what you do in the owner session, in order, and how long each step takes, at the Mac mini (the Confirm prompt) or over Screen Sharing; the per-part tables are in owner-checklist-parts.md. Rehearsed on helper 0.2.62 with labelled stand-ins (CU-341).'
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/human-control.md@0.4.6
  - source: _designs_/desktop-extension/physical-confirmation.md (the prompt, its 1 s arm, no Return, no remote confirmation)
  - source: _environments_/macos-desktop/run-lock.mjs (D-066's five minutes; the prompt only on owner_active; a Cancel or timeout blocks the seat's next prompt for 5 minutes)
  - source: _environments_/macos-desktop/helper/Sources/ConfirmPrompt.swift (never key; no key equivalent)
  - source: _tools_/live-view/ui-logic.mjs (the texts quoted in owner-checklist-parts.md)
  - source: _verifiers_/desktop-human-control/owner-step4.mjs (the step 4 run)
  - source: Linear CU-11, CU-119, CU-135, CU-203 and CU-341 (rehearsal R1 and R1b on helper 0.2.62, 9 Nov)
---

# Owner checklist - the owner session

One sitting, three parts. cu-verifier runs each part as an announced scripted run in **CU Fixture** and calls every
step. Nothing you own is touched, no setting changes, and the helper is CUHelper 0.2.62. What each press shows:
[owner-checklist-parts](owner-checklist-parts.md).

## Before (2 minutes)

1. Quit Typeless and any app that floats a window over the screen; dismiss the two notification alerts (top right).
2. Open both links in a browser **on the Mac mini** (they bind 127.0.0.1). For the watch link, cu-verifier gives you
   the run's `live view (watch):` line. For the control link, copy the **whole line** cu-verifier gives you (it
   starts `CU_HOME=...`) and run it **in your own Terminal**; the link prints only there. The page title starts
   `[cu live view]`.
3. Then take your hands off the Mac. cu-verifier holds the Mac for the session, and that hold needs five minutes of
   no input, so it is taken before you start.

## In order

| # | You | How long |
|---|---|---|
| 1 | **Part 1, step 4 (CU-11).** At the prompt (see below), Confirm. When cu-verifier says so, press one key on the Mac: the run pauses before its next action. Then on the control link: **Resume**, **Take over**, **Hand back**, **Stop**. | about 8 minutes |
| 2 | **Part 2, G2 (CU-119), live only, no rehearsal.** At the prompt, Confirm. While the run holds a key, press any key once: the held key comes up and the run pauses. Then **Stop**. | about 1 minute |
| 3 | **Part 3, the Replace chain (CU-135).** At the prompt, Confirm. Answer the file choice **Approve once**; answer the separate Replace question **Decline**. | about 2 minutes |

Part 2 was not rehearsed: no scripted stand-in can act during a hold (CU-343), so the dry run and your press here
are its evidence; no rehearsal pass covers it. Each control press takes effect at once: the rehearsal measured 6 to 34 ms from a press to the new state. After
Resume or Hand back, the agent waits 1.5 s of hands-off before its next action.

## The prompt at each part's start

- **At the Mac mini** (about 15 minutes in all): each part opens the helper's prompt "<seat> wants to post clicks
  and keys into this session. Confirm lets this one run start now."
  - A **Return** does nothing: the prompt never takes the keyboard. A click on **Confirm** in its first second also
    does nothing.
  - **Wait a second, then click Confirm** with the mouse or trackpad.
  - **Cancel** refuses the part. After a Cancel, or 60 s with no answer, that seat cannot ask again for 5 minutes.
- **Over Screen Sharing** (about 25 minutes in all): a remote click cannot confirm, because it is not hardware. Before
  each part, leave the Mac untouched for five minutes; cu-verifier says when the next part starts. Your remote key
  or click must pause a running part as it would at the Mac, and cu-verifier checks that first.

Once a part runs, your own input pauses it and never ends it; you stop it with the control link. In Part 1, the run
answers any question itself (declined), so you see no consent buttons there.

## Report at once

- a part that started by Return, or by a click in the prompt's first second;
- agent input while paused or taken over;
- a resume you did not press;
- any window but CU Fixture on the page;
- control buttons or consent answers on the watch link;
- in Part 3, a Replace that happens without its own question.
