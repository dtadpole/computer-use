---
title: Trajectory privacy on the desktop
created: 2026-11-02T08:29:12Z
modified: 2026-11-06T04:06:27Z
level: L1
version: 0.4.5
description: What a desktop run records and what it never records, so the trajectory holds nothing from outside approved apps.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (trajectory row)
  - source: _designs_/system-architecture/trajectory.md@0.8.4
---

# Trajectory privacy on the desktop

The run directory, schema and replay are the browser's ([trajectory](../system-architecture/trajectory.md)); the
desktop adds what the screen can leak.

| Recorded | Never recorded |
|---|---|
| each step's app-scoped screenshot (black outside approved apps), with the approved frontmost app's own menu titles | any capture of the whole display, the menu bar's status area, or another app |
| per action: the target's app bundle id, AX role, title, frame | AX values of secure fields; values of any element not acted on |
| the scope (approved bundle ids) and every approval, revoke and block with its reason | names or titles of windows outside the scope, or of excluded apps |
| `localInput` pauses: time and kind (`key`, `pointer`) | which key the person pressed, or where they clicked |
| typed text, redacted for `credential` and `sensitive_data`, secret values scrubbed | pasteboard contents (copy and paste are allowed, D-031; their contents are never read or kept) |
| `screenText` hits of the inspector (excerpts) | the full screen text of a step |
| per step: the latency of the model call, the input and the observation, and the model's token use (CU-54) | nothing about a model request beyond its token counts and cost |

The inspector's excerpts can quote an approved app's window, as page excerpts do today. A blocked foreground app is
named by bundle id only - "an excluded app (com.1password.*) came to the front" - never by window title.

An attributed open or save panel ([file panels](file-panels.md)) shows the file and folder names of wherever it is
opened; they enter the step screenshots and so the run directory - a residual recorded here (D-044). When the hit
test names an unapproved app over an action's point, its bundle id is kept here and in the person's consent request,
never told to the model (CU-38); when the helper refuses such a point, the action's `coveredBy` keeps it (CU-47). Where no app can
be verified at a point, the process there is kept as `unverified` (its pid and executable name, beside the element's
owner - never a title) for diagnosis.

## Retention and access

As today: `$CU_HOME/runs/<run-id>/`, mode 700, never in git, 50 runs or 14 days, whichever keeps more. The live view
streams frames to the watcher and keeps none (R39 ruling).

## Check (trajectory row)

cu-verifier's desktop trajectory check plants a marker string in an unapproved fixture window and in a secure field
of the approved fixture app, runs a task, and needs the marker in no file of the run directory, screenshot bytes
included.
