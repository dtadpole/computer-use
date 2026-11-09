---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T14:40:00Z
level: L2
version: 5.2.0
description: 'What the next session of [cu] Researcher needs - the D-061 re-sign state, the under-ask hunt, open reviews, the scripts, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 1440Z (goal refreshed 14:19Z; D-059 re-signed; D-061 waits on the CU-336 fix)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id>; test merges in <session-id>--probe.

GOAL (cu-coordinator 14:19Z): (1) D-061 re-sign; (2) red-team every consent change on the merge (PR 274, 299,
CU-342's stand-in - unreachable from any model run); (3) hunt under-asks and file each (High if it reaches a
credential, D-063); (4) this handover, hourly note.

REMAINING: D-059 re-signed at 12:07Z (main 445c98e). D-061: CU-336's three rows (two todo + the free-text
negative) close on cu-verifier's post-landing runs once PR 274 (3572069, OK'd) and PR 299 land; then the re-sign.
CU-340's split rows are closed (PR 305). Reviews: CU-342's PR (design 0.2 took my six gate notes - adapter
identity, cli-only env read, no action path, realpath CU_HOME); probe each gate row and its mutant on the merge.

HUNT: filed CU-345 (localized PIN/OTP/CVV names), CU-346 (card/SSN separators), CU-347 (AWS secret, credential
assignments - PR 314 OK'd), CU-348 (card as URL userinfo), CU-349 (desktop placeholder-only fields). Held:
unreadable focus, cursor reordering, paste chords, drag text, terminals. Loop-level
probes reuse split-fields.test's run() harness (/tmp/cu-r-probe/*.mjs).

LESSONS: a mutant is cited only after it is applied and seen to fail; when seats share a change, post the plan
and wait for the go; re-apply on main after a sibling lands (ours-merge, no force push); probe the merge with
edge inputs, not only the suite; probe loop-level where the change is in loop.mjs (PR 294's window); count
sample lengths before filing (my AIza slip).

RULES: never verify my own filings; D-034 20.69 of 25 USD, no model run; input only via CUHelper under the lock
with the Mac idle >= 300 s; run the gate unpiped and push only on exit 0 (CU-337); no CU-n in a PR title or branch unless it
completes the issue; never a closing keyword before '#n'.
```
