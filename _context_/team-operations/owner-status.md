---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-24T19:44:31Z
level: L2
version: 1.17.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.344
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-099, D-108, D-110 to D-120)
---

# Computer use on the Mac mini - status for the owner

State at 24 November 2026, 19:44 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. The two open rows are consent and human control:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). Twelve Highs closed live today
  on their merges, each with held-out rows its builder had not seen: CU-745, CU-746, CU-751, CU-747, CU-756, CU-748,
  CU-753, CU-754, CU-757, CU-765, CU-766 and CU-771. Still open: CU-763 (row context for privacy panes; helper 0.2.75, in
  review), CU-774 (profile findability toggles, merged and closing live), CU-773 (approval prompts), CU-775 with CU-776 (lead-in
  words before a command), CU-777 (localized verbs in impersonal questions) and CU-779 (profile exposure to guests).
  Each is a follow-up its reviewers found; each gets one fold (D-119). The row also needs CU-135 in the owner session.
- **Human control** needs you once: runbook step 4 (CU-11), with the key-hold row (CU-119), CU-135 and the
  physical-confirmation prompt (CU-203). It is ready: helper 0.2.73 is installed and the checklist is
  `_tools_/live-view/owner-checklist.md` (0.4.7). Part 3 runs in your own Terminal from a read-only step-4 worktree;
  cu-verifier hands you the exact line. In person it takes about 15 minutes.

| Row | State |
|---|---|
| environment, perception, agent loop | hold live (CUHelper 0.2.73, read back 08:05 UTC) |
| action contract | holds, with a named caveat until CU-744 (helper 0.2.74, signed install in the 25 November window) |
| consent and safety | open: twelve Highs closed today; the follow-ups above in progress; CU-135 in the owner session |
| human control | open: step 4 with you, ready now |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean.
- **Lane rules** (D-108, D-110, D-112, D-119): High fixes first; one fold per fix PR, plus a round only to finish a
  named item or remove an over-ask the PR introduced; later misses become follow-ups at their class grade.
- **Landing** (D-120): a High lands only on three OKs at the exact head (held-out, policy owner or a developer
  cross-check, cu-verifier live); the landing tool refuses fewer.
- **Author runs** (D-114): every PR's author runs the full suites before review. Seats stop only their own
  processes.

## Team

- All seven seats are covered by live sessions with armed goals. The integrator seat moved to successors at 09:10
  and 15:37 UTC (planned, near the end of context); the next hand-over is planned for about 22:00 UTC so that a fresh
  session runs the 25 November 08:00 UTC window.
- Last War runs from its own worktree with the 300 s idle rule; their daily slot is 09:20-10:50 UTC, when only
  node-only and headless work runs on our side.

## Open owner actions

1. Screen Recording: when macOS asks to re-confirm CUHelper's Screen Recording permission, answer Allow. Only you
   can; unanswered, it repeats every few hours, and if it lapses every desktop run stops at its first screenshot.
2. Step 4: say 'start step 4' (or name a time). The team clears the desktop for 30 minutes and cu-verifier leads.
3. Model budget: 20.69 of 25 USD spent, and nothing past 21 USD runs without you (D-034). The last ~0.31 USD is kept
   for step 4's single CU-135 run. The third evaluation batch (CU-66, S8 and S9 on Opus) needs a raise from you.
4. Dismiss the notification alerts on the Mac mini and quit Typeless before step 4.
5. Long-running Chrome tabs on the Mac mini keep the load near 30 and slow the team's gates.
6. Decide on the history clean-up the coordinator reported privately on 9 November.
7. Confirm the Mac-wide "Paste from other apps" setting (D-052).
8. Optional: give the Heddle Linear app initiative read/write for initiative updates.
