---
title: Capture and scaling
created: 2026-11-02T08:29:12Z
modified: 2026-11-06T06:05:16Z
level: L1
version: 0.4.10
description: How the helper captures only approved apps with ScreenCaptureKit, and how frame pixels map to Retina pixels and global screen points for every action.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (perception, trajectory rows)
  - source: _designs_/system-architecture/keys-and-coordinates.md@0.8.4
---

# Capture and scaling

## What is captured (perception, trajectory rows)

The helper uses ScreenCaptureKit (`SCScreenshotManager`) with a content filter rebuilt for **every** capture from the
run's scope: the display holding the target app's key window, **including only windows whose WindowServer owner pid
resolves through AppKit to an approved bundle id** that ScreenCaptureKit also reports (a window-scoped filter), never
by name or a cached pid map.
Everything else - other apps, an unapproved app's menu bar, the desktop, notifications - is black, so nothing else
reaches the model, trajectory or live view. An approved browser's excluded windows (live view,
DSH) are excepted too (R68); excluded apps are never in a scope. The cursor is not drawn.

The menu bar: when the frontmost app is approved, the strip shows only that app's own menu titles (its `AXMenuBarItem` frames, read through AX), and every other pixel of the strip (status items, the clock, Control
Center, other apps' extras) is black; when the frontmost app is not approved, the whole strip is black.

One display per run, the one holding the target app's key window at the first capture. The frame is fixed for the
run, so a target window moving to another display ends the run `error: display_changed`, never a silent remap. If the first app's join moves it off the launch
guess, agent core rewrites the header once (`frameFixed`, CU-68).

## Pixels, points and the frame

Three spaces, mapped per axis as in [keys-and-coordinates](../system-architecture/keys-and-coordinates.md):

| Space | Unit | Owner |
|---|---|---|
| frame | pixels of the image the model sees | agent core (every action and target) |
| capture | pixels ScreenCaptureKit returns, `scale` = backing scale factor (2 on Retina) | helper |
| global | points of the macOS global display space (origin top-left of the main display) | helper input, AX |

The driver asks for a capture no larger than the adapter's `maxImage` (Claude: long edge 2576, 4784 visual tokens):
the helper captures at the display's point size times the largest factor that fits - usually below the Retina
pixel size - so `frameScale` = frame px per point is at most `scale`. A frame point `(x, y)` maps to global points as
`originPt + (x / frameScaleX, y / frameScaleY)`, rounded to the nearest point; out-of-frame points are refused before
any input ([action-schema](../system-architecture/action-schema.md)). The environment owns the scale; the core never
sees points.

## Proving it (perception row)

The Mac mini's display has been 5120x2880 pixels at scale 2 and 1920x1080 points at scale 1 (D-033). Nothing assumes a size: plans and checks read the run's frame and give frame pixels, and
the driver's pure mapping (`frameToGlobal(point, frame)`) is unit-tested at scale 1 and 2 with `capture {simulateScale}`. The fixture app reports each click's landing point in window coordinates. A check clicks the centre of a target
whose frame the fixture also reports, on a Retina and a non-Retina layout (scale 1 by capture size), and needs the
landing point within one point of its centre.

## Stable frame

The frame size is fixed from the first capture, like the browser's; a display resolution change mid-run ends the
run `error: display_changed` too.
