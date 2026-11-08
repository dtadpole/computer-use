---
title: macOS helper identity, background operation and local-input pause
created: 2026-11-02T08:55:00Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.0.1
description: How TCC ties our helper's grants to its code-signing identity, how the helper can act while the owner works, how it can notice local input without new permissions, what the prompt-free probe found and which steps need an owner-approved prompt.
status: unverified
grounded_in:
  - source: developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
  - source: developer.apple.com/documentation/devicemanagement/privacypreferencespolicycontrol/services-data.dictionary/identity
  - source: developer.apple.com/videos/play/wwdc2019/701
  - source: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEventSource.h
  - source: _context_/desktop-computer-use/probe-results-2026-11-02.json
  - source: _context_/desktop-computer-use/mechanics-sources.yaml
---

# Helper identity, background operation, input pause

Short names resolve in [mechanics-sources.yaml](mechanics-sources.yaml).

## TCC identity

- **How grants are kept.** TCC records an app's designated requirement (DR) and checks each later version against it. An ad hoc DR is tied to one version, so every change prompts again [TN3127][codesign-man].
- **Probe.** swiftc output is ad hoc signed with a DR of `cdhash H"…"`. An identical rebuild was byte-identical; changing one string gave a new cdhash, which would drop the grant (inference) [probe].
- **Stable identity.** A self-signed identity keeps the DR stable (inference for TCC) [CSG-About] but must not ship [CSG-Procedures]. Developer ID plus notarization also passes Gatekeeper [Sec-signing]. Sign the whole bundle with `codesign -s <identity> -f --timestamp -o runtime` [DistSign].
- **Keys.** Per MDM docs, bundles are keyed by bundle ID, bare binaries by path, and nested helpers inherit the bundle's grants [PPPC-identity]. The services are ScreenCapture, Accessibility, PostEvent and ListenEvent [PPPC-services]. `tccutil reset <service> <bundle-id>` clears one app's decision [tccutil-man].
- **Responsible process.** Each process has a responsible process [ES-responsible]; a shell-launched tool is judged as its host, matching the probe (inference).
- **Layout.** `Contents/Info.plist`, `Contents/MacOS/<exe>`, nested tools in `Contents/Helpers/` [Bundle]. Set `CFBundleIdentifier`, `LSUIElement` (no Dock icon) and `NSScreenCaptureUsageDescription` [CFBundleIdentifier][LSUIElement][SCK]. On our unlaunched skeleton, editing Info.plist changed the cdhash [probe].

## Acting while the owner works

- The frontmost app receives key events [NSWorkspace-front]. Since macOS 14, activation is cooperative and never guaranteed [NSApp-activate][NSApp-yield]. Activating the target steals focus; without focus, use AX actions or pid-targeted events, the latter unproven (inference).
- Space changes are notified [NSWorkspace-space], and window capture continues off-screen [WWDC22-10155].
- App Nap throttles timers in background apps that hold no assertion [AppNap]; hold `beginActivity` during a run [ProcessInfo-activity].

## Pausing on local input

- **Poll idle time** with `CGEventSourceSecondsSinceLastEventType(.hidSystemState, kCGAnyInputEventType)`. HID state covers hardware; combined state covers every source that posts [CGEventSource.h]. It returned live values with every grant false; `ioreg HIDIdleTime` agreed at 735 s [probe].
- **Avoid event taps and global key monitors.** They need Input Monitoring or Accessibility and prompt on first use [WWDC19-701][NSEvent-monitor].
- **Tag our events** with source user data from a private source state [CGEventSource.h][CGEventTypes.h]; reading tags back needs a tap. Whether our posts reset HID idle is unknown; test it with the owner.

## Probe results (macOS 27.0, 2026-11-02)

- All four TCC preflights false, for the DSH host [probe].
- One 1920×1080-pt display, scale 1.
- Idle 735 s (HID) versus 30406 s (combined).
- 26 on-screen windows; 2 named, all with sharing state, which WWDC19 says is withheld.
- Frontmost: a UserNotificationCenter alert of unknown origin.

## Needs an owner-approved prompt

1. Screen Recording, plus any periodic re-confirmation.
2. Accessibility (AX and posting).
3. Input Monitoring, only if we use a tap.
4. A signing identity (Keychain or Developer ID).
5. Any `tccutil reset`.
6. The helper's first live capture or input.
