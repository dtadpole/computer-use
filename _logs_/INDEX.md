---
title: _logs_
created: 2026-11-08T21:56:32Z
modified: 2026-11-08T21:56:32Z
version: 1.0.0
description: The repository's own append-only logs - one JSON line per action, written in the same commit as the change.
grounded_in:
  - source: dtadpole/reflection change-tracking convention (each repository logs its own actions in _logs_/)
  - source: computer-use decision D-077 (no session ids in public logs; the input log stays private)
---

# _logs_

- [repo-actions/action-log.jsonl](repo-actions/action-log.jsonl) - one line per action on this repository:
  timestamp (ISO with offset), actor (a seat key), action, paths, reason, commit (null when it ships in the commit it
  describes). Append-only.

This repository is public, so no line carries a session id; the owner's inputs and session-bearing logs stay in the
team's private records.
