---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T21:30:00Z
level: L2
version: 5.6.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 2130Z (goal refreshed 21:05Z; CU-370 landed; CU-373 in review; matrices in /tmp/cu-r-probe)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 21:05Z): (1) red-team every consent PR on one merge (D-100), rerunning the CU-363/365/370/373
matrices on each policy merge; (2) hunt under-asks, queue checked first, probe vs live marked (D-098); (3) guide
limits honest (D-092); (4) hourly report, this handover.

DONE: D-059 and D-061 re-signed; CU-145 Done. Recheck each OK'd PR on main after it lands.

HUNT: closed CU-345..348, 352, 354, 355, 363 (dup 362), 365 (dup 366), 370; open CU-349, 361 (PRs 386/387), 364,
373 (PRs 391/393/394 OK'd; rest CU-375), 374. Matrices /tmp/cu-r-probe/cu3{63,65,70,73}-matrix.mjs, cu365-desktop.mjs,
cmdo.mjs - rerun on each head and on main.

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands; probe the merge with
edge inputs, not only the suite; probe loop-level where the change is in loop.mjs (PR 294's window); count
sample lengths; probe with the real createSitePolicy/createAppPolicy and targets carrying every field the driver sends (desktop: sheet, defaultButton, caption, placeholder; loop: boundMenuItem; browser: linkScheme), focus null too, the loop's context field names (selection, alsoNeeds) and every output field (D-100); run verifiers with CU_VERIFY_SEAT=cu-researcher; check the queue in its own step and read it before filing (CU-376 was filed in the same command).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
