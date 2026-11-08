---
title: '[cu] Developer One - Artifacts'
created: 2026-11-07T02:20:40Z
modified: 2026-11-08T10:56:30Z
level: L2
version: 2.3.0
description: 'What [cu] Developer One shipped for the M7-M9 and continuity goal - each issue, its design note and its PRs, and where it stands.'
status: unverified
grounded_in:
  - source: pull requests from cu/cu-developer-one branches (the private history repository until 2026-11-08, this repository after) and Linear team CU, 2026-11-06 to 2026-11-08
---

# [cu] Developer One - Artifacts

One row per issue or group: the design note first where the change touched the contract or safety, then the code.
PR numbers from #248 to #556 are in the private history repository; #5 onwards are in this one. States are Linear's,
read 8 November 10:57Z; "Verify" means the code is on main and a live row remains.

| Issue | What changed | PRs | State |
|---|---|---|---|
| CU-104, 113, 121, 123 | the no-app-window stop names the run's apps; a blank final capture is marked; D-057's ANSWER line | #248-#289 | Done |
| CU-125, 139-160 | desktop keys, drags, save panels, deletes, pastes, history moves, certificates, app-named questions | #299-#391 | Done |
| CU-135 | a key activating a control judged like a click; Replace and Don't Save destructive | #308-#320 | Verify (the Replace sheet with the owner) |
| CU-157-178 | a bare Reply; bank, tax, key, seed-phrase, identity and contact values and names (D-061, D-062); names compared normalised | #374-#429 | Done |
| CU-179, 183, 186, 192, 196, 218 | a paste meets the typing rules; a copy carries its source field's class; any Paste route judged at the focused field | #431-#477, #470 | Done |
| CU-184, 194, 212 | a password-named entry hands off like a secure one and stays one when shown | #441-#511, #534 | Done |
| CU-187, 195, 210, 213 | a copy or drag of captioned shown text carries the caption's class; controls carry none | #468-#532, #540 | Done |
| CU-190, 214 | an unreadable default button asks submit; D-069's helper floor at the handshake | #450, #452, #542 | Done |
| CU-198 | a text drag onto an entry is judged as a paste at its drop point | #488, #490, #503 | Done |
| CU-185 | a national phone number with a trunk 0 asks by value | #527 | Done |
| CU-145, 171 | the action policy true to live closes; D-061 closes; four D-059 cells close on cu-verifier's runs | #373, #495, #546, #550 | CU-171 Done; CU-145 open |
| CU-177, 199, 205, 206 | guide and action policy split under budget; a refusal names its check; the idle rule in the guide | #492-#531 | Done |
| CU-203 | the owner checklist's in-person check; the guide's `--ask-owner` start | #551; #6 (HOLD) | In Progress (cu-developer-three's) |
| CU-220 | a missing pasteboard count makes a desktop paste the owner's - asked | #5 | Done |
| CU-225 | the guide's read-only text box drag limit goes (CU-209 closed live) | #13 | Verify |
| CU-230 | any Command or Control with V is a paste (Paste and Match Style); browser copies by the driver's map | #17 | Verify |
| CU-237 | a desktop chord judged by the menu items it fires (CU-232) | #26 | In Progress |
| CU-234 | modifier variants of judged keys recognised generously | #31 | In Review |

Lessons: a rule tested through classify() alone is not proven (CU-152); a close needs the real helper path (CU-148);
a doc states the rule as the code has it; measure a budget at the file's real path (CU-177); green suites do not show
an outcome is unchanged when no test covers it; verify a push before cleaning up; a shared verifier's fix is its
owner's PR (CU-220's crossed edit was dropped); after the scrub, re-apply a diff by hand and compare its changed lines.
