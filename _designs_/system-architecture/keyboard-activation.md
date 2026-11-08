---
title: Keyboard activation is judged like a click
created: 2026-11-07T00:07:33Z
modified: 2026-11-08T02:48:28Z
level: L1
version: 0.3.0
description: How a keypress that activates a button - Space on a focused button, a sheet's key equivalents - is classed like a click on that button, and the destructive words a save panel's Replace sheet needs.
status: unverified
grounded_in:
  - source: CU-135 (a Replace click overwrites a file unasked; cu-developer-two, cu-verifier)
  - source: policy.mjs classify, which matches a target's name only for pointer actions and a keypress with ENTER
  - source: cu-verifier's keyboard routes and cu-researcher's sheet signal, 2026-11-07
  - source: the two trajectory scans of 2026-11-07 (models press Space on focused buttons; CU-137's unnamed hold button)
---

# Keyboard activation is judged like a click

Before CU-135 the policy matched destructive words only for a click or ENTER, so Space on a focused Delete, Command-D
on a Don't Save sheet and Replace in a save panel's "already exists" sheet went unasked.

## Rule

| route | judged as |
|---|---|
| SPACE alone, on a focused control a click activates (button, checkbox, radio, pop-up, menu item, link, disclosure) | a click on it: its name against every word list; in a text input it types a space and is not judged |
| ENTER in any spelling (RETURN), a key hold, a typed newline anywhere, a typed space on a focused control | as those keys pressed: the focused element's name, a held dialog, and the window's default button, if reported, for a single-line input or non-text focus; in a text area a Return is text, Command-Return presses it (CU-142) |
| CMD+BACKSPACE or CMD+DELETE, any modifiers | `delete` (Move to Trash, Empty Trash, a dialog's Delete), in a text input too: the menu sees the chord before the field (CU-143) |
| CMD+D, the focused element a button | `delete`: with a sheet or alert focused it presses Don't Save or Delete |
| words | `delete` adds replace, overwrite and don't save; a save panel's Replace names the file |

A SPACE or ENTER right after Tab, Shift-Tab or an arrow in one batch is judged on the focus the app moved to: agent
core reads it until two reads 50 ms apart agree (300 ms at most); a focus that never settles is opaque, asked.

A default button the helper could not read (`defaultButtonRead` false: a failed read, an unreadable focus, no
Accessibility) asks `submit` for every route that presses it - a Return, a typed newline in a single-line input,
Command-Return in a text area - focused or not; true keeps the rule; no field asks too, and a helper before 0.2.44 is refused (D-069).

`delete` is never pre-approved and is declined unattended. A Find bar's Replace asks too: an accepted over-ask.

## Not done, on purpose

- No guess at what other chords press.
- An unnamed target (a custom view, or a window answering for one) is a blind spot for every word list, marked `targetUnnamed: true`. A nearby-label fallback is a follow-up;
  pixels, never.
- With none reported (a page without one), a Return is judged by the focused name
  only.

## Acceptance

- CU-135, met (tests, mutants, live at 01:18Z): every route asks through the real driver and, unattended, nothing
  happens; text inputs, Cancel, Escape and Keep Both do not. The step-4 Replace row remains, with a new-name control.
- CU-142: a Return - ENTER or a typed newline - into "Send a message", or into an unnamed field whose window's default
  button is Send, asks submit, as does Command-Return in a text area there; lines typed into that area, Notes and enter-12-rows'
  cells do not. A mutant per rule fails. Live on consent-keys.
- CU-143: from a field, every Command-Backspace asks delete; a plain one fired 'Clear Line' live, so the
  exemption went. Live on consent-keys, never Finder.
