---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-23T13:34:00Z
level: L2
version: 5.4.41
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
- **Open:** Highs CU-585, CU-371 (#1368 r3: live check on its head, close on its merge); CU-720 (live row after CU-721, `live720.sh`); CU-717 (#1373, armed); CU-722 (re-run CU-585 / CU-371 pages on main, then `rec331.py`). Consent row waits on CU-135 step 4.
- **Lessons:** read the Verify state before `verified` (outside Verify it only moves there); a records PR naming an
  issue moves it to Verify on merge - reopen with a live row; count OKs from the PR. One browser per seat, one job
  per window, one DONE after all of it. Rows start only in a written window given to me, shared, or my close -
  never another seat's - and never while a gate runs (`q.sh` checks per row). A mutant counts only when its row
  fails, the file parses, its anchor is unique, and it ran in a scratch tree after the close. Held-outs cover
  person, possessive and imperative twins; pin parity rows. Never split a page across runs (CU-722); keep run folders when a row surprises; desktop rows run `deskguard.sh` first.
