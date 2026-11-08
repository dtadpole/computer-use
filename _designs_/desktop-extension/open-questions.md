---
title: Desktop open questions
created: 2026-11-02T08:29:12Z
modified: 2026-11-05T19:37:48Z
level: L1
version: 0.4.16
description: What the desktop design does not settle yet, who answers each question, and what the design assumes until then.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-024)
---

# Desktop open questions

| # | Question | Who | Assumed until answered |
|---|---|---|---|
| Q-D1 | Which pause guards without Input Monitoring? | settled 0.3.2; measured after the grant (D-033) | the HID idle counter plus an Accessibility-gated pass-through tap, no Input Monitoring; our tagged posts reset the counter, so the helper re-baselines after each post with a small slack; whether Screen Sharing input pauses a run is runbook step 4 |
| Q-D2 | Which stable signing identity for the helper? | ruled D-031 | a self-signed "CU Helper Signing" certificate, created once by the owner; builds sign with it after one Always Allow; no seat reads the keychain |
| Q-D3 | Which apps accept `pid`-targeted input reliably? | measured after the grant (cu-developer-three) | `pid` delivers keys but not pointer events, so it is keyboard-only; `global` stays the default and only pointer mode |
| Q-D4 | How is the live-view or DSH window recognised in a browser? | settled 0.2 | the live view's fixed title marker; a known browser's document URL as fallback |
| Q-D5 | System Settings whole or only its privacy and security panes? | ruled D-025 | whole app until the owner asks otherwise |
| Q-D6 | The system pasteboard in desktop runs? | ruled D-031 (replacing D-025) | copy, cut and paste allowed in approved apps (may overwrite the clipboard); never read or recorded |
| Q-D7 | Remote input from the live view to the real desktop? | owner | out of scope; take over means using the Mac |
| Q-D8 | macOS may itself raise its Screen Recording alert when the helper captures | cu-developer-three (after the grant) | raised once in the grant session; mid-run it is a system prompt in front, never answered by the agent; a declined capture is `not_granted` |
| Q-D9 | An approved IDE's terminal panel (red-team E5): typing there runs shell commands inside an approvable app; does it need a click-only approval tier (R67)? | cu-developer-one with the coordinator | implemented (rule `terminal_view`): IDEs stay approvable; typing into a target named terminal, console or shell is refused, clicks allowed; a click-only tier (R67) stays open |
| Q-D10 | `launch_code` misses Finder with extensions hidden and rarer extensions; launchers such as Alfred and Raycast are not excluded | cu-researcher (retest) | acceptable until cu-researcher's retest ([desktop rules](desktop-rules.md)) |
| Q-D11 | A third-party click-through overlay (Typeless, live) over the approved app? | ruled 0.4.18 | a click-through overlay no longer blocks and a clickable one is refused: the owner is the hit window ([Q-D15](hit-window.md)); `out_of_scope` names it |
| Q-D12 | A drag between two approved windows across the desktop (CU-8, live)? | ruled 0.4.14 (cu-verifier's red team) | held moves may cross bare desktop, never another app's window, a desktop icon, the Dock, the menu bar or a corner - drag hover can read the dragged data, so it reaches only the approved app and Finder's desktop (a system process); press and release keep every check, and an abort sends Escape before the up so nothing drops; CU-36 |
| Q-D13 | An app's open or save panel (out of process, CU-8)? | cu-developer-one; red team cu-researcher | attributed to its client app when it is that app's sheet; `file_choice` always asked ([file panels](file-panels.md)) |

Each has a safe assumption; none blocks a run.
