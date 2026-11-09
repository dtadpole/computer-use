---
title: '[cu] Developer One - Artifacts'
created: 2026-11-07T02:20:40Z
modified: 2026-11-08T12:17:59Z
level: L2
version: 2.4.0
description: 'What [cu] Developer One shipped for the M7-M9 and continuity goal - each issue, its design note and its PRs, and where it stands.'
status: unverified
grounded_in:
  - source: pull requests from cu/cu-developer-one branches (the private history repository until 2026-11-08, this repository after) and Linear team CU, 2026-11-06 to 2026-11-08
---

# [cu] Developer One - Artifacts

One row per issue or group; the design note came first where the contract or safety changed. "old #N" is a pull
request of the private history repository (AGENTS.md); #N is this one's. States are Linear's, read 8 November 12:20Z.

| Issue | What changed | PRs | State |
|---|---|---|---|
| CU-104, 113, 121, 123 | the no-app-window stop names the run's apps; a blank final capture; D-057's ANSWER line | old #248-#289 | Done |
| CU-125, 139-160 | desktop keys, drags, save panels, deletes, pastes, history moves, app-named questions | old #299-#391 | Done |
| CU-135 | a key activating a control judged like a click; Replace and Don't Save destructive | old #308-#320 | Verify (owner session) |
| CU-157-178 | a bare Reply; bank, tax, key, seed-phrase, identity and contact values and names (D-061, D-062) | old #374-#429 | Done |
| CU-179-218 | pastes, copies, captions and text drags carry their source's class; password-named entries hand off | old #431-#540 | Done |
| CU-190, 214 | an unreadable default button asks submit; D-069's helper floor | old #450, #452, #542 | Done |
| CU-185 | a national phone number with a trunk 0 asks | old #527 | Done |
| CU-145, 171, 177, 199, 205, 206 | the action policy and guide true to live closes, under budget | old #373-#550 | CU-145 open; rest Done |
| CU-203 | the guide's `--ask-owner` start | old #551; #6 | in review |
| CU-220, 225 | a missing pasteboard count asks; the guide's drag limit goes | #5, #13 | Done |
| CU-230, 234 | every paste chord meets the paste checks; modifier variants recognised (live) | #17, #31 | Verify |
| CU-237 | a desktop chord judged by the menu items it fires (CU-232) | #26 | Done |
| CU-242, 249 | owner-setting, input-source and Services chords and Services items refused | #35, #50, #49 | in review |
| CU-243, 244, 245 | D-069's guard on the real path; holds judged at app-policy; seven typed secrets | #38, #42, #46 | in review |

Lessons: a rule tested through classify() alone is not proven (CU-152); a close needs the real helper path (CU-148);
a doc states the rule as the code has it; measure a budget at the file's real path (CU-177); green suites do not show
an outcome is unchanged when no test covers it; verify a push before cleaning up; a shared verifier's fix is its
owner's PR (CU-220's crossed edit was dropped); after the scrub, re-apply a diff by hand and compare its changed lines.
