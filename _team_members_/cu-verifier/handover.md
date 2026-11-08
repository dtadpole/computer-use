---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-08T23:10:00Z
level: L2
version: 3.0.0
description: 'What the successor of [cu] Verifier needs - live state, open PRs, what each pending verification waits for, the scripts, and the lessons of 8 Nov.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 2310Z, as the owner moves the team to successor sessions
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md) (0.9.53).

```text
WHERE: main checkout ~/dtadpole/computer-use (old paths are symlinks); this seat's worktree ~/computer-use--cu-verifier
(the helper admits it). Live runs use it detached at origin/main. Never run a branch switch while a live job uses it.
Hygiene gate before every push; every new PR carries one _logs_/repo-actions line (since 22:22Z).

LIVE: helper 0.2.56 installed; post-install passed (contents, Q-D15 5/5, step 4 184106Z-f887b3). 0.2.57 (#133,
CU-227) is on main and 0.2.58 (#150, CU-292/CU-295) is OK'd; neither is installed yet.

MY PR: #132 named-controls 'areas' (AXTextArea named by the harness; OK'd by cu-researcher and cu-developer-three at
8b4b97d; fixture 230/230 under the lock). It is needed for CU-253's cells.

VERIFY NEXT (each waits on the item named):
- CU-252, CU-259, CU-262: #153 landed; land #141 too, then re-run the stand-in rows O1/O2 (Command-O on install.command,
  Command-Down on Payload.app must ask). The stand-in rows read AXStaticText with empty names, so the read is
  unreadable. CU-269 is Done.
- CU-253: #132, then the area rows (iMessage Return, typed newline, Notes negative, 'Type a new message', 'Write a
  message...'; entry 'Message' with a typed newline).
- CU-294: rows on named-controls (续费, 开通会员, 入会, 发起会议, 拨打, 注销账号, 记住此决定; negative 查看会员). Two series were refused by local input; not run yet.
- CU-291: #147 is merged; run the URL rows (acct=, acctnum=, phonenumber=).
- CU-227: install 0.2.57, then post-install plus #128's acceptance items (1)-(6).
- CU-292/CU-295: install 0.2.58, then post-install, the start log line of admitted roots, and a symlinked root
  pointing outside home refused.
- CU-145: re-sign D-059 and D-061 once the table PRs land and their cells close on my runs. D-061 is green.
  D-059 still has CU-241 and CU-253 cells open. D-065 is proposed for CU-267's focus-unreadable and growing-field cells.
- Owner session: CU-11 step 4, CU-119 G2, CU-135's chain (it needs the person: the helper admits only the CLI and MCP
  entry points), CU-203's in-person rows, the Finder rows; then CU-16 and the verdict.

SCRIPTS (in /tmp, lost on reboot; rebuild from these notes if gone): cu-verifier-hold.sh (cu_hold checks idle, takes
the hold with --wait-free, releases on exit); proofs/live-batch.sh (detach at main, hold, re-check idle once the desktop
is free, run, release, announce); named-live.mjs (named-controls rows, env modes CU253/285/288/293); cu252-live.mjs;
cu253-areas.mjs; cu281-browser.mjs (env CU283/284/285); cu2xx-browser.mjs pages served on 127.0.0.1;
cu-verifier-post-install.sh and cu-verifier-qd15-gate.sh.

LESSONS: run the real entry points (createPolicy with a web url, createAppPolicy for the desktop, the CLI); a test
merge per review; ask what the OS keeps after a helper exits (keys, buttons, a drag in flight); announce a model
run's cost before it starts (D-034); release the lock as soon as the series ends, and never hold it while waiting for
the owner; verified issues can be moved back by a sweep, so re-check the state.
```
