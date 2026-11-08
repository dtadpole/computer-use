---
title: Keyboard activation is judged like a click
created: 2026-11-07T00:07:33Z
modified: 2026-11-08T12:27:38Z
level: L1
version: 0.3.3
description: How a keypress that activates a button - Space on a focused button, a sheet's key equivalents - is classed like a click on that button, and the destructive words a save panel's Replace sheet needs.
status: unverified
grounded_in:
  - source: CU-135 (a Replace click overwrites a file unasked; cu-developer-two, cu-verifier)
  - source: policy.mjs classify, which matches a target's name only for pointer actions and a keypress with ENTER
  - source: cu-verifier's keyboard routes and cu-researcher's sheet signal, 2026-11-07
  - source: the two trajectory scans of 2026-11-07 (models press Space on focused buttons; CU-137's unnamed hold button)
  - source: CU-234 (cu-researcher's chord sweep - modifier variants recognised generously)
---

# Keyboard activation is judged like a click

Before CU-135 destructive words were matched only for a click or ENTER, so Space on a focused Delete, Command-D on a
sheet and a save panel's Replace went unasked.

## Rule

| route | judged as |
|---|---|
| SPACE, alone or with Shift, Option or Control (CU-234), on a focused control a click activates (button, checkbox, radio, pop-up, menu item, link, disclosure) | a click on it: its name against every word list; in a text input it types a space and is not judged |
| ENTER or RETURN, a key hold, a typed newline anywhere, a typed space on a focused control | as those keys pressed: the focused element's name, a held dialog, and the window's default button, if reported, for a single-line input or non-text focus; in a text area a Return is text, Command-Return presses it (CU-142) |
| RETURN in a chat app (Command-Return too) or a Message, Reply or Chat field (CU-253) | `submit`, text areas too; Shift-Return is text |
| CMD+BACKSPACE or CMD+DELETE, any modifiers | `delete` (Move to Trash, Empty Trash, a dialog's Delete), in a text input too: the menu sees the chord before the field (CU-143) |
| CMD+D, any extra modifier too (CU-234), the focused element a button | `delete`: with a sheet or alert focused it presses Don't Save or Delete |
| words | `delete` adds replace, overwrite and don't save; a save panel's Replace names the file |

A SPACE or ENTER right after Tab, Shift-Tab or an arrow in one batch is judged on the focus the app moved to: agent
core reads it until two reads 50 ms apart agree (300 ms at most); a focus that never settles is opaque, asked.

A default button the helper could not read (`defaultButtonRead` false, or no field) asks `submit` for every route that
presses it - a Return, a newline in a single-line input, Command-Return in a text area; a helper before 0.2.44 is
refused (D-069).

`delete` is never pre-approved and is declined unattended. A Find bar's Replace asks too: accepted over-ask.

## Not done, on purpose

- An unnamed target (a custom view) is a blind spot for every word list, marked `targetUnnamed: true`; pixels, never.
- With none reported (a page without one), a Return is judged by the focused name
  only.

## Acceptance

- CU-135, met (live 01:18Z): every route asks through the real driver, unattended nothing happens; text inputs,
  Cancel, Escape and Keep Both do not. The step-4 Replace row remains.
- CU-142: a Return or typed newline into "Send a message", or an unnamed field whose default button is Send, asks
  submit, as does Command-Return in a text area; lines typed there do not. Mutants fail; live on consent-keys.
- CU-143: from a field, every Command-Backspace asks delete (a plain one fired 'Clear Line' live). Live on consent-keys.
- CU-234, measured (cu-researcher, helper 0.2.51): Shift-Space pressed CU Fixture's focused Delete button and checkbox
  (20261108T105653Z-f6cd2b, 105705Z-baca96). Option-Space, modified Backspace on a stock table and Command-Shift- or
  Command-Option-D on a stock sheet did nothing: named over-asks, kept for apps with their own key handling.
