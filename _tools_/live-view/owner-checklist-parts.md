---
title: Owner checklist - the three parts (step 4, G2, the Replace chain)
created: 2026-11-08T03:05:00Z
modified: 2026-11-09T15:00:00Z
level: L1
version: 0.2.0
description: The owner session's three parts, moved from owner-checklist.md (three sentences tightened) - what the owner presses in each and what he should see.
status: unverified
grounded_in:
  - source: _tools_/live-view/owner-checklist.md@0.2.0 (Parts 1-3, moved; three sentences tightened)
  - source: _designs_/desktop-extension/human-control.md@0.4.4
  - source: _tools_/live-view/ui-logic.mjs (controlsFor, noticeFor, consentView, pageFor - the texts quoted here)
  - source: _tools_/agent-core/loop.mjs (the held-key notice, G2)
  - source: _verifiers_/desktop-human-control/owner-step4.mjs (the step 4 run)
---

# Owner checklist - the three parts

Before and between parts: [owner-checklist](owner-checklist.md).

## Part 1 - step 4 (CU-11), about 10 minutes

**Order** (cu-verifier calls each): your own key press first - the run must pause before its next synthetic event -
then Resume, Take over, Hand back, Stop. Pause is optional.

| You press | The page | The Mac |
|---|---|---|
| (nothing) | only CU Fixture's windows; before any approval "Waiting for an approved app ..." | CU Fixture in front |
| **Pause** | `paused`; Resume and Take over enabled | no agent input |
| **Resume** | `running` | its next input waits for 1.5 s of hands-off |
| **Take over** | `taken_over`; "You have taken over: the agent sends no input. Use the Mac itself, then hand back." | no agent input; the page's screen takes no clicks |
| **Hand back** (note optional) | `running` | 1.5 s hands-off first, as after Resume |
| **Stop** | `finished` | run ends `cancelled`; the control link stops working |

**Your own input.** A key press or click on the Mac pauses the run: "A person's own key press (or pointer movement
or click) on the Mac paused the agent. It stays paused until you press Resume; it never resumes by itself." - with a
Resume button. Input during a 1.5 s wait restarts it; 60 s of it pauses the run again.

**Consent.** Part 1's run starts with `--consent unattended`, so it answers any question itself (declined) and
you see no consent buttons. An app you did not expect in front (a covering window such as Typeless): quit it. A
refused action can leave a notice "A <bundle id> window covered the point of the agent's last action - quit, move or
dismiss it." (CU-38). Part 3 is the part with questions for you.

**Watch link.** Same screen and state; only Pause and Stop; a question shows as text without answers.

## Part 2 - your input during a key hold (G2, CU-119), about 1 minute

A run holds one key down for a few seconds (cu-verifier names the key). While it holds:

| You press | The Mac | The page |
|---|---|---|
| any key, once | the held key comes up at once; the run pauses | "Your input stopped the run while it held <key>; your first keystroke may have carried <key>. Check what it typed." - with Resume |
| **Stop** | nothing more is typed | `finished` |

Report: the key still down after your press, or a notice that does not name the key.

## Part 3 - the Replace chain (CU-135), about 1 minute

A run exports `summary.txt` into a folder that already has one.

| You see on the page | You press | What must follow |
|---|---|---|
| "choose a file in ai.reflection.cu.fixture's file panel ("Save"): .../summary.txt" | **Approve once** | the agent saves; macOS shows its own sheet "“summary.txt” already exists. Do you want to replace it?" |
| a **second, separate** question: "click "Replace" on ai.reflection.cu.fixture (delete)" | **Decline** | nothing is replaced: the old `summary.txt` stays as it was (cu-verifier checks it) |

Report at once: a Replace that happens without its own question - the file choice alone must never cover it.
