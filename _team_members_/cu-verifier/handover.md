---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-09T00:22:00Z
level: L2
version: 4.0.0
description: 'What a fresh session of [cu] Verifier needs - live state, open PRs and asks, the scripts, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-09 0022Z, the successor session in the dtadpole/computer-use workspace (supersedes 3.0.0, #161)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md) (0.9.54).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session id>; purpose worktrees beside it (--pr132, --cu298,
--records, --tm* test merges). CUHelper 0.2.58 admits the worktrees folder, so live runs start from the session
worktree. Hygiene gate before every push; one _logs_/repo-actions line per PR.

LIVE: helper 0.2.58; post-install passed (contents, Q-D15 5/5 at 00:07Z, step 4 235934Z-d47196). D-081: no model run
off the fixture apps until CU-301 is verified.

MY PRS: #132 (named-controls areas, merged with main at 1c417fd; one grid.test failure under investigation), #171
(Fixes CU-298: frame-editor-probe, same-origin and cross-origin frame editors plus card-frames; OK'd at ad666c2).

VERIFY NEXT: CU-301 live rows (desktop named-controls keys, browser loopback page; scripts in /tmp/cu-verifier-ab3d/),
CU-279/CU-296 (fixture rows; the IDE half needs Cursor approved by the owner), CU-295 (stand-ins with NODE_PATH
stripped), CU-253 after #132, CU-241/CU-297 on #171 after #168/#175, CU-252/259/262 after #165, CU-263 after #174
(not OK'd: keypresses skip the CAPTCHA-entry hand-off). Owner session: CU-11, CU-119, CU-135, CU-203.

REVIEWS OWED: #182 (helper 0.2.59, CU-303) after its macos-helper run; re-OK #174 on its fix.

SCRIPTS: /tmp/cu-verifier-hold.sh, /tmp/cu-verifier-proofs/ (predecessor's; the Q-D15 probes still use
~/computer-use--cu-verifier), /tmp/cu-verifier-ab3d/ (batch scripts, test-merge.sh). Lost on reboot.

LESSONS: run node tests with --test-reporter=tap (the default reporter prints no counts); a test merge per review;
a run's 'declined' may be approval, not policy - read its notes; dry-run helper bursts can exhaust tccd (CU-303).
```
