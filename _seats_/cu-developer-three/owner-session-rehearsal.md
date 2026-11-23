---
title: Owner session rehearsal on helper 0.2.62 (CU-341)
created: 2026-11-09T19:05:00Z
modified: 2026-11-09T19:05:00Z
version: 1.0.0
description: 'The owner session rehearsed step by step on installed CUHelper 0.2.62 under idle-checked holds, every owner action a labelled stand-in - per step the checklist line, the expected screen, what cu-verifier records, the time it took and what could not be rehearsed.'
status: unverified
grounded_in:
  - source: Linear CU-341 notes (R1 14:22Z, R1b 14:32Z, R3 14:38Z, R1c 18:59Z on 9 Nov)
  - source: _tools_/live-view/owner-checklist.md@0.4.0 (the one-page checklist, #324)
  - source: _seats_/cu-verifier/owner-session-evidence.md (#352, what cu-verifier records)
  - source: Linear CU-342 (#322, the owner-input stand-in), CU-343 (G2 covered), CU-344 (Part 3 by script)
---

# Owner session rehearsal on helper 0.2.62 (CU-341)

Every run below was held by cu-developer-three, with the owner idle for at least 300 s right before the hold. Each
hold carried its token (CU-327) and CU_DESKTOP_SEAT (CU-305), and was released by that token. Each run used a private
CU_HOME and CU Fixture only. Each owner action was a scripted **STAND-IN**, labelled in the run notes and in the
evidence, never presented as the owner's.

| Checklist line | Stand-in | Expected screen | What cu-verifier records | Measured |
|---|---|---|---|---|
| Before: open the control link in your Terminal | the run's mode-600 control file read by script | page title `[cu live view]`, state running | the link from the run's own file, never a pipe | 1.3 s after start |
| Part 1: press one key on the Mac (H1) | CU-342 labelled untagged move after turn 7 | `paused`, the local-input notice with Resume | the note, then the `local_input` event, then state paused with source local_input; 0 tagged events until Resume | paused 15 ms after the stand-in; 0 inputs while paused (R1c) |
| Part 1: Resume | scripted control POST | `running`; the next input waits 1.5 s hands-off | first input after it has settleMs 1500, later inputs none | 12 ms to state; settleMs 1500 once (R1b, R1c) |
| Part 1: Take over | scripted control POST | `taken_over`; remote input refused by name | 0 tagged events while taken over; /input 409 unsupported_on_desktop | 8 ms; 0 inputs (R1b) |
| Part 1: Hand back | scripted control POST | `running`, 1.5 s hands-off first | first input settleMs 1500 | 9 ms (R1b) |
| Part 1: Stop (running, and while paused) | scripted control POST | `finished`; the control link stops working | run ends cancelled; 0 inputs after; the control file removed | 6-34 ms; stop while paused 27 ms (R1b) |
| The watch link | the same POSTs with the watch token | Pause and Stop only; no answers | take_over/resume/hand_back/guide 403; input 403 control_token_required | 30 frames, none outside scope (R1) |
| End of each part | none | none | 0 CUHelper processes; helper end line with the AXManualAccessibility summary; held-keys marker absent | every run |

## Not rehearsable by script, and why

- **Part 2, G2: the owner's key press during a hold.** The helper serves requests one at a time, so nothing scripted
  can land inside a hold. It is covered by the dry-run row and its mutant ('keep-held-on-local-input', 2 of 2 rows
  fail), the fake-helper rows and the page text. It stays a live-only step (CU-343, closed as covered).
- **Part 3, the Replace chain.** A scripted CLI runs unattended and declines every question; file_choice is never
  pre-approved; plans have no save-panel step. Filed as CU-344 (Low). The owner does it live.
- **The CU-203 prompt.** It opens only when the owner has been active in the last 300 s, which an idle-checked
  hold never sees. It is covered by unit, dry-run and fake rows. 'A Return does nothing' is now pinned by a
  helper-sources row (#316).

## Breaks found and fixed or filed

- The owner checklist was stale: helper 0.2.50, no hold or seat, no 5-minute backoff after Cancel, answerable consent
  rows in Part 1. Rewritten as one page, 0.4.0 (#324).
- No owner-input stand-in existed: CU-342 (#322) added one, and CU-367 (#368) makes the loop refuse it for any model run.
- The rehearsal scripts twice ran Homebrew's node, which the boundary refuses: the 13:17Z proof and R1c's first
  window. Under the harness's _VOLTA_TOOL_RECURSION the volta shim passes through to the next node on PATH. The scripts
  now pin volta's own image and refuse any other node.
