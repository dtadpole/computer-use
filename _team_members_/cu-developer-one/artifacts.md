---
title: '[cu] Developer One - Artifacts'
created: 2026-11-07T02:20:40Z
modified: 2026-11-07T16:27:16Z
level: L2
version: 1.5.0
description: 'What [cu] Developer One shipped for the M7-M9 and continuity goal - each issue, its design note and its PRs in dtadpole/computer-use, and where it stands.'
status: unverified
grounded_in:
  - source: dtadpole/computer-use pull requests from cu/cu-developer-one branches, and Linear team CU, 2026-11-06 to 2026-11-07
---

# [cu] Developer One - Artifacts

Each row is one CU issue: the design note first where the change touched the contract or safety, then the code.
States are Linear's (read 7 November, 16:30Z); "Verify" means the code is on main and a live row remains.

| Issue | What changed | PRs | State |
|---|---|---|---|
| CU-104, 113, 121 | the no-app-window stop names the run's apps; a blank final capture is marked; the note | #248, #265, #282 | Done |
| CU-123 | D-057's ANSWER line and the OUTCOME line share the final answer | #288 note, #289 | Done (live) |
| CU-125, 139, 140, 142-144, 146-148, 151-155, 158, 160 | desktop keys, drags, save panels, deletes, pastes, history moves, certificates, app-named questions | between #299 and #391 | Done (live where a row exists) |
| CU-135 | a key activating a control judged like a click; Replace and Don't Save destructive | #308 note, #311, #315, #320 | Verify (the Replace sheet with the owner) |
| CU-157 | a bare Reply free only when every entry on its page or window is read and empty | #374, #376, #390, #392, #393, #402 | Done (live, both drivers) |
| CU-163 | IBAN (country, length, mod-97), EIN, routing with an account, bank and tax field names | #397, #401 docs | Done (live) |
| CU-164 | a 0x key, a recovery phrase; password, secret and identity field names | #398, #405 docs, #406 | Done (live) |
| CU-167 | SSN, card code, passport, licence, national and tax numbers, birth date by name | #407, #412 | Done (live) |
| CU-170 | a click into a plain text entry takes no class from its name except submit | #409 note, #417, #418 docs (open) | Done (live) |
| CU-172 | the D-061 table: government, payment, auth, health names; NI, PAN, Aadhaar, TFN values; D-062 contact names | #415, #420, #421, #423, #426 guide (open) | Done (live) |
| CU-178 | names compared normalised; spellings and abbreviations of decided names | #429 | In Progress (approved) |
| CU-179 | a paste goes through the same name and value rules as typing | #431 | In Progress (approved) |
| CU-145 | action policy and guide true to the live closes | #373 docs | Done |

Next: CU-183 (a copy's source class carried to its paste; design note first) and CU-177 (the guide's body moves to a
document under its index).

Lessons: a rule tested through classify() alone is not proven (CU-152); a close needs the real helper path (CU-148);
a doc states the rule as the code has it (#373, #405); measure a budget at the file's real path, where an INDEX.md is
held to 300 words (CU-177); green suites do not show an outcome is unchanged when no test covers it (#429); verify a
push before cleaning up (#429).
