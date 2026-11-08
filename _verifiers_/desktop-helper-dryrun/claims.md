---
title: Desktop helper dry-run claims
created: 2026-11-02T10:37:30Z
modified: 2026-11-06T04:40:09Z
level: L1
version: 0.10.0
description: What the desktop-helper-dryrun verifier claims about the real CUHelper's input rules before the grant, from its dry run - tagged events at global points, the point re-check, and every down released when a person acts, secure input turns on, or the driver leaves.
status: unverified
grounded_in:
  - source: _environments_/macos-desktop/helper/dry-run.md
  - source: ULTIMATE_GOAL.md@2.0.0 (action contract, consent and safety, human control, perception)
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| R1 | Every built event carries the CUSE tag; clicks land at their global points on a Retina main display and on a secondary display with a negative origin | untagged |
| R2 | Input at a point over an app outside the scope is refused out_of_scope, naming only its owner; nothing is built | point-unchecked (both checks) |
| R3 | A person acting mid-click stops the input as local_input, and the held button is released | no-release |
| R4 | Secure input turning on mid-typing stops before the next key step; no text after; the held modifier is released | secure-unchecked |
| R5 | A modifier and a button held when the driver says bye are released before the helper goes | no-release |
| R6 | A capture shows no pixel of an app outside the scope: an unapproved window drawn in the marker colour over CU Fixture comes out black, its colour nowhere, CU Fixture itself present. This judges the dry run's model of the app-scoped filter and the scope the dispatcher passes it; the live SCContentFilter is judged after the grant | capture-unscoped |
| R7 | The menu bar is masked as live (design 0.3.8): with the approved app in front only its own menu items show; another app's item, a marker-colour status item and the gaps stay black; with an unapproved app in front nothing of the strip is drawn. The mask (Frames.blackOut) is the live capture's own | menu-mask-off |
| R8 | settleMs (design 0.4.2) is honoured only after local input the helper saw: ignored otherwise and the input posts at once; after local input it waits for settleMs of hands-off, then posts; past the cap nothing posts and the input stops local_input at step 0; once honoured it is spent. The spent rule has two redundant paths (the seen mark cleared, and a later post), so no single mutant shows it | settle-always-honoured, settle-no-cap |
| R6b | An unapproved app sharing an approved app's executable stays black in each of 3 consecutive captures, even when ScreenCaptureKit names it the approved app; CU Fixture shows (control) | capture-trusts-sck |
| R9 | A click on that app is refused out_of_scope naming it, even when Accessibility names the approved app; a click on CU Fixture itself is done | owner-rule-off |
| R10 | A drag refused mid-path (a window appears over the rest of the path) is cancelled with Escape before the button comes up, so nothing drops; no held move is built over the covering window; nothing stays held; the reply says cancelledDrag (CU-44) | drag-abort-no-escape |
| R12 | During our drag the source's own dragging-level window is passed over, so a window appearing mid-drag is refused naming it; another app's dragging-level window counts with or without our drag (CU-46) | drag-image-no-pass-over, drag-image-skip-any-500 |
| R13 | Another process's content in an approved window is reported as elementOwner and fails closed unless that process is approved; AppKit's panel identifiers mark save/open panels through the ancestry, an AX error or the depth limit gives 'unknown', a title or a declared key never marks, and an ordinary window carries neither (CU-39, D-045) | element-owner-ignored, panel-marker-dropped |
| R14 | panelSelection canonicalises a panel's commit target: a symlinked folder and a typed path through a symlink are resolved, a name typed as a path is that path, a plain name with no readable folder is unknown, control and format characters are escaped, and nothing is returned with no panel in front (CU-39) | panel-path-typed-ignored, panel-path-unresolved, panel-path-unescaped |
| R15 | A capture of a Retina display is its points times its scale, the PNG is that size, and the approved window sits at its global points times the scale; the scale-1 display is captured at its points (CU-55) | capture-scale-ignored |
| R16 | With a menu bar on every display (separate Spaces), only the display holding the approved app's menu-bar strip shows the bar: another display's status item never reaches its capture, and the approved app's own item still shows (CU-55, CU-51) | menu-bar-every-display |
| R17 | A window straddling two displays' shared edge belongs to the display holding its centre (the scope reply's display), and each side of it takes a click at its global points; this pins the dry run's model of the live rule, which reads the first running scope app's focused window (AXFocusedWindow, else AXMainWindow) - the dry run's one rect per app stands for that window (CU-55) | scope-display-first-touched |
| R18 | On the secondary display, input over an unapproved window is refused out_of_scope naming that window's app, nothing is built, and the approved window beside it still takes a click (CU-55) | point-unchecked |

"Released" is judged by this verifier's own pairing: every button and key down has its up, and modifier flags end
at 0 (D-028). The world is the verifier's own; nothing is posted, captured or granted.

## Read next

[INDEX.md](INDEX.md).
