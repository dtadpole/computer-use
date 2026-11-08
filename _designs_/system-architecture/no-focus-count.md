---
title: A copy or paste with nothing focused is judged on the count read beside it
created: 2026-11-08T10:20:00Z
modified: 2026-11-08T10:30:00Z
level: L1
version: 0.1.0
description: How a keystroke copy, cut or paste with no focused element keeps the pasteboard count that proves the run's own copy, without a placeholder target and failing closed when focus moves between reads.
status: unverified
grounded_in:
  - source: CU-219 (a reply with no focused element dropped its count; under CU-220 the paste asked even after an own copy)
  - source: cu-developer-one's design review and cu-researcher's red team on PR 10 (fail closed if focus appears between the reads)
  - source: paste-consent.md (the count rule) and copy-caption.md (a selection's caption is the copy's source)
---

# A copy or paste with nothing focused is judged on the count read beside it

[paste-consent](paste-consent.md) proves a paste is the run's own copy by the pasteboard's change count, which the
helper sends beside the focused element. With nothing focused the driver's target is null, so the count was lost.
Since CU-220 that made a keystroke paste after the run's own copy ask, and a copy made there left no baseline.

## Rule

- **The target stays null.** A placeholder target would change how every rule judges a no-focus key. A target that
  names no app is refused, and one with no role makes Return, Space and a typed newline ask each time.
- **The count travels beside it.** For a Command or Control + C, X or V whose focused target is null, agent core asks
  the desktop driver for `pasteboardChangeCount()`, a fresh `focused` read, and judges the copy or paste on that count.
  The event records `countRead: 'no-focus'`.
- **Fail closed.** The driver gives the count only when that same reply still reads as no focus. If focus moved in
  between (a click still landing), the null target is stale; the count is null and the paste asks as the owner's. A
  failed or malformed read is null too.
- **The source class still applies.** A copy of selected text takes its source from the selection
  ([copy-caption](copy-caption.md)), so an IBAN-captioned own copy asks wherever it is pasted.

## Acceptance

- Copy then paste with nothing focused, the count risen by that copy: allowed on the count, with no target recorded.
  A rise the run did not make, or no own copy: asked. A copy with nothing focused pasted into a field, and the reverse:
  judged on the count. Other keys never read it.
- Selected text captioned Vendor: allowed. Captioned IBAN: asked.
- A side read whose reply carries an element or a placeholder, or that fails: asked.
- Mutants: the side read dropped, read for any target, a copy recording another count, the source dropped, the
  fail-closed check dropped, a placeholder made from the count.
- Live (cu-verifier): on CU Fixture, an own copy then Command-V with nothing focused is allowed by count.
