---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-12T05:21:00Z
level: L2
version: 1.8.44
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _seats_/cu-verifier/ultimate-goal-2-verdict.md@0.9.210
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-102)
---

# Computer use on the Mac mini - status for the owner

State at 12 November 2026, 05:21 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). **Three High items are open**
  per verdict 0.9.210, all reproduced: CU-548 (smart-home life safety - smoke, CO and leak sensors off, water
  valves; table PR 46, #798 - both reviews in), CU-549 and CU-550 (router exposure and carrier plans; table PR 47,
  #805 in review). Ruled since: CU-551 (repository visibility; table PR 48, #807 in review), CU-552 and CU-553
  (patient-record downloads, HR terminations; table PR 49). Every earlier ruled High is closed live: fifty-three on
  10 November, fifty-five on 11 November and seventeen so far on 12 November. Both consent tables are signed. Since 9 November the team's own audits
  have found one hundred and fifty-two High gaps, closed one hundred and forty-eight live and lowered one to Medium, among them CU-363 (a website's own one-key shortcuts, such as '#'
  to delete in a mail list), CU-365 (the same with Ctrl or Command chords), CU-370 (choosing 'Delete' in a
  drop-down, list box or radio group by keyboard), CU-373 ('Generate app password' and mail auto-forwarding on a
  website's account settings) and CU-381 (Delete or Backspace on a web page outside a text field). Medium fixes
  closed live that day include field names in six more languages, personal-ID names, unusual separators, less common
  password forms and links carrying a password. What the row still needs is CU-135, the
  Replace-sheet chain, which only you can answer (a scripted consent answer is refused by design).
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
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.65 installed 10 Nov, reading placeholder text, a label placed beside a box, pop-up menus, open menus and whether the clipboard holds a file; 0.2.66, which marks Finder's Quick Actions, and 0.2.67, which reads the file a row names and Finder's AirDrop, Shared and Network destinations, are in review) |
| consent and safety | three High open per 0.9.210 (CU-548, CU-549, CU-550), all reproduced, fixes with both reviews or in review; CU-551 to CU-553 ruled; both tables signed; then waits on CU-135 in the owner session |
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
   `_tools_/live-view/owner-checklist.md`. The human-control row waits only on it, and the consent row on it once the open Highs close (CU-135).
2. Dismiss the notification alerts on the Mac mini (one sits at the screen centre; at 21:37 UTC one intercepted a live check's click) and quit Typeless before step 4.
3. Long-running Chrome tabs on the Mac mini hold the load near 30 and slow the team's gates; closing them helps.
4. Decide on the history clean-up the coordinator reported privately on 9 Nov.
5. Confirm the Mac-wide "Paste from other apps" setting (D-052).
6. Optional: give the Heddle Linear app initiative read/write for initiative updates.
7. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
8. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
9. If your apps use a language other than the eight above (four more in review), say which, and the next table pass adds it (D-099).
