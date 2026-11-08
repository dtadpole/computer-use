---
title: Running it, watching and control
created: 2026-11-07T21:18:46Z
modified: 2026-11-08T00:45:22Z
version: 0.1.3
level: L1
status: unverified
description: Starting a desktop run, watching and stopping it, and what it costs.
grounded_in:
  - source: _tools_/agent-core/cli.mjs (run, control-link, apps), loop.mjs (DEFAULT_BOUNDS), exclusions.mjs, policy.mjs
  - source: _environments_/macos-desktop/run-lock.mjs (refuseUnlessIdle - D-066, D-068), PR 499
  - source: _designs_/desktop-extension/human-control.md, file-panels.md, app-policy.md
---

# Running it, watching and control

## Starting a run

The helper needs its grants (Accessibility, Screen Recording, Input Monitoring, event posting), and
the apps you name must be on screen; it says which is missing. One desktop run at a time.
If you have touched the keyboard, mouse or trackpad in the last five minutes, a desktop run stops at
once without doing anything and says so ('this Mac had local input N s ago ...'); start it again after
five minutes without touching them. If the idle time cannot be read, it refuses the same way. A session with the team is a few runs, and
each starts the same way: hands off the Mac for five minutes, then it begins - again before every later part, since
your input ending one part counts as use. Once a part runs, touching the Mac pauses it (below) and never ends it on
its own - you stop it with the control link.

```
node _tools_/agent-core/cli.mjs run --env macos-desktop --seat <seat> --app <bundle id> [--app ...] \
  --model claude-gateway/<model> --task "..."
```

Defaults: 20 steps, 10 minutes, 1.00 USD (`--max-steps`, `--max-minutes`, `--max-cost`). Runs stay in
`~/.computer-use/runs/` (or `$CU_HOME`).

## Watching and control

The run prints a live-view address. The control link (pause, resume, take over, hand back, stop, answer) prints only in your terminal (or run
`cli.mjs control-link <run-id>` there). Touching your mouse or keyboard pauses it, and only you resume it (tested; to be shown live with you). To take over, use the Mac; hand back tells the agent the screen may differ. If a window covers its click point, the live view names that app to move or quit.

## Cost

The result shows tokens, cost and time per step. A short task costs 0.03-0.05 USD;
a 38-step one 0.61 USD (Sonnet).
