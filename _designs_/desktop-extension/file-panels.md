---
title: File panels (open and save)
created: 2026-11-05T17:40:25Z
modified: 2026-11-06T01:49:35Z
level: L1
version: 0.4.23
description: How an approved app's open and save panel counts as that app - an in-process panel marked by AppKit's identifier, a remote one attributed by proven attachment - why choosing a file is always asked, and what is never read (the panel's folder, a named limit).
status: unverified
grounded_in:
  - source: CU-8 run analysis (export-file asked new_app for com.apple.appkit.xpc.openAndSavePanelService), CU-39
  - source: cu-developer-three's attachment proof and cu-developer-two's attribution rule, inbox 20261105T1728-1738
  - source: _context_/team-operations/decision-log.yaml (D-043)
---

# File panels (open and save)

macOS shows an app's open or save panel in one of two ways (CU-39, live). For an ordinary app it is in-process: the
window and its elements are the app's own, so a click on Save looks like any other. For a
sandboxed app it is remote: the window is the app's, its content belongs to
`com.apple.appkit.xpc.openAndSavePanelService` (CU-8's `new_app`). Without a rule, `file_choice` never triggers.

## When an element is in a panel

Reported on hit tests and the focused element, never by title:

| Case | Proof | Marker |
|---|---|---|
| in-process | an ancestor window or sheet of the element carries AppKit's AXIdentifier `save-panel` or `open-panel` | `panel: 'save'` or `'open'` |
| remote | the window at the point is the frontmost, approved, unexcluded client's attached sheet (its focused window's `AXSheet`, same frame, directly above its parent), and the element belongs to the panel service on the system volume | `hostedBy` |
| undecided | the ancestor walk hit its limit or an AX error, or the element is another process's without that proof | `panel: 'unknown'`, or owner only |

Agent core gives `panel` and `hostedBy` the same rules; undecided targets are asked each time, never pre-approved;
D-045 refuses an unproven owner and element mismatch. A window falsely claiming a panel identifier only
adds questions. Measured live (0.2.22): sheets and panel windows carry them, the main window not; Return
and a double click in a sheet were asked `file_choice`. `panelSelection` reads the name field and the panel's `AXURL` or `AXDocument` before the
commit. A name typed as a path (with `/` or led by `~/`) is resolved and checked on its own, and `..` is refused; with
no folder the request says the destination is unknown (`folderKnown` false), never read as allowed. Live, neither holds a
folder and an open panel gives nothing; the folder shows only as display names, never used (D-047, final). So a
navigated destination is asked as unknown; typed paths, and shortcuts or items into a protected place, are refused.

## What the agent sees and does

Its file and folder names reach the model and trajectory, a residual recorded in
[trajectory privacy](trajectory-privacy.md). A task needing a file names its folder, so the agent goes there with Go to
Folder; excluded apps stay excluded.

Inside an attributed panel the agent may navigate and select. Refused there, nothing sent:
Quick Look (it renders files), context menus, drag out, and file operations (rename, trash,
new folder, tags).

The final button - Open, Save, Choose, Upload, Attach, Select, Import or Export - is class `file_choice`: asked every
time, never pre-approved, declined unattended. A known path is shown canonically -
symlinks resolved, Unicode and bidi controls escaped - not only the panel's text.
Even with approval, no file is saved into, or chosen from, `~/.ssh`, `~/Library/LaunchAgents`, `/Library/LaunchAgents`,
`LaunchDaemons`, `~/Library/Keychains`, shell start-up files, login items, or `/Applications` and app bundles.

## Proof

CU Fixture's panels (sheet, window); helper unit checks and dry-run worlds (attributed, floating, foreign);
agent-core tests; read-only `inspect` checks; every commit - Return, double click, typing, Save button - asked live, declined. Red-teamed by cu-researcher (Q-D13).
