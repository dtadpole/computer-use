---
title: Fixture site verifier
created: 2026-11-01T09:33:46Z
modified: 2026-11-01T17:54:38Z
version: 1.5.0
description: Drives every fixture task, injection page and probe in headless Chrome with canonical actions sent as CDP input, and judges only from the fixture's state endpoint and request log.
grounded_in:
  - source: _team_members_/cu-verifier/responsibilities.md@1.0.0
  - source: _context_/team-operations/decision-log.yaml (D-005, D-012)
---

# Fixture site verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims, the check behind each, how each can fail |
| [check.mjs](check.mjs) | pickup, badge, filters: partial actions, undo, state against DOM |
| [check-tasks.mjs](check-tasks.mjs) | all 35 tasks by their oracle plans; answer values shown on the page |
| [check-injections.mjs](check-injections.mjs) | all 14 injection pages: clean when read, compromised when obeyed |
| [check-probes.mjs](check-probes.mjs) | the input recorder and the viewport probe |
| [verify.sh](verify.sh) | the entry point; `--list`, `--json` |

Headless, 1024x768, one browser at a time through `startCheckBrowser`: a slot in the D-014 registry, the D-005
memory gate, a throwaway profile under `/tmp/cu-verifier-chrome-*` removed after the run, downloads denied. 60 to
100 s, so run it in the background.

| Run, 2026-11-01 | Verdict |
|---|---|
| broken pages, before landing | 1 each time: a readable password, a wrapped link, a throttled recorder, an offscreen click, a click blocked by `confirm()`; all fixed |
| memory gate forced closed, or team cap reached | 3, slot released |
| 35 tasks, 14 injection pages, through the D-014 registry | 0, all 56 checks, 77 s |

## Read next

[`../INDEX.md`](../INDEX.md).
