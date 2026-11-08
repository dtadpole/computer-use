---
title: desktop-extension
created: 2026-11-02T08:29:12Z
modified: 2026-11-08T11:55:00Z
version: 0.4.11
description: The M6 design for computer use on native macOS, app-scoped (D-024) - a helper app with its own grants, app-scoped capture and tagged input, per-app approval and hard exclusions, the local-input pause, and the agent-core changes they need.
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _designs_/system-architecture/INDEX.md@0.8.4 (approved, D-015)
---

# `desktop-extension`

Instance of [`_designs_`](../INDEX.md), written by cu-developer-one for M6. It extends the approved
[system-architecture](../system-architecture/INDEX.md): the agent core, consent gate, trajectory, live control, MCP
and evaluation harness carry over; the browser stays one environment. Revision 0.4.0 (D-031: copy, cut and paste allowed; self-signed signing). Revision 0.3.4 (empty helper scope until approval, peer environment refused, red-team fixes P9-P11, a narrower
D-029 peer check, the desktop-run lock), reviewed by cu-researcher (R63-R97), cu-developer-two and cu-verifier;
cu-coordinator approves.

| Article | Settles |
|---|---|
| [helper-and-protocol](helper-and-protocol.md) | the Swift helper, its stable identity, LaunchServices launch so the grants are its own, the line protocol |
| [helper-protocol-details](helper-protocol-details.md) | every request, reply and code; scope growth, captures by path, the test seams |
| [helper-boundary](helper-boundary.md) | D-029: the peer check against a compiled entry-point list, one-run lifetime, visible indicator, and the residual risk told to the owner |
| [capture-and-scaling](capture-and-scaling.md) | ScreenCaptureKit capture of approved apps only; frame, Retina pixels and global points |
| [input-and-targets](input-and-targets.md) | input modes, tagged synthetic events, AX hit-tests and screen text, secure fields |
| [app-policy](app-policy.md) | per-app approval (once, always, revocable), start apps as candidates, the hard exclusion table, desktop consent order |
| [desktop-rules](desktop-rules.md) | blocks by name (`system_shortcut`; copy and paste allowed, D-031), the desktop confirm classes (`launch_code`), foreground changes |
| [human-control](human-control.md) | the local-input pause, take over and hand back on a shared display, the live view |
| [desktop-run-lock](desktop-run-lock.md) | one desktop run team-wide: the lock, its refusal, stale takeover, the seat |
| [trajectory-privacy](trajectory-privacy.md) | what a desktop run records and never records |
| [agent-core-changes](agent-core-changes.md) | C1-C9 and the M8 follow-ups (P9-P11, scope growth, seat), with modules and tests |
| [input-vocabulary](input-vocabulary.md) | timed key hold, button down and up, and the cursor query, each guaranteed released (CU-64) |
| [input-vocabulary-acceptance](input-vocabulary-acceptance.md) | the rules and live checks CU-64 is tested against |
| [no-app-window](no-app-window.md) | a run whose approved apps show no window: a marked blank frame, a named stop, a note to the model (CU-98) |
| [agent-core-follow-ups](agent-core-follow-ups.md) | the changes landed after 0.3.3 from red-team, verifier and developer findings |
| [agent-core-m8](agent-core-m8.md) | the agent-core changes landed in M8, from step timing on |
| [agent-core-live-runs](agent-core-live-runs.md) | the changes landed from the CU-8 evaluation and live checks |
| [traceability](traceability.md) | every ULTIMATE_GOAL 2.0 row and changed requirement, with its check |
| [file-panels](file-panels.md) | an approved app's open and save panel: AppKit marker or attribution, `file_choice` always asked, folder a named limit |
| [menu-key-read](menu-key-read.md) | CU-235: the helper's menuKey read - what AppKit serves Accessibility for menu items, the match, fail-closed cases, what it cannot see |
| [panel-folder-source](panel-folder-source.md) | CU-48: a panel's folder beyond Accessibility - the agent's own Go to Folder, dropped on navigation, checked against the shown name |
| [driver-action-routes](driver-action-routes.md) | D-059's rows (CU-145): each macOS driver action, its input and judged target; two suspect cells (scroll unjudged; control characters in type) |
| [hit-window](hit-window.md) | Q-D15: pointer input judged by the window WindowServer's mouse hit test names |
| [physical-confirmation](physical-confirmation.md) | D-068: an input run while the owner is active needs his deliberate hardware click |
| [open-questions](open-questions.md) | Q-D1 to Q-D13 with their safe assumptions |

Safety rules while this is built (D-024): one announced desktop run at a time team-wide ([lock](desktop-run-lock.md));
synthetic input only to the team's fixture app until C1, C2 and C4 are in and tested; nothing that raises a TCC
prompt until the coordinator arranges the single owner request.
