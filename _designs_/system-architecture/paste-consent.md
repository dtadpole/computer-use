---
title: A paste is judged by what it inserts
created: 2026-11-07T03:33:02Z
modified: 2026-11-08T10:20:00Z
level: L1
version: 0.2.11
description: How a paste is judged without reading the owner's pasteboard - the browser checks the run's own clipboard text; the desktop asks before a paste that has no copy of the run's own before it.
status: unverified
grounded_in:
  - source: CU-151 (a pasted card number passes where a typed one asks; Cmd+V moves the owner's pasteboard unasked)
  - source: D-031 (copy, cut and paste allowed; the helper never reads the pasteboard) and D-050 to D-052 (the clipboard guard)
  - source: the CU-145 matrix rows paste-no-own-copy and web-paste-card
  - source: CU-219 (a reply with no focused element dropped its count; the count now travels beside the null target)
---

# A paste is judged by what it inserts

Typed text passes the credential and sensitive-data checks; a paste inserted text no check saw - the run's clipboard in the browser, the owner's
pasteboard on the desktop, unread by the helper (D-031).

## Rule

| Environment | Paste (Cmd/Ctrl+V, Edit > Paste, Paste and Match Style) | Judged as |
|---|---|---|
| browser | the run's clipboard text, known to the run | exactly a typed text: looksSensitive, credential, sensitive_data |
| desktop, after the run's own copy or cut | the run's own text (unread, but the run put it there) | judged by the copy's source ([copy-source](copy-source.md)) |
| desktop, no copy or cut of the run's own before it | the owner's pasteboard | sensitive_data, asked: "paste your clipboard into <field> in <app>?"; declined unattended |

The helper reports `NSPasteboard.general.changeCount` - a number, never
content - wherever the run already observes. Agent core records the count before each copy or cut of the run's own and
reads it again when it judges a paste: the paste is the run's own text only if the count rose by exactly the run's own
copies since. A copy with nothing selected (no rise), a take-over or pause in which the person copied, or another app
writing the pasteboard (a rise the run did not make) all make it the owner's. A clipboard-guarded fixture item
(D-050) copies first; a write landing after the paste is judged asks - the safe side, counted.

With nothing focused the focused target is null, and a null target carries no count. For a keystroke copy, cut or paste
there the desktop driver reads the count beside it (`pasteboardChangeCount()`, a fresh `focused` read) and agent core
judges on that count, the target staying null (CU-219): a placeholder target would change how every rule judges a
no-focus key - one naming no app is refused, one with no role makes Return ask each time.

A menu paste (Edit > Paste, a context-menu Paste) or, on the desktop, a toolbar or popover button named exactly Paste or Paste
and Match Style (CU-192; English names; an undescribed icon is
missed) is a click, so agent core judges it at the focused field:
its name rules and secure or password hand-offs (CU-186). A focus read on a menu leaves the field
unknown; the paste asks. Menu items are recognised by their key equivalent (Command-V, C, X; CU-154), by English
name only where none is reported. A copy of shown text carries its caption's class ([copy-caption](copy-caption.md)).

## Acceptance

- Browser: a copied card number pasted into a third-party 'Comments' box is asked.
- Desktop: Cmd+V first is asked; Cmd+C then Cmd+V, also in one batch, is allowed; Cmd+C with nothing selected, a take-over
  in which the person copies, or another app's write before the paste - asked; the Edit menu's Paste counts the same.
- Mutants: the paste text not judged (browser); changeCount ignored; the take-over reset removed; the count read in the
  copy's own reply (a delayed-write test pins it).
- No count (a deviation since D-069's floor; CU-220): paste first -> asked; copy then paste -> asked too; mutant: a
  missing count taken as the run's own copy fails three rows.
- Nothing focused (CU-219): Cmd+C then Cmd+V, the count risen by that copy -> allowed on the count, no target recorded;
  a rise the run did not make -> asked; a copy with nothing focused pasted into a field, and the reverse -> judged on
  the count; a selected value captioned Vendor -> allowed, captioned IBAN -> asked, wherever it is pasted; a failed
  side read -> asked; other keys never read it. Mutants: the side read dropped, read for any target, a copy recording
  another count, a placeholder target made from the count.
- Over-ask: none in our trajectories (5 of 5 pastes followed an own copy).
- Live: consent-keys, unattended - Cmd+V into Message first asks and is declined, nothing pasted.

## Not done


Every admitted helper sends the count (since 0.2.38; the floor is 0.2.44), so a missing one makes the paste the
owner's - asked (CU-220). With nothing focused the count is read beside the null target (CU-219, the event's
`countRead: 'no-focus'`); only a failed side read leaves none, and then the paste asks.

