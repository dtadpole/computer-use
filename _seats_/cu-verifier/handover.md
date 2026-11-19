---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-19T02:56:00Z
level: L2
version: 5.3.1
description: 'What a fresh session of [cu] Verifier needs - where things are, the pass, the tools, the open rows and the lessons, in under 300 words.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-16, trimmed to the seat rule of 300 words (supersedes 5.0.4)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md).

- **Where:** `--records` for verdicts, `--tm*` test trees, `--vtools` for local tools (never /tmp).
- **Push:** gate unpiped, push on exit 0; one action-log line per PR; a PR title names no filing id but 'Part of CU-16'.
- **Every pass:** inbox; `verifyq.py` (Verify state, any assignee); `filings.py` (unreproduced filings); `unarmed.py` (unwatched fix PRs); the run lock;
  my open PRs' mergeability (merge main if CONFLICTING; D-085).
- **Rows:** `rowrun.mjs`, one headless Chrome run per row; evidence: the run record and the
  click record.
  Desktop filings: `probes/apps.mjs` (clicks; ';;' joins labels), `probes/keyprobe.mjs` (keys);
  helper mutants: `probes/swiftunit.mjs`.
- **Closes:** `watchall.sh` is one background job (restart every ~30 h) over `watchlist.tsv`. Then `linear.py verified` with after and before
  run ids from the logs by script, plus a mutant.
- **Desktop rows:** in cu-developer-three's holds; I judge from events.jsonl.
- **Open:** the CU-586 after-row on 0.2.71 and the CU-588 close row on 0.2.72; CU-375 closes with #856's switch
  rows; CU-596 awaits a reproduction under load; CU-607 waits on a class ruling. The consent row
  waits on CU-135 step 4 (owner).
- **Lessons:** read the Verify state itself; state no OK count I have not read on the PR; one browser per seat;
  no browser row once a GATE START is out (`q.sh` refuses); a mutant
  counts only when its row fails, the file still parses, and it ran in a scratch tree after the close - a list
  entry a rule also covers needs both mutated. Read an issue's state before `verified`; outside Verify it only moves there. A records PR naming an issue id moves that issue to Verify on merge: reopen with a live row. A held-out page covers
  person, possessive and imperative twins, not only the filed one.
