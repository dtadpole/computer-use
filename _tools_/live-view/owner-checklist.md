---
title: Owner checklist - the owner session (step 4, G2, the Replace chain)
created: 2026-11-05T17:25:00Z
modified: 2026-11-08T03:44:30Z
level: L1
version: 0.3.1
description: The owner session's two modes (at the Mac mini with the Confirm prompt, or over Screen Sharing with five-minute breaks), what to do before it, and what to report; the parts are in owner-checklist-parts.md. One page for the owner's sitting - step 4 (pause, resume, take over, hand back, stop and his own input on a desktop run), G2 (his input during a key hold) and CU-135's Replace chain on the real save panel - what he presses and what he should see.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/human-control.md@0.4.4
  - source: _designs_/desktop-extension/physical-confirmation.md (the prompt, its 1 s arm, no Return, no remote confirmation)
  - source: _environments_/macos-desktop/run-lock.mjs (D-066's five minutes; own_hold admits at 300 s, CU-208)
  - source: _environments_/macos-desktop/helper/Sources/LocalInput.swift localInputTapCallback (any input not tagged by the helper pauses a run, Screen Sharing's included)
  - source: _designs_/system-architecture/run-tokens.md@0.6.1
  - source: _tools_/live-view/ui-logic.mjs (controlsFor, noticeFor, consentView, pageFor - the texts quoted here)
  - source: _environments_/macos-desktop/helper-link.mjs (SETTLE_MS 1500, SETTLE_CAP_MS 60000)
  - source: Linear CU-11, CU-37, CU-119 and CU-135
  - source: _tools_/agent-core/loop.mjs (the held-key notice, G2)
  - source: _verifiers_/desktop-human-control/owner-step4.mjs (the step 4 run)
---

# Owner checklist - the owner session

One sitting in three parts - step 4 (CU-11), your input during a key hold (G2, CU-119) and the Replace chain
(CU-135). cu-verifier runs each as an announced scripted run in **CU Fixture** and calls every step; nothing you own is
touched and no setting is changed. What you press in each part: [owner-checklist-parts](owner-checklist-parts.md).

## Two ways to take part

A desktop run refuses to start within five minutes of your own input on the Mac (D-066), and each part ends with your
input, so every part needs a fresh start:

- **At the Mac mini** (about 15 minutes; helper 0.2.50 or later): each part opens the helper's prompt "<seat> wants
  to post clicks and keys into this session. Confirm lets this one run start now." At the first prompt, check it as cu-verifier calls
  each step: once cu-verifier says CU Fixture is in front, press **Return** -
  nothing happens on the prompt (it never takes the keyboard: a Return goes to the app in front, so never with your
  Terminal there); click **Confirm** within a second of it appearing - nothing happens; wait a second, then click
  **Confirm** with the mouse or trackpad - the part starts. After that, wait a second and click Confirm each time;
  **Cancel** refuses the part at once. Then take your hands off - your next touch pauses the part.
- **Over Screen Sharing** (about 25 minutes; also at the Mac before helper 0.2.50): a remote click cannot confirm (it
  is not hardware), so before each part leave the Mac untouched for five minutes - cu-verifier says when the next part
  starts. Your remote key or click should pause a running part as at the Mac - cu-verifier checks that first when
  you join remotely.

Once a part runs, your input pauses it and never ends it; you stop it with the control link.

**Before.** Quit Typeless and any app that floats a window over the screen, and dismiss the two notification alerts
(top right). Both links bind 127.0.0.1: open them in
a browser **on the Mac mini**. Watch link: the run's `live view (watch):` line. Control link: copy the
**whole line** cu-verifier gives you (it starts `CU_HOME=...`: the run keeps a private store) and run it **in your
own Terminal** - the link prints only there.
The header shows run, state and `(control)` or `(watching)`; the title starts `[cu live view]`.

## Any part

**Report at once:** a part started by Return or by a click in the prompt's first second; agent input while paused or
taken over; a resume you did not press; any window but CU
Fixture on the page; control buttons or consent answers on the watch link.
