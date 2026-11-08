---
title: A paste chord is Command or Control with V, whatever else is held
created: 2026-11-08T10:19:47Z
modified: 2026-11-08T10:19:47Z
level: L1
version: 0.1.0
description: Which key chords agent core judges as a paste or a copy - pastes generously, desktop copies exactly, browser copies by the driver's map - and why each direction fails closed.
status: unverified
grounded_in:
  - source: CU-230 (Paste and Match Style and Command-Shift-V skipped every paste check; a probe through runTask on main da045e2)
  - source: paste-consent.md (CU-151's count proof) and copy-source.md (CU-183's source kept on a real write)
  - source: _environments_/chrome-browser/keys.mjs chordMeaning (the browser driver's clipboard map)
---

# A paste chord is Command or Control with V, whatever else is held

[paste-consent](paste-consent.md) judges what a paste inserts; this note says which key chords are pastes and copies
(`pasteChord` and `copyChord` in `_tools_/agent-core/loop.mjs`). Menu items and toolbar buttons keep their own rules there.

## Rule

| Chord | Desktop | Browser |
|---|---|---|
| Command or Control with V, with or without Shift or Option (Paste and Match Style is Command-Option-Shift-V) | a paste: the owner's board unless the count proves the run's own copy | a paste of the run clipboard, its text judged like typed text |
| Command or Control with C or X | a copy or cut | a copy or cut |
| the same with Shift | no copy | a copy or cut (the driver's map) |
| the same with Option | no copy | no copy (the driver sends an ordinary key) |

Each direction fails closed. A chord taken for a paste that is not one only asks; a paste missed inserts text
unjudged, so pastes are recognised generously. On the desktop a copy missed only raises the count past the run's own
copies, so the next paste asks, while a copy counted wrongly would vouch for a pasteboard the run did not write, so
desktop copies stay exact. The browser keeps a copy's source only when the run buffer really changed, so its copies
may follow the driver's map.

## Acceptance

- Desktop: Command-Shift-V, Command-Option-Shift-V, Command-Option-V and Control-Shift-V with no own copy ask; after an
  own copy proven by the count they are allowed, carrying the source's class; a Command-Shift-C that writes the board
  leaves the next paste asked.
- Browser: Control- or Command-Shift-V with a card number in the run clipboard asks; a Shift copy from a Password field
  carries credential to the paste.
- Mutants: the paste chord back to two keys; the browser copy back to two keys; the desktop copy made generous.
- Over-ask: Command-Option-V in the browser is an ordinary key judged as a paste; it asks only when the run clipboard
  holds a sensitive value.
- Live: cu-verifier, CU Fixture - Command-Option-Shift-V into Message with no own copy, declined, nothing pasted.
