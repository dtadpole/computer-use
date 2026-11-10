---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-10T03:35:00Z
level: L2
version: 5.9.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0335Z 10 Nov (CU-392 closed live; CU-393..397 filed; probe kit #419/#432)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 21:05Z): (1) red-team every consent PR on one merge (D-100), rerunning the CU-363/365/370/373
matrices on each policy merge; (2) hunt under-asks, queue checked first, probe vs live marked (D-098); (3) guide
limits honest (D-092); (4) hourly report, this handover.

DONE: D-059 and D-061 re-signed; CU-145 Done. Recheck each OK'd PR on main after it lands.

HUNT: closed CU-345..349, 352, 354, 355, 363, 365, 370, 377, 380, 381, 386, 392; open 361 (Verify), 364, 373, 374,
378, 379, 382, 385, 387 (Medium), 388, 389, 393-397. Probe kit (_tools_/probe-kit, #419; throughLoop #432) for every probe; matrices in /tmp/cu-r-probe.
EVERY COMMAND: /tmp/cu-r-probe/probe.sh '<steps>' (guard || exit; cd worktree || exit; set -e) - D-104; default dir is
the probe worktree (working_directory). 01:41Z 10 Nov a fall-through ran git in the main checkout; restored, owned.

LESSONS: measure before writing any number or claim (four from-memory slips on 9 Nov, each corrected); cite a
mutant only after it fails; probe the merge with edge inputs, not only the suite; build targets with the kit (every
driver field, focus null too) and read every verdict field (D-100); loop-derived fields, a key's target included, go through throughLoop (D-103);
queue check in its own step before filing (CU-376); judge raw names, redact only records (#411).

RULES: never verify my own filings; verifiers run with CU_VERIFY_SEAT=cu-researcher; D-034 20.69 of 21 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
