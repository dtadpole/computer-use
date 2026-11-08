---
title: '[cu] Verifier - M1 testability review of system-architecture 0.1'
created: 2026-11-01T09:40:00Z
modified: 2026-11-01T09:43:29Z
level: L2
version: 1.1.0
description: 'cu-verifier''s answer to Q-V1..Q-V4 of the M1 draft - whether every ULTIMATE_GOAL row has a check that can fail, what each seed must observe from outside the system, and what the fixture site adds so it can.'
status: unverified
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.1.0
  - source: _designs_/system-architecture/open-questions.md@0.1.0
  - source: _tools_/fixture-site/contract.md@1.0.0
---

# M1 testability review, draft 0.1

**Verdict: testable with changes.** Several seeds read the system's own records; some need hooks the draft lacks.
Blocking items **B1-B6**, accepted by the coordinator as V-B1..V-B6 for 0.3; re-checked against 0.2.

## Cross-cutting

- **B1 Outside observers.** A seed passes only on evidence the judged code did not write: the fixture page's event
  log, the fixture server's request log, Chrome's command line, the filesystem. `describe()`, trajectory events and
  `status` are diagnostics, never the verdict (R48).
- **B2 Independence.** [layout](../../_designs_/system-architecture/layout-and-ownership.md) line 33 has the fixture
  site import `agent-core`; it must not, or the judge fails in step with the judged. Scripted plans are data.
- **B3 Build identity.** `run.json` `build` needs the commit and a dirty flag (a dirty tree yields no pass rate);
  `task` carries an opaque `meta` (fixture task id, seed) copied into `run.json`.

## Q-V1 Scripted format: not enough

Fixed coordinates drift with fonts and viewport (measured: `--window-size=1024,768` gives a 1024x681 headless
viewport); `expect.urlIncludes` misses a same-page misclick; 0.2's `frame` check catches neither. **B4:** verifiers may pass
`(input) => turn` through `lib.mjs`; the fixture publishes target boxes, so a plan clicks `round(env * scale)`. A
turn may also carry `usage` (tests `max_cost` offline) and `delayMs` (`max_time`).

## Q-V2 `api` controller: yes, with

`pending()`, `respond({ id, approved, lifetime })`, `answerAsk`, `waitForRequest(timeoutMs)`, and `answeredBy`
(`tty`, `live`, `api`, `unattended`, `timeout`) on every consent event.

## Q-V3 State endpoint: answered

`GET /__fixture/state` behind a per-server token ([contract](../../_tools_/fixture-site/contract.md)).
`_evaluators_/task-suite/` accepted: one `results.jsonl` row per run with `runId`, `taskId`, `seed`, `model`,
`build`, `status`, `verdict` (`pass`, `wrong-answer`, `fail`, `false-success`), `steps`, `usage`, `wallMs`.

## Q-V4 Seeds that need changes

| Row | Change |
|---|---|
| environment | a page reads the viewport and `devicePixelRatio`; PNG size equals viewport times scale; run 1's storage marker is absent in run 2; **B5:** no `--no-sandbox` in `Browser.getBrowserCommandLine` - browser-use's `launchChrome` retries without the sandbox, flagging only `noSandbox`; R1 needs a refusal |
| perception | holds; use odd coordinates so rounding errors show |
| action contract | a batch of one valid and one unknown action yields zero page events; modifiers released after a failed action (R16) |
| agent loop | a pure `parseTurn(wire)` per adapter, fed fixtures the verifier owns (OpenAI's documented `call_002`, the researcher's gateway captures) |
| consent and safety | **B6:** offline, the script obeys the injection and the check is that its side effect never reaches the fixture; pixel-only pages judged live only; benign tasks show zero inspector hits, so escalating on everything fails |
| human control | judged through the live view's HTTP surface, so `liveUrl` must be exposed while running |
| integration | `computer_use_start` accepts a scripted model; a scripted MCP caller finds no approval path, so the checkout's order appears only after a human approves through `lib.mjs`; M4 also needs a real DSH and heddle call |
| trajectory | a killed run shows `attempted` without `completed` (R47) |

## Fixture additions (cu-verifier, M2)

Request log, target boxes, input-recorder page, viewport and storage probe, consent checkout, a target that moves
after approval, and `localhost` as a second origin on the same port.

## Read next

[`INDEX.md`](INDEX.md).
