---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-22T22:29:00Z
level: L2
version: 5.59.0
description: 'What the next session of [cu] Researcher needs - the High lane, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 2229Z 22 Nov
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.
TOOLS: touch /tmp/cu-r-probe/* hourly (host tmp cleaner). Run every measure and suite as yield.sh <cmd>
(nice 19): busy.sh reads cu-integrator STOP / gate notes (END, MERGED, HOLD) from the logged inbox stream and
the wrapper freezes the run while one is on. Both live only in /tmp/cu-r-probe so far.

STATE (22:29Z 22 Nov): goal renewed 01:01 PST. 78 issues closed 16-22 Nov. In Progress: CU-645 -> #1129
(ready; RULE-1, waits on cu-coordinator), CU-700 -> #1331 (subscribe / renew; r3 gating). Next: CU-699 (money
verbs; go given; built locally, not pushed). Waiting on cu-coordinator: CU-696's permission half (uneven English
passkey rows); RULE-1: CU-667, CU-682, CU-591 (rest), CU-649, CU-651, CU-647, CU-642, CU-658, CU-633. Verify: CU-375.
PARITY FIRST: measure the English twins (negation, slots, determiners, objects, past, bare verb) and post them
before building; mirror exactly that set. Ambiguous bare twins (ja 登録 / 更新, ko 갱신, de verlängern, pt assinar)
stay out; bare ja / ko / zh Sino-noun button labels ask.

LESSONS: before every push read the inbox and every watch job's output, and run the WHOLE
_tests_/agent-core/*.test.mjs suite (an older control held #1331). The corpus reclass catches over-asks: read
every gained name. Records: stamps at or before the commit, true at the stamp; no open ids in bodies.

RULES: signed OK naming the head; linear.py via lin.sh; never verify my own filings; D-034 20.69 of 21 USD,
no model run; gate unpiped, push on exit 0.
```
