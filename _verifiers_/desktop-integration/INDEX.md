---
title: Desktop integration verifier
created: 2026-11-02T10:05:17Z
modified: 2026-11-02T11:31:19Z
version: 0.5.0
description: Judges desktop runs through startRun on the fake helper - completion, final screenshot, replayable trajectory, refusals - and whether DSH's MCP server offers desktop runs (M9).
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (integration row)
---

# Desktop integration verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | I1-I11 and the mutant each must catch |
| [check.mjs](check.mjs) | startRun on the fake helper (this tree's copy) through environmentOptions; the MCP server's tool list |
| [mutants.mjs](mutants.mjs) | ten broken builds for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_MILESTONE=M8` leaves out the M9 check |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 065ee9e7e | 1: I5 only, no MCP tool offers a desktop run yet (M9); I1-I4 hold (the startRun seat finding is fixed, #189) |
| prove-failing, M8 scope | 2 of 2 caught |
| I6 unclean environment, on PR #229's head | holds; unclean-ignored caught by I6 (I1-I4 hold with the clean environment) |
| main d296b9b52 (#229, #235, #238 in), I7-I8 added | 1: only the M9 check; I1-I4 and I6-I8 hold; prove-failing (M8 scope) 5 of 5, each new mutant by its own check |
| main f31c0b225 (#251: MCP and heddle offer macos-desktop), I9 added | 0, all 9 checks; prove-failing 8 of 8 |
| main e39f2d68c (#255: the MCP server's clean re-exec and symlink-safe guard), I10-I11 added | 0, all 11 checks; prove-failing 10 of 10 |

## Read next

[../INDEX.md](../INDEX.md).
