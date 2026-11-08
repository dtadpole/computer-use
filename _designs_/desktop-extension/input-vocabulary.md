---
title: Input vocabulary - timed key hold, button down and up, cursor query
created: 2026-11-06T10:21:57Z
modified: 2026-11-06T23:10:27Z
level: L1
version: 0.1.4
description: How the desktop run adds hold_key, left_mouse_down and left_mouse_up, and a real cursor_position, with every held key or button guaranteed released and the same scope and consent checks as a key press or a drag.
status: unverified
grounded_in:
  - source: Linear CU-64 (parity gap; cu-coordinator's assignment of 2026-11-06)
  - source: Anthropic computer use tool reference, computer_toolset_20260801 members, fetched 2026-11-06
  - source: _designs_/system-architecture/anthropic-mapping.md (the three members disabled today)
---

# Input vocabulary (CU-64)

The rules each change is tested against are in the [acceptance list](input-vocabulary-acceptance.md).

## The gap

The toolset offers `hold_key` (`text`, `duration` up to 300 s), `left_mouse_down` and `left_mouse_up` (no
input: the button at the current cursor, after `mouse_move`), and `cursor_position` (the cursor's `[x, y]` in
screenshot pixels). The adapter disabled the first three; `cursor_position` answered from the last pointer sent, not the real cursor. Shift-click ranges, Command-click sets and Option-drags need them (cu-researcher's S6).

## The rule: nothing stays held past one input request

| Member | Canonical action | Safety |
|---|---|---|
| `hold_key` | `hold_key {keys, duration_ms}`, at most 10 s (as `wait`); longer is refused | one input request: keys down, a helper-side hold, keys up in reverse; the helper's release guarantee (pause, stop, failure, `bye`, socket loss) covers the hold |
| `left_mouse_down` ... `left_mouse_up` | compiled by agent core into one `drag {path}`: the down point, each `mouse_move`, the up point; a `wait` between them becomes that point's `holdMs` (a long press is a path of one place held) | only `mouse_move` and `wait` between them, in one batch, held at most 10 s in all; an unpaired down or up, or anything else between, refuses the batch before any input ("send the press, its moves and its release together") |
| `cursor_position` | unchanged | agent core asks the driver: a `cursor` request answers global points, mapped to frame pixels, `{cursor: null, offFrame: true}` off the frame; an older helper falls back to the last point (`source: 'last_pointer'`) |

So a button is never held across turns: a stop, pause or take-over mid-press is a drag's case, with Escape first
(CU-44) and the release point reported (CU-45) - and once a hold began, the effect is uncertain even at the press point. The down point is the batch's last pointer position, or the last one
agent core sent; with neither, the batch is refused ("move the pointer first").

## Same checks as today

A hold is a key action for the policy: a secure field or secure input hands off (R83), a system prompt hands off
(CU-76), a terminal view refuses typing, and a held chord is judged exactly as the same chord pressed - a system
shortcut (P9) is refused, a class asks. The compiled drag goes through the drag path: scope and target at its start,
held moves over approved windows or bare desktop only (Q-D12), every event re-checked by the helper. Its first moves stay inside the pressed row, since list
views take the dragged item from where the drag begins (CU-96; live, 10 of 10 rows after a scroll). The trajectory
records each member beside the compiled drag (`composedFrom`).

## Who does what

Agent core (cu-developer-one): schema, adapter mapping and enabling, the pairing compiler, policy and trajectory.
Helper (cu-developer-three): a `{kind: 'hold', ms}` step, interruptible by pause, stop or local input, then the
ups; and the `cursor` request. Driver (cu-developer-two): one request per hold, its timeout extended; holds inside a drag; cursor mapping. cu-researcher: the hold-confirm item (acceptance list). Browser runs keep them disabled until Chrome supports a hold.
