---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-09T16:12:00Z
level: L2
version: 1.6.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.66
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-099)
---

# Computer use on the Mac mini - status for the owner

State at 9 November 2026, 16:12 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). **No Urgent or High item is
  open** (verdict 0.9.66). Today the team's own audits found six High gaps and closed each live within hours:
  CU-340 (a card or ID number split across boxes, or half pasted), CU-347 (secret keys and 'password=' lines typed
  into a field), CU-351 (a click on a label fired its button unjudged), CU-352 (buy, pay, delete and send buttons in
  German, French, Spanish, Russian, Japanese and Korean), CU-353 (an access-key shortcut, closed as a precaution) and
  CU-354 (a task naming the last four digits let the whole card through). Also closed: CU-336, CU-326, CU-300, CU-263
  (a CAPTCHA is handed to you), CU-328, CU-329. Left:
  - The D-061 table's re-sign (its last rows are landing); D-059 is re-signed.
  - Medium items with fixes in review: field names in those six languages (CU-345), unusual separators (CU-346), less
    common password forms (CU-350), personal-ID field names (CU-355), placeholder-only boxes on the desktop (CU-349).
  - Names are read in English, Chinese and those six languages; other languages are a named limit (D-099).
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing
  about 25. The team rehearsed every step it can with labelled stand-ins (every pause and take-over under 35 ms, no
  input while paused); the one-page checklist is reviewed (CU-341).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.62 installed 9 Nov; it admits drivers only from the configured checkouts and now gives back the one Accessibility setting it changes in your apps at every run end, CU-329) |
| consent and safety | no Urgent or High item open (0.9.66); D-059 re-signed; D-061 re-sign next; Medium fixes in review |
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
8. If your apps use a language other than the eight above, say which, and the next table pass adds it (D-099).
