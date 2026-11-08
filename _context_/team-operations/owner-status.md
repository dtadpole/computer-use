---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-06T10:00:00Z
level: L2
version: 1.1.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _team_members_/cu-verifier/ultimate-goal-2-verdict.md@0.9.10
  - source: _context_/team-operations/decision-log.yaml (D-039 to D-049)
  - source: _context_/run-analysis/desktop-suite-2026-11-06.md
---

# Computer use on the Mac mini - status for the owner

## Where it stands

Eight of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence (cu-verifier's verdict 0.9.10). The ninth,
human control, needs runbook step 4 with you at the Mac for about ten minutes (Linear CU-11).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.28 installed, signed, grants kept; step 4 rehearsed on it) |
| consent and safety | holds live; one named limit: a file panel's navigated folder is asked as "unknown" (CU-48) |
| integration | DSH and heddle start desktop tasks (CU-15) |
| trajectory, evaluation | hold live; second batch accepted (D-048) |
| human control | waits for step 4 (CU-11) |

## What the agent does

- Sees and acts only in apps you approved; every other window is black in its screenshots and refuses its clicks.
- Terminals, password managers and system security panes are excluded outright.
- Asks you before deleting, submitting, buying, sending sensitive data or choosing a file; unattended, it declines.
- Pauses the moment you touch the keyboard or mouse; you can take over and hand back from the control link.

## Evaluation (one build, every attempt counted)

| | Sonnet 5.5 | Opus 5.5 |
|---|---|---|
| desktop tasks | 17/26 (plain tasks 16/17) | 18/26 (plain tasks 17/17) |
| injection screens | 12/12, none compromised | 12/12, none compromised |

The failures are correct consent stops, a password hand-off by design, items your notification alerts covered, and
one capability miss. Consent was never skipped (consentMissed 0).

## Safety holes found and closed today

Drags released onto other apps (CU-44/45/46), a file panel's Save passing without a question (D-045/D-046), the
covering app's name reaching the model (CU-47). Each was fixed, proven with mutants, and verified live.

## Open owner actions

1. A time for step 4 (about ten minutes; checklist: `_tools_/live-view/owner-checklist.md` in the repository).
2. Dismiss the two notification alerts on the Mac mini. Typeless no longer blocks clicks (the hit-window rule Q-D15 passes
   over click-through overlays), but it still shows black in screenshots wherever it covers an approved app.
3. Optional: the new DSH and heddle install rows; add `dtadpole/computer-use` to Linear's GitHub app; give the Heddle
   Linear app initiative read/write if you want initiative updates.

## Overnight (6 Nov, UTC)

- Helper 0.2.27 fixed scaled captures (CU-74); Retina-scale runs then passed 42/42. Helper 0.2.28 refuses input to
  system privacy and permission prompts even inside an approved app's window (CU-76).
- Clipboard items (D-050): the guard keeps your clipboard in memory only and restores it. A guard flaw could have
  cleared it after an unconfirmed read (D-051); on this Mac every app is "always allowed" to read the pasteboard, so
  no prompt was answered and your content was most likely not lost (D-052). The guard now never clears after an
  unconfirmed read; please confirm your Mac-wide "Paste from other apps" setting.
- An enforced desktop hold stops one seat's run from cutting into another's (D-053).
- Long tasks now keep only the newest screenshots in the model request past 30 (CU-65); budget 13.6 of 25 USD.

## While step 4 waits (D-049)

The team keeps working: Retina scale 2 and two displays (helper 0.2.26), your user guide, end-to-end tests, a
nightly no-model regression, parity gaps against public computer-use agents and a third batch of fixture screens.
