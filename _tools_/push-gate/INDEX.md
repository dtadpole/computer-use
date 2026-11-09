---
title: push-gate
created: 2026-11-09T11:20:00Z
modified: 2026-11-09T13:08:00Z
version: 0.2.0
description: "CU-337 (D-097): git's pre-push hook for this public repository - it runs the public-hygiene gate unpiped over exactly what each pushed ref adds and refuses the push on any non-zero exit; the gate's path comes from the machine, never the tree; one installer per repository and a check for cu-integrator."
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-097)
  - source: Linear CU-337 (twice on 9 Nov a gate FAIL piped into tail let a push through - #249, #275)
---

# `push-gate`

Writer: cu-developer-two. Node 24, no npm.

| File | What it does |
|---|---|
| [`push-gate.mjs`](push-gate.mjs) | reads git's pushed refs; every ref is gated over what it adds beyond the remote's main, `<remote>/main..sha` (so a branch that merged origin/main is not judged on main's commits), a delete over nothing; runs the gate over each range and refuses on any exit other than 0 (1 findings, 2 the gate cannot run) |
| [`hooks/pre-push`](hooks/pre-push) | the hook git runs |
| [`install.mjs`](install.mjs) | sets `core.hooksPath` to `_tools_/push-gate/hooks`, which git resolves per worktree; `--check` exits 0 only when that is set and this worktree has an executable hook |

Install once per repository on a host, from any of its worktrees:

    node _tools_/push-gate/install.mjs          # then --check in each worktree you push from

**The gate's path.** It is read from `CU_HYGIENE_GATE`, else the local config's `paths.hygieneGate`, else
`<paths.heddleRepo>/_tools_/public-hygiene/gate.mjs`. A path that is no file refuses the push.

**Limit.** A missing hook file means no hook: a branch cut before this landed has no `hooks/pre-push`, and git then
pushes silently unguarded. Run `--check` before pushing from an old branch; merging origin/main brings the hook in. Running the gate unpiped and chaining the push with `&&` stays the rule
(D-097).
