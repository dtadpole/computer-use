---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-09T12:30:00Z
level: L2
version: 4.2.0
description: 'What a fresh session of [cu] Verifier needs - live state, open PRs and asks, the scripts, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-09 1230Z, the successor session in the dtadpole/computer-use workspace (supersedes 4.1.0)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md) (0.9.59).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session id>; purpose worktrees beside it (--records, --cu323,
--d065j, --tm* test merges). Every PR comment, issue and inbox item starts '[cu] Verifier, session-<8>:' (roster v3,
seat files under the reflection repo's _seats_/cu-verifier/, the seat tools in its tools/).

PUSH (D-097): the hygiene gate runs unpiped and decides the push by its exit status - 'if gate; then push', never
'gate | tail && push'. Never write 'fix/close/resolve #N' about another PR in a body or commit (GitHub closes #N
on merge) - write 'PR #N'. One _logs_/repo-actions line per PR; merge origin/main, never soft-reset onto it.

LIVE: helper 0.2.61 installed and fully checked (contents, Q-D15, CU-303, CU-299 stand-ins). 0.2.62 (CU-329,
PR #263) is OK'd: after its install, acceptance row 5 - read AXManualAccessibility on CU Fixture before a run,
after bye and after a socket loss, noInput.

CU-145: D-059 re-signed on main 445c98e (nine allow-side named limits). D-061 waits for the CU-336 fix (PR #274,
OK'd): then run /tmp/cu-verifier-ab3d/cu336-frames.mjs on main (CVV, expiry, free-text and same-origin rows),
send the run ids, re-sign D-061 when cu-researcher asks. CU-323 (mine, PR #272): all six cells live; CU-338 (a
fixture-site CAPTCHA page, mine, Low) after PR #272 lands.

D-065: a cell counts only if its cited mutant applied alone fails it (D-093); run _tools_/verify-kit/d065-audit.mjs
on the exact merge. PR #275 makes the audit journal in the git dir and repair an interrupted run.

SCRIPTS: /tmp/cu-verifier-ab3d/ (lost on reboot) - batch-template.sh (idle-checked hold, HELD in the background
with its start time, RELEASED with the end time), cells/web/cu3xx live scripts, test-merge.sh. Never run a
hold-taking script (qd15-gate.sh) inside a held batch: its EXIT trap frees your seat's hold (CU-327).

LESSONS: preflight every batch lock-free (CfT fetched, page serves, scripts parse); D-095 window order (High
consent work, then code gates, then tables); a system alert window can cover a click target - read the window
list before blaming the policy; an alarm-killed node --test leaves orphan swiftc - kill your own process group.
```
