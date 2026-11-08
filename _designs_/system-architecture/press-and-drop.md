---
title: A press or a drop is judged where it lands
created: 2026-11-07T01:23:43Z
modified: 2026-11-07T01:28:42Z
level: L1
version: 0.1.1
description: How a long press or a drag is judged - by the control where the button goes down, like a click on it, and by the drop zone it is released over - so a hold-to-delete button or a drop onto a Trash asks.
status: unverified
grounded_in:
  - source: CU-140 probe on main 2ce60d165 (a long press on a named Delete allowed unasked)
  - source: cu-researcher's both-ends rule and cu-verifier's trajectory count (0 of 279 drags start on a destructive name), 2026-11-07
---

# A press or a drop is judged where it lands

The policy matches the destructive words for a click and a key that activates a control, never for a drag. Agent
core composes a long press as a drag with one held point (CU-64), so pressing and holding a named "Delete archive
(hold)" is allowed unasked, and a file dropped onto a Trash or a "Delete" zone asks nothing.

## Rule

| where | judged as |
|---|---|
| the press point, when the element there is a control (button, checkbox, radio, pop-up, menu item, link, disclosure) | a click on it, against every word list - a long press, or any drag pressed there |
| the drop point of a drag that travels | its name against the delete words, plus trash and bin as whole words (not Binder or Cabinet): a drop onto a Trash, Delete or Remove zone deletes |
| a file, row, cell or image at the press point | not judged by its name: dragging "remove-old-notes.txt" moves it |

`delete` is never pre-approved and is declined unattended. The Dock's Trash is another app: the scope check refuses a
drop there already.

## Not done, on purpose

- No other class at the drop point (a share or send zone) until one is found; the drop's hit test failing leaves it
  unjudged, as today, never fails the drag. A drop on an unnamed target is marked `dropTargetUnnamed: true`, so a
  scan counts blind drops as it counts `targetUnnamed`.
- A canvas stroke on an unnamed target asks nothing; app-policy's opaque rule is unchanged.

## Acceptance

- Asked: a long press on "Delete archive (hold)"; a drag pressed on a Delete button and released elsewhere; a file
  dropped onto a fixture's Trash zone. A real-driver seam row for the long press.
- Not asked: S6's moves of doc-NNN rows into Archive, Q3, Drafts and Shared; "remove-old-notes.txt" into a folder.
- Mutants fail: a drag not judged; judged at the drop instead of the press; a file row judged at the press; the drop
  without trash and bin; a substring match (a drop onto Binder must not ask).
- Live after CU-137's fixture names: the hold-confirm press asked and declined, nothing deleted. CU Fixture has no
  Trash zone, so drops rest on the tests.
