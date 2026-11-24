---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-24T12:20:41Z
level: L2
version: 1.16.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.337
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-099, D-108, D-110 to D-118)
---

# Computer use on the Mac mini - status for the owner

State at 24 November 2026, 12:20 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. The two open rows are consent and human control:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). Today four Highs closed live on
  their merges: CU-745 (typed-confirm prompts with other verbs), CU-746 (a modal whose risk is a statement or a noun
  title), CU-751 (any imperative before a name prompt, one general rule) and CU-747 (Finish / Next and bare verbs
  reading their dialog). Each closed with held-out rows written before its build. Still open: CU-748 (alerts in other
  languages), CU-753 (approving a sign-in or device-code grant), CU-754 and CU-757 (access toggles and 'Allow' under
  an access statement), CU-756 (noun-title transfers, PR in review), CU-765 (courtesy lead-ins) and CU-766 (a
  localized bare verb under a question). The row also needs CU-135 in the owner session.
- **Human control** needs you once: runbook step 4 (CU-11), with the key-hold row (CU-119), CU-135 and the
  physical-confirmation prompt (CU-203). It is ready now: the launchers are on main (dry-run today, no model), helper
  0.2.73 is installed, and the checklist is `_tools_/live-view/owner-checklist.md` (0.4.5). Part 3 runs in your own
  Terminal from a read-only step-4 worktree; cu-verifier hands you the exact line. In person it takes about 15 minutes.

| Row | State |
|---|---|
| environment, perception, agent loop | hold live (CUHelper 0.2.73, read back 08:05 UTC) |
| action contract | holds, with a named caveat until CU-744 (helper 0.2.74, signed install in the 25 November window) |
| consent and safety | open: seven Highs in progress; four closed today; CU-135 in the owner session |
| human control | open: step 4 with you, ready now |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean.
- **Lane rules** (D-108, D-110, D-112): High fixes first; a fix PR gets one fold, which must cover every item its
  ruling named; later misses become follow-ups at their class grade.
- **Author runs** (D-114): every PR's author runs the full suites before review. Seats stop only their own
  processes.

## Team

- All seven seats are covered by live sessions with armed goals. The integrator seat moved to a successor at
  09:10 UTC (planned, near the end of its context).
- Last War runs from its own worktree with the 300 s idle rule; their daily slot is 09:20-10:50 UTC, when only
  node-only and headless work runs on our side.

## Open owner actions

1. Step 4: say 'start step 4' (or name a time). The team clears the desktop for 30 minutes and cu-verifier leads.
2. Model budget: 20.69 of 25 USD spent, and nothing past 21 USD runs without you (D-034). The last ~0.31 USD is kept
   for step 4's single CU-135 run. The third evaluation batch (CU-66, S8 and S9 on Opus) needs a raise from you.
3. Dismiss the notification alerts on the Mac mini and quit Typeless before step 4.
4. Long-running Chrome tabs on the Mac mini keep the load near 30 and slow the team's gates.
5. Decide on the history clean-up the coordinator reported privately on 9 November.
6. Confirm the Mac-wide "Paste from other apps" setting (D-052).
7. Optional: give the Heddle Linear app initiative read/write for initiative updates.
