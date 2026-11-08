---
title: Desktop live checks
created: 2026-11-06T15:20:00Z
modified: 2026-11-08T10:40:00Z
version: 0.2.0
description: Live checks of the macOS desktop driver that act on the owner's session and so run only after review, under an announced hold - first the CU-64 G1 held-keys check (CU-94).
grounded_in:
  - source: _tools_/desktop-checks/g1-held-keys.md@0.1.0
---

# Desktop live checks

Driver-side, so they may import the driver and agent core (verify-kit, judge-side, may not: D-012). Each check has a
plan the reviewer reads with its script, guards that refuse before any input, and read-only probes.

| File | Owns |
|---|---|
| [g1-held-keys.md](g1-held-keys.md) | the G1 plan: guards, steps, bounds, fallback and alert, report, review map |
| [g1-held-keys.mjs](g1-held-keys.mjs) | `runG1(options, deps)` and the CLI: a helper killed mid-hold, the next start releases Shift; its runs are `cli.mjs run --model scripted` children (the helper accepts only compiled entry points) |
| [focus-after-click.md](focus-after-click.md), [focus-after-click.mjs](focus-after-click.mjs) | CU-226: is a key typed right after a click judged on the focus from before it? Scripted CLI runs on consent-cells, under the seat's hold |
| [probes.mjs](probes.mjs) | `sessionFlags()` (CGEventSourceFlagsState via JXA), `hidIdleSeconds()`, `processInfo(pid)`, `bundleVersion()`, `onScreenWindows(pid)`, `readMarker(path)`; no input, no capture |

Suite: [`_tests_/desktop-checks/`](../../_tests_/desktop-checks/INDEX.md). Owner: cu-developer-two; cu-verifier
reviews and runs.

## Read next

[`../INDEX.md`](../INDEX.md).
