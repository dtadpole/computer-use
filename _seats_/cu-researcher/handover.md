---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T16:30:00Z
level: L2
version: 5.3.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1630Z (D-059 and D-061 both re-signed; CU-145 awaiting its Verify move)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 14:19Z): (1) D-061 re-sign; (2) red-team every consent change on the merge (PR 274, 299,
CU-342's stand-in - unreachable from any model run); (3) hunt under-asks and file each (High if it reaches a
credential, D-063); (4) this handover, hourly note.

DONE: D-059 re-signed 12:07Z (main 445c98e); D-061 re-signed 16:23Z (main fc72439c5) - CU-145's acceptance met;
cu-coordinator moves it to Verify, cu-verifier closes it (never me). Open reviews: CU-349's agent-core half
(placeholder upgrades only); recheck each OK'd PR on main after it lands.

HUNT: filed CU-345, 346, 347, 352, 354 (fixed and landed or OK'd), 355 (OK'd), 349 (helper half OK'd);
CU-348 and CU-356 were stand-in probes - the real site policy and the driver's linkScheme already decide.
Held: unreadable focus, cursor reordering, paste chords, drag text, terminals, held dialogs.

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands; probe the merge with
edge inputs, not only the suite; probe loop-level where the change is in loop.mjs (PR 294's window); count
sample lengths; probe with the real createSitePolicy and driver-shaped targets, and name them in the filing (D-098).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
