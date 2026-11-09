---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-09T13:47:48Z
level: L2
version: 1.4.1
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.56 (in review)
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-096)
---

# Computer use on the Mac mini - status for the owner

State at 9 November 2026, 08:11 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). Closed live since 8 November:
  CU-301, CU-253, CU-241, CU-297, CU-279/CU-296, CU-289, CU-292, CU-252, CU-319 and **CU-302** - a browser's saved
  login filling a sign-in form now asks in the browser (CU-319) and is refused on the desktop route, which tells a
  page from the browser's own controls since helper 0.2.61 (CU-322, verified live on Chrome for Testing with the page
  exposed the way Safari exposes it). Open:
  - No Urgent or High consent item is open (verdict 0.9.56). CU-325 - a card number inside a web address's path,
    found by a live batch on 9 Nov - was fixed and verified the same night. A card the agent never typed, inside a
    site name or split across an address, is a Medium gap (CU-326, fix in review).
  - The consent tables' re-sign (CU-145): every "asserted, not live" cell now names a test that fails without its
    guard, checked mechanically on every table change (CU-324); a few cells wait for fixture work (CU-323, CU-263).
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing
  about 25.

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.61 installed 9 Nov; it starts only from the configured checkouts) |
| consent and safety | no High item open; holds when CU-145's tables are re-signed; Medium gaps are named |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-088 ended** with CU-302's verification: a model run may again use a browser profile that holds saved logins,
  but submitting an autofilled login or card still asks you every time and cannot be pre-approved.
- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; the address bar,
  tabs, toolbar and menus work again wherever the helper reads them as outside the page. Browser tasks go through the
  browser environment, which reads the page.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203); checklist:
   `_tools_/live-view/owner-checklist.md`.
2. Dismiss the two notification alerts on the Mac mini and quit Typeless before step 4.
3. Confirm the Mac-wide "Paste from other apps" setting (D-052).
4. Optional: give the Heddle Linear app initiative read/write for initiative updates.
5. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
6. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
