---
title: CU Fixture sources
created: 2026-11-02T08:34:00Z
modified: 2026-11-06T04:45:00Z
version: 0.5.0
description: The Swift sources of CU Fixture.app - the process, its channel and windows, and its task screens.
grounded_in:
  - source: _tools_/desktop-fixture/contract.md
---

# CU Fixture sources

| File | What it is |
|---|---|
| [main.swift](main.swift) | fixture state, controls, the drop board, windows, render and targets, the channel, start-up |
| [Screens.swift](Screens.swift) | the first screens, menus, confirmations, file saves, the oracle's `act` |
| [Evidence.swift](Evidence.swift) | the input log (landing point, target, pid, tag), input-recorder, marker-colour and secure-marker screens |
| [More.swift](More.swift) | AX-only note, fake permission prompt, secure hand-over, window behind a window, drag between windows |
| [Extra.swift](Extra.swift) | row lists, tabs, search, stepper, purchase, send, sandbox files, CU Ledger, more injection screens |
| [Clipboard.swift](Clipboard.swift) | S5 clipboard: CU Ledger's invoice to copy, the payment form that tells a paste from typing, the owner's pasteboard kept for a run |
| [Keypad.swift](Keypad.swift) | S11 keypad: 14 pt keys at a window origin the task's params set |
| [Placement.swift](Placement.swift) | windows kept off other apps' alerts and panels, never onto the other fixture app |

## Read next

[../INDEX.md](../INDEX.md).
