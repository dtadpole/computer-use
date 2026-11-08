---
title: Driver action routes (D-059 rows)
created: 2026-11-07T03:17:17Z
modified: 2026-11-07T03:17:17Z
level: L1
version: 0.1.0
description: Every action the macOS driver accepts, the input it posts and the target agent core judges - the rows of the D-059 consent-route table (CU-145), read from the source.
status: unverified
grounded_in:
  - source: _environments_/macos-desktop/input-plan.mjs (ACTION_TYPES, planAction), environment.mjs (actionTypes, focusedElement), _tools_/agent-core/loop.mjs (contextFor) on main 2026-11-06
  - source: D-059 (cu-coordinator) and CU-145 (cu-researcher, lead)
---

# Driver action routes

Every route by which an action reaches the desktop, read from the source. **Target** is what agent core judges before
the action runs (`contextFor` in `loop.mjs`).

| Action (fields) | Posted to the helper | Target | For the table |
|---|---|---|---|
| `click` (x, y, button, keys) | move, down/up, with held modifiers | the element at (x, y) | right opens a context menu; middle, back, forward are app-defined; held modifiers change a click's meaning |
| `double_click`, `triple_click` (x, y, keys) | down/up two or three times, left | the element at (x, y) | opens or commits |
| `move` (x, y, keys) | move, with held modifiers | the element at (x, y) | hover only, no press |
| `drag` (path, keys; holdMs per point) | down at the first point, drag segments, up at the last; dwells | the press point and the drop point (CU-140) | Option-drag copies, Cmd-drag moves; a one-point path with holdMs is a press-and-hold (`press_hold`) |
| `scroll` (x, y, scroll_x, scroll_y, keys) | move, one wheel event, with held modifiers | **none**: not in `POINTER` | **suspect**: scrolling over a slider, stepper or pop-up can change its value; held Shift, Cmd or Ctrl change what a scroll does |
| `keypress` (keys, repeat) | keyDown/keyUp per stroke, as a chord, repeated | the focused element and its default button (CU-142) | every modifier chord and key equivalent, menu shortcuts included |
| `hold_key` (keys, duration_ms within the cap) | the chord's downs, one hold step, the ups | judged as its chord | a posted held key is not auto-repeated (to confirm live) |
| `type` (text) | Unicode text chunks; `\n` as the Return key, `\t` as the Tab key | the focused element; a newline as ENTER (CU-142); tab segments on the settled focus (#315) | **suspect**: every other control character goes as text: U+0003 is keypad Enter in AppKit, U+001B Escape, U+0008 and U+007F delete. Never the pasteboard |
| `wait`, `screenshot`, `zoom`, `cursor_position` | nothing; the driver acts locally | none | no input |
| `navigate` | refused | none | none |

**Batches.** `planBatch` refuses a batch before anything runs. Each action is judged in order, just before it runs;
after a focus-moving key, the focus is read until it settles (CU-135).

**Not routes of their own.** Paste is a `keypress` (Cmd-V); a menu is a `click` or a key equivalent; a person's
take-over pauses the run (D5).
