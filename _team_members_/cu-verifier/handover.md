---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-09T06:22:00Z
level: L2
version: 4.1.0
description: 'What a fresh session of [cu] Verifier needs - live state, open PRs and asks, the scripts, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-09 0622Z, the successor session in the dtadpole/computer-use workspace (supersedes 4.0.0)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md) (0.9.55).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session id>; purpose worktrees beside it (--records, --cu324,
--tm* test merges). Hygiene gate before every push; one _logs_/repo-actions line per PR; never soft-reset a branch
onto a moved main (it reverts others' lines) - merge origin/main instead.

LIVE: helper 0.2.58 installed; 0.2.59-0.2.61 land as one chain (#201 -> #230 -> #206) and one install. Then: the
post-install set, CU-303, and CU-322's rows on portable CfT (cu-coordinator 05:22Z: C1-C8 with and without
--force-renderer-accessibility, no Safari row), then close CU-322 and CU-302 and send verdict 0.9.56.

CU-145: back In Progress until its open cells close - CU-323 (named-controls check boxes + menu items, mine, after
#171 lands), CU-263 (#174), D-061 batches B4/B5, two D-065 cells in a follow-up pair. Run ids so far: 65 cells live.

D-065: a cell counts only if its 'mutant: table-mutants <name>' applied alone fails it (D-093); the table lane runs
_tools_/verify-kit/d065-audit.mjs (CU-324, Done). Review citations by running it, never by name.

SCRIPTS: /tmp/cu-verifier-ab3d/ (batch*.sh hold wrappers, cells-live, web-cells-live, web-keys-live, cu322-cft,
test-merge.sh); git copies of the hold helper in the reflection seat folder. /tmp is lost on reboot.

LESSONS: yield idle slots to a waiting code gate (D-073); an open blocking finding holds a landing (D-093); run
node tests with --test-reporter=tap; a test merge per review, re-run when a head moves.
```
