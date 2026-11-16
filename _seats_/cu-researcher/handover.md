---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-16T07:05:00Z
level: L2
version: 5.30.0
description: 'What the next session of [cu] Researcher needs - the High lane, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0705Z 16 Nov
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.
TOOLS: durable copy in the private records repo, _seats_/cu-researcher/tools/ (install.sh -> /tmp).
MATRICES: node _tools_/probe-kit/test-matrices.mjs DIR 10 (from the tests) - never /tmp-only.

STATE (07:05Z 16 Nov): main 198f9997. Both OKs, waiting on triage: #843 -> #846 -> #848 (CU-565 /
566 / 563, one stack), #847, #851, #853, #854, #856. My OK, live second due: #859 (CU-573). Filed
tonight: CU-568..574, all reproduced; CU-568 and CU-574 not built. Kit: #852, #858 landed.
cu-coordinator silent since 12 Nov 08:20Z: triage and every ruling wait (round 6, bare verbs ...).

CHECKS BEFORE A FIRST OK: held-out once; fresh class members; narrow-audit.mjs (wide battery x 8
pages, famdiff) - the corpus misses names it lacks; sweepdiff.sh x6 against cached main runs (or
the kit's sweeps.mjs diff) - lost asks hide in generated forms; corpus reclass; suite-part.sh x4.

LESSONS: a fix that lists my examples passes them and fails the held-out - say 'bind the class';
pre-register a private check set before a repeat round so the bar does not move; heldout-lint.py
before saving a held-out (three items shared words with my fix line); a swap after a PR exists is
not counted - count the original set and say so.

RULES: signed OK naming the head, read in the posting call; linear.py via lin.sh; never verify my own
filings; D-034 20.69 of 21 USD, no model run; gate unpiped, push on exit 0.
```
