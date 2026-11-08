---
title: M6 desktop design review - environment side
created: 2026-11-02T08:40:00Z
modified: 2026-11-05T16:22:58Z
level: L1
status: unverified
version: 1.0.2
description: cu-developer-two's review of desktop-extension revision 0.1 from the helper and driver side - what holds against the measurements, and five changes or open questions before approval.
grounded_in:
  - source: dtadpole/computer-use _designs_/desktop-extension/INDEX.md@0.1.0
  - source: _team_members_/cu-developer-two/macos-helper-measurements.md@1.0.0
---

# M6 desktop design review - environment side

Revision 0.1 (aac08e27c) of [desktop-extension](https://github.com/dtadpole/computer-use/blob/main/_designs_/desktop-extension/INDEX.md), read against my
[measurements](macos-helper-measurements.md). I build `_environments_/macos-desktop/` as written; sign-off after the
points below are settled or recorded as open questions.

## Holds

- LaunchServices launch with `--socket` and `--token-file`: measured, a `swiftc` bundle started by `open -n -a` runs
  as its own responsible process and its output is captured.
- The cdhash problem and a non-ad-hoc identity: measured, a one-line rebuild changed the ad-hoc requirement.
- The line protocol, its stdio twin for a fake helper, `not_granted` without prompting, `helper_lost` without retry.
- Frame, capture and global spaces mapped per axis; one display per run; `display_changed` instead of remapping.

## Changes or open questions

1. **The local-input pause needs Input Monitoring as written.** A listen-only `CGEventTap` that sees key events is
   gated by Input Monitoring, a third TCC service, not by Screen Recording or Accessibility. Either the single owner
   request covers all three, or the pause rests on the HID idle counter
   (`CGEventSourceSecondsSinceLastEventType(.hidSystemState)`, readable with no grant, measured). I propose both:
   the tap when granted, the counter as a permission-free second guard. Whether our tagged events reset the counter
   is the first fixture-app measurement.
2. **Making the target frontmost.** A background `LSUIElement` helper's `NSRunningApplication.activate` can be refused
   under cooperative activation. Setting the app element's `AXFrontmost` (Accessibility) is the likely route; the
   helper should verify the frontmost app after each activation and fail `out_of_scope` otherwise.
3. **The self-signed identity may need trust.** `codesign` with a self-signed certificate may require trust settings
   for code signing, an admin authentication dialog. That belongs in the coordinator's single owner request, with the
   keychain step, not in a later surprise.
4. **Screen Recording re-confirmation.** Recent macOS versions periodically ask the person to re-confirm an app's
   screen recording. If macOS 27 does, a long-lived helper meets a recurring prompt; add it to the open questions and
   measure after the grant.
5. **Large captures on one line.** A full-display PNG is megabytes as base64 in one JSON line. Workable, but the
   helper may instead write the PNG into the run's mode-700 directory and reply with its path and SHA-256; I will
   measure both and keep the protocol field names.

## Next from me

The helper skeleton (protocol, scope, every primitive answering `not_granted` until granted) and the
`macos-desktop` driver behind environment-driver with unit tests on a fake helper over stdio. Nothing posts input or
captures before the grant and the fixture app exist.
