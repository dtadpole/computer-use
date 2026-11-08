---
title: Input and targets
created: 2026-11-02T08:29:12Z
modified: 2026-11-06T15:24:26Z
level: L1
version: 0.4.19
description: How canonical actions become macOS input events, why every synthetic event is tagged, and how accessibility hit-tests give the policy its targets without reading secure fields.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (action contract, consent rows)
  - source: _designs_/system-architecture/environment-driver.md@0.8.4
---

# Input and targets

## Actions (action contract row)

The nine GA actions plus `triple_click`, `zoom`, `cursor_position` and, where the helper holds, `hold_key`
([input vocabulary](input-vocabulary.md)); presses arrive as drags; `navigate` is refused by name. The driver plans each action into pointer, button,
key, wheel and text steps, sent as one `input` request. Keys keep agent core's names.

## Delivery (R65, R79, R83, R86)

`global` mode posts with `CGEventPost` at the HID level, the target app raised with `AXFrontmost` and verified; `pid` mode (`CGEventPostToPid`) is keyboard-only;
its pointer actions are refused (Q-D3). `global` runs only while the [local-input pause](human-control.md) is armed. Before **every
low-level event**, the helper re-checks with WindowServer:

| Check | On failure |
|---|---|
| the frontmost app and the window under the point (its WindowServer owner, below) are in scope and not excluded; a drag's held moves may also cross bare desktop (no counted window; AX names Finder's desktop, not an icon), never within 8 pt of a corner - the planned path checked first (Q-D12) | stop posting; `out_of_scope` names the bundle id; an excluded app in front is the person's (hand-off) |
| `IsSecureEventInputEnabled()` is false before a key step | no key posted; `secure_input`, a hand-off |

**Release guarantee:** on pause, stop, failure, `out_of_scope`, `bye` or socket loss the helper first posts tagged up
events for every button and key it holds (Escape first for a held drag, CU-44); the fixture checks every down has its up.

**Retries (CU-56):** agent core retries only what is transient and posted nothing - an action refused pre-post as
unverified or by the helper's front-app check (CU-82: after the helper's settle) - once, after
150 ms, if input is still allowed - and a capture dropped for a leak (twice); each is recorded.

## Tagged events

Every synthetic event carries `kCGEventSourceUserData = 0x43555345` (`CUSE`) from a private event source; any event
without it is the person's. A forged tag could only fail to pause a run, never act.

## Targets for the policy (consent row, R83, R92)

`hitTest` returns the AX element under the point: bundle id, pid, role, subrole, title or description, frame,
`secure` (`AXSecureTextField`), and `opaque` when unnamed and generic; when that element is another process's, only the
window's owner and `elementOwner` (D-045). Panel elements carry `panel` or `hostedBy` ([file panels](file-panels.md)).
`AXManualAccessibility` makes Electron apps expose their tree. `focused`, the focused element. They map
onto the policy's target (`name`, `role`, `origin`, `fingerprint`, which includes the panel markers). A secure element's value is never
read; acting in it is the person's ([app policy](app-policy.md)). `null` is empty space.

## Screen text and clipboard

`screenText` gives the inspector the visible AX text of the frontmost approved window (at most 20,000 characters, no secure
fields). Copy, cut and paste are allowed in
approved apps and may overwrite the clipboard (D-031); it is never read or recorded.

For pointer input the owner at a point is the window WindowServer's mouse hit test names, judged before every posted
event ([hit window](hit-window.md), Q-D15). Capture's window lists come from `CGWindowListCopyWindowInfo` (pid, number,
layer, bounds, alpha; never titles), and owners win over AX (D-037).
