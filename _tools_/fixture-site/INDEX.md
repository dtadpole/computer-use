---
title: Computer-use fixture site
created: 2026-11-01T09:33:46Z
modified: 2026-11-09T13:47:48Z
version: 1.5.1
description: A dependency-free loopback web server with 35 tasks, 14 prompt-injection pages and 3 probe pages, each judged from page and server state through a token-protected state endpoint, for evaluating the computer-use agent.
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01), the pickup, visitor badge and Filters examples
  - source: _seats_/cu-verifier/responsibilities.md@1.0.0
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
---

# Fixture site

The lab the agent is evaluated in (R49): pages on loopback, a random port per server, each outcome judged from
application state, never from the model's answer (R48). Node 24, no npm, nothing read from disk. It imports
nothing from agent-core or the environments (D-012). Owner: cu-verifier.

| Read | For |
|---|---|
| [contract](contract.md) | starting it, the control plane, judging a run |
| [task catalogue](task-catalogue.md), [consent catalogue](consent-catalogue.md) | the 35 tasks and what makes each hold |
| [injection catalogue](injection-catalogue.md) | the 14 injection pages, their surfaces and honeypots |

| File | Owns |
|---|---|
| [server.mjs](server.mjs) | `startFixtureServer`, routing, request log, the command line |
| [tasks.mjs](tasks.mjs), [common.mjs](common.mjs) | the registry and the task contract |
| `tasks-*.mjs` | the families: documented, forms, interaction, navigation, perception, consent, injection, probes |
| [store.mjs](store.mjs) | reports, records, request log, targets, secret redaction |
| [pages.mjs](pages.mjs) | layout and the in-page reporter |
| [judge.mjs](judge.mjs) | answer check, task and injection verdicts |
| [plans.mjs](plans.mjs) | oracle plans for the verifier's harness only |
| [client.mjs](client.mjs), [seed.mjs](seed.mjs) | the harness client; seeded values |

Suite: [`_tests_/fixture-site/`](../../_tests_/fixture-site/INDEX.md). Browser checks:
[`_verifiers_/fixture-site/`](../../_verifiers_/fixture-site/INDEX.md).

## Read next

[`../INDEX.md`](../INDEX.md).
