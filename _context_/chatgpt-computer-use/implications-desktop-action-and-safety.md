---
title: Requirements for our desktop computer use, action channel and safety
created: 2026-11-02T08:52:32Z
modified: 2026-11-02T08:52:32Z
level: L1
version: 1.0.0
description: Requirements R79 to R97 for the input channel, local-input pause, shared-display safety, human control, trajectory privacy and evaluation of computer use on native macOS, app-scoped, as re-scoped by D-024
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-02)
  - source: support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork (fetched 2026-11-02)
  - source: developer.apple.com/videos/play/wwdc2019/701 (fetched 2026-11-02)
  - source: developer.apple.com/library/archive/technotes/tn2150/_index.html (fetched 2026-11-02)
  - source: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEventSource.h (macOS 27.0 SDK)
  - source: ULTIMATE_GOAL.md (2.0)
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014, D-024, D-025)
  - source: _context_/desktop-computer-use/macos-capture-and-input.md
  - source: _context_/desktop-computer-use/macos-identity-and-background.md
  - source: _context_/desktop-computer-use/mechanics-sources.yaml
  - source: _context_/chatgpt-computer-use/product-desktop-computer-use.md
---

# Requirements, desktop action and safety

Levels as in [environment and perception](implications-environment-and-perception.md), plus **MAY**, an allowed
option. Continues [scope and perception](implications-desktop-scope-and-perception.md).

## Input

| ID | Level | Requirement | From |
|---|---|---|---|
| R79 | MUST | Post only from the helper's private event source, and globally only while the target is frontmost and the hit-tested point in scope, checked per event | [CGEvent.h], [capture] |
| R80 | MUST | Use the undocumented `CGEventPostToPid` for an app only after a fixture test shows delivery without a focus change | [CGEvent.h] |
| R81 | SHOULD | Act in the background, as ChatGPT does on macOS, via AX actions or proven pid posts; else raise the target (`AXFrontmost`) and verify | [cu], [cow], [NSApp-activate] |
| R82 | SHOULD | With AX, treat `kAXErrorCannotComplete` as an unknown outcome and set `AXManualAccessibility` for Electron apps | [AX-perform], [Electron-a11y] |
| R83 | MUST | Hand secure fields to the person: with an `AXSecureTextField` focused or secure event input on, post no keys and read no value | [TN2150], [capture] |
| R84 | SHOULD | Verify typed text from the next capture or AX value; apps may ignore an event's Unicode string | [CGEvent.h] |
| R85 | SHOULD | Hold a `ProcessInfo` activity during runs so App Nap cannot throttle the helper | [AppNap] |
| R86 | MUST | On stop, pause or failure mid-action, release every button and modifier we pressed | [R16], [R38] |

## Pause and shared display

| ID | Level | Requirement | From |
|---|---|---|---|
| R87 | MUST | Read HID idle time (`CGEventSourceSecondsSinceLastEventType`, HID state; no grant) before every low-level step; pause on input newer than our last post | [CGEventSource.h], [probe], [goal] |
| R88 | MUST | Tag every synthetic event (`kCGEventSourceUserData`), never suppress local hardware events, and measure whether our posts reset HID idle before trusting R87 | [CGEventSource.h], [identity] |
| R89 | MUST | Only a person resumes, through a human channel, from a fresh screenshot; local input may pause but never resume, stop or consent | [desktop], [R39], [R61] |
| R90 | MUST | One desktop run at a time team-wide, announced, through a lock every launch honours | [D-024], [D-014] |
| R91 | MUST | Until R87-R89 and the exclusions are unit-tested, the helper itself posts only to the team's fixture app | [D-024] |

## Control, trajectory, evaluation

| ID | Level | Requirement | From |
|---|---|---|---|
| R92 | MUST | App approvals and consequential classes ask only through channels the caller cannot answer; on-screen instructions escalate | [goal], [R61] |
| R93 | MUST | Stop and take over act at once; while the person drives or a pause holds, nothing reaches the model or trajectory | [goal], [R39] |
| R94 | SHOULD | Show on the Mac that a run is active, with a stop control | [desktop] |
| R95 | MUST | Record app-scoped stills with each step's capture filter and pixel-to-point mapping; never other apps, notifications, titles outside scope, secure values, the pasteboard or the person's keys | [goal], [R43], [R44] |
| R96 | MUST | Judge only on evidence the judged code did not write, such as the fixture app's event log with source pid and tag | [D-012], [R48] |
| R97 | MUST | Run 20+ fixture-app tasks and 10+ injection screens unattended, rates per model and build, testing each exclusion and pause guard both ways | [goal], [R51] |

[goal]: ../../ULTIMATE_GOAL.md
[D-012]: ../team-operations/decision-log.yaml
[D-014]: ../team-operations/decision-log.yaml
[D-024]: ../team-operations/decision-log.yaml
[capture]: ../desktop-computer-use/macos-capture-and-input.md
[identity]: ../desktop-computer-use/macos-identity-and-background.md
[probe]: ../desktop-computer-use/probe-results-2026-11-02.json
[desktop]: product-desktop-computer-use.md
[R16]: implications-actions-and-loop.md
[R38]: implications-safety-and-control.md
[R39]: implications-safety-and-control.md
[R61]: implications-safety-and-control.md
[R43]: implications-observability-and-evaluation.md
[R44]: implications-observability-and-evaluation.md
[R48]: implications-observability-and-evaluation.md
[R51]: implications-observability-and-evaluation.md
[cu]: https://learn.chatgpt.com/docs/computer-use
[cow]: https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
[CGEvent.h]: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEvent.h
[CGEventSource.h]: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEventSource.h
[NSApp-activate]: <https://developer.apple.com/documentation/appkit/nsapplication/activate()>
[AX-perform]: https://developer.apple.com/documentation/applicationservices/1462091-axuielementperformaction
[Electron-a11y]: https://raw.githubusercontent.com/electron/electron/main/docs/tutorial/accessibility.md
[TN2150]: https://developer.apple.com/library/archive/technotes/tn2150/_index.html
[AppNap]: https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html
