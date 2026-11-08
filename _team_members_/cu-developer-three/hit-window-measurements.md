---
title: Hit-window and drag-image measurements (2026-11-05)
created: 2026-11-05T20:05:00Z
modified: 2026-11-05T20:05:00Z
level: L1
version: 0.1.0
description: The grant-free measurements behind CU-46 (AppKit's full-screen drag image) and Q-D15 (the owner at a point is WindowServer's mouse hit window) - what was run and what each result decided.
status: unverified
grounded_in:
  - source: dtadpole/computer-use _designs_/desktop-extension/hit-window.md (PR #77, draft 0.4.18)
  - source: dtadpole/computer-use _designs_/desktop-extension/input-and-targets.md (PR #71)
  - source: Linear CU-46, CU-26
  - source: inbox 20261105T191005, 20261105T193014, 20261105T193536 (cu-developer-three)
---

# Hit-window and drag-image measurements

These runs used this Mac (one 1920x1080 display, scale 1) and no grant. They read only owners, layers, alpha and
bounds from CGWindowList, never titles. The hit window is `+[NSWindow windowNumberAtPoint:belowWindowWithWindowNumber:]`
called from an NSApplication process. Every run was announced and held the desktop-run lock.

## CU-46: the drag image hides other windows

Run `20261105T190930Z-e89837` used the drag-session screen on helper 0.2.19. CU Ledger's blocker appeared mid-drag,
yet the drag ended `done` and the session ended with operation none. A sampler read the window under the pointer
every 25 ms. From the first held move to the release, the topmost window there was CU Fixture's, at layer 500 with
bounds 0,0 1920x1080. That is AppKit's drag image.

So the per-event check was not caching anything. It saw the drag source and never reached CU Ledger at layer 3.
Helper 0.2.21 (#72, design #71) passes over that window, but only while our button is held and only when the drag
source owns it.

## Q-D14 gate: click-through or clickable

CU Ledger's overlay sat at 200,300 300x200, floating, over Chrome. The table shows the readings at (350,400).

| Overlay | Hit window | List's topmost |
|---|---|---|
| click-through, alpha 0.02 or 1 | Chrome, beneath | CU Ledger |
| clickable, alpha 0, 0.02 or 1 | CU Ledger | CU Ledger |

The hit test also skipped Typeless's real overlay, the Dock (layer 20) and Notification Center (layer 21).

## Q-D15 open points

| Point | Result |
|---|---|
| Drag image (run `20261105T193507Z-3065af`) | Skipped. Once CU Ledger appeared, it was the hit window while the list's topmost stayed CU Fixture@500. |
| Menu bar | One WindowServer window, layer 24, across the strip. The hit test cannot tell menu titles from extras, so Accessibility decides there. |
| Transparent pixels | In a half-clear window that left `ignoresMouseEvents` at its default, the clear half hit the window beneath. With `ignoresMouseEvents = false` set, both halves hit the window itself. |
| Latency | 33 us median and 91 us p99 per call, against 377 us median for CGWindowListCopyWindowInfo. |
| Notification banner | Not measured: posting one would prompt the owner. |
| Scroll over a click-through overlay | Not measurable without the Accessibility grant. It will be proven after the build with CU Fixture's scroll log. |

## What it decided

- **CU-46:** the narrow drag-source rule.
- **Q-D14 (#76):** not built.
- **Q-D15 (#77):** the hit window decides pointer input, combined with the menu-bar rule; capture stays on the
  window list. Helper 0.2.23 is staged on `cu/cu-developer-three-qd15`.
