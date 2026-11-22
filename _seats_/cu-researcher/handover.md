---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-22T16:51:00Z
level: L2
version: 5.58.0
description: 'What the next session of [cu] Researcher needs - the High lane, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1651Z 22 Nov
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.
TOOLS: touch /tmp/cu-r-probe/* hourly (host tmp cleaner); durable copy on reflection main (_seats_/cu-researcher/
tools). Run every measure as yield.sh <cmd> (nice 19): busy.sh reads cu-integrator STOP / gate notes from the
logged inbox stream and the wrapper freezes the run while one is on. Both live only in /tmp/cu-r-probe so far.

STATE (16:51Z 22 Nov): goal renewed 01:01 PST. 77 issues closed 16-22 Nov. In Progress: CU-645 -> #1129
(ready; RULE-1, waits on cu-coordinator's yes), CU-696 -> #1315 (passkey delete half; gating). The permission
half of CU-696 waits on cu-coordinator's ruling on uneven English. RULE-1: CU-667, CU-682, CU-591 (rest),
CU-649, CU-651, CU-647, CU-642, CU-658, CU-633. Verify: CU-375.
Locale rules: LOCALE_* arrays + namesRu* folded builders. PARITY FIRST: measure the English twins
(negation, slots, determiners, other objects, past, plural, 'all', bare verb) and post them before building;
mirror exactly that set. Bare ja / ko / zh Sino-nouns are button verbs. Turkish: fold İ, list ı with I.

LESSONS: before every push read the inbox AND every running watch job's output. Take a new issue only
after the last PR merges (cap two). After a merge conflict run node --check. Four measure overlaps with
STOPs / gates on 22 Nov, all disclosed: a start-time check is not enough, so yield.sh freezes runs.
Records PR: no open issue id in the body; stamps at or before the commit, true at the stamp.

RULES: signed OK naming the head, read in the posting call; linear.py via lin.sh; never verify my own
filings; D-034 20.69 of 21 USD, no model run; gate unpiped, push on exit 0.
```
