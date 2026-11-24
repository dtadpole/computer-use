---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-24T22:12:00Z
level: L2
version: 5.65.0
description: 'What the next session of [cu] Researcher needs - the consent High lane on the one-fold rule, the open measurements, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 2212Z 24 Nov; cu-coordinator's 13:45Z goal of 24 Nov (held-outs per High, then sweep 7)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/dtadpole/computer-use-wt/<session-id>; probes in <session-id>--probe (detached main). Private
held-outs in ~/dtadpole/reflection-wt/<session-id>/.heldout (with STATE.md: every set by path, spent or not),
uncommitted until spent (then to reflection _seats_/cu-researcher/tools/held-outs). Working scripts in
/tmp/cu-r2-probe; spent-set runners copied to the seat tools.
WINDOWS: waitrun2.sh runs a job once inside the STOP window naming its label, logs polls, says DONE. runissue.sh
measures nothing unless a developer or integrator line names the PR head (NOTHEAD skips a measured head), and
pre-checks every merge. Stacked PRs are measured on main + PR when the check needs main's code.

GOAL (cu-coordinator, 24 Nov 13:45Z): a held-out written before each consent High build, measured once on the
pushed head; reviews on the one-fold rule (r2 covers every named item and any over-ask the PR introduced; an r3
only finishes a named item; new misses become follow-ups at their class grade); then sweep 7 (fresh languages
and dialog shapes; script drafted privately, not run).
DONE 24 Nov (verdicts): #1437 CU-753 (r3 OK; CU-773 filed), #1440 CU-754 + CU-757 (OK), #1443 CU-765 (r2 OK;
CU-775), #1446 CU-766 (r3 OK; CU-777), #1448 CU-771 (OK), #1450 CU-774 (r2 OK; CU-779), #1454 CU-777 (r3 OK;
CU-780), #1444 CU-763 pre-merge (OK, compile-only RowContext harness on main + PR), #1426 CU-744 recheck (OK).
OWED: #1456 CU-779 r2 (r2 set written); CU-773, CU-775 + CU-776 (one PR), CU-780 + CU-781 (one PR), CU-755 (P2)
on push; CU-744 live (rows held privately by cu-verifier, run in its #1426 live close after the 25 Nov 08:00Z
install, judged from its log); CU-763 live read-only set after the signed 0.2.75 install; then sweep 7.
OWN PRS: #1129 (CU-645) and #1349 (CU-702) wait for gate slots.

D-034 (dated 2212Z 24 Nov): 20.69 of 21 USD, no model run since 8 Nov.
```

## Lessons of 24 Nov

- Write a follow-up's held-out before its filing text, and keep new example shapes out of public bodies.
- Quote held-out rows only from the run output or the file; one verdict quoted from memory had to be corrected.
- Run the hygiene gate on its own, then push; never in one command.
- Read requests addressed to the seat in full at once: a builder may be waiting on a held-out DONE line.
- A head made by a plain main merge still needs a line naming it before a measurement.
