---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-09T14:22:00Z
level: L2
version: 1.5.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.61 (in review)
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-097)
---

# Computer use on the Mac mini - status for the owner

State at 9 November 2026, 14:22 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). One High item is open: CU-347,
  found at 14:20Z by the team's own probe - an AWS secret key, a Google API key or a 'password=' line typed into a
  field does not ask yet; the fix is being made now. Closed live since 8 November: CU-301, CU-253, CU-241, CU-297, CU-279/CU-296, CU-289, CU-292, CU-252, CU-319,
  CU-302, CU-325, and overnight **CU-340** - a card or ID number split across separate boxes, or half pasted, now asks
  at the box that completes it (found by the team's own key-by-key audit, CU-339). Also closed: CU-326, CU-300, CU-263
  (a CAPTCHA is handed to you), CU-323, CU-328. Open:
  - CU-336 (Medium): a card's security code typed into a payment frame whose name cannot be read; fix in review.
  - CU-345 (Medium: a PIN or code box labelled only in Japanese, Korean, German, French or Spanish) and CU-346
    (Medium: a card or ID number written with dots, slashes or underscores).
  - The consent tables (CU-145): D-059 is re-signed (every cell closed by a live run or a test that fails without its
    guard, 9 named over-ask limits); D-061 is re-signed after CU-336.
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing
  about 25. The team is rehearsing every step with labelled stand-ins first and will hand you a one-page checklist
  (CU-341).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.62 installed 9 Nov; it admits drivers only from the configured checkouts and now gives back the one Accessibility setting it changes in your apps at every run end, CU-329) |
| consent and safety | open: CU-347 (High, fix in progress); D-059 re-signed; D-061 after CU-336 (Medium) |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; the address bar,
  tabs, toolbar and menus work wherever the helper reads them as outside the page. Browser tasks go through the
  browser environment, which reads the page.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean, and a
  pre-push hook enforces it.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203); checklist:
   `_tools_/live-view/owner-checklist.md` (refreshed by CU-341).
2. Dismiss the notification alerts on the Mac mini (one sits at the screen centre) and quit Typeless before step 4.
3. Decide on the history clean-up the coordinator reported privately on 9 Nov.
4. Confirm the Mac-wide "Paste from other apps" setting (D-052).
5. Optional: give the Heddle Linear app initiative read/write for initiative updates.
6. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
7. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
