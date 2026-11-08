---
title: CUHelper (macOS helper app)
created: 2026-11-02T09:35:00Z
modified: 2026-11-06T08:00:00Z
version: 0.3.2
description: The Swift helper app com.reflection.cu-helper - the one process the owner grants Screen Recording and Accessibility - with its line protocol, rules, dry run, peer boundary and build script.
grounded_in:
  - source: _designs_/desktop-extension/INDEX.md@0.3.1
  - source: dtadpole/_context_/team-operations/decision-log.yaml (D-024 to D-049)
---

# `helper` - CUHelper.app

Writer: cu-developer-three (D-026). Swift via `swiftc`; no Xcode, no npm. Contract:
[helper and protocol](../../../_designs_/desktop-extension/helper-and-protocol.md),
[input and targets](../../../_designs_/desktop-extension/input-and-targets.md),
[human control](../../../_designs_/desktop-extension/human-control.md),
[helper boundary](../../../_designs_/desktop-extension/helper-boundary.md). Driver side:
[`helper-link.mjs`](../helper-link.mjs); reference fake: [`fake-helper.mjs`](../../../_tests_/macos-desktop/fake-helper.mjs).

- `bash build.sh <out-dir>` builds `CUHelper.app`, ad hoc unless `CU_HELPER_IDENTITY` names a signing identity.
- `bash install.sh [--cu-home <dir>]` installs at `$CU_HOME/helper`, the path the owner granted. It says when the
  designated requirement changed, so grants would not carry over, and runs the prompt-free self-test.
- What each source owns: [Sources/](Sources/INDEX.md). Driving it with no grant: [dry-run.md](dry-run.md).
- Tests: [`_tests_/macos-helper/`](../../../_tests_/macos-helper/INDEX.md); cu-verifier's
  `desktop-helper-dryrun` verifier pins the input rules against mutants.

**State (0.2.28).** Signed with the owner's "CU Helper Signing" identity and granted Accessibility, Screen Recording
and event posting and listening; live desktop runs since 2026-11-05. Each install is announced and made under the
desktop-run lock, with the self-test after. A live run passes the peer check, takes the one-helper lock and shows
the indicator. Rules in force:

- pointer input decided by the hit window (Q-D15);
- foreign content fails closed, and open and save panels are marked (CU-39);
- drags abort with Escape and pass over their own drag image (CU-44 to CU-46);
- the menu bar is masked to the approved app's titles, on its own display only (CU-51);
- a capture is stretched to exactly its frame's pixels, so a simulated or clamped scale maps right (CU-74);
- a system privacy or permission prompt is marked and refused, pointer and keys, even inside an approved window (CU-76).

**Open.** A live two-display check (the Mac has one display). The navigated folder of a panel stays unread, a
named limit (D-047, CU-48).
