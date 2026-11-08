---
title: A copy of shown text carries its caption's class
created: 2026-11-07T20:04:28Z
modified: 2026-11-08T02:09:11Z
level: L1
version: 0.1.8
description: How a value a page or window only shows - a passport number in a table, an IBAN beside its label - is judged when the run copies it and pastes it elsewhere, without reading anything but labels.
status: unverified
grounded_in:
  - source: CU-187 (cu-verifier's residual on copy-source.md; cu-researcher's todo rows, PR 446)
  - source: cu-developer-two's selectionSource and caption reads (PRs 460, 461, 464) and cu-developer-three's helper caption (PR 462)
  - source: cu-verifier's live row 20261107T192057Z-5cbf70 (an entry captioned only by nearby text takes typed text unjudged)
---

# A copy of shown text carries its caption's class

[copy-source](copy-source.md) carries a copied field's name class to the paste. A value that is only shown - a
passport number in a profile table, an IBAN beside its label - had no class: nothing was focused at the copy, and a
shown text's own name is the value itself.

## Rule

1. **The selection is the source.** At a copy whose focus is no text entry, agent core asks the environment for
   `selectionSource()` - the element holding the selection: role, tag, origin and caption, never a name and never the
   selected text (D-060). Read only at a copy; never recorded.
2. **The caption carries the class.** `caption` is the label that captions a non-entry element, read from the page or
   the accessibility tree, at most 80 characters, outside the fingerprint and never in run files. Browser: an
   `aria-labelledby` on the element or an ancestor within three levels, never past a dialog, landmark or section; a
   `<dd>`'s `<dt>`; a cell's column `<th>` joined with its row's key. Desktop: `AXTitleUIElement`, else the column
   header joined with the row's key, read on the hit leaf even when the target is lifted to a pressable ancestor. A
   row's key is its row header, or in a two-cell row its first cell; so 'Field | Value' and 'Name | IBAN' both reach IBAN. No nearest preceding text.
3. **A name that is its own text carries nothing.** A source named by its own words - static text, a generic element,
   a cell - takes no class from its name in either list; its caption decides. A form control's name is its label and
   still counts, editable or not.
4. **A drag carries it too.** A travelling drag pressed on such a source and dropped on a text entry or editable area
   carries its caption's class (CU-195); one ending elsewhere selects text and carries nothing, as does one pressed on a
   control, tree items included (CU-210), and a page drop zone taking text is not covered.

## Not done

A selection spanning the whole page, or a label together with its value, has no captioned source. Web content inside a native app keeps its selection in WebKit text markers, unread; the copy is judged by its target. A caption
made by layout alone is not read: pixels, never. A link set only inside the app (AppKit's plain text
cell) gives no caption. Desktop entries take no caption; in the browser an unnamed entry takes its dl or table caption as its name (password-memory
rule 5, live 20261107T234253Z-4d7662). An entry never secure and captioned by layout alone stays unjudged
(password-memory's limit).

## Acceptance

- The todo rows of PR 446 and the loop-level selection-copy test turn: a captioned 'Passport number' or 'IBAN' value
  copied and pasted into an unnamed entry asks `sensitive_data`; copying the caption word itself, or a 'Notes' value,
  is allowed; each row fails with its caption removed.
- Live: real Chrome and CU Ledger - the captioned value copied into an unnamed entry asks, nothing pasted; a Vendor-captioned value is allowed.
