---
title: Step-4 readiness - the owner session walked on main and helper 0.2.73
created: 2026-11-23T19:50:24Z
modified: 2026-11-23T19:50:24Z
version: 1.0.0
description: One page for cu-coordinator - each owner-session row (CU-11, CU-119, CU-135, CU-203) with its exact steps, the evidence that decides it, the time it takes and what the owner does, and the gaps that would waste the owner's time.
grounded_in:
  - source: _tools_/live-view/owner-checklist.md@0.4.3 and owner-checklist-parts.md@0.2.0
  - source: _verifiers_/desktop-human-control/INDEX.md and owner-step4.mjs (main c0a566c3)
  - source: _seats_/cu-verifier/owner-session-evidence.md@0.2.0
  - source: helper Sources ab27c7b3e (0.2.67) .. bf29f3524 (0.2.73), read in git
  - source: Linear CU-11, CU-119, CU-135, CU-203, CU-727, CU-728
---

# Step-4 readiness

Read on main c0a566c3 (23 Nov 19:00Z); nothing was run. Helper 0.2.73 is on main (merged 18:39Z). Its signed
install is in the 24 Nov 08:00Z window; until then the installed helper is older (owner-status names 0.2.70).
**Since the rehearsed 0.2.67, no helper change touches the controls.** ConfirmPrompt.swift, LocalInput.swift and
Events.swift are unchanged. 0.2.68-0.2.73 add reads (form context, default candidates, dialog words, form entries)
and 0.2.73's exclusion floor for remote-desktop and VM client apps.

## The rows

| Row | Steps (cu-verifier runs, owner presses) | Evidence that decides it | Time | Owner |
|---|---|---|---|---|
| **CU-11** step 4 | cu-verifier holds the Mac (`run-lock.mjs hold`, five idle minutes first). `CU_VERIFY_SEAT=<seat> ROUNDS=80 [CU_ASK_OWNER=1] node _verifiers_/desktop-human-control/owner-step4.mjs` runs a CU Fixture run (~6.5 min). The owner opens the watch link, plus the control link via `cli.mjs control-link <run-id>` in their own Terminal. | In the run's events: a pause by `local_input` before the next synthetic event; then resume, take over, hand back and stop, each in order; no synthetic event between the key and the resume; only tagged events in the fixture's input log. | ~8 min | Confirm at the prompt; one key; Resume, Take over, Hand back, Stop |
| **CU-119** G2 | A run holds one key for a few seconds (the key named aloud); the owner presses any key once; then Stop. | In event order: the owner's press; the helper's key-up for the held key (or the held-keys marker cleared); the pause with sender `local_input`; no synthetic event after the press. The notice names the key. Live only (CU-343). | ~1 min | Confirm; one key during the hold; Stop |
| **CU-135** Replace chain | A run exports `summary.txt` onto an existing one (fixture task `export-overwrite`) with interactive consent. | Two separate questions: the file choice, then 'click Replace (delete)'. After Decline, the old file's hash is unchanged. Any Replace without its own question fails. | ~2 min | Confirm; Approve once on the file; Decline on Replace |
| **CU-203** physical prompt | No separate run: the prompt opens at each part's start in person. | Return does nothing; a click in the first second does nothing; a hardware click after 1 s starts the part; a Cancel blocks the seat for 5 min. | inside the parts | Wait a second, then click Confirm |

**In person, about 15 minutes** (the only mode that can accept CU-203). Over Screen Sharing it takes about 25
minutes: five hands-off minutes before each part, and CU-203 stays open.

## Gaps that would waste the owner's time

1. **No launcher for Parts 2 and 3** (filed CU-727). Only Part 1 has a script. The hold_key and `export-overwrite`
   runs would be composed live while the owner waits. Add `owner-g2.mjs` and `owner-replace.mjs`, rehearse Part 3
   with a stand-in, and dry-run Part 2.
2. **The owner's pages are dated 10 Nov** (filed CU-728). The checklist names helper 0.2.67. It needs the installed
   version on the day and the one-line 'controls unchanged' statement above.
3. **The Last War bridge must be idle** (noted on CU-11). It holds the lock as `cu-lastwar` and posts untagged input,
   which pauses Part 1 and resets the five-minute idle clock. Book outside its slots, with a confirmed pause.
4. **Screen Sharing input is unmeasured** (CU-11's own question, open since the retraction). The tap should count
   untagged remote events as the person's, but nobody has shown it. Prefer the in-person mode, or measure first.
5. **Book after the 08:00Z install and cu-verifier's scripted re-run** (the verifier's INDEX asks for a re-run after
   every install), so the sitting runs on 0.2.73.
6. **Before the sitting:** cu-verifier checks that the owner store still has the tty record for CU Fixture
   (owner-step4.mjs throws without it). The owner quits Typeless and dismisses the two alerts (owner action 2).

## Recommendation

An in-person sitting on 24 Nov after 08:00Z, once CU-727's two launchers exist and the scripted re-run on the
installed 0.2.73 is green. Book it outside Last War's slots, with `cu-lastwar` paused. About 15 minutes of the
owner's time; all four rows can close in one sitting.
