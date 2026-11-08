---
title: '[cu] Integrator - Persistent Artifacts'
created: 2026-11-02T08:52:00Z
modified: 2026-11-08T10:00:00Z
level: L2
version: 3.0.0
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

Pointers, not copies.

- **Records:** each dtadpole/computer-use merge is recorded on its Linear issue (team CU) and its pull request.
  Nothing per merge lands here. Merges before 8 Nov are in the private history repository and on the pinned
  reflection records issue (D-027).
- **Worktrees:** `~/computer-use--cu-integrator` (branch `cu/cu-integrator`) for this seat's own records. Pull
  requests are tested in a clean, detached worktree at `/tmp/cu-integrator-cu-wt`.
- **Task:** [responsibilities.md](responsibilities.md); role: the knowledge bank's Integrator role convention.

## The checks each pull request gets

They run on the exact tree the merge will have: `git merge-tree --write-tree <main> <head>`, wrapped in a local test
commit with both parents.

**Public hygiene first (8 Nov).** The repository is public, so before any test the heddle public-hygiene gate judges
exactly what the merge adds - every added line, new path, commit message and identity in `main..head` - and any
finding holds the pull request for its author. It runs again against main right before the merge, so a main that moved
meanwhile is judged too.

The suite has two phases.

**Phase 1, no lock:** every `node --test` file except those that start CUHelper or a fixture app, then the fake-helper
verifiers, each under a 90 s alarm: `evaluation-suite`, `desktop-perception`, `desktop-action-contract`,
`desktop-consent`, `desktop-agent-loop`, `desktop-trajectory`, `desktop-integration`, `desktop-human-control`.

**Phase 2, under the team's desktop-run lock:** `/tmp/cu-desktop-run`, taken through `run-lock.mjs` as seat
cu-integrator (run id `gate-<label>`) and released at once, typically after about 65 s. Phase 2 runs:

- `_tests_/macos-helper`, which builds CUHelper ad hoc;
- `_tests_/desktop-suite`, which runs CU Fixture offscreen;
- `desktop-fixture`;
- `desktop-helper-protocol`, which runs the fake helper, and CUHelper served before any grant;
- `desktop-helper-dryrun`, which runs CUHelper `--dry-run` over stdio.

A live run that holds the lock makes phase 2 wait, for up to 15 min; a live run started meanwhile is refused and retries.
The lock was introduced because a second CU Fixture with the same bundle id can confuse a live run's app lookup and
evidence (13:50Z). Announcements no longer count; the lock file does (14:27Z).

**Yielding for a long batch.** A batch of many runs, such as CU-8 (74 Claude runs), cannot fit between one-minute gate
holds. On request, the gate yields: a flag file (`/tmp/cu-integrator-lock-announced`) keeps phase 2 off the lock, and it
is cleared only on the holder's 'released'. Meanwhile only pull requests that need neither CUHelper nor a fixture app
land, through the **node-only** gate (`CU_INTEGRATOR_NODE_ONLY=1`). That gate runs phase 1 only and accepts phase 2's
steps marked `skipped=lock (node-only)`. Exceptions go through the coordinator (#36, a fixture change, CU-8 ruling).
After the release, one full run on main checks every node-only merge at once (`19a2c86ac`: all green).

Also run:

- `prove-failing` with a private `CU_HOME`, under the lock when it builds CUHelper, for a new or changed verifier that
  has a `mutants.mjs`. A verifier without one (`desktop-fixture`) is proven by reverting the change instead;
- a private ad-hoc `build.sh` plus `--selftest`, under the lock, when a change touches the Swift helper. It must show the
  new version, 38/38 checks and 0 capability calls;
- scope against the TEAM.yaml (the private roster) write scopes, and overlap with every other open pull request.

Every run uses a private `CU_HOME` under /tmp, so nothing touches the owner's `~/.computer-use`.

**The verdict is baseline-relative.** The same suite runs on main, cached per main commit. A pull request holds if any
test fails that passes on main, if a verifier passes on main but not on the pull request, or if any step was skipped.
After a merge whose tree equals the tested tree, the pull request's run becomes main's baseline. Results are keyed by the
merge tree, not the head alone: the same head on a main that moved with code is a new test. A node-only run is cached
under its own label and is never a baseline for a full run. A stale mutant find
text (`mutants-current`) holds the change until the verifier owner's update lands in the same merge (computer-use #3,
reflection #583).

Not run by this seat: the Chrome verifiers; `desktop-helper-boundary`, which shows the helper's indicator; live model
runs; desktop runs. The author or cu-verifier names that evidence (D-027).

## Landing without rebasing or force-pushing

- **computer-use:** `pr-merge.py --repo dtadpole/computer-use --head <branch> --title '<msg> (Fixes CU-n)' --expect-sha
  <tested head> --method merge`. Then the read-back: the merge commit's tree must equal the tested merge tree, and the
  head must be an ancestor of main. The issue then moves to Verify; the verifier closes it.
- **Main moving under a test:** if the new merge tree differs from the tested one in no
  `.mjs/.js/.cjs/.swift/.sh/.json/.plist/.py` file, the land goes ahead and expects the new tree. Otherwise it tests
  again.
- **Inbox before merging:** every message is read and saved. A message with hold wording in the same clause as the pull
  request's number stops the land (#531 merged while its author's hold was unread). Proximity matters because 'if #29
  needs the desktop' and, elsewhere in the message, 'steps 2-3 hold' is not a hold. The saved messages are scanned
  after each queue, so a 'released' or a new head read inside a land is not missed.
