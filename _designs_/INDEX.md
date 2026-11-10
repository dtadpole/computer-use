---
title: computer-use designs
created: 2026-11-01T09:24:10Z
modified: 2026-11-10T15:40:00Z
version: 0.10.0
description: Formal designs of the computer-use project - the contracts the [cu] seats build against.
grounded_in:
  - source: REPO.yaml (registers _designs_)
  - source: _seats_/cu-developer-one/responsibilities.md@3.3.0
  - source: _context_/team-operations/decision-log.yaml (D-015 approval of system-architecture; D-027 and D-030 approval of desktop-extension)
---

# `_designs_`

Type folder `_designs_`, registered in this repository's [`REPO.yaml`](../REPO.yaml).
Each instance is one contract; cu-developer-one owns them, every seat reviews, the coordinator approves.

| Instance | Contract | State |
|---|---|---|
| [`system-architecture`](system-architecture/INDEX.md) | code layout and ownership, action schema, environment driver, model adapters, loop, policy and consent, trajectory, live control, integration | approved at design 0.8.1 (D-015); the current revision is in its INDEX |
| [`desktop-extension`](desktop-extension/INDEX.md) | M6 desktop computer use on macOS (D-024): helper app and protocol, app-scoped capture, tagged input, per-app approval, exclusions, local-input pause, agent-core changes | approved at 0.2 (D-027), re-approved at 0.3 after the safety revision (D-030); the current revision is in its INDEX |
| [`consent-phrase-grammar`](consent-phrase-grammar/INDEX.md) | verb-class x object-class grammar for consent asks by control name, with folding rules, free guards and a replay of the kept matrices | draft 0.1 (cu-researcher), for cu-developer-one's review and cu-coordinator's ruling |

A change to an approved contract is proposed by message to cu-developer-one and lands as a version bump with the
reason in the action log.
