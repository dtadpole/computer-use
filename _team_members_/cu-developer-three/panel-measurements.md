---
title: Open/save panel measurements (2026-11-05)
created: 2026-11-05T22:20:00Z
modified: 2026-11-06T00:45:00Z
level: L1
version: 0.3.0
description: The live measurements behind CU-39 - CU Fixture's open and save panels are in-process, and AppKit's identifiers mark them - and what each result changed in the helper.
status: unverified
grounded_in:
  - source: dtadpole/computer-use _designs_/desktop-extension/file-panels.md (PR #84)
  - source: dtadpole/computer-use PRs #87, #65, #96 and #90 (cli.mjs inspect)
  - source: Linear CU-39; decision D-045 (cu-coordinator)
  - source: inbox 20261105T203914, 20261105T204346, 20261105T215015, 20261105T221234 (cu-developer-three)
---

# Open/save panel measurements

Every run was announced and held the desktop-run lock. CU Fixture opened its own panel through its control channel
(`act {press}`), so no input was posted into a panel.

## 1. The window (12:38 PT, no grant)

The window list showed no window of `com.apple.appkit.xpc.openAndSavePanelService`. The save sheet was CU Fixture's
own window, directly above its main window. So the first design of file-panels.md, and #65's first attribution, were
wrong for this app: they looked for a window owned by the panel service.

## 2. The elements (12:41 PT, helper 0.2.21)

Scripted pointer moves over the sheet came back fully described as CU Fixture, and the frontmost app stayed CU Fixture.
The panel is in-process, so no element is owned by another process. These moves came before D-045 (12:44). Moves post
events, so they are not used on panels again.

Consequence: the owner/element mismatch rule cannot catch this case. A panel marker is needed instead.

## 3. AppKit's identifiers (13:50 PT, helper 0.2.22)

`cli.mjs inspect` was used. It is read-only and posts nothing. In the save sheet, five points (cell, text field, split
group, label) all gave `panel: 'save'`. In the open sheet, the same points all gave `'open'`. No point had an
`elementOwner`.

## 4. Panels as their own window (14:12 PT, helper 0.2.22)

#96 adds `panelStyle: 'window'`, which calls `begin()` instead of showing a sheet. Inside that window, points gave
`'save'` or `'open'`. A point on the main window gave no marker. One point fell on a UserNotificationCenter alert,
which sits at layer 8 and has been on screen since at least 12:38. It came back owner-only, which is correct.

## What changed

- 0.2.22 (#87): the panel marker (`save`, `open`, `unknown`). It also adds the fail-closed mismatch rule with
  `elementOwner`, for remote panels.
- 0.2.23 (#65): `panelSelection {path, directory, name}`, which finds the panel by its identifier.
## 5. Where the folder lives (15:05 PT, branch build 0.2.24-measure)

`--panel-attributes` listed attribute names and URL booleans only. No URL, Document, Filename or Path attribute
appeared in the first 1,500 nodes of either sheet, and no value was a file URL. The browser's item level was not
reached. D-047 made the navigated folder a named limit; a targeted walk of the browser waits for the batch's end.

## 6. The browser's items (16:26 PT, branch build 0.2.25-measure)

The walk started at the panel's AXBrowser. Its file items are AXGroups that expose only AXDescription, AXIndex,
AXTitleUIElement and AXCustomActions. The panel has no folder attribute anywhere, so D-047's limit is final. CU-39
closed verified with two named limits (D-048); CU-48 and CU-49 carry them.

- Still unmeasured: sandboxed apps (a remote service), because the team may only touch fixture apps.
