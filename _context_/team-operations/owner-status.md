---
title: Computer use on the Mac mini - one-page status for the owner
created: 2026-11-06T04:55:00Z
modified: 2026-11-09T01:56:36Z
level: L2
version: 1.3.0
status: unverified
description: 'What the [cu] team has built and proven, what is left, and the owner actions that are still open - one page, kept current by the coordinator.'
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _team_members_/cu-verifier/ultimate-goal-2-verdict.md@0.9.54 (0.9.55 in review)
  - source: _context_/team-operations/decision-log.yaml (D-034, D-052, D-063, D-079 to D-089)
---

# Computer use on the Mac mini - status for the owner

State at 9 November 2026, 02:00 UTC.

## Where it stands

Seven of the nine ULTIMATE_GOAL 2.0 rows hold on live evidence. Two are open:

- **Consent and safety** holds only when no Urgent or High under-ask is open (D-063). Closed live tonight: CU-301
  (keys pressed one by one into a card code, recovery phrase, ID or password field), CU-253 (Return in a chat
  compose field), CU-241 and CU-297 (shortcuts and secrets inside web frames), CU-279 and CU-296 (IDE terminals in
  any language; the IDE half asserted under D-065), CU-289, CU-292, CU-259, CU-262. Open:
  - **CU-302** (found tonight): a browser's saved login fills the sign-in fields on load, so a "Sign in" click would
    submit your saved password unasked. The fix is reviewed and landing - the browser driver reports autofilled
    fields and the policy asks (CU-319); on the desktop route a page in an approved browser is refused outright
    (D-089), including Safari's exposed page elements (CU-322, helper 0.2.61).
  - **CU-252** (opening a launchable file from a menu): every live row holds; it closes when its fixture (#165) lands.
- **Human control** needs you once: runbook step 4 (CU-11), with the G2 key-hold row (CU-119), the Replace-sheet
  chain (CU-135) and the physical-confirmation prompt (CU-203) - in person about 15 minutes, or over Screen Sharing
  about 25. Optional in the same sitting: approve Cursor once for one read-only look at its terminal (CU-279).

| Row | State |
|---|---|
| environment, perception, action contract, agent loop | hold live (CUHelper 0.2.58 installed; 0.2.61 next, one install) |
| consent and safety | open: CU-302 (fix landing) and CU-252 (fixture landing); Medium gaps are named limits |
| human control | open: step 4 with you (CU-11, CU-119, CU-135, CU-203) |
| integration | DSH and heddle each completed a fixture task (CU-15) |
| trajectory | holds; capture stays inside approved apps |
| evaluation | holds; first batch 16/25 per model with injections 12/12, none compromised; second batch Sonnet 16/21, Opus 17/21 |

## Limits in force

- **D-088**: until CU-302 is verified live, no model run operates a browser profile that holds saved logins (your
  Chrome or Safari); browser tasks use throwaway profiles and the fixture site.
- **D-089** (interim): the desktop route does not act inside an approved browser's page at all - only the browser's
  own menus, and its address bar and tabs once the helper can tell them from the page; browser tasks go through the
  browser environment, which reads the page. It costs nothing the team runs today, but it means the desktop agent
  cannot work a web page by screenshots the way some other agents do. If you want that kept, say so; the team would
  then measure a per-element rule (CU-321) instead.

## Open owner actions

1. A time and mode (in person or Screen Sharing) for step 4 (CU-11, CU-119, CU-135, CU-203); checklist:
   `_tools_/live-view/owner-checklist.md`.
2. Dismiss the two notification alerts on the Mac mini and quit Typeless before step 4 (overlays show black in
   screenshots of approved apps).
3. Confirm the Mac-wide "Paste from other apps" setting (D-052).
4. Optional: give the Heddle Linear app initiative read/write for initiative updates.
5. The third evaluation batch's S8 and S9 on Opus wait for your answer (CU-66).
6. Model budget: 20.69 of 25 USD spent; nothing past 21 USD runs without you (D-034).
7. Optional: object to D-089 if the desktop route should keep working web pages.
