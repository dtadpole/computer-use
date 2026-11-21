---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-21T15:30:00Z
level: L2
version: 5.4.10
description: 'What a fresh session of [cu] Verifier needs - where things are, the pass, the tools, the open rows and the lessons, in under 300 words.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-16, trimmed to the seat rule of 300 words (supersedes 5.0.4)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and [verdict](ultimate-goal-2-verdict.md).

- **Where:** `--records` for verdicts, `--tm*` test trees, `--vtools` for local tools.
- **Push:** gate unpiped, push on exit 0; one action-log line per PR; a PR title names no filing id but 'Part of CU-16'.
- **Every pass:** inbox; `verifyq.py`; `filings.py`; `unarmed.py`; the run lock;
  my PRs' mergeability (merge main if CONFLICTING; D-085).
- **Rows:** `rowrun.mjs`, one headless run per row; `resume.sh` resumes gate-interrupted batches.
  Review PRs by FETCH_HEAD SHA.
  Desktop probes: `probes/`.
- **Closes:** `watchall.sh` is one background job (restart daily) over `watchlist.tsv`. Then `linear.py verified` with
  run ids copied by script, plus a mutant.
- **Desktop rows:** in cu-developer-three's holds; I judge from events.jsonl.
- **Open:** CU-586 / CU-588 desktop rows; CU-375 with #856; CU-596 under load; CU-607 on a class ruling;
  CU-645 has #1129 (rule-1); no fix PR: CU-612, CU-618, CU-631 .. CU-633, CU-640, CU-642, CU-647, CU-649, CU-651, CU-656, CU-658, CU-667, CU-671, CU-677, CU-678, CU-680; CU-653 closes on a green nightly. The consent row
  waits on CU-135 step 4.
- **Lessons:** read the Verify state; state no OK count unread on the PR; one browser per seat;
  no browser row while a gate runs, records gates too (`q.sh` checks per row; closes wait); a mutant
  counts only when its row fails, the file still parses, and it ran in a scratch tree after the close - a list
  entry a rule also covers needs both mutated. Read an issue's state before `verified`; outside Verify it only moves there. A records PR naming an issue moves it to Verify on merge: reopen with a live row. A held-out page covers
  person, possessive and imperative twins, not only the filed one. A parity test generated from its own table misses a dropped form; pin rows.
