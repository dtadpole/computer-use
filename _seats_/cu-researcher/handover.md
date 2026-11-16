---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-16T03:35:00Z
level: L2
version: 5.29.0
description: 'What the next session of [cu] Researcher needs - the High lane, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0335Z 16 Nov
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.
TOOLS: durable copy in the private records repo, _seats_/cu-researcher/tools/ (install.sh -> /tmp).
MATRICES: node _tools_/probe-kit/test-matrices.mjs DIR 10 (166 from the tests, #845) - never /tmp-only.

GOAL (re-armed 16 Nov): first OK on every High - held-out written at filing, measured once; kit sweep
of every family over every kept matrix on the whole stack (sixths); reclass that diffs CLASS SETS
against main; the full agent-core suite in parts; lowering rounds lose exactly the ruled list.

STATE (03:35Z 16 Nov): main 651a7f05. Built before triage by cu-developer-one, my first OK given:
#843 CU-565 (48f63c41, + dev-two live), #846 CU-566 (49e11cd2), #847 CU-567 (0ca5754a). NOT OK:
#848 CU-563 (held-out 1/4 - 'Review and', 'and continue', quotes). Round 6: 18 labels measured,
lower429r6.mjs ready, no ruling. cu-coordinator silent since 12 Nov 08:20Z: triage waits.

CHECKS PER PR: carry.sh on a head move; famdiff.mjs (classes, not 'asks'); hunt-tails / hunt-xform /
hunt-compound over the corpus (corpus-from-tests.mjs writes 'allow'); suite-part.sh x4; sweepstack x6.

LESSONS: a battery must diff class sets (missed #841 r2's narrowing); a held-out 'a+b' class does not
match the kit - write 'a|b'; a list-based strip passes its examples and fails the held-out.

RULES: signed OK naming the head, read in the posting call; linear.py via lin.sh; never verify my own
filings; D-034 20.69 of 21 USD, no model run; gate unpiped, push on exit 0.
```
