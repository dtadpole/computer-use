---
title: AutoFill on the desktop - what a saved login does in a desktop run of an approved browser
created: 2026-11-09T01:16:00Z
modified: 2026-11-09T02:36:00Z
version: 1.1.0
description: 'The CU-302 measurement (D-070 plan 0.2, D-084): a saved login fills a sign-in form on load, and the desktop helper sees the page as one opaque area - what follows for the consent rules.'
grounded_in:
  - source: Linear CU-302 (plan 0.2, the OK of cu-developer-one, the result note of 2026-11-09 01:14Z)
  - source: D-084 (a portable Chrome for Testing is not an install) and D-088 (CU-302 High)
  - source: 'measurement run 2026-11-09 01:13Z, scripted click run 20261109T011318Z-c90145'
---

# AutoFill on the desktop

**Question.** In a desktop run of an approved browser, can the owner's saved login reach a form without the agent
typing it, and can any rule see that?

**Setup.** Chrome for Testing 157, a throwaway profile with a mock keychain and one saved login (a fake, built at
run time), the fixture site's sign-in page, approval only in a private `CU_HOME`, one scripted click through
CUHelper under an enforced hold with the Mac idle 300 s or more. Everything was removed afterwards.

| Question | Measured |
|---|---|
| Q1 - filled on load? | Yes. Username and password both matched `:autofill` before any action, headed and headless. |
| Q2 - what the helper reads | The page is one element: role `AXScrollArea`, no name, `opaque: true`, at both fields and at three points below the username field after one click on it. No suggestion row was readable. |
| Q3 - policy on those targets | Agent core's policy allows; app-policy, which the desktop loop also runs, asks `unknown_target` ('an element the app does not describe'). The unattended run most likely declined the click; no login was submitted. |

**What follows.**

- A click on Sign in, or a Return, would submit the owner's saved password, and it does not need a suggestion click.
  It is asked only as an unknown target, so the person never learns a saved password is being sent. A caller's
  pre-approval of unknown_target lets it through silently, and no name or field rule can judge it (High, D-088).
- The browser driver can read `:autofill` per field. The desktop route has to fail closed instead: it should ask
  before a submit-like action in an approved browser's opaque web area, or not drive browsers until a driver reads
  the page.
- Not measured: the suggestion list's own shape. Nothing was exposed below the field after the click.
