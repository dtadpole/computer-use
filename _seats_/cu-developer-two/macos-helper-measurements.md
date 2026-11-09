---
title: macOS helper measurements for M6
created: 2026-11-02T08:30:00Z
modified: 2026-11-05T16:22:58Z
level: L1
status: unverified
version: 1.0.1
description: What a swiftc-built Swift helper can do on this Mac for desktop computer use, measured on 2026-11-02 without raising any TCC prompt - toolchain, permission preflights, display, idle signal, code identity and launch path.
grounded_in:
  - experiment: '/tmp/cu-developer-two-scratch/macos/probe.swift (preflight-only probe) and CUHelper.app (ad-hoc bundle), 2026-11-02 from 00.24 to 00.30 PT'
  - source: _context_/team-operations/decision-log.yaml (D-024)
---

# macOS helper measurements for M6

Input to the M6 design (D-024). Only calls documented not to prompt were made: preflights, screen geometry, running
apps, the HID idle counter. Nothing captured the screen, posted input or read another app's accessibility tree.

## Measured

| Question | Result | Design consequence |
|---|---|---|
| Toolchain | macOS 27.0 (26A428), arm64; Swift 6.4 from Command Line Tools, no Xcode; the SDK has ScreenCaptureKit, CoreGraphics, ApplicationServices, IOKit | the helper builds with `swiftc`, no project file |
| Grants now | Screen Recording, post-event and listen-event preflights false; `AXIsProcessTrusted` false; Input Monitoring `unknown` | nothing is granted; every capability waits for the owner's one grant |
| Display | one screen, 1920x1080 points at scale 1 | frame pixels equal points today; keep the per-axis mapping for Retina |
| Idle signal | `CGEventSource.secondsSinceLastEventType(.hidSystemState, any)` read 261.5 s with no permission | a local-input pause can poll it; whether synthetic events also reset it is the first live measurement |
| Code identity | ad-hoc `codesign -s -` gives `designated => cdhash H"…"`; a one-line rebuild changed it (be4cac7b… to 5582d74f…) | TCC keys a grant on that requirement, so an ad-hoc helper loses its grants on every rebuild |
| Launch path | a `swiftc` bundle (`dev.heddle.computer-use.helper`, `LSUIElement`) launched by `open -n -a` ran and its stdout was captured | LaunchServices makes the helper its own responsible process; spawned by Node it would be charged to DSH or the terminal |

A system alert has been frontmost since 2026-11-01 08:50 (`com.apple.UserNotificationCenter`, started then), before
this probe; the shared display already holds an alert the owner may want to see.

## Recommendations (inference)

1. **Thin, stable helper.** Primitives only - capture a window or display, post one event, read one AX node, list
   apps - behind a versioned JSON protocol on a Unix socket; policy, consent and the loop stay in Node. Rebuilds
   then stay rare.
2. **A signing identity that survives rebuilds.** The owner chooses: an Apple development certificate, a self-signed
   code-signing certificate made once, or ad-hoc with a re-grant after each helper rebuild. The first two are owner
   keychain actions, requested by cu-coordinator.
3. **Launch through LaunchServices** (`open -n -a … --args --socket <path>`), so grants attach to the helper.
4. **Measure after the grant, on the fixture app only:** ScreenCaptureKit window capture and frame rate,
   `CGEventPostToPid` versus HID-tap posting, the idle counter under synthetic input, and AX hit-testing at a point.
