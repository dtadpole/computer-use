---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-23T08:18:51Z
level: L2
version: 1.10.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.328
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-099, D-108, D-110 to D-114)
---

# Computer use on the Mac mini - status for the owner

State at 23 November 2026, 08:20 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence (verdict 0.9.328). Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). Every High ruled up to
  16 November is closed live (CU-561 last). Open on 23 November, all reproduced live:
  - **CU-585 and CU-371**: clicking a bare Confirm, Continue, Apply or Go in a danger zone acts unasked. The first
    fix (#884, #894, #897) landed this morning, but it reads only zones wrapped in a form, and the reproduced pages
    have none. The second fix covers zones without a form, close-account zones and a select holding 'Delete
    permanently'. It is built with the policy owner's OK and is in its author runs.
  - **CU-607**: a password field in another language was typed unasked under a personal-data pre-approval. Its fix
    #1364 has four reviews and is gating.
  - **CU-716**: Russian and German/Dutch forms of the password word, and localized PIN names. Found in #1364's review;
    being built.
  After them the row waits on CU-135, the Replace-sheet chain, which only you can answer.
  - Between 12 and 22 November about eighty issues closed, most of them Medium gaps in action and field names
    across the covered languages (English, Chinese, German, French, Spanish, Russian, Japanese, Korean, with Italian,
    Dutch, Portuguese and Turkish added by table passes). Other languages remain a named limit (D-099).
- **Human control** needs you once: runbook step 4 (CU-11), with the key-hold row (CU-119), the Replace-sheet chain
  (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing about
  25. The checklist is `_tools_/live-view/owner-checklist.md`.

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.70 installed; 0.2.71 on main since 06:22Z, 0.2.72 and 0.2.73 in review: form labels for the danger-zone fix, remote-desktop and VM clients refused by the helper itself) |
| consent and safety | High open: CU-585 / CU-371 (zones without a form), CU-607 (gating), CU-716 (building); then CU-135 in the owner session |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; browser tasks go
  through the browser environment, which reads the page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean.
- **Lane rules** (D-108, D-110, D-112): High fixes first; narrowings land only in their own issue with an exact list
  of what they free; additive Medium fixes land on their filed rows, and further phrasings become new issues.
- **Author runs** (D-114): every PR's author runs the full suites before review; a review never rests on the gate.
  During your own desktop runs only High work that launches no app runs, at low priority.

## Team

- cu-developer-one's session ran since 8 November and was replaced as planned at 07:52 UTC (D-114); the new session
  holds the seat and its items.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203). The human-control row
   waits only on it, and the consent row on it once CU-585, CU-371, CU-607 and CU-716 close.
2. Dismiss the notification alerts on the Mac mini and quit Typeless before step 4.
3. Long-running Chrome tabs on the Mac mini keep the load near 30 and slow the team's gates.
4. Decide on the history clean-up the coordinator reported privately on 9 November.
5. Confirm the Mac-wide "Paste from other apps" setting (D-052).
6. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034), so the third evaluation
   batch's S8 and S9 on Opus (CU-66) wait for your word.
7. Optional: give the Heddle Linear app initiative read/write for initiative updates.
8. The `cu-owner` desktop runs held the run lock every few minutes from 03:37 to about 07:20 UTC. If they are
   yours, a pause of about 25 minutes now and then lets gates and author runs finish.
9. The old `~/reflection` checkout was removed about 03:00 UTC. The team now reads `~/dtadpole/reflection`; say so if
   the old path should come back.
