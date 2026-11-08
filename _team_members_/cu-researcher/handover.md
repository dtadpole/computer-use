---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T11:50:53Z
level: L2
version: 1.4.0
description: 'What a fresh session of [cu] Researcher needs - live state, open PRs and asks, the methods, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 1150Z, main at 46e6d65 (CU-230's and CU-232's agent-core fixes in)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: one worktree ~/computer-use--cu-researcher; a branch per change from origin/main
(cu/cu-researcher-<topic>); never edit the main checkout (the DSH working directory). Code and records land
here by PR through cu-integrator. PR numbers restarted at #1 on 8 Nov.

PUBLIC: run the public-hygiene gate over origin/main..HEAD before every push (it must print ok); no home path,
name, e-mail, internal model id (alias model-a), host, session id, private address or key-shaped literal
(build test values from _tests_/fixture-shapes/shapes.mjs). Tool paths live in the goal, not here.

TABLES (mine): D-059 consent-routes.test.mjs, D-061 sensitive-classes.test.mjs. Open PRs: #12 (Fixes CU-223,
closed on cu-verifier's R3-R6), #20 (menu-key-send open CU-232 since #26), #23 (CU-230: two web cells closed,
six desktop cells wait for #24), #30 (CU-234: six todo, flip when #31 lands), #40 (CU-241 (4): two todo),
#41 (desktop cells judged with url desktop://; newline-default-absent todo CU-243 until #38), #43 (D-061:
CU-245's seven todo rows). Docs: #34 (consent-limits.md; consent-routes 1.1.1 at 498 words). Rule: whichever of
a cell PR and its fix lands second flips the cell. D-064: a closing run is cu-verifier's or a decision.

REVIEWS DUE: #27 (driver list + incomplete -> unreadable), #36 (helper menuKey: a menu-bar item with no AXMenu
child, the Services submenu), CU-245's and CU-241's fixes, CU-238's compose screen.

DONE TODAY: chord sweep (CU-145) -> CU-230, CU-232, CU-234; CU-234 measured under my hold (Shift-Space acts in
CU Fixture; the rest named over-asks - table on CU-234); key-carrying action sweep through runTask (no live
gap; Control-scroll zoom named). CU-66 released (owner-gated).

LESSONS: probe through runTask, not one layer, before calling a hole live (CU-243, CU-244 - I over-called
CU-244); release a hold the moment the series ends (D-073); no CUHelper process of any build outside the lock;
a measurement plan runs on one non-author OK (D-070) and never closes a cell.

RULES: never verify my own filings (CU-145..198, 223, 226, 228, 231, 232, 234, 240, 242, 244, 245); re-read the
inbox before every push; search recent CU-145/CU-171 children before filing an Urgent; send only --from
cu-researcher; D-034 ~20.69 of 25 USD, the 21 USD line holds, model-a on S8/S9 waits for the owner; owner-app
runs wait for CU-230 and CU-232 (D-071); no input outside CUHelper (D-056); reply to the owner in Chinese.
```
