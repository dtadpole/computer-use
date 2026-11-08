---
title: macOS capture and input mechanics for an app-scoped computer-use helper
created: 2026-11-02T08:46:00Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.1.1
description: How our helper app can capture approved windows with ScreenCaptureKit, send input through CGEvent or Accessibility, and map screenshot pixels to global display points across Retina and multiple displays.
status: unverified
grounded_in:
  - source: developer.apple.com/documentation/screencapturekit/sccontentfilter
  - source: developer.apple.com/videos/play/wwdc2022/10155
  - source: developer.apple.com/videos/play/wwdc2019/701
  - source: developer.apple.com/documentation/applicationservices/axuielement_h
  - source: platform.claude.com/docs/en/build-with-claude/vision
  - source: _context_/desktop-computer-use/mechanics-sources.yaml
---

# macOS capture and input mechanics

Short names resolve in [mechanics-sources.yaml](mechanics-sources.yaml).

## Capture (ScreenCaptureKit)

- **Filters**: one window on any display, a display with only listed apps, or a display minus listed apps. Excepting windows flip inclusion [SCK-filter]. Use them to exclude our own live view [WWDC22-10156], not `NSWindow.sharingType = .none`, a legacy constant Apple says not to use for hiding [NSWindow-sharing].
- **Window capture** keeps occluded and off-screen content, and pauses while minimized [WWDC22-10155].
- **Stills.** `SCScreenshotManager.captureImage` (macOS 14+) returns a CGImage [SCK-shot]. The cursor is drawn by default; `minimumFrameInterval` 0 means maximum rate [SCK-config].
- **Consent.** Capture needs Screen Recording consent [WWDC22-10156] and an `NSScreenCaptureUsageDescription` string [SCK]. A new grant needs an app restart [SCK-sample]. From 15.1, MDM can bypass "a screen capture alert" [MDM-restrictions]. Persistent capture is a VNC entitlement granted on request [PCC]. Third parties report monthly re-consent for capture outside `SCContentSharingPicker` [9to5Mac][tinyapps]. Not verified on macOS 27.

## Input (CGEvent)

- **Global post.** `CGEventPost` at the HID or session tap enters the system stream and passes later taps [CGEvent.h][CGEvent-doc]. It reaches whatever has cursor or key focus (inference).
- **Pid-targeted post.** `CGEventPostToPid` has no Apple documentation beyond its declaration; the PSN form is deprecated [CGEvent.h]. Whether it clicks into a background app without taking focus is unknown; test it on our fixture app.
- **Consent.** The first post is discarded and the user is sent to Accessibility [WWDC19-701]. `PostEvent` is its own TCC service [PPPC-services]. `CGPreflightPostEventAccess` checks without a prompt [CGEvent.h].
- **Limits.** Apps may ignore an event's Unicode string and re-translate key codes [CGEvent.h]. Secure input stops keys reaching intercepting processes [TN2150][CarbonEventsCore.h]. Its effect on posted keys is undocumented; hand secure fields to the person (inference).

## Accessibility

- `AXUIElementCreateApplication(pid)` roots the tree [AX-create]. `kAXPressAction` and `AXUIElementSetAttributeValue` act [AX-perform][AX-set][AXActionConstants.h]. `AXObserver` reports changes [AX-observer].
- An untrusted client gets `kAXErrorAPIDisabled` [AXError.h][AX-trusted].
- A busy app returns `kAXErrorCannotComplete`; tune `AXUIElementSetMessagingTimeout` [AX-perform][AX-timeout].
- Electron apps need `AXManualAccessibility` set first [Electron-a11y].
- Reported 2026-11-05 (cu-developer-three, one diagnostic): the system-wide AX hit test returned the lower window's
  pid where another app's window was on top; WindowServer's owner pid via `NSRunningApplication` was right and is
  now the owner authority (helper 0.2.12). A ScreenCaptureKit fault was not shown (D-038).

## Points, pixels, image budget

- **Coordinate systems.** CGEvent, `CGDisplayBounds`, `kCGWindowBounds` and AX positions use global points with the origin at the main display's top-left [CGEvent.h][CGDisplayBounds][CGWindow.h][AX-pos]. AppKit frames start at the bottom-left [Cocoa-coords]. `backingScaleFactor` is pixels per point [NSScreen-scale].
- **Capture size.** ScreenCaptureKit sizes are pixels; `.nominal` gives one pixel per point [WWDC22-10155][SCK-config].
- **Model budget.** Tokens are ⌈w/28⌉×⌈h/28⌉, capped at 2576 px long edge and 4784 tokens. Oversized computer-use screenshots are rejected, not resized [Claude-vision].
  - Point-size capture fits unscaled, at half Retina detail: 1512×982 pt is 1944 tokens, 1920×1080 2691 [probe].
  - Otherwise, map clicks back with x_pt = origin_x + x_img/(s·backingScale) (inference).

## Multiple displays

- One global space; the first active display is the main one. `CGGetDisplaysWithRect` on a window's bounds names its display [CGDirectDisplay.h]. `NSScreenNumber` maps NSScreen to display ID [NSScreen-device]. Don't cache screens [NSScreen-screens].
- This Mac: one 1920×1080 1x display that system_profiler names "virt" (inference: virtual) [probe].
