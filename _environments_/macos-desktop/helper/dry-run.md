---
title: CUHelper dry run - driving the real helper before the grant
created: 2026-11-02T10:45:00Z
modified: 2026-11-08T10:51:00Z
level: L1
version: 0.3.2
description: How cu-verifier and tests drive the real Swift helper's rules with no grant and nothing on screen - the command line, the world file, what the helper answers and the events file it writes.
status: unverified
grounded_in:
  - source: _environments_/macos-desktop/helper/Sources/DryRun.swift
  - source: _designs_/desktop-extension/helper-and-protocol.md
---

# CUHelper dry run

`--dry-run --world <json>` runs the real helper - framing, validation, grant gate, scope and exclusions, the pause,
the per-step re-checks, `secure_input`, held-input release, capture sizes, frame composition, CGEvent building - over a
declared world instead of the Mac. Nothing is captured, posted or read from another app, no grant is used and no
prompt can appear; the peer check is skipped because nothing can act. The hello carries `mode: 'dry-run'`.

```
CUHelper --stdio --token-file <mode-600 file> --dry-run --world <world.json> [--events-out <new file>]
CUHelper --socket <path> --token-file <path> --dry-run --world <world.json> [--events-out <new file>]
```

Over the socket, captures come back by file (`path`, `sha256`) in the socket's directory, as the driver reads them;
over stdio they come inline (`png`). `--events-out` must not exist; it is created mode 600.

## The world

Every field is optional; the defaults give one 800 x 600 display at scale 1 and one app, `com.example.fixture`.

| Field | Shape | Meaning |
|---|---|---|
| `grants` | `{screen, accessibility, postEvents, listenEvents}` | what the helper believes is granted (default all but `listenEvents`); with `accessibility` the pass-through tap counts as running |
| `displays` | `[{id, main?, originPt: {x, y}, sizePt: {width, height}, scale}]` | the hello's displays and the capture geometry; the scope's display is the one holding the window's centre, as live |
| `apps` | `[{bundleId, pid, rect: {x, y, width, height}, title?, image?}]`, top-most first | running apps; in a capture an approved app is its `image` (a PNG path, for example CU Fixture's offscreen render) or a colour block, an app outside the scope is black and hides what lies under it, and the rest is black |
| `frontmost` | bundle id | the frontmost app (default the first app) |
| `elements` | `[{rect, element}]` | what `hitTest` answers inside `rect`; `element` is the target object, shaped by scope like the live helper's |
| `focused` | target object | what `focused` answers |
| `screenText` | string | the frontmost approved window's text |
| `activationWorks` | bool (default true) | whether bringing an approved app to the front succeeds |
| `localInputAfter` | integer | a person acts after that many posted steps of the next input (`local_input`, a `localInput` event) |
| `secureInputAfter` | integer | secure input turns on after that many posted steps (`secure_input` before the next key step) |
| `menuBar` | `[{bundleId, frame, title?}]` | each app's own menu bar items (its AXMenuBarItems) in global points |
| `menuKeyBar`, `menuKeyBarUnreadable` | `[{title, items: [{title, char?, modifiers?, virtualKey?, glyph?, enabled?, items?}]}]`; bool | the frontmost app's menus as Accessibility reports them (`modifiers` in AX bits: Shift 1, Option 2, Control 4, no Command 8), matched by `menuKey` with a US layout (CU-235); unreadable makes the read fail |
| `statusItems` | `[{frame, image?}]` | other apps' extras, the clock, Control Center - a colour block or a PNG |
| `menuBarStrip` | `{x, y, width, height}` | the menu bar strip (default the main display's top 24 pt when either field above is set); a capture includes it only on the display that holds it (CU-51) |
| `apps[].executable`, `apps[].sckBundleId`, `apps[].axOwner` | string; bundle ids | the same-named-app failures of 2026-11-05, declared: `sckBundleId` is the owner ScreenCaptureKit reports for the app's windows, `axOwner` the app Accessibility's hit test names over them (both default to the app itself). As live, a window is drawn only when `sckBundleId` equals the app's own bundle id and it is in scope, and the owner of a point is the topmost app (WindowServer) whenever `axOwner` names another one (design 0.4.9) |
| `handsOnMs` | integer, 0 to 600000 | the person keeps using the Mac for that long after the helper starts: the idle counter reads 0, then counts up (for the settle) |

With an approved app in front, a capture draws the whole strip - its items, other apps' items and the status items -
and then applies the live helper's mask (design 0.3.8): only the front app's own item frames survive, everything else
in the strip is black. With an unapproved app in front the strip is not drawn at all.

A point over no app hit-tests as `null`; over an app with no declared element it is the app's window, unnamed and
opaque. Outside the scope only the owner (`bundleId`, `pid`) is named. There is no `activate` request: when the
frontmost app is not approved, an `input` naming an approved `bundleId` brings that app to the front first
(`activationWorks: false` makes that fail as `out_of_scope`).

## The events file

One JSON line per CGEvent the helper built and would have posted, read back from the event itself:

```
{"mode": "global", "pid": 501, "event": {"type": 1, "x": 100, "y": 200, "flags": 0, "tag": 1129665349, "button": 0, "clickState": 1}}
```

`type` is the CGEventType (1 left down, 2 left up, 5 move, 6 left drag, 10 key down, 11 key up, 12 flags changed,
22 scroll), `tag` is `CUSE` (0x43555345) on every event the helper made, and key events carry `keyCode` and, for text,
`text` (at most 16 UTF-16 units per event). The release of held input appears as its own up events. The seam
`simulateLocalInput via: 'untagged'` writes one untagged move (`tag: 0`).

## Examples

The macos-helper suite drives it end to end: [`helper.test.mjs`](../../../_tests_/macos-helper/helper.test.mjs)
(stdio and socket) and [`UnitTests.swift`](../../../_tests_/macos-helper/UnitTests.swift) (every dispatcher rule).

## The settle (helper-protocol-details.md 0.4.1)

An `input` with `settleMs` is honoured only when the helper has seen local input since its last posted step (a
`local_input` stop or a `localInput` report; releases of held input do not count), else ignored. Honoured, it waits
until the person has been hands-off for `settleMs` - by the idle counter and by the guards' last report - then takes
that moment as the guard's new baseline and posts; past the cap (60 s, or `--settle-cap-ms` in a dry run) it answers
`done: false`, `failedAt: 0`, `code: local_input`. The dry run writes what each settle did to `--events-out`:
`{"settle": {"outcome": "ignored" | "settled" | "capped" | "gone", "waitedMs": n}}`.
