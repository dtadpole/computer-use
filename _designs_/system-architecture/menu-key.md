---
title: A desktop chord is judged by the menu item it fires
created: 2026-11-08T10:36:57Z
modified: 2026-11-08T10:36:57Z
level: L1
version: 0.1.0
description: How agent core judges a desktop key chord that is a menu item's key equivalent - as a click on that item too, the stricter verdict winning - and what it does when the menu bar cannot be read.
status: unverified
grounded_in:
  - source: CU-232 (cu-researcher - Mail's Send, Shift-Command-D, runs unasked while a click on Message > Send asks submit)
  - source: design note 0.1 and 0.1.1 on CU-232 (cu-developer-one), reviewed by cu-verifier and cu-researcher
  - source: keyboard-activation.md (CU-143 - AppKit offers a key equivalent to the menu before the field editor) and D-069 (an absent read asks)
---

# A desktop chord is judged by the menu item it fires

On a Mac a chord that is a menu item's key equivalent fires that item: Mail's Send is Shift-Command-D. A click on the
item is judged by its name ([action-classes](action-classes.md)), so the chord must be too.

## Rule

1. **Which chords.** A desktop keypress or key hold with Command or Control held, or a function key, takes the read. The editing
   chords the loop already judges by their meaning do not: Command with A, Command or Control with C, X or V (any paste
   chord, [paste-chords](paste-chords.md)), Command-Z with or without Shift, Command or Option arrows, and the CU-143
   delete chords. Typing, Shift or Option alone, and plain keys never do.
2. **The read.** `environment.menuItemForChord(action)` asks the helper (`menuKey`) for the frontmost approved app's
   menu item whose key equivalent matches. It reads the role, title and key equivalent only, never a value or a
   selection. It answers `{role, name, keyEquivalent}`, `{none: true}` after a whole read with no match, or
   `{unreadable: true}`. Disabled items still match: a stale enabled state could hide an item that fires, while a
   disabled one only over-asks.
3. **The verdict.** The item's name joins the keys' own judgement by the click rules: purchase, delete, permission and
   submit words, Trash or Bin, a Reply by the entries' text (CU-157). The stricter verdict wins, and an item never
   lowers what the keys ask. With `none`, the keys alone decide.
4. **Unreadable.** A read that fails, throws or answers nothing usable is unreadable. App-policy asks it each time
   (`unknown_target`, rule `menu:unreadable`) unless the keys already ask. An environment with no read (the browser,
   test fakes) judges by the keys, as before.
5. **Records.** The action event names the item (`boundMenuItem`: role, name, key equivalent - no menu path), or
   `none`, or `unreadable`.

## Acceptance

- Through runTask on a fake desktop:
  - Shift-Command-D bound to Send asks submit; with no bound item, or with no read, it is allowed;
  - Clear Log is allowed;
  - Delete Conversation and Move to Trash ask delete, Buy Now asks purchase, a function key bound to Send All asks submit;
  - an unreadable, thrown, null or nameless answer asks unknown_target;
  - the editing chords read nothing, even with an unreadable bar;
  - Command-D on a sheet stays delete beside a benign item.
- Mutants: the bound item ignored; unreadable read as none; the editing exemption removed; app-policy's unreadable
  ask removed.
- Helper and driver halves: CU-235 and CU-236. D-059 cells: menu-key-send and menu-key-benign.
- Live (cu-verifier, CU-238): CU Fixture's compose screen with Message > Send on Shift-Command-D - the chord with a
  draft is declined submit and nothing is sent.

## Limits

An item the app adds after the read, in the same step, is missed only until the helper re-walks on a miss. The D-069
floor rises to the helper that answers `menuKey`.
