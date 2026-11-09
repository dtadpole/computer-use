---
title: '[cu] Integrator - Persistent Artifacts'
created: 2026-11-02T08:52:00Z
modified: 2026-11-08T11:00:00Z
level: L2
version: 4.0.0
description: 'Where the persistent artifacts of [cu] Integrator live - its records, the checks each pull request gets (public hygiene, two phases, the desktop-run lock), how it lands without rebasing or force-pushing in dtadpole/computer-use, and baselines on main.'
status: unverified
grounded_in:
  - source: owner choice 2026-11-02 (7 seats - add a Swift helper developer and an Integrator) - D-026
  - source: coordinator rulings D-027 (records issue, browser-free verifiers, validate-frontmatter as the gate)
  - source: 'coordinator rulings 2026-11-05 13.50Z, 13.56Z and 14.27Z (no CUHelper or fixture launch during a live run; the lock file is the source of truth; the gate takes the desktop-run lock)'
  - source: D-039 (computer-use moves to github.com/dtadpole/computer-use; Linear team CU) and goal revision 3 (pr-merge.py, never force-push)
  - source: the knowledge bank's Integrator role convention (session-team-coordination) 1.3.0
  - source: owner order 2026-11-08 (one public repository from a scrubbed tree; the public-hygiene gate before every push)
---

# [cu] Integrator - Persistent Artifacts

Pointers, not copies. Each merge is recorded on its Linear issue and its pull request; merges before 8 Nov are in
the private history repository. Pull requests are tested in a clean detached worktree; this seat's own records are
edited in `~/computer-use--cu-integrator`. Task: [responsibilities.md](responsibilities.md).

## The checks each pull request gets

A non-author seat's OK must name the head. Everything runs on the tree the merge will have (`git merge-tree
--write-tree main head`, wrapped in a test commit with both parents), with a private `CU_HOME`.

1. **Public hygiene** - the heddle gate over `main..head` (lines, paths, messages, identities); again right before
   the merge. Any finding holds the pull request for its author.
2. **Phase 1, no lock** - every `node --test` file outside macos-helper and desktop-suite, then the fake-helper
   verifiers, each under an alarm.
3. **Phase 2, under the desktop-run lock** (seat cu-integrator, `noInput`) - macos-helper (ad-hoc CUHelper),
   desktop-suite (offscreen CU Fixture), desktop-fixture, desktop-helper-protocol, desktop-helper-dryrun. A live hold
   makes it wait; a skipped step holds the pull request.
4. **Extras** - a helper change gets an ad-hoc build and `--selftest` under an idle-checked enforced hold (D-053,
   D-066); a changed `mutants.mjs` gets `prove-failing` on the test merge.

The verdict is baseline-relative: no test may fail that passes on main, and every verifier that passes on main must
pass. A baseline is the same suite on main; after a merge whose tree equals the tested tree, the run becomes main's
baseline. A verifier that fails on a new baseline is reported as a BASELINE SHIFT and listed on its issue. Chrome
verifiers, live model runs and desktop runs stay with their authors and cu-verifier (D-027).

## Landing

- `pr-merge.py --expect-sha <tested head> --method merge`, then read back: the merge tree equals the tested tree and
  the head is on main. If main moved meanwhile with no code change the land proceeds; otherwise it tests again.
- GitHub's own `mergeable` is asked first; a conflict goes back to the author, who merges main (no rebase, no
  force-push).
- The inbox is read right before merging; hold wording beside the number stops the land, and holds persist in a
  file until the author or coordinator releases them. A branch that carries another open pull request stops.
- `Fixes CU-n` moves its issue to Verify; `Part of` gets a note; a partial pull request moved to Verify goes back.

## Baselines on main

| Main | Node suites | desktop-fixture | evaluation-suite | Sampled |
|---|---|---|---|---|
| history `7b589fa64` | 2023/2023, macos-helper 69/69, desktop-suite 28/28 | 76/76 | 4/4 | 2026-11-08T04:36Z, the old repository's last main; every verifier passes |
| `da045e269` | 2032/2032, macos-helper 69/69, desktop-suite 28/28 | 76/76 | 3/4 | 2026-11-08T10:05Z, this repository's first baseline; evaluation-suite check 2 finds no recorded build here (CU-222, listed there and on CU-207) |

Earlier rows name history-repository commits and are in that repository's copy of this file.

## Read next

[`INDEX.md`](INDEX.md).
