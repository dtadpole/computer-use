---
title: M6 desktop design - testability review
created: 2026-11-02T08:50:00Z
modified: 2026-11-02T08:50:00Z
level: L1
version: 1.0.0
description: cu-verifier's testability review of the M6 desktop design 0.1.3 - for each ULTIMATE_GOAL 2.0 row, the outside evidence a check judges, what CU Fixture provides, what the helper or driver must expose, and two seeds untestable as written.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/traceability.md@0.1.3
  - source: _context_/team-operations/decision-log.yaml (D-012, D-024, D-025)
---

# M6 testability review (design 0.1.3)

Seams (a)-(d) are folded: `frameToGlobal` with `simulateScale: 2`, the fake helper, `simulateLocalInput`, and
add-only exclusions. Measured 2026-11-02: CU Fixture, executed directly by the harness, registers with LaunchServices
as `ai.reflection.cu.fixture` (`lsappinfo`). Scope by bundle id therefore works with the fixture's private channel.

1. **Environment.** Evidence: CU Fixture records each received event's `eventSourceUnixProcessID` and
   `eventSourceUserData`. The pid must be the helper's, whose parent is launchd, never node. *Ask:* name the tag
   constant in input-and-targets.md.
2. **Untestable as written (environment).** "Responsible process" is not visible without private API, and "TCC
   grants name only the helper" needs TCC.db, under `~/Library`, which we never read. Replace both with item 1, plus
   a non-helper probe whose preflight reports no grant.
3. **Perception.** CU Fixture records every mouse event in window and global points. The check needs it within one
   point of the reported target. Real Retina cannot be shown here; the simulated 2x path is accepted and the verdict
   will say so. *Ask:* each action record keeps the frame and `originPt` it was mapped with.
4. **Action contract.** A CU Fixture input-recorder screen logs raw events: type, button, click count, location,
   deltas, key code, characters, modifiers, pid, tag. A malformed batch must leave it empty, and so must copy, cut
   and paste chords (D-025).
5. **Consent and exclusions.** CU Ledger stands in for an excluded app through the test-only exclusion entry, and
   paints a marker colour. "Never captured" means no run PNG contains that colour. *Ask:* the entry comes from run
   config the check sets, recorded in `run.json`.
6. **Human control.** `simulateLocalInput` proves the pause logic only. *Ask:* a `via: 'untagged'` variant that
   posts a real untagged event from the helper, so the event-tap path is exercised once granted. Evidence: no tagged
   event reaches the fixture after it until a human-channel resume.
7. **Trajectory.** A marker string in a CU Fixture secure field and in an unapproved CU Ledger window, with the
   marker colour. Neither may appear in any run file or PNG.
8. **Integration and evaluation.** *Ask:* `--env macos-desktop` attaches to an already running app by bundle id, so
   the harness keeps launching the fixture itself.
9. **Consistency.** One helper bundle id everywhere; the exclusion check reads it from the table.

My side, for M7: the input recorder with pid and tag, marker-colour and secure-marker screens, mouse-moved events,
and a visible launch mode.

## Read next

[traceability](../../_designs_/desktop-extension/traceability.md).
