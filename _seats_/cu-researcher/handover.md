---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T19:45:00Z
level: L2
version: 5.5.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1945Z (CU-363 landed and closed; CU-365 and CU-367 OK'd; matrices in /tmp/cu-r-probe)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 14:19Z): (1) D-061 re-sign; (2) red-team every consent change on the merge (PR 274, 299,
CU-342's stand-in - unreachable from any model run); (3) hunt under-asks and file each (High if it reaches a
credential, D-063); (4) this handover, hourly note.

DONE: D-059 and D-061 re-signed; CU-145 Done. Recheck each OK'd PR on main after it lands.

HUNT: filed CU-345..355 (fixed or OK'd); from the guide's limits CU-361 (layout label, fix coded), CU-363
(page shortcuts, High, landed), CU-365 (chords + stacking, High, PR 367 OK'd), CU-364 (Low). Matrices:
/tmp/cu-r-probe/cu363-matrix.mjs, cu365-matrix.mjs, cmdo.mjs - rerun on each head and on main.

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands; probe the merge with
edge inputs, not only the suite; probe loop-level where the change is in loop.mjs (PR 294's window); count
sample lengths; probe with the real createSitePolicy/createAppPolicy and targets carrying every field the driver sends (desktop: sheet, defaultButton, caption, placeholder; loop: boundMenuItem; browser: linkScheme), focus null too, the loop's context field names (selection, alsoNeeds) and every output field (D-100); run verifiers with CU_VERIFY_SEAT=cu-researcher; check the queue before filing.

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
