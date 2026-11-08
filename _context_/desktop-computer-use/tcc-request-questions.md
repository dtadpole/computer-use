---
title: Questions behind the owner TCC request for the helper
created: 2026-11-02T09:10:00Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.1.1
description: What the coordinator's single TCC request for our Swift helper must ask and leave out - Input Monitoring, Screen Recording re-confirmation, Accessibility scope, signing identity and launch - answered with sources, confidence and what the owner will see.
status: unverified
grounded_in:
  - source: 'design open-questions.md Q-D1 as measured in cdfefa64e and helper 0.2.10 (f6b69d1e5)'
  - source: '_team_members_/cu-developer-two/macos-helper-measurements.md@1.0.0'
  - source: '_team_members_/cu-developer-two/m6-desktop-review.md@1.0.0'
  - source: 'dtadpole/computer-use/_designs_/desktop-extension/helper-and-protocol.md@0.2.0'
  - source: 'dtadpole/computer-use/_designs_/desktop-extension/human-control.md@0.2.0'
  - source: 'dtadpole/computer-use/_designs_/desktop-extension/open-questions.md@0.2.0'
  - source: _context_/team-operations/decision-log.yaml
  - source: _context_/desktop-computer-use/mechanics-sources.yaml
  - source: _context_/desktop-computer-use/probe-results-2026-11-02.json
  - source: developer.apple.com/videos/play/wwdc2019/701
  - source: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEvent.h
  - source: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGEventSource.h
  - source: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/ScreenCaptureKit.framework/Headers/SCError.h
  - source: developer.apple.com/documentation/macos-release-notes/macos-15-release-notes
  - source: developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.persistent-content-capture
  - source: developer.apple.com/documentation/devicemanagement/restrictions
  - source: developer.apple.com/documentation/xcode/resetting-access-to-protected-resources-in-macos
  - source: developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
  - source: developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos
  - source: github.com/trycua/cua/pull/5352
  - source: stackoverflow.com/questions/52891033/how-to-reset-hididletime-on-macos-10-14
  - source: github.com/jackielii/skhd.zig/blob/2ec9ff38f/docs/CODE_SIGNING.md
  - source: raw.githubusercontent.com/silverstein/minutes/87eff6010/crates/core/src/hotkey_macos.rs
  - source: 9to5mac.com/2024/08/14/macos-sequoia-screen-recording-prompt-monthly/
---

# Questions behind the owner TCC request

On cu-developer-two's [measurements](../../_team_members_/cu-developer-two/macos-helper-measurements.md) and
[review](../../_team_members_/cu-developer-two/m6-desktop-review.md); short names in
[mechanics-sources.yaml](mechanics-sources.yaml); 3p = third-party.

| Q | Answer | Confidence | Evidence |
|---|---|---|---|
| Q1 Input Monitoring | **Don't ask.** Only listen-only key taps need it; creating one ungranted prompts. Pause on the HID idle counter (no grant; measured 2026-11-05 on macOS 27: our own posts DO reset it, contrary to the 10.14 report, so the guard re-baselines after each post - helper 0.2.10, Q-D1) plus an Accessibility-gated active tap passing events through. Ours carry `CUSE` user data and the helper's pid. Owner sees no Input Monitoring entry. | medium | WWDC19-701; CGEvent.h; CGEventSource.h; measured; [SO](https://stackoverflow.com/questions/52891033/how-to-reset-hididletime-on-macos-10-14), [skhd](https://github.com/jackielii/skhd.zig/blob/2ec9ff38f/docs/CODE_SIGNING.md), [minutes](https://raw.githubusercontent.com/silverstein/minutes/87eff6010/crates/core/src/hotkey_macos.rs) 3p |
| Q2 Screen Recording re-confirmation | First capture without `SCContentSharingPicker`, by any API, raises a focus-taking direct-access alert; monthly on 15.0, once per bundle path on 26.5. Picker, VNC entitlement and MDM bypass don't fit. Trigger it during the grant; later an alert frontmost pauses the run, never answered by the agent; `SCStreamErrorUserDeclined` is `not_granted`. Owner sees one alert, maybe again. | low for 27 | macOS15-RN; PCC; MDM-restrictions; SCError.h; 9to5Mac, [cua](https://github.com/trycua/cua/pull/5352) 3p |
| Q3 Accessibility | One toggle covers AX and posting; PostEvent has no own pane. Ungranted posts are discarded and prompt, so the helper preflights first. Owner sees one Accessibility entry. | medium-high | WWDC19-701; PPPC-services; [tccutil](https://developer.apple.com/documentation/xcode/resetting-access-to-protected-resources-in-macos) |
| Q4 Identity | Grants bind `com.reflection.cu-helper` plus its designated requirement, ad hoc the cdhash, so each live rebuild needs `tccutil reset All com.reflection.cu-helper`, two toggles, a relaunch; ~20 rebuilds in M7-M9 (estimate) mean 40 grants. Self-signed: one grant, a keychain Always Allow, maybe a trust dialog. | high ad hoc, medium self-signed | measured; TN3127; CSG-About; [skhd](https://github.com/jackielii/skhd.zig/blob/2ec9ff38f/docs/CODE_SIGNING.md) 3p |
| Q5 Also | Grant only the bundle at fixed `$CU_HOME/helper/`, launched by `open -n -a`; Quit & Reopen after Screen Recording. No Full Disk Access, Input Monitoring, Automation; nothing for terminals, node, DSH, browsers. First clear the alert frontmost since 2026-11-01. | high | SCK-sample; measured; [helper](../../_designs_/desktop-extension/helper-and-protocol.md); D-024 |

## Recommended wording for the owner request

- "Turn on CUHelper (`com.reflection.cu-helper`) under Screen & System Audio Recording and Accessibility only, then Quit & Reopen."
- "Our first test capture may ask to access your screen directly; choose Allow. If it returns, the agent pauses."
- "Choose signing: a self-signed certificate made once, or ad hoc with re-grants after each helper change."
- "Revoke any time with `tccutil reset All com.reflection.cu-helper`."

## Open, needs a measurement

Fixture app, after the grant:

1. Do our tagged posts, or Screen Sharing input (the display is virtual), move the HID counter? Other activity does (probe).
2. Do active-tap keys and `CGPreflightPostEventAccess` work with Accessibility alone, promptless?
3. Does the capture alert recur on 27, from which process?
4. Does an untrusted self-signed identity sign and keep grants across rebuilds?
5. Bundle id: design `com.reflection.cu-helper`, measured `dev.heddle.computer-use.helper`; fix one.
