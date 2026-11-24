---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-24T03:12:12Z
level: L2
version: 1.14.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.329
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-099, D-108, D-110 to D-115)
---

# Computer use on the Mac mini - status for the owner

State at 24 November 2026, 03:15 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence (verdict 0.9.333). The two open rows now wait only
on you:

- **Consent and safety** holds when no Urgent or High under-ask is open (D-063). None is open. On 23 November seven
  Highs closed live on their merges: CU-607 and CU-716 (password and PIN words in other languages), CU-585 and CU-371
  (typed-confirm danger zones with the instruction in a paragraph or a purpose clause), CU-726 (the same zones in
  nine other languages), CU-729 (confirm buttons such as 'Ja', 'Oui', 'はい' or '确定') and CU-735 (English
  'your account name' prompts). Medium and lower follow-ups (CU-736, CU-731, CU-738 and others) keep landing. The row
  still needs CU-135, the Replace-sheet chain, in the owner session.
- **Human control** needs you once: runbook step 4 (CU-11), with the key-hold row (CU-119), CU-135 and the
  physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing about 25. The checklist
  is `_tools_/live-view/owner-checklist.md` (0.4.4; the prompt's controls are unchanged since helper 0.2.67).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.70 installed; 0.2.73 on main, signed install in today's 08:00-08:25 UTC window) |
| consent and safety | no High open; CU-135 in the owner session |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

The owner-idle carry (CU-720) was verified live at 02:49 UTC: after one of our runs, the idle count continues
rather than restarting.

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; browser tasks go
  through the browser environment, which reads the page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean.
- **Lane rules** (D-108, D-110, D-112): High fixes first; narrowings land only in their own issue with an exact list
  of what they free; additive Medium fixes land on their filed rows, and further phrasings become new issues.
- **Author runs** (D-114): every PR's author runs the full suites before review; a review never rests on the gate.
  During your own desktop runs only High work that launches no app runs, at low priority.

## Team

- cu-developer-one (07:52 UTC), cu-integrator (23:16 UTC) and cu-researcher (01:31 UTC) were replaced as planned
  near the end of their context (D-114); each successor holds its seat and items.
- Shared desktop with the Last War team: soft slots and a daily 08:00-08:25 UTC quiet window (D-116, D-117).

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203), best after today's
   08:00 UTC helper install. Both open rows wait only on it.
2. Dismiss the notification alerts on the Mac mini and quit Typeless before step 4.
3. Long-running Chrome tabs on the Mac mini keep the load near 30 and slow the team's gates.
4. Decide on the history clean-up the coordinator reported privately on 9 November.
5. Confirm the Mac-wide "Paste from other apps" setting (D-052).
6. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034), so the third evaluation
   batch's S8 and S9 on Opus (CU-66) wait for your word.
7. Optional: give the Heddle Linear app initiative read/write for initiative updates.

Answered: CU-721, option (a) (D-118). In today's 08:00 UTC window the Last War bridge gets its own worktree that
tracks main. Their bridge runs at owner-idle 0 until then (D-117), and our side keeps the 300 s wait.
