---
title: CUHelper Swift sources
created: 2026-11-02T09:35:00Z
modified: 2026-11-08T00:00:00Z
version: 0.3.1
description: The Swift sources of CUHelper.app, compiled together by ../build.sh - what each file owns; main.swift is the entry point and every other file is also compiled into the unit tests.
grounded_in:
  - source: _environments_/macos-desktop/helper/INDEX.md@0.3.0
---

# `Sources`

One module, compiled by [`../build.sh`](../build.sh). The unit tests in
[`UnitTests.swift`](../../../../_tests_/macos-helper/UnitTests.swift) compile every file but `main.swift`.

| File | Owns |
|---|---|
| [`main.swift`](main.swift), [`Arguments.swift`](Arguments.swift) | the command line and one run's life: connect, boundary, hello, time caps, exit after releasing held input; the unified log |
| [`Protocol.swift`](Protocol.swift), [`JSON.swift`](JSON.swift), [`Framing.swift`](Framing.swift), [`Link.swift`](Link.swift) | requests, fields and codes, strict parsing, lines, socket and stdio |
| [`Dispatcher.swift`](Dispatcher.swift) | every rule: grants, scope, exclusions, pause, per-step re-checks, secure input, release, capture sizes, watch |
| [`Policy.swift`](Policy.swift) | identity, the `CUSE` tag, preflights, exclusions, the owner, hit-window, drag, panel and menu-bar rules |
| [`Events.swift`](Events.swift), [`LocalInput.swift`](LocalInput.swift) | tagged CGEvents and held-input tracking; the person's input: idle counter and pass-through tap |
| [`SystemCapabilities.swift`](SystemCapabilities.swift), [`Accessibility.swift`](Accessibility.swift) | the live Mac: window-scoped capture, the hit window, posting, Accessibility |
| [`DryRun.swift`](DryRun.swift) | `--dry-run --world`: the same rules over a declared world |
| [`PeerCheck.swift`](PeerCheck.swift), [`Indicator.swift`](Indicator.swift) | D-029: only agent core's entry points in an owner checkout may connect; the panel on every display |
| [`ConfirmPrompt.swift`](ConfirmPrompt.swift) | CU-203: the confirmation prompt only the owner's deliberate hardware click answers (the gate is in `Policy.swift`) |
| [`SelfTest.swift`](SelfTest.swift) | `--selftest`: framing, validation, identity and preflights, with no capability call |
| [`RequestGrants.swift`](RequestGrants.swift) | `--request-grants`, the owner's one prompt for Accessibility and Screen Recording |
