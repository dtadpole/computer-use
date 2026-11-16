---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-16T16:19:00Z
level: L2
version: 5.1.0
description: 'What a fresh session of [cu] Verifier needs - where things are, the pass, the tools, the open rows and the lessons, in under 300 words.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-16, trimmed to the seat rule of 300 words (supersedes 5.0.4)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md).

- **Where:** the session worktree, `--records` for verdicts, `--tm*` test trees, and `--vtools` for the seat's local tools
  (outside the repo, never /tmp).
- **Push:** the gate runs unpiped and the push waits for its exit 0; one action-log line per PR. A PR title names no
  filing id except 'Part of CU-16', since Linear's GitHub integration moves every issue a title names.
- **Every pass:** inbox check and read; `verifyq.py` (the Verify state, any assignee); `filings.py` (filings without my
  reproduction); the run lock.
- **Rows:** `rowrun.mjs` runs one scripted, unattended CLI run per row in headless Chrome. Evidence is the page server's own
  click record, and the D-106 watcher yields to gate runs. Row kinds: button, link, switch, field, nav, select. Desktop
  filings without the app go through `probes/apps.mjs` (policy level); helper mutants through `probes/swiftunit.mjs`.
- **Closes:** `watchall.sh` is one background job over `watchlist.tsv` (`closewatch.sh` for web rows, `policywatch.sh`
  for desktop probes). It tells cu-coordinator when every row matches. Then `linear.py verified` with the after and before
  run ids taken from the logs by script, plus a mutant.
- **Desktop rows:** cu-developer-three's idle-checked holds; I judge from the run's events.jsonl.
- **Open:** the CU-586 after-row on 0.2.71 and the CU-588 close row on 0.2.72. The consent row waits on CU-135 step 4
  (owner).
- **Lessons:** read the Verify state itself; state no OK count I have not read on the PR thread; one browser per seat.
