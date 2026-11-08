---
title: agent-core test suite
created: 2026-11-01T10:11:08Z
modified: 2026-11-05T16:23:32Z
version: 0.7.1
description: Unit tests of agent-core - keys, the site filter table, the launch gate, run control, schema validation, policy classes, trajectory and the loop against a fake environment and the scripted model - with no browser, network or key.
grounded_in:
  - source: _tools_/agent-core/INDEX.md@0.6.0
---

# `agent-core` suite

`node --test '_tests_/agent-core/*.test.mjs'` from the project folder; no browser, network or key.

| File | Judges |
|---|---|
| [`keys.test.mjs`](keys.test.mjs) | canonical names, both dialects' aliases, printable characters, refusal by name, xdotool chords |
| [`sites.test.mjs`](sites.test.mjs) | every row of the site-filter test table: loopback aliases, fixed-deny ports, private and link-local hosts, exact-origin patterns, wildcard depth, the default allow list, `new_site` approvals |
| [`resource-gate.test.mjs`](resource-gate.test.mjs) | the D-014 registry: entry, chrome pid, release, seat and team caps, dead-owner pruning, lock timeout and stale lock, memory floor, exit handler |
| [`control.test.mjs`](control.test.mjs) | tokens, pause and resume rules, take-over gates, consent only from human channels, timeouts, stop, hand-back, guidance |
| [`actions.test.mjs`](actions.test.mjs) | the nine GA actions, extensions only when declared, whole-batch refusal with each code, batch cap, ignored fields |
| [`policy.test.mjs`](policy.test.mjs) | an allowed and a confirmed case per class, sensitive-data patterns, pre-approvals, site decisions, held dialogs, hand-off, approval lifetimes |
| [`trajectory.test.mjs`](trajectory.test.mjs) | run ids, run directory and modes, screenshot hashes, redaction, retention, replay text, build identity |
| [`loop.test.mjs`](loop.test.mjs) | completion, refused batches, each bound, cancel and stop, consent decline, approval and recheck, safety checks, escalation, questions, the inspector, site decisions, driver failures, secrets, extensions, pause |
| [`cli.test.mjs`](cli.test.mjs) | argument parsing, pre-approvals, viewport, bounds, secret references, exit codes, replay, usage errors |
| [`adapter-claude.test.mjs`](adapter-claude.test.mjs) | member mapping table, refusal of disabled members, the documented batch, every stop kind, result shapes with the halt text, one cache breakpoint, cost, a fake-gateway session (retry, echo, key never in transcript), function mode |
| [`local-config.test.mjs`](local-config.test.mjs) | the config path (`$CU_CONFIG`, else `~/.config/computer-use/config.json`), missing file `{}`, invalid JSON and non-objects named, alias resolution, toolset flags, prices, path order (variable, config, default) with `~/` expanded; every read injected, never the owner's file |
| [`adapter-responses.test.mjs`](adapter-responses.test.mjs) | OpenAI's documented call_002 and other recorded shapes, the computer_call_output answer, chaining and commentary continuation |
| [`run.test.mjs`](run.test.mjs) | `startRun`: live URLs while live, the live port denied, the view closed after the run and on a launch failure, no live view when asked; `keepLiveView` serving the replay until `closeLiveView()`; `onEvent` hearing every event line in order with no secret value, a throwing listener harmless; `started` false on every early failure |
| [`inspect.test.mjs`](inspect.test.mjs) | the inspector flags every text injection of the fixture and no benign page or near miss |
| [`exclusions.test.mjs`](exclusions.test.mjs) | every exclusion entry and prefix, lookalikes, unknown app fails closed, add-only config, live-view title marker and loopback windows |
| [`app-policy.test.mjs`](app-policy.test.mjs) | the order of desktop checks, classes on AX targets, run scope and the always store, D-025 chords and navigate, run-config exclusions; per-app pre-approvals (`class@bundle.id`) cover that app only, app-less ones every app, `credential` and `launch_code` never |
| [`app-approvals.test.mjs`](app-approvals.test.mjs) | grant, list, revoke across stores; mode 600; excluded and non-human grants refused; corrupt store fails closed; the policy reads it per action |
| [`loop-desktop.test.mjs`](loop-desktop.test.mjs) | desktop runs on the fake: app policy, navigate neither offered nor accepted, header scope, new_app always into the store, two blocks end the run, secure typing handed off, offered lifetimes only; privacy: excluded and unapproved apps recorded by bundle id and role only, local-input pauses by kind only, the driver's mapping on done events |
| [`desktop-cli.test.mjs`](desktop-cli.test.mjs) | `run --env macos-desktop` argument mapping; `startRun` refuses a desktop run with the local-input pause unarmed or no app; apps, exclusions and the default always store reach the app policy; `apps list` and `apps revoke` under a temp `CU_HOME` |
| [`desktop-scope.test.mjs`](desktop-scope.test.mjs) | an approved or always-covered app joins the helper scope before its first input; a refused add posts nothing; a desktop startRun passes seat and driver seams |
| [`desktop-start-apps.test.mjs`](desktop-start-apps.test.mjs) | P11 with an empty helper: an uncovered start app asked `new_app` before any capture and added before the first screenshot; a covered one added without a question; an excluded one never asked nor added; an `always` answer stored; unattended with none approved ends `declined` with no screenshot, input or model |
| [`lib.test.mjs`](lib.test.mjs) | the public surface: `lib.mjs` exports `createExclusions`, `EXCLUDED_APPS`, `createAppPolicy` and `createAppApprovals` alongside the browser pieces |
