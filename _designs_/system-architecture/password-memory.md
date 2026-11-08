---
title: A field seen as a password stays one when it is shown
created: 2026-11-07T22:19:37Z
modified: 2026-11-07T23:32:27Z
level: L1
version: 0.1.5
description: How an entry the run saw as a password field is still judged as one after 'Show password' turns it into plain text, and how an unnamed browser entry takes its structural caption as its name.
status: unverified
grounded_in:
  - source: CU-194 (cu-verifier's live row 20261107T192057Z-5cbf70; cu-researcher's proposal and red team, inbox 20261107T221757)
  - source: chrome-browser/environment.mjs (the fingerprint hashes inputType) and macos-desktop/environment.mjs (the fingerprint hashes the AX role), main d8e67638a
---

# A field seen as a password stays one when it is shown

'Show password' turns a secure field plain: the browser flips the input's type; AppKit swaps an AXSecureTextField
for an AXTextField at the same place. Both drivers' fingerprints hash exactly that, so the field looks new and text
typed afterwards meets only its name - none, when its label sits beside it by layout (192057Z-5cbf70). A memory keyed
by fingerprint would never match.

## Rule

1. **Each driver sends a stable key**, outside the fingerprint and never recorded: the browser a hash of the tab, page loader and DOM node (the node survives the type change); the desktop a hash of the bundle id, process and the frame's top-left relative to its window (the swapped field keeps
   its place; the helper adds `windowOrigin`, its AXWindow's top-left - a sheet's own - else the screen frame).
2. **Agent core remembers the keys of password fields it has seen** in the run: an entry that was `isPassword`,
   secure, or named for a password - never a hint (CU-184).
3. **An entry whose key is remembered is judged as a password field** even when shown in plain text: `credential`
   in the browser, the password hand-off on the desktop. A match only strengthens a verdict, never relaxes one.
4. **The memory ends with its page or app:** the browser key carries the loader, so a navigation forgets it; on the
   desktop a key goes when its process quits or the run ends.
5. **An unnamed browser entry takes its structural caption as its name:** a `<dd>`'s `<dt>`, or a cell's column
   `<th>` joined with its row's key (copy-caption rule 2), read only when the accessible name is empty.

## Not covered (named)

- A different field later drawn at the same desktop frame (a wizard's next step) inherits the memory: an over-ask,
  the safe side.
- A second window of the same app with a field at the same place inherits the memory too (the key holds the process,
  not the window): an over-ask, the safe side.
- A field scrolled or a window resized between the two reads, or moved before `windowOrigin` exists, loses the
  memory: the shown field is judged as today, by its name.
- A site that shows a password by swapping the input element, or re-renders its login frame, makes a new key: the
  shown field is judged as today, by its name.
- Rule 5 is the browser's: the helper sends entries no caption, so an unnamed desktop entry under a header stays
  unjudged.
- A field never secure in this run and labelled by layout alone stays unjudged: pixels, never.

## Acceptance

- CU-194's todo rows turn: an unnamed entry captioned Password takes `credential`, captioned IBAN `sensitive_data`.
- Units: a password field toggled to text (key kept, type or role changed) asks or hands off; a toggled hint field
  stays a confirm; another key is unaffected; a navigation forgets. Mutants: the key ignored; a hint remembered.
- Live (cu-verifier): a CU Fixture password field shown, then typed into, hands off; the browser twin asks.