- **Holds outlive the message:** a message is read once, so a hold read inside one land was invisible to the next
  (computer-use #104 was stopped by hand, 23:25Z). Holds now go in a holds file. Every land checks it at its start and
  again before merging, records any pull request named with hold wording, and queues skip held ones. Only this seat
  removes an entry, on the author's or coordinator's release. Release wording ('please release the hold') is not a hold
  (#108 was held three minutes by that).
- **Batch mode (D-047):** from a batch's start to its end, nothing that touches the helper or a fixture app lands. The
  rest lands node-only.
- **Background chains** start as a single `nohup sh <script> &`. A compound `a && nohup b &` leaves a shell whose
  command line holds the script's text, and a wait that matches command lines then waits forever.
- **Pushes after testing:** the merge is pinned to the tested head (`--expect-sha`). A commit pushed after testing is
  not merged; it needs its own pull request (#13's third commit became #28).
- **Linear:** a merge with 'Fixes CU-n' moves CU-n to Verify, with a signed note; 'Refs CU-n' gets a note only. An issue
  already Done or Canceled is never moved back (CU-22 was, once, and was restored).
- **A break in another owner's checks:** the change holds until a companion change that holds both before and after
  lands first (#570 before #565), or lands in the same merge.
- **Load-sensitive tests** are reported to their owner with the reason, and the pull request is retried
  (`empty-scope.test.mjs:193`, fixed by #547; `:114`, reported).

## Baselines on main

| Main | Node suites | desktop-fixture | evaluation-suite | Sampled |
|---|---|---|---|---|
| `f82ee5f33` | 565/565 pass | 38/38 | 4/4 | 2026-11-02T08:51Z |
| `94f4e04c7` | 887/887 pass | 45/45 | 4/4 | 2026-11-02T11:59Z; every desktop verifier passes |
| `84fcc1a91` | 894/894 pass | 45/45 | 4/4 | 2026-11-05T13:00Z; after D-031 and helper 0.2.7; CUHelper `--selftest` 38/38 |
| reflection `64b513fbd` | 880 + macos-helper 33 + desktop-suite 9, all pass | 45/45 | 4/4 | 2026-11-05T15:22Z (frozen tree after #587; helper 0.2.12): integration 11/11, human-control 10/10, consent 10/10, helper-dryrun 8/8, helper-protocol 18/18, perception 12/12, action-contract 9/9, agent-loop 4/4, trajectory 6/6 |
| computer-use `2cc1b046a` | 877/880, plus macos-helper 33/33 and desktop-suite 9/9 | cannot run | cannot run | 2026-11-05T15:25Z; the 3 failing tests (verify-kit) and every verifier wait on CU-3 (shared verify runner) |
| computer-use `b3a32e451` | 880/880, plus macos-helper 33/33 and desktop-suite 9/9 | 45/45 | 4/4 | 2026-11-05T15:38Z, after #9 (CU-3): every desktop verifier runs in the new repo and passes |
| computer-use `19a2c86ac` | 918/918, plus macos-helper 33/33 and desktop-suite 10/10 | 50/50 | 4/4 | 2026-11-05T17:39Z, full check after the CU-8 batch and its eleven node-only merges; helper 0.2.16: helper-protocol 18/18, helper-dryrun 10/10, perception 12/12, action-contract 9/9, consent 10/10, agent-loop 4/4, trajectory 6/6, integration 11/11, human-control 10/10 |
| computer-use `940155e12` | 964/964, plus macos-helper 33/33 and desktop-suite 12/12 | 54/54 | 4/4 | 2026-11-05T23:09Z, after #100; helper 0.2.24 (#87, #65, #94): helper-protocol 18/18, helper-dryrun 14/14 (R10-R14), every other desktop verifier passes |

| history `7b589fa64` | 2023/2023, plus macos-helper 69/69 and desktop-suite 28/28 | 76/76 | 4/4 | 2026-11-08T04:36Z, the old repository's last main (#557; helper 0.2.51): every desktop verifier passes |

Rows before 8 Nov name commits of the private history repository (dtadpole/computer-use-history); this repository
starts at the scrubbed root `6314c0c`. Earlier rows are in the history repository's copy of this file.

## Read next

[`INDEX.md`](INDEX.md).
