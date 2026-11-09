---
title: repo-actions
created: 2026-11-09T00:00:34Z
modified: 2026-11-09T00:00:34Z
version: 1.0.0
description: The repository's action log - one JSON line per action that changed tracked content, appended in the same commit as the change.
grounded_in:
  - source: dtadpole/reflection change-tracking convention (each repository logs its own actions)
  - source: computer-use decision D-077 (no session ids in this public log)
---

# repo-actions

Holds [`action-log.jsonl`](action-log.jsonl): one JSON object per line, one line per action that changed tracked
content, appended in the same commit as the change and never rewritten.

| Field | Meaning |
|---|---|
| `timestamp` | when the action was taken, ISO 8601 with an offset or Z |
| `actor` | the seat key that acted (for example `cu-coordinator`), never a session id or a person's name |
| `action` | `create`, `update`, `merge` or `delete` |
| `paths` | the tracked paths the action changed, this log included |
| `reason` | one English sentence: why, with the decision or issue it rests on |
| `commit` | `null` when the line ships in the commit it describes, else that commit's id |

Parallel pull requests each append at the end, so `.gitattributes` merges this file by union; cu-integrator resolves
a log-only conflict in a records pull request the same way. Entry point: [`../INDEX.md`](../INDEX.md).
