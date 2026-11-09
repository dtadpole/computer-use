---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T23:14:29Z
level: L2
version: 2.0.1
description: 'What the successor of [cu] Researcher needs - open PRs and what each waits for, owed flips and live closes, reviews due, lessons and rules.'
status: unverified
grounded_in:
  - source: the seat's own state at 2305Z, main at da1d49f (CU-252's any-app rule, CU-291, CU-293, CU-294 landed; the main checkout moved to ~/dtadpole/computer-use)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: worktree ~/computer-use--cu-researcher (the helper admits it); a branch per change from origin/main. The main
checkout is ~/dtadpole/computer-use (symlinks at the old paths): never edit it, nor anything under its .git.

OPEN PRS (head - waits for): #154 52c0c40 record 2.3.0 - OK'd. #34 d28fc65 consent-limits 0.3.8 - re-OK.
Table PRs whose heads moved today (flips, live closes) - re-OK: #43 bb5baef, #48 efa7110, #63 14696ae, #65 7f2b70b,
#68 a7e9e72 (#140 landed as 3c7fecd). Older table PRs, clean with main and 0 failures at 22:47Z - an OK at their
heads: #20, #41, #57, #69, #73, #77. #44 is superseded by this PR.

ACTION LOG: every new PR adds its line (actor cu-researcher, UTC Z, commit null); PRs opened before #148 land
without one and are logged after they merge (one line each, with the merge commit). An old branch's first main
merge conflicts on the log: keep both sides (git merge-file --union), each line must parse.

OWED FLIPS: #146 -> #48's five CU-279 terminal cells; #149 -> #48's two CU-296 Debug Console cells.
LIVE CLOSES OWED: CU-294's six web cells need a browser run, its two Firefox checkboxes a checkbox run; CU-293's
Traditional cells; CU-286's remember-decision checkbox; CU-267's three cells close with D-065 once ruled.
REVIEWS DUE: #150 (0.2.58) after its main merge - helper Sources unchanged from 4f186dc; after install, the start
log's 'checkouts:' line names the new roots. Guide lines owed: CU-252's over-ask, the IDE over-block (after
#146/#149), saving a password or passkey.

LESSONS: take labels from an app's own localization files (vscode-loc, mozilla-l10n, Apple's zh-cn and zh-tw guides)
- VS Code's zh terminal label has a fullwidth comma; Traditional differs in words, not glyphs. Terminal rows need a
non-shell title (zsh trips E5 by itself). Trace every route of a check (#150's lexical branch). Read the producer
(loop.mjs) before trusting a policy probe's input shapes. A 'Fixes CU-n' PR must pass every todo pinned to CU-n. A
run closes only cells of its route, control and exact label. Gate a commit on its edit applied (counts) and 0
failures; commit before a detached test merge; read the inbox before every push.

RULES: never verify my own filings (CU-145..198, 223, 226, 228, 231, 232, 234, 240, 242, 244, 245, 249, 251-254,
256-258, 260, 261, 263-273, 278, 283-286, 288, 289, 291-294, 296); send only --from cu-researcher; OKs by inbox as
'#N OK at <sha>'. D-034: 20.69 of 25 USD; announce a live model run's cost first and log it on CU-66; the 21 USD
line holds; model-a on S8/S9 waits for the owner. No input outside CUHelper (D-056). Reply to the owner in Chinese
with the todo list, every round.
```
