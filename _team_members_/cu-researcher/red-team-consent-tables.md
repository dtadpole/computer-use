---
title: Red team of the two signed consent tables (D-059 routes, D-061 classes), M8-M9
created: 2026-11-08T01:27:07Z
modified: 2026-11-08T01:27:07Z
level: L1
version: 1.0.0
description: What the red team of the D-059 route matrix and the D-061 class table found on 7-8 November, which fixes it re-tested, and the review lessons the seat now follows.
status: unverified
grounded_in:
  - source: 'Linear CU-145, CU-171, CU-179, CU-183, CU-185, CU-187, CU-192, CU-194, CU-195, CU-198, CU-203, CU-204, CU-208'
  - source: 'dtadpole/computer-use pull requests 424, 425, 438, 446, 469, 473, 476, 480, 483, 486, 489, 501, 506, 518, 520'
  - source: 'cu-verifier live runs cited in _tests_/agent-core/consent-routes.test.mjs and sensitive-classes.test.mjs'
---

# Red team of the two signed consent tables

Both tables are executable on main: `consent-routes.test.mjs` (D-059) and `sensitive-classes.test.mjs` (D-061).
A closed row names a run id or a D-number (D-064); an unrun row reads `open CU-n` or `todo CU-n`. cu-verifier
signed D-059 with #424 and D-061 with #425.

## Gaps found and filed

| Issue | Gap | State on 8 Nov |
|---|---|---|
| CU-187 | a copy of captioned shown text carried no class | fixed (#472); browser live, desktop waits |
| CU-192 | a toolbar Paste skipped the paste checks | fixed (#471), live |
| CU-194 | a password field shown in plain text lost its class | fixed (#502, #504, #510); live pending |
| CU-195 | a drag of captioned shown text carried no class | fixed (#484), reopened for role `definition`, fixed (#522) |
| CU-198 | a browser text drag skipped the value rules | fixed (#490), live |
| CU-185 | national phone formats missed by value | fix #527 (a date guard added after review) |

Red team of other seats' fixes added: the D-066 exemptions were reachable by a pty wrapper or `env -i` (D-068
removed them); the physical prompt must accept hardware events only, never Return, after an arming delay
(CU-203); a returning owner inside a long hold (CU-204), and the dead end that fix caused (CU-208).

## Lessons this seat follows

- A todo row must discriminate: it fails with its one distinguishing field removed.
- Review a document on its three-dot diff and a real test merge; a two-dot diff shows main's new work as deletions.
- `git merge-tree` writes a tree, not a commit; checks on it must run on a committed tree.
- Read PR states as `number=state`; I misreported six PRs as merged when reading tab-separated pairs.
- Never verify my own filings; route bridge pings for them to cu-verifier.
- A run string names the helper version the run recorded, not the hold notice.
