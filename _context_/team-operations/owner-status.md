---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-24T08:17:12Z
level: L2
version: 1.15.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.336
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-099, D-108, D-110 to D-118)
---

# Computer use on the Mac mini - status for the owner

State at 24 November 2026, 08:17 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. The two open rows are consent and human control:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). At 06:00 UTC the researcher's
  fifth sweep found four new High classes, and their fixes are under way. CU-745 (typed-confirm prompts with other
  verbs) closed live at 07:26 UTC (48/48 on its merge). Open Highs: CU-746 (a modal whose risk is a statement or a
  noun title, PR in its second round), CU-747 (Finish / Next and bare-verb buttons, second round), CU-748 (alerts in
  other languages) and CU-751 (any imperative verb before a name prompt, one general rule). The row also needs
  CU-135, the Replace-sheet chain, in the owner session.
- **Human control** needs you once: runbook step 4 (CU-11), with the key-hold row (CU-119), CU-135 and the
  physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing about 25. Part 3
  (CU-135) starts from your own Terminal. The checklist is `_tools_/live-view/owner-checklist.md`; its update for
  0.2.73 and the Terminal line is in review.

| Row | State |
|---|---|
| environment, perception, agent loop | hold live (CUHelper 0.2.73 signed, installed and read back at 08:05 UTC today) |
| action contract | holds, with a named caveat: a cancelled drag's Escape can reach a non-approved front app (CU-744, High; fix built, needs helper 0.2.74 in the 25 November window) |
| consent and safety | open: four Highs in progress (CU-746, CU-747, CU-748, CU-751); CU-135 in the owner session |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

CU-744 came from a question by the Last War team. The helper sends Escape when a drag is cancelled, and in global
mode that key goes to whichever app is in front.

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; browser tasks go
  through the browser environment, which reads the page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean.
- **Lane rules** (D-108, D-110, D-112): High fixes first; narrowings land only in their own issue with an exact list
  of what they free; a fix PR gets one fold, and later misses become follow-ups at the grade of their class.
- **Author runs** (D-114): every PR's author runs the full suites before review; a review never rests on the gate.
  Seats stop only their own processes, never by name pattern.

## Team

- All seven seats are covered by live sessions with armed goals.
- Shared desktop with the Last War team: their bridge now runs from its own worktree at a fully gated main commit
  (D-118, created 08:05 UTC), and moves only in the daily 08:00-08:25 UTC window. Today they hand off 08:25-08:34 UTC
  and restart at 09:10 UTC. Their slot is 09:20-10:50 UTC.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203). Helper 0.2.73 is now
   installed. The launchers finish their no-model dry run after 09:00 UTC today. Part 3 runs in your own Terminal.
2. Model budget: 20.69 of 25 USD spent, and nothing past 21 USD runs without you (D-034). The last ~0.31 USD is kept
   for step 4's single CU-135 model run. A model rehearsal of Part 3 and the third evaluation batch (CU-66, S8 and
   S9 on Opus) need a raise from you.
3. Dismiss the notification alerts on the Mac mini and quit Typeless before step 4.
4. Long-running Chrome tabs on the Mac mini keep the load near 30 and slow the team's gates.
5. Decide on the history clean-up the coordinator reported privately on 9 November.
6. Confirm the Mac-wide "Paste from other apps" setting (D-052).
7. Optional: give the Heddle Linear app initiative read/write for initiative updates.
