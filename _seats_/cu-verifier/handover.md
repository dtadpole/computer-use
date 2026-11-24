---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-24T15:38:00Z
level: L2
version: 5.4.47
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
  my PRs' mergeability (D-085).
- **Rows:** `rowrun.mjs`, one headless run per row; `resume.sh` resumes gate-interrupted batches.
  Review PRs by FETCH_HEAD SHA.
  Desktop probes: `probes/`.
- **Closes:** `watchall.sh` is one background job (restart daily) over `watchlist.tsv`. Then `linear.py verified` with
  run ids copied by script, plus a mutant.
- **Open:** Highs CU-765, CU-766, CU-774, closes armed on 'Fixes CU-n'; CU-763 after its helper; CU-744's live rows (mine plus cu-researcher's private three) at the 25 Nov 08:00Z install; #1396, #1409, CU-569 follow-up armed. Human control: step 4 from `step4-owner` (`step4-kit.md`, `part3check.py`); CU-727 closes on it.
- **Lessons:** read the Verify state before `verified` (outside Verify it only moves there); One browser per seat, one DONE per window. Rows start only in a written window given to me, shared, or my close -
  never another seat's - and never while a gate runs (`q.sh` checks per row). A mutant counts only when its row
  fails, the file parses, its anchor is unique, and it ran in a scratch tree after the close. Held-outs cover
  person, possessive and imperative twins; pin parity rows. Never split a page across runs; desktop rows run `deskguard.sh` first. Browser runs only through `q.sh` / `resume.sh` under `locks/browser.lock`; launchers start only on their own named window and exit when the wait ends without it (a timed-out loop once fell through). A filed desktop row is never 'covered' by web rows: run it verbatim, by probe at least. Closes take any window naming me.
