---
title: Input vocabulary - acceptance list
created: 2026-11-06T10:41:22Z
modified: 2026-11-06T21:59:14Z
level: L1
version: 0.1.2
description: The rules every CU-64 change is tested against - holds, presses, the cursor query and the live checks - as agreed by the verifier, the researcher and the helper and driver developers.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/input-vocabulary.md
  - source: cu-verifier's and cu-researcher's reviews of 2026-11-06 (H, D, C, G and R items), adopted by cu-developer-two and cu-developer-three
---

# Input vocabulary: acceptance (CU-64)

Agreed on 2026-11-06 for [input vocabulary](input-vocabulary.md). Unit and dry-run tests pin each rule; live checks
use CU Fixture only.

## Holds (`hold_key`)

- **H1** every key down has its up, reversed: at the end, on pause, stop, failure mid-hold, `bye` and socket loss.
- **H2** `duration_ms` is 1 to 10,000, else refused before any request.
- **H3** a held chord is judged as the same chord pressed (P9 refused, a class asks); secure input and a system
  prompt hand off before any down.
- **H4** pause or stop ends a hold within one 10 ms slice: an owner event at 300 ms of a 5 s hold has the keys up by
  400 ms and the run paused.
- **G1** helper death mid-hold: a held-keys marker written before the hold and removed after the ups; the next helper
  start posts the ups first and says `releasedStale` in its hello; a lost link carries `heldAtLoss`; the run records
  it and the person is told. It writes the owner's input state, so its live check runs only after cu-verifier reviews
  the plan.
- **G2** owner input during a hold releases at once; `heldKeys` in the reply lets the notice say the person's first
  keystroke may have carried the modifier.
- **G3** the front app leaving the approved set mid-hold releases and refuses.
- **G4** a synthetic held key does not auto-repeat: holding a printable key types one character, so it is judged as
  that key pressed (terminal view, secure input, sensitive data) - a parity difference from a physical hold.

## Presses (`left_mouse_down`, `left_mouse_up`)

- **D1** a down without its up in the batch, an up without a down, or anything but `mouse_move` and `wait` between:
  refused before any input.
- **D2** a down in one turn and its up in the next is refused: nothing is held across turns.
- **D3** no known pointer: refused, "move the pointer first".
- **D4** the compiled drag takes every drag check (scope at its start, held moves over approved windows or bare
  desktop, Escape first, the release reported) and the trajectory keeps `composedFrom`.
- **D5** after a hand-back, take-over, pause or consent the last pointer is stale: a press needs a fresh `mouse_move`.
- **R1** a wait inside a press is a helper-side hold in the same request (a point's `holdMs`), at most 10 s in all,
  never a sleep between requests.

## Cursor

- **C1** `cursor_position` maps to frame pixels at the run's scale, `--simulate-scale` and `--simulate-display`
  included (tests at 1.32 and 2).
- **C2** off the frame: `{cursor: null, offFrame: true}`, no coordinates.
- **C3** an older helper's fallback says `source: 'last_pointer'`; after a pause or take-over it is null.

## Live, before CU-64 closes

G1 under the reviewed plan and G3 on CU Fixture; a Shift-click range and an Option-drag on cu-researcher's S6
item; and its hold-confirm item (a 1.5 s press, a 1 s Space hold). All shown on 2026-11-06 through CUHelper. G2
needs the owner's own keystroke, which no seat may post (D-056), so it runs at runbook step 4 as its own issue (D-057).
