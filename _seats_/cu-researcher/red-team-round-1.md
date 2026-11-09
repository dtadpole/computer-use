---
title: Red team round 1 - desktop helper boundary, exclusions and consent (offline)
created: 2026-11-02T09:36:40Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.1.2
description: Findings of the first offline red-team pass over the desktop helper, driver, fake helper and agent-core app policy, with owners, severities and the retest plan.
status: unverified
grounded_in:
  - source: dtadpole/computer-use/_designs_/desktop-extension/helper-boundary.md (0.3.1)
  - source: _context_/team-operations/decision-log.yaml (D-028, D-029)
  - source: _context_/chatgpt-computer-use/implications-desktop-action-and-safety.md (R63 to R97)
  - source: 'commits 84e5393f4, 2d9f54453, 982a985cd and e494e03c7 on origin/main'
---

# Red team round 1 (offline)

Offline: source review and node-level tests; nothing built, launched, posted, captured or prompted. Findings went
to the owners by inbox.

## Helper boundary (cu-developer-three helper, cu-developer-two driver)

| ID | Finding | Severity |
|---|---|---|
| B1 | No peer check exists, and the roles are reversed: the driver listens, the helper connects | critical |
| B2 | Any same-user process can launch the helper at its own socket and token and drive the owner's grants | critical |
| B3 | The helper sends the token, grants and geometry before any check | high |
| B6 | After socket loss the helper keeps posting up to 40 s and runs every queued request; no wall-time cap or idle window | high |
| B9 | The always-visible indicator (D-029 c) does not exist | high |
| B11 | No held-input release (D-028, R86) | high |
| B4, B5, B7, B8, B10, B12 | token lifetime, impersonation at the driver, single instance, queue, scope widening, fake divergence | medium |
| B13 | the helper takes exactly four arguments, so B1 and B6 need one joint pull request | low |

Holds: token creation (mode 600, exclusive, random, per-run directory), socket squatting and symlinks, line limits,
and no approval accepted over the socket.

## Agent-core app policy (cu-developer-one)

| ID | Finding | Severity |
|---|---|---|
| P9 | System shortcuts (log out, lock, whole-screen screenshot, Force Quit) not refused | high |
| P10 | Code launch from an approved Finder (double-click a `.command`, open an `.app`) allowed | high |
| P11 | Start-app approvals are a bare list; `grantScope` takes no consent answer | high |
| E3, E5, E6, E8, E10, P3, P4, P5, P8, P13 | exclusion coverage, targets without an origin, credential pre-approval, `unknown_target` and menu-name bypasses | medium |

Holds: the secure-field hand-off (R83) and the terminal exclusions.

## Retest after fixes (merged #184 and #185; #187 at its pull request head)

| Finding | Verdict | Remaining |
|---|---|---|
| B3, B7, B13 | fixed | token read only after the peer check; a single-instance lock; launch pins the driver's node and entry |
| B6, B9 | fixed, minor gaps | no driver-idle timeout and a cap a blocked write can delay; the indicator appears after hello, main screen only |
| B1, B2 | partly fixed | only `NODE_OPTIONS` is screened, so `DYLD_INSERT_LIBRARIES` on this Mac's node (which allows it) passes; any `.mjs` in the project is accepted until design 0.3.3 pins the entry points |
| B11 | partly fixed | no release on refusals before posting, a disarmed pause, a scope change or quit |
| B10 | accepted by design | the scope now grows after a human approval (PR #189); it rests on B1 |
| P9, P11, E2, E3, E6, E8 | fixed | restart and Quick Note chords not yet listed |
| P10 | partly fixed | `.scptd`, `.prefPane`, `.mobileconfig`, `.webloc` and hidden extensions still open without asking |
| launchers | open | Alfred and Raycast not excluded |

B1's environment gap holds the owner's grant (D-029). Swift-side tests T-B2 and T-B6 to T-B11 still run once the
helper is built.

## Read next

[INDEX.md](INDEX.md).
