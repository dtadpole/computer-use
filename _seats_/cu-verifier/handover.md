---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-16T13:10:00Z
level: L2
version: 5.0.3
description: 'What a fresh session of [cu] Verifier needs - live state after the 15 Nov reboot, the rebuilt row tools, the armed closes, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-16 0910Z, the same session after the 15 Nov reboot (supersedes 4.2.0)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md) (0.9.225).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session id>; purpose worktrees beside it (--records for verdicts,
--tm4 .. --tm14 for test runs on main or a PR merge, --vtools for the seat's local row tools). Every PR comment, issue
and inbox item starts '[cu] Verifier, session-<8>:'.

PUSH (D-097): the hygiene gate runs unpiped and decides the push by its exit status. One _logs_/repo-actions line per
PR. A verdict is a new PR off origin/main, or stacked on the previous verdict branch while that PR is open (retarget
to main once it lands). cu-integrator lands everything; records need a non-author OK.

ROW TOOLS (rebuilt 15 Nov; the reboot emptied /tmp, so they now live in --vtools, never /tmp):
- rowrun.mjs: one fresh scripted, unattended run of the system under test's CLI per row, real headless Chrome,
  real driver and site policy; evidence the driver did not write is the page server's own click record (ACTED);
  D-106 watcher: waits for the desktop-run lock (30 s grace after a gate run) and stops a row by its own pid if a
  gate run starts, then retries it. Page specs are JSON in pages/ (button, link, on/off switch, aria switch,
  pre-line text, a text box that is clicked then typed into - judged on the type, optionally pre-filled - and a
  button whose script navigates to a given URL).
- q.sh: label + tree + log + pages; a fresh log per run (old one to .prev); results also as .jsonl.
- closewatch.sh: waits for MERGED (6 h max), moves its tree to origin/main, runs the pages, compares each row with
  an A / F / . string and sends cu-coordinator a one-line fyi when every row matches, so a close waiting on a turn
  is visible. Never edit it in place while a watcher is inside it.
- watchall.sh: ONE background job for every armed close (the job runner caps a seat at 10 jobs); it re-reads
  watchlist.tsv each pass and runs closewatch.sh (web pages) or policywatch.sh (desktop policy probe: probes/apps.mjs
  on the merge, each line of probes/expect*.txt must match) when a PR merges, serialized. Arm a close by adding a
  line; 24 h max, restart it with the same list.
- ids.py (run ids from a results .jsonl, page order, full dated ids), repro_ids.py (before ids from my own posted
  REPRODUCED note), filings.py (filings since a time that lack my reproduction - run it every pass).
- verifyq.py: every CU issue in the Verify state, whoever it is assigned to - the seat queue view does not list
  issues assigned to the owner's account (CU-360 and CU-374 waited hours on 16 Nov); run it every pass.
- Desktop-only filings (apps not installed here) are reproduced at policy level: the main's own createAppApprovals
  and createAppPolicy, a fresh approvals store, one classify per action, output pasted.

LIVE STATE (16 Nov 09:10Z):
- Closed since the reboot: CU-559, CU-560, CU-561 (High), CU-462 (Medium; #841 follow-up checked), CU-383 (re-closed
  16 Nov after it went back to Verify), CU-374 and CU-360 (16 Nov: unit rows, a mutant each, CU-360 a live run).
- Closes armed (watchall.sh rows, each with its own tree): #843 CU-565, #846 CU-566, #847 CU-567, #848 CU-563,
  #851 CU-569, #853 CU-570 (weaker three unruled), #854 CU-571, #856 CU-572, #859 CU-573, #862 CU-574. All wait
  on triage (each PR's OKs as on its thread); watchall.sh skips a PR closed unmerged.
- Reproduced, no PR yet: CU-568, CU-578 and CU-579 (in part), CU-582, CU-583 (policy level), CU-584; CU-585's driver
  half is #884. CU-579 sits in Verify with no fix - not closed. #876 (CU-580) and #877 (CU-581) closes are armed too. CU-575 / CU-576 / CU-577 (policy level) have
  PRs #863 / #865 / #866; their closes are armed as policy rows in watchall.sh.
- Round-6 lowering (17 verb-as-noun-head labels): before-rows on main 651a7f0 - all 17 ask as links, all 20
  neighbours ask; run the same two pages on the lowering's merge.
- Blocker reported: no cu-coordinator item since 12 Nov 09:04Z; triage is stalled.
- Consent row: every ruled High closed live; waits only on CU-135's step 4 (owner session).

NEXT: on each watcher fyi, close with linear.py verified (after ids from logs/close*.jsonl, before ids from
repro_ids.py or logs/repro*.jsonl, main sha read from the log header by pattern, never by field number), then one
verdict per landed PR.

LESSONS: read the Verify state itself, not only the seat queue; state no OK count you have not read on the PR
thread; keep tools and logs out of /tmp; a finished close job must be visible without my turn (closewatch fyi);
run the filings check every pass (an inbox item can be missed); one browser per seat - serialize watchers.
```
