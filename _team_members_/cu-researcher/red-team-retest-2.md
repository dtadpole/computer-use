---
title: Red team retest 2 - peer environment, launchers, code launch, driver peer check
created: 2026-11-02T10:21:45Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.5.1
description: The second retest of the desktop red-team findings after helper 0.2.1, the policy fixes and the driver-side peer check, with what still stays open.
status: unverified
grounded_in:
  - source: _team_members_/cu-researcher/red-team-round-1.md (1.1.1)
  - source: 'main at 9f6822d5b (PR #196), f0db9e0b3 (PR #187) and 609480de9 (helper 0.2.3); PR #204 head (open)'
---

# Red team retest 2

Offline unless marked live.

| Finding | Where checked | Verdict |
|---|---|---|
| B1 a, environment | main 9f6822d5b, PeerCheck.swift lines 23 to 54 | fixed: any `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_EXTERNAL_MODULE`, `NODE_ICU_DATA` refused before the token is read |
| B1 b, entry points | same | fixed: only agent core's `cli.mjs`, the MCP `server.mjs` and the desktop suite's `run.mjs` |
| B5, driver accepts a fake helper | main c7e3233ba (PR #204) | fixed: `lsof` names the one connecting pid and `codesign --verify` checks it before any hello |
| P10, code launch | main f0db9e0b3, replay | fixed for `.scptd`, `.prefPane`, `.mobileconfig`, `.webloc` and more; a hidden extension is caught only once hit-tests carry the file name or URL |
| Launchers | same | fixed: Alfred and Raycast excluded |

Residual risk: a same-user debugger can attach to the driver after the check; the environment is read once.

| Finding | Where checked | Verdict |
|---|---|---|
| B11, held input | main 609480de9 (helper 0.2.3), Dispatcher.swift 226 to 433, main.swift 154 to 158 | fixed: released on every input refusal, before disarming the pause and before a scope change; a failed up stays held and is retried; SIGTERM, SIGINT and SIGHUP release then exit |
| B6, lifetime | main.swift 137 to 150 | fixed: wall cap and a driver-idle end on their own queue, aborting first |
| B9, indicator | main.swift 167 to 170, Indicator.swift 18 | fixed: one panel per display, shown before the hello |

(My first retest of these read an older 0.2.0 head.)

E5 (an IDE's terminal panel): fixed on PR #218's head 12ca87d for any view whose label names a terminal, console,
REPL, notebook or code cell; an unlabelled code view needs a helper-reported role, to probe live. P13 (empty space):
fixed, the helper checks the window owner under the point before every event and an unnamed window reads `opaque`.

New, high (C1, cu-developer-one): `--consent tty` reads answers from a pipe, so a calling script or a model with a
shell tool can approve its own apps and consequential actions (cli.mjs line 143, consent.mjs lines 74 to 90; R61,
D-029 d). Fixed on main b561f7193 (PR #244): `--consent tty` is refused unless stdin and stdout are terminals, and
the controller reads only `/dev/tty`; a piped `y` declines (retested). Residual: a same-user pseudo-terminal.

Live, after the grant (D-033), CUHelper 0.2.8 on the Mac mini, 2026-11-05 14.04 UTC, no input posted: T-B2 and T-B3
pass (a non-node listener is refused with exit 3, no hello, token never read); T-B7 passes (a second helper beside the
listed stand-in exits 4); T-B11 passes (self-test 38 of 38); a stand-in started from a shell that sets `NODE_PATH`
is refused live (B1 a). cu-verifier's first desktop run also blocked a stray click on Terminal and a keypress to an OS
security app, with only CU Fixture in the capture. T-B6 and T-B8 cannot be staged live because no listed entry
misbehaves; their unit tests stand.

## Read next

[red-team-round-1](red-team-round-1.md).
