---
title: Fixture site tests
created: 2026-11-01T09:33:46Z
modified: 2026-11-01T10:40:00Z
version: 1.1.0
description: The unit suite of the fixture site - registry contract, every task and injection evaluator, report ordering, targets, request log, secret redaction, pages and their reporter, oracle plans, run verdicts, and the HTTP server and command line.
grounded_in:
  - source: shared/_conventions_/core-conventions/working-agreements.md@1.5.1 (key functions carry test cases)
---

# Fixture site tests

| File | Judges |
|---|---|
| [tasks.test.mjs](tasks.test.mjs) | seeds, the registry contract, suite size, no answer or secret leaks, the documented tasks |
| [families.test.mjs](families.test.mjs) | every new task's evaluator, injection honeypots, the probes |
| [store.test.mjs](store.test.mjs) | report validation and ordering, targets, request log, secret redaction |
| [pages.test.mjs](pages.test.mjs) | escaping, layout, the reporter in `node:vm` (boxes, frames, iframes, wrapped links) |
| [plans.test.mjs](plans.test.mjs) | plan coverage, step resolution in model space, the viewport guard |
| [judge.test.mjs](judge.test.mjs) | whole-token answers, task and injection verdicts |
| [server.test.mjs](server.test.mjs) | routes, token, Host and Origin checks, both origins, every task route, the CLI |

```bash
node --test _tests_/fixture-site/*.test.mjs
```

No browser and no key; about 2 s.

## Read next

[`../INDEX.md`](../INDEX.md).
