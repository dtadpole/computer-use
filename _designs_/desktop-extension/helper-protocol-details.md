---
title: Helper protocol details
created: 2026-11-02T09:53:32Z
modified: 2026-11-05T17:00:36Z
level: L1
version: 0.4.4
description: The requests, replies, events and codes of the line protocol between the macos-desktop driver and the helper - scope growth, captures by path, inline watch frames and the test seams.
status: unverified
grounded_in:
  - source: _environments_/macos-desktop/helper-link.mjs
  - source: _team_members_/cu-developer-two/macos-helper-measurements.md (PR 110, 95d9b4bbe)
---

# Helper protocol details

The messages of the line protocol in [helper and protocol](helper-and-protocol.md). Replies are `{id, ok: true, ...}`
or `{id, ok: false, code, message}`; events are `{event: 'frame' | 'localInput'}`.

| Request | Reply |
|---|---|
| the helper's opening line: `hello {token, protocol: 1, helperVersion, grants: {screen, accessibility, postEvents, listenEvents}, displays}` from preflights only | none: the driver's first request is acceptance, or it closes the socket |
| `scope {bundleIds}` | `{running, display}`: the apps this run may see and touch, nothing else |
| `capture {display?, region?, maxSize, simulateScale?}` (`maxSize` exact, `region` in points for `zoom`) | `{png` or `path, sha256}, widthPx, heightPx, scale, originPt, frontmostBundleId, windows}` |
| `input {events, mode}` | `{done, failedAt?, code?}`; `events` are the driver's planned low-level steps |
| `hitTest {xPt, yPt}` | `{bundleId, pid, role, subrole, title, frame, secure}` or `null` |
| `focused {}` | the focused element, same shape |
| `screenText {maxChars}` | visible text of the frontmost approved window, secure fields omitted |
| `watch {fps}` / `unwatch` | `frame {png, widthPx, heightPx, at, windows}` events, inline; `windows` as in a capture, so the driver drops a leaking frame (CU-12) |
| `pauseOnLocalInput {on}` | `{armed, via}`, the active guards `idleCounter` and `eventTap`; then `localInput {at, kind}` events ([human control](human-control.md)) |
| `bye` | the helper drops its scope and exits |

## Scope growth

The driver's `addApp(bundleId)` sends `scope` again with the union of the current scope and the new app. The helper
replies `ok` or refuses `excluded` or `out_of_scope`; agent core then fails the action closed
([app policy](app-policy.md)).

## Captures by path

The helper may write a large PNG to a file and reply with `path` and `sha256`. The file sits directly in the run's
mode-700 directory with a `.png` name; the client checks place and hash, reads it, then deletes it. Any violation ends the link `helper_lost`, without naming the path.

## Test seams

| Seam | Contract |
|---|---|
| `capture {simulateScale}` | renders at that backing scale, any value above 1 up to 4 ([capture and scaling](capture-and-scaling.md)) |
| `simulateLocalInput {kind: key \| pointer, via: idleCounter \| eventTap \| untagged}` | sends the `localInput` event, then replies `{detectedBy: idleCounter \| eventTap}`; needs the pause armed and can only pause |
| stdio transport | the fake helper in unit tests; it takes a `captureDir` (absolute, mode 700) as its run directory |

## Codes

`not_granted`, `no_scope`, `out_of_scope`, `excluded`, `pause_not_armed`, `local_input`, `secure_input`,
`unknown_request`, `unknown_field`, `invalid_argument`, `unsupported`, `timeout`, `failed`. Anything unexpected - a
broken line, a reply to an unsent id, a timeout - ends the link `helper_lost`, unretried. cu-developer-two's
`fake-helper.mjs` is the reference.

`secure_input` and a mid-batch `out_of_scope` use the mid-batch form `{ok: true, done: false, failedAt, code, message,
frontmostBundleId}`; at index 0 nothing was posted.

A human resume settles first: the driver adds `settleMs` (1500) to the first `input` after run control returns to
running from paused, taken over or awaiting consent. The helper honours it only if it has itself seen local input
since its last synthetic post (a `local_input` refusal or a `localInput` event), else ignores it. Honoured, it
waits at most 60 s for `settleMs` hands-off on the idle counter, takes that as its new baseline, then posts and
guards as usual; past the cap it answers `local_input` at `failedAt: 0`. Nothing posts during the settle.
