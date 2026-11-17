---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-17T03:09:00Z
level: L2
version: 5.2.1
description: 'What a fresh session of [cu] Verifier needs - where things are, the pass, the tools, the open rows and the lessons, in under 300 words.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-16, trimmed to the seat rule of 300 words (supersedes 5.0.4)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md).

- **Where:** `--records` for verdicts, `--tm*` test trees, `--vtools` for local tools (never /tmp).
- **Push:** gate unpiped, push on exit 0; one action-log line per PR; a PR title names no filing id but 'Part of CU-16'
  (Linear moves every issue a title names).
- **Every pass:** inbox; `verifyq.py` (Verify state, any assignee); `filings.py` (unreproduced filings); the run lock.
- **Rows:** `rowrun.mjs`, one scripted unattended CLI run per row in headless Chrome; evidence is the run record and the
  page's click record; the D-106 watcher yields to gates. Row kinds: button, link, switch, field, nav, select, drop (a
  row dragged onto a named target), and a page may sit in a labelled dialog. Desktop filings without the app go through
  `probes/apps.mjs` (clicks; ';;' separates labels with commas) and `probes/keyprobe.mjs` (keypresses), both policy level;
  helper mutants through `probes/swiftunit.mjs`.
- **Closes:** `watchall.sh` is one background job over `watchlist.tsv` (`closewatch.sh` for web rows, `policywatch.sh`
  for desktop probes) and tells cu-coordinator when every row matches. Then `linear.py verified` with after and before
  run ids from the logs by script, plus a mutant.
- **Desktop rows:** in cu-developer-three's holds; I judge from events.jsonl.
- **Open:** the CU-586 after-row on 0.2.71 and the CU-588 close row on 0.2.72; CU-375 closes with #856's switch
  rows; CU-596 (a sentinel-test flake) awaits a reproduction under load. The consent row
  waits on CU-135 step 4 (owner).
- **Lessons:** read the Verify state itself; state no OK count I have not read on the PR thread; one browser per seat;
  no browser row once a GATE START is out (a missed before-row runs on the pre-merge commit after the merge); a mutant
  counts only when its row fails (and a probe flips).
