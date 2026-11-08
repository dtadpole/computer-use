---
title: The hit window decides pointer input
created: 2026-11-05T19:37:48Z
modified: 2026-11-07T22:20:00Z
level: L1
version: 0.4.19
description: For pointer input the owner at a point is the window WindowServer's own mouse hit test names - so click-through overlays and AppKit's drag image stop blocking, clickable windows of other apps are refused at any alpha, and capture stays on the window list.
status: unverified
grounded_in:
  - source: cu-developer-three's grant-free measurements, /tmp/cu-developer-three-scratch/qd15 (2026-11-05), CU-26, CU-46
  - source: cu-researcher's red team of Q-D15, inbox 20261105T192853 and 20261105T193558
  - source: CU-199 (2026-11-07) - cu-verifier's 0.2.44 Q-D15 runs and cu-developer-three's read-only probes; cu-researcher's red team, inbox 20261107T220145
---

# The hit window (Q-D15)

Every posted pointer event asks which app would receive it. WindowServer's own mouse hit test answers directly:
`+[NSWindow windowNumberAtPoint:belowWindowWithWindowNumber:]`, then that window's owner from the list.

## Rule

Before every posted pointer event - down, each held move, up, scroll - the helper reads the hit window at the point:

| Hit window | Decision |
|---|---|
| a window of an approved, unexcluded app | post |
| WindowServer's menu-bar window (layer 24) | Accessibility decides: the approved app's menu titles in, menu extras and other apps out |
| an open or save panel of the approved client ([file panels](file-panels.md)) | post as that client; elements carry `panel` or `hostedBy` (remote), under `file_choice` rules |
| Finder's desktop window (below layer 0) during a drag's held moves | Q-D12's Accessibility check decides (the desktop, not an icon or corner); a press or release there is refused |
| any other app's window, at any alpha or layer - one parked over the menu bar, another app's dropdown | refuse with `out_of_scope` and the bundle id |
| 0, a number missing from the on-screen list, or the helper's own window | refuse (fail closed); the helper's click-through indicator is skipped |

**Overlay elements (CU-199).** Accessibility's element at the point may be a click-through overlay's while the
click goes to the hit window. If the element's process owns a window listed, in the same read, above
the hit window on a higher layer and containing the point, CU-39's element rule yields: `hitTest` describes the hit
window's app's element there, naming the overlay in `overlaySkipped`, as input replies do. Otherwise the refusal stands,
naming its `check`.

The rules compose; position never selects one: the menu-bar rule applies only when that window is hit.
The call takes AppKit points (bottom-left origin), events top-left ones: y is flipped against the primary display's
height, unit-checked near both edges.

## Why

Measured grant-free (2026-11-05):

- click-through windows are skipped at any alpha (Typeless's overlay; CU Ledger click-through at 0.02 and 1), and
  clickable ones are named at any alpha, even 0;
- Notification Center's and the Dock's full-screen layers are skipped;
- AppKit's full-screen drag image is skipped and a window appearing mid-drag is named, so CU-46 needs no exception;
- per-pixel pass-through is followed: a borderless window's clear half hits the window beneath;
- 33 µs median per call, ten times cheaper than a window-list read.

So click-through overlays no longer block, a clickable one is refused (it would receive the click), the system-overlay
and drag-image exceptions go, and Q-D14's trusted-overlay list is unneeded.

## Unchanged

Capture keeps the window list: every unapproved window, click-through or not, stays black. Keyboard input keeps the
frontmost-app and focused-element checks. The check-to-post race stays as Q-D11 states.

## Gates

Before it is relied on: a notification banner is hit and named (logged in an announced run); a scroll
over a click-through overlay lands beneath (CU Fixture's scroll log); CU-14's overlay probes stay as regression -
faint, floating and late (0, 2, 20 ms) refused, a click-through CU Ledger passing; for CU-199, a click under a dictation
overlay allowed, an open/save panel's remote element still refused.
