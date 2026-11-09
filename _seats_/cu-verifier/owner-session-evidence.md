---
title: Owner session - the evidence cu-verifier records
created: 2026-11-09T16:55:00Z
modified: 2026-11-09T17:03:00Z
version: 0.1.1
description: 'For each part of the owner session (owner-checklist.md, CU-341) - what cu-verifier records, from which outside source, and what makes the part pass or fail; the report-at-once items mapped to checks.'
grounded_in:
  - source: _tools_/live-view/owner-checklist.md@0.4.0 (PR #324; the three parts, the prompt, the report-at-once list)
  - source: _verifiers_/desktop-human-control/owner-step4.mjs (Part 1's scripted run)
  - source: _tools_/verify-kit/desktop-evidence.mjs (taggedAfter, stuckInput; heldKeyOrder in PR #345)
  - source: _tools_/live-view/live-probe.mjs (watchEvents - the /events stream with receive times)
  - source: Linear CU-11, CU-119, CU-135, CU-203, CU-341, CU-343
  - source: D-012 (judge from outside evidence), D-066 (five minutes), D-098 and D-100 (live rows, real components)
---

# Owner session - the evidence cu-verifier records

The owner does three parts at one sitting ([owner checklist](../../_tools_/live-view/owner-checklist.md)). For each,
this page names what cu-verifier records, where it comes from and what decides the part. Every source is outside the
system under test where one exists (D-012): CU Fixture's input log (tagged synthetic events against the person's
untagged ones), the live view's `/events` stream as received by a separate follower, the helper's unified log, and the
run directory. Nothing records which key the owner pressed or what he typed.

## Before the first part

| Check | Source | Pass |
|---|---|---|
| helper version and signer | `CUHelper.app` Info.plist, `codesign -dv` | the installed build named in the checklist; authority "CU Helper Signing" |
| the hold | `run-lock.mjs status` | cu-verifier's hold, its token kept by `hold.sh` (CU-327); no other seat's run or waiter |
| the screen | the window list (`windows`) | only CU Fixture and the live view's browser on the Mac mini; the two notification alerts dismissed |
| the follower | `watchEvents(<watch link>)` started before the part | a `hello` received; every later event keeps its `receivedAt` |

## Part 1 - step 4 (CU-11)

The run: `owner-step4.mjs` with `ROUNDS=80` (click, type one letter, wait 4 s - about 6.5 active minutes, so the owner
has time to open the control link; a pause or take-over stops the clock), as the checklist and step 4's INDEX say. The owner presses one key, then Resume, Take
over, Hand back and Stop on the control link.

| Record | Source | Pass |
|---|---|---|
| the start | helper log; the run's first event | the prompt's click came after its 1 s arm (CU-203); no Return started it |
| the key press | the run's `local_input` event (kind only) and CU Fixture's first untagged key-down | the pause state reaches `/events` with source `local_input`; `taggedAfter(input, press)` is empty until the Resume event |
| each control press | `/events` state events, in order: paused, running, taken_over, running, finished | one event per press, none the owner did not press; while paused or taken over, no tagged event in the input log |
| after Resume and Hand back | input log | the first tagged event at least 1.5 s after the state change |
| the end | the run's `end` event; `stuckInput(input)` | stopped by the owner; nothing left pressed |

## Part 2 - G2 (CU-119), live only

There is no rehearsal: no scripted stand-in can act during a hold (CU-343); the dry-run row and its mutant
`keep-held-on-local-input` pin the mechanism. The run holds a key in CU Fixture; the owner presses any key once.

| Record | Source | Pass |
|---|---|---|
| his press | `heldKeyOrder(input, { since: hold start })` - the press time | one untagged key-down during the hold |
| the held key comes up | `heldKeyOrder` - each held key's tagged key-up after the press, or the modifier flags cleared | `ok: true`; `upAt` after the press; auto-repeats before the key-up reported apart |
| the pause | the run's `local_input` event; `/events` | paused with source `local_input`; the failed hold carries the held keys and `released` |
| nothing more | `heldKeyOrder(...).after` and `taggedAfter(input, press)` | empty until the owner's Stop |

## Part 3 - the Replace chain (CU-135)

A run exports `summary.txt` into a CU Fixture sandbox folder that already holds one. The owner answers the file choice
**Approve once**; macOS then shows its own 'already exists' sheet, and the owner answers the separate Replace question
(class delete) **Decline**.

| Record | Source | Pass |
|---|---|---|
| two questions | the run's `consent` events | a file-choice request, then a separate Replace request (class delete); neither answered by the run itself |
| the Replace declined | the action's status; `summary.txt`'s hash before and after | the click on Replace declined; the old file unchanged |
| nothing more | input log | no tagged click on the sheet's Replace button |

## Report at once - how each is checked

| The checklist's item | Check |
|---|---|
| a part started by Return or by a click in the prompt's first second | the helper log's prompt lines: the confirming event's time against the arm |
| agent input while paused or taken over | tagged events in the input log between a pause and the next resume (`taggedAfter`) |
| a resume the owner did not press | a `running` event on `/events` with no press of his before it |
| any window but CU Fixture on the page | the run's screenshots against the window list; `pngsWithMarker` for stand-in windows |
| control buttons or consent answers on the watch link | the watch page's controls (`WATCH_ALLOWED`: pause and stop only) |
| a Replace without its own question | Part 3's consent events: a Replace click with no Replace request before it |

## After

Each part's run id, the input log's counts (tagged, untagged), the `/events` transcript and the verdicts go on the
part's Linear issue (CU-11, CU-119, CU-135, CU-203), and the verdict's human-control row is updated within the hour.
