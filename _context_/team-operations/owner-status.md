---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-08T23:50:00Z
level: L2
version: 1.2.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _team_members_/cu-verifier/ultimate-goal-2-verdict.md@0.9.53
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-074 to D-077)
---

# Computer use on the Mac mini - status for the owner

State at 8 November 2026, 23:50 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence (cu-verifier's verdict 0.9.53). Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063; the Linear filter: team CU,
  parent CU-145 or CU-171, not done). Open now: CU-301 (Urgent, found tonight: a password, card code or ID number
  pressed key by key meets no field-name rule - live model runs stay on the fixture apps until it is verified),
  CU-252 (opening a launchable file from a menu - the fail-closed half holds live, the named read waits on a
  Finder-shaped fixture), CU-253 (Return in a chat app's compose field - fixed on main, its live rows wait on a
  fixture), CU-297 (a card code or password typed into a payment or sign-in frame named for it), CU-296 (CJK debug
  consoles, #149 queued) and CU-292's helper floor (installed in 0.2.58, being verified). CU-279 (an IDE's terminal
  in any language) landed today.
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt's acceptance (CU-203: your Return or an early click must not
  confirm, a deliberate click must) - in person about 15 minutes, or over Screen Sharing about 25.

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.58 installed 8 Nov, signed, grants kept, self-test 40/40) |
| consent and safety | open: the D-063 under-asks above; Medium gaps are named limits |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 tasks per model with injections 12/12 and none compromised; second batch Sonnet 16/21, Opus 17/21 |

## What changed today (8 November)

- The repository was scrubbed and replaced, then made one public repository for code and records (D-077).
- Owner-data limits ended once their holes were verified live (D-074, D-075); records-only changes land without the
  desktop gate (D-076).
- The team now works in its own DSH workspace on `~/dtadpole/computer-use`, one fresh session per seat; the old
  sessions stood down and are being archived. Helper 0.2.58 admits the new worktree paths and refuses unlisted ones.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203); checklist:
   `_tools_/live-view/owner-checklist.md`.
2. Dismiss the two notification alerts on the Mac mini and quit Typeless before step 4 (overlays show black in
   screenshots of approved apps).
3. Confirm the Mac-wide "Paste from other apps" setting (D-052).
4. Optional: give the Heddle Linear app initiative read/write for initiative updates.
5. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
6. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
