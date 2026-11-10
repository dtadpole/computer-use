---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T23:00:00Z
level: L2
version: 5.7.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 2300Z, day end (CU-381 closed; CU-377/380 High in review; matrices in /tmp/cu-r-probe)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 21:05Z): (1) red-team every consent PR on one merge (D-100), rerunning the CU-363/365/370/373
matrices on each policy merge; (2) hunt under-asks, queue checked first, probe vs live marked (D-098); (3) guide
limits honest (D-092); (4) hourly report, this handover.

DONE: D-059 and D-061 re-signed; CU-145 Done. Recheck each OK'd PR on main after it lands.

HUNT: closed CU-345..349, 352, 354, 355, 363, 365, 370, 381; open 361 (387), 364, 373 (393/394; rest 375), 374,
377 (residual: unattributed paste), 378, 379, 380 (399+405), 382. Matrices /tmp/cu-r-probe/cu3{63,65,70,73,77,81}-matrix.mjs,
cu365-desktop.mjs, cmdo.mjs, cu361.mjs - rerun on each head and on main.

LESSONS: a mutant is cited only after it fails when applied; post the plan when seats share a change;
probe the merge with
edge inputs, not only the suite; probe loop-level where the change is in loop.mjs (PR 294's window); count
sample lengths; probe with the real createSitePolicy/createAppPolicy and targets carrying every field the driver sends (desktop: sheet, defaultButton, caption, placeholder; loop: boundMenuItem; browser: linkScheme), focus null too, the loop's context field names (selection, alsoNeeds) and every output field (D-100); run verifiers with CU_VERIFY_SEAT=cu-researcher; check the queue in its own step and read it before filing (CU-376 was filed in the same command); judge raw names, redact only records (#411).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
