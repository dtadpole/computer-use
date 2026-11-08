---
title: A text drag onto an entry is judged as a paste at its drop point
created: 2026-11-07T21:32:27Z
modified: 2026-11-07T22:44:59Z
level: L1
version: 0.1.2
description: How a drag that moves selected text into a text entry is judged - by the dragged text's value and the drop target's name, as a paste is - once the browser delivers such drags.
status: unverified
grounded_in:
  - source: CU-198 (cu-researcher's red team of PR 485, which makes browser text drags deliver - CU-197)
  - source: cu-developer-two's environment.dragText(point) read (Part of CU-198)
  - source: paste-consent.md, copy-source.md rule 4, copy-caption.md rule 4
---

# A text drag onto an entry is judged as a paste at its drop point

Once a browser drag of selected text delivers (CU-197), the moved text meets only the source rules - the pressed
entry's class (copy-source) and a caption's (copy-caption). A card number or key shown with no caption would drag into
a third-party form unasked, while the same text copied and pasted asks by value; and no drag is judged by the name of
the field it lands in.

## Rule

1. **The browser driver reads the dragged text once.** At a drag that travels, `environment.dragText(point)` returns
   what the press point would drag: the page selection containing it, or a focused input's selected text - never a
   password field's - else null; a failed read is `{ unknown: true }`. At most 4096 characters, never recorded (D-060).
2. **A drag that moves text and drops on a text entry or an editable area is judged as a paste there.** It moves text
   when dragText is a string (browser) or its press is on a text entry or shown text (desktop). The verdict adds
   `insertedClass(dragText, dropTarget)` - the value rules on the text and the drop target's name rules, a paste's;
   with no text read (the desktop) the name rules alone. An unknown read asks, as an unknown copy source does
   (CU-196). The source rules still apply; the strongest class wins.
3. **Any other drag** - a slider, a window, a drop off an entry - adds nothing here.

## Not covered (named)

- The desktop does not read selected text (content stays unread, D-031): its text drags meet the source, caption and
  destination-name rules, but no value rule - as the desktop paste.
  Measured on CU Fixture: a text view's drag with a 400 ms dwell moved text (20261107T222914Z-c6dda0; with
  none it only selected, 222911Z-86f886); a single-line field's moved nothing at 0 or 400 ms (222122Z-969160,
  222126Z-1abf59). Other apps and longer dwells are unmeasured.
- A selection inside a cross-origin frame is unreadable (null): such a drag is judged by its source and destination.

## Acceptance

- CU-198's todo cells turn: an uncaptioned card number dragged onto an unnamed entry asks `sensitive_data`; a
  neutral sentence is allowed; a drag from Notes into a field named Password (browser) or IBAN (desktop) asks.
- Units: a null dragText adds no value rule; an unknown read asks; a slider drag over a field named IBAN adds
  nothing. Mutants: dragText ignored; the drop target's name ignored; the text-moving condition dropped.
- Live (cu-verifier), after PR 485 lands behind this: real Chrome, the card-number paragraph dragged into the form
  asks and the page receives nothing.
