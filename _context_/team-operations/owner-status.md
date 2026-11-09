---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-09T19:50:00Z
level: L2
version: 1.7.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.73
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-102)
---

# Computer use on the Mac mini - status for the owner

State at 9 November 2026, 19:50 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open, and both now wait on one session
with you:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). **No Urgent or High item is
  open** (verdict 0.9.73), and both consent tables are signed. Today the team's own audits found eight High gaps and
  closed each live: CU-340, CU-347, CU-351, CU-352, CU-353 and CU-354 by mid-afternoon, then CU-363 (a website's own
  one-key shortcuts, such as '#' to delete in a mail list, pressed or typed outside a text field) and CU-365 (the
  same with Ctrl or Command chords). Medium fixes closed live today include field names in six more languages,
  personal-ID names, unusual separators, less common password forms and links carrying a password. What the row
  still needs is CU-135, the Replace-sheet chain, which only you can answer (a scripted consent answer is refused by
  design).
  - Names are read in English, Chinese, German, French, Spanish, Russian, Japanese and Korean; Italian, Dutch,
    Portuguese and Turkish are in review. Other languages are a named limit (D-099).
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing
  about 25. The team rehearsed every step it can with labelled stand-ins: every pause and take-over under 35 ms, no
  input while paused, and (R1c, 9 Nov) a stand-in local input paused the run in 15 ms with nothing sent until Resume.
  The stand-in was a pointer move, so your key press is the first measurement on the key path. The checklist and the
  evidence plan are on main (CU-341).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.62 installed 9 Nov; 0.2.63, which adds placeholder text, installs in the next idle window) |
| consent and safety | no Urgent or High item open (0.9.73); both tables signed; waits on CU-135 in the owner session |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-089**, narrowed (D-096): the desktop route does not act inside an approved browser's page; the address bar,
  tabs, toolbar and menus work wherever the helper reads them as outside the page. Browser tasks go through the
  browser environment, which reads the page.
- **Mail links** (CU-360): in browser mode a page's own script may open a mail draft (mailto:) in the Mac's mail
  app; nothing is sent.
- **Public hygiene** (D-097): a push to the public repository goes ahead only when the hygiene gate exits clean, and a
  pre-push hook enforces it.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203); checklist:
   `_tools_/live-view/owner-checklist.md`. This one session is what both open rows wait for.
2. Dismiss the notification alerts on the Mac mini (one sits at the screen centre) and quit Typeless before step 4.
3. Long-running Chrome tabs on the Mac mini hold the load near 30 and slow the team's gates; closing them helps.
4. Decide on the history clean-up the coordinator reported privately on 9 Nov.
5. Confirm the Mac-wide "Paste from other apps" setting (D-052).
6. Optional: give the Heddle Linear app initiative read/write for initiative updates.
7. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
8. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
9. If your apps use a language other than the eight above (four more in review), say which, and the next table pass adds it (D-099).
