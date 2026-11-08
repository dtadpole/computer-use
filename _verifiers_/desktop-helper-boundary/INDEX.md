---
title: Desktop helper boundary verifier
created: 2026-11-02T09:51:16Z
modified: 2026-11-02T10:26:47Z
version: 0.5.0
description: Judges CUHelper's D-029 peer boundary before the grant with a stand-in driver, an impostor, code-loading flags and the window table; unjudged until CUHelper 0.2.0 is on main.
grounded_in:
  - source: _designs_/desktop-extension/helper-boundary.md@0.3.2
---

# Desktop helper boundary verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | B1-B4 and the mutant each must catch |
| [stand-in-driver.mjs](stand-in-driver.mjs) | hosts the socket, starts CUHelper with --enforce-boundary, reports one JSON line |
| [not-an-entry.mjs](not-an-entry.mjs) | the stand-in under a name not on the entry list |
| [check.mjs](check.mjs) | the four checks; skips while CUHelper predates 0.2.0 |
| [mutants.mjs](mutants.mjs) | six broken CUHelpers (Swift), rebuilt per mutant |
| [verify.sh](verify.sh) | the entry point; each run shows the indicator for about a second, so runs are announced |

| Run, 2026-11-02 | Verdict |
|---|---|
| main (CUHelper 0.1.0) | 3, unjudged |
| main 2026-11-02 09:58Z (CUHelper 0.2.0), from a home checkout | 0, all 4 checks |
| same, from a /tmp worktree | 3: the accepted case skips (the helper accepts only scripts in a home checkout); 3 of 4 hold |
| prove-failing on main, from a home checkout | 4 of 4 caught, each failing exactly its own check |
| main with helper 0.2.1 (narrowed entries, pins), checks updated | 0, all 4 checks, each refusal by its own rule |
| prove-failing on main, from a home checkout | 5 of 5 caught, each failing its own check (a flags mutant must disable both refusal paths) |
| B3 split (unlisted refused; listed accepted with indicator; hello-and-bye only) | 3 on main: the accepted case waits for the helper to list the stand-in; the other five hold |
| against PR #209 (helper 0.2.3 lists the stand-in), from a home checkout | 0, all 6 checks; no-indicator mutant caught by the accepted case |
| PR #184 head fccc6f2fe (CUHelper 0.2.0) | 0, all 4 checks |
| prove-failing against #184 (Swift rebuilt per mutant) | 4 of 4 caught, each failing its own check |

## Read next

[../INDEX.md](../INDEX.md).
