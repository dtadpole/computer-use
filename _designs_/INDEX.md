---
title: computer-use designs
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
version: 0.9.1
description: Formal designs of the computer-use project - the contracts the [cu] seats build against.
grounded_in:
  - source: _projects_/heddle/REGISTERED_TYPES.yaml@1.0.0 (registers _designs_, inherited here)
  - source: _team_members_/cu-developer-one/responsibilities.md@1.0.0
---

# `_designs_`

Type folder `_designs_`, registered in this repository's [`REPO.yaml`](../REPO.yaml).
Each instance is one contract; cu-developer-one owns them, every seat reviews, the coordinator approves.

| Instance | Contract | State |
|---|---|---|
| [`system-architecture`](system-architecture/INDEX.md) | code layout and ownership, action schema, environment driver, model adapters, loop, policy and consent, trajectory, live control, integration | approved at 687f4336b (D-015), revision 0.8.4 |
| [`desktop-extension`](desktop-extension/INDEX.md) | M6 desktop computer use on macOS (D-024): helper app and protocol, app-scoped capture, tagged input, per-app approval, exclusions, local-input pause, agent-core changes | revision 0.3, safety revision offered for approval (0.2 approved, D-027) |

A change to an approved contract is proposed by message to cu-developer-one and lands as a version bump with the
reason in the action log.
