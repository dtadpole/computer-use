---
title: A desktop chord is judged by the menu item it fires
created: 2026-11-08T10:36:57Z
modified: 2026-11-08T10:48:27Z
level: L1
version: 0.1.3
description: How agent core judges a desktop key chord that is a menu item's key equivalent - as a click on that item too, the stricter verdict winning - and what it does when the menu bar cannot be read.
status: unverified
grounded_in:
  - source: CU-232 (cu-researcher - Mail's Send, Shift-Command-D, runs unasked while a click on Message > Send asks submit)
  - source: design note 0.1 and 0.1.1 on CU-232 (cu-developer-one) and cu-researcher's review (every match, plain Delete and Escape off text, lazy menus, named limits)
  - source: keyboard-activation.md (CU-143 - AppKit offers a key equivalent to the menu before the field editor) and D-069 (an absent read asks)
---

# A desktop chord is judged by the menu item it fires

A chord that is a menu item's key equivalent fires the item (Mail's Send is Shift-Command-D); a click on the item
is judged by its name ([action-classes](action-classes.md)), so the chord must be too.

## Rule

1. **Which chords.** A desktop keypress or key hold with Command or Control held, or a function key, takes the read;
   so do a plain Delete, Forward Delete or Escape when the focus is no text input (Mail's Delete). Typing and other
   plain keys never do.
2. **The read.** `environment.menuItemForChord(action)` asks the helper (`menuKey`) for the frontmost approved app's
   menu items whose key equivalent matches - all of them, so a benign first match hides nothing. It reads the role,
   title and key equivalent only, never a value or selection. It answers the items (`{role, name, keyEquivalent}`,
   one or a list of up to eight), `{none: true}` after a whole read with no match, or `{unreadable: true}` (also more
   than eight matches, or a lazily filled menu). Disabled items still match: a stale enabled state could hide one
   that fires.
3. **The verdict.** Each item's name joins the keys' own judgement by the click rules: purchase, delete, permission and
   submit words, Trash or Bin, a Reply by the entries' text (CU-157). The stricter verdict wins, and an item never
   lowers what the keys ask. With `none`, the keys alone decide. An Apple-menu item (Lock Screen, Log Out) is
   refused as a system shortcut.
4. **Unreadable.** A read that fails, throws or answers nothing usable is unreadable. App-policy asks it each time
   (`unknown_target`, rule `menu:unreadable`) unless the keys already ask - or the chord is an editing chord the loop
   judges by meaning: Command-A, copy and cut, any [paste chord](paste-chords.md), Command-Z with or without Shift,
   Command or Option arrows, the CU-143 delete chords. With no read (the browser, fakes), the keys decide.
5. **Records.** The event's `boundMenuItem` keeps names only: role, name capped at 80 characters, key equivalent,
   enabled - never the menu path; or `none`, or `unreadable`.

## Acceptance

- `menu-key.test.mjs`, through runTask: Send asks submit, no match or no read allows; bound items take their
  click-rule class; every match counts; bad or over-cap answers ask; editing chords are read but spared by an
  unreadable bar; plain Delete and Escape read off text only; a sheet's Command-D stays delete; Apple-menu items are
  refused; records are capped and pathless.
- Mutants, one per rule, each fail a row.
- Halves CU-235 (helper) and CU-236 (driver); D-059 cells menu-key-send and menu-key-benign; live (cu-verifier,
  CU-238): Shift-Command-D on a compose screen's Message > Send with a draft is declined submit, nothing sent.

## Limits

An item the app adds after the read, in the same step, is missed only until the helper re-walks on a miss. A window
button's own key equivalent and a shortcut a view handles itself are judged by the keys alone (cu-researcher). Named
over-ask: a Control editing chord (Control-K) asks when the bar cannot be read. The D-069 floor rises to the helper.
