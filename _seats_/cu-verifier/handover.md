---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-23T21:00:00Z
level: L2
version: 5.4.43
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
- **Open:** High CU-729 (close armed: `cu729-*`, held-outs `cu729h-*`; desktop sheet row owed); CU-586 (desktop row); CU-631, CU-701, CU-705 still reproduce; CU-720 (`live720.sh`). Consent row: CU-135 step 4.
- **Lessons:** read the Verify state before `verified` (outside Verify it only moves there); a records PR naming an
  issue moves it to Verify on merge - reopen with a live row; count OKs from the PR. One browser per seat, one job
  per window, one DONE after all of it. Rows start only in a written window given to me, shared, or my close -
  never another seat's - and never while a gate runs (`q.sh` checks per row). A mutant counts only when its row
  fails, the file parses, its anchor is unique, and it ran in a scratch tree after the close. Held-outs cover
  person, possessive and imperative twins; pin parity rows. Never split a page across runs (CU-722); keep run folders when a row surprises; desktop rows run `deskguard.sh` first. Browser runs only through `q.sh` / `resume.sh` under `locks/browser.lock`; launchers start only on their own named window. Closes take any window naming me.
