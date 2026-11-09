---
title: '[cu] Linear workflow - states, fields, cadence, roles'
created: 2026-11-06T11:30:00Z
modified: 2026-11-09T13:06:32Z
level: L2
version: 1.3.0
description: 'How the [cu] team runs its work in Linear (team CU) - what each state means and who moves it, priorities, labels, templates, cycles, project updates, PR rules, owner questions, and every seat''s Linear duties.'
status: unverified
grounded_in:
  - source: owner 2026-11-06 0315 PST (research and set up how the team works with Linear; member workflow, roles and responsibilities)
  - source: _context_/team-operations/decision-log.yaml D-039 to D-042, D-049, D-053, D-055
  - source: Linear documentation at linear.app - docs/triage, docs/use-cycles, docs/github, docs/assigning-issues, docs/initiative-and-project-updates, developers/agent-best-practices
---

# [cu] Linear workflow

One unit of work is one CU issue. Every PR names its issue; every decision in
[decision-log.yaml](decision-log.yaml) names the issues it rests on. Linear holds the work (what, who, state,
priority, cycle); the records hold decisions, reviews, verdicts and run analyses; GitHub holds the code; the inbox
holds the conversation. Tool: `python3 <private-tools>/linear/linear.py --seat <seat>`
(`file`, `queue`, `mine`, `take`, `note`, `ask`, `pr`, `release`, `verified`, `reopen`, `show`; for dependencies
`block CU-a --by CU-b`; for the triage captain `triage`, `duplicate`, `decline`, `estimate`).

## Structure

| Linear object | [cu] use |
|---|---|
| Team | Computer Use (CU), workspace the team Linear workspace, timezone America/Los_Angeles |
| Initiative | Computer use on macOS (updates need the app's initiative scope - owner item) |
| Projects | one per open milestone: M7 helper and driver, M8 consent and human control, M9 DSH, heddle and evaluation; lead is the owner (an agent app cannot lead a project), updates are posted by cu-coordinator |
| Project milestones | the milestone's deliverables (for example "Take over and local-input pause") |
| Cycles | one week, Monday 00:00 PT to Sunday, no cooldown, two upcoming; unfinished issues roll over |
| Views | CU Kanban, CU By Agent, CU Recently Done, CU Owner asks, CU Triage, CU Verify queue, CU This cycle, CU Blocked, CU Stale |
| Templates | CU Bug, CU Safety hole, CU Parity gap, CU Evaluation item, CU Tooling, CU Owner question |

## States: meaning, entry, who moves it

| State | Means | Enters when | Moved by |
|---|---|---|---|
| Triage | filed, not yet accepted | `linear.py file` (every new issue) | cu-coordinator, within one 15-minute pass |
| Backlog | accepted, not planned this cycle | triage | cu-coordinator |
| Todo | planned and ready: acceptance checks written | cycle planning or mid-cycle pull | cu-coordinator; a seat picks it with `queue` |
| In Progress | one seat owns it (Agent label, Heddle as delegate) | `take` | the seat |
| In Review | a PR is open | GitHub automation | automation |
| Verify | the work is complete and waits for independent proof | a merged PR with `Fixes CU-n`, or the seat's note "complete: evidence ..." for non-code work | automation; for non-code work cu-coordinator on the seat's note until `linear.py submit` exists |
| Done | verified | `verified` with evidence | cu-verifier only; cu-coordinator closes the verifier's own deliverables |
| Canceled / Duplicate | dropped / same as another | triage or later | cu-coordinator, with a reason or the duplicate relation |

`reopen` returns an issue to In Progress with the failing evidence. A partial PR never moves an issue to Verify; if
automation does, cu-integrator moves it back.

## Fields

**Priority** (Linear's five levels; `linear.py --priority P0..P3`):

| Level | [cu] meaning | Response |
|---|---|---|
| Urgent (P0) | a consent, exclusion or privacy hole, or anything that touched the owner's data, apps or input | file with CU Safety hole, inbox cu-coordinator `--urgent`; runs that could hit it hold; jumps every queue |
| High (P1) | blocks an ULTIMATE_GOAL row, step 4, a live run or an evaluation batch; a red nightly | this cycle, next free seat |
| Medium (P2) | normal planned work | by cycle plan |
| Low (P3) | parity gaps and polish with no current test | Backlog until planned |

**Labels:** exactly one `Agent` label while In Progress (the seat doing it; `take` sets it, `release` clears it);
`Found by` (who filed it); one `Area` (the ULTIMATE_GOAL part); one `Type` (Bug, Improvement, Parity gap, Tooling);
`Owner ask` while a question waits on the owner.

**Assignee and delegate:** Linear keeps a human accountable, so the owner is the assignee of record and the Heddle
app is the delegate; the `Agent` label names the seat. The owner acts only on the CU Owner asks view.

**Estimates:** not used; plan by count and priority. Split instead: an issue whose work spans two seats, or whose
acceptance list would not fit one PR, becomes a parent with sub-issues (one per seat or PR); the parent closes when
its sub-issues are Done.

**Relations:** `blocks / blocked by` for real dependencies (shown in CU Blocked), `duplicate` when merging,
`related` for context. Mentioning another issue links it.

**Description** (the templates enforce it): what happens or what is wanted, evidence (run id, commit, helper
version), acceptance checks that can fail, links (decisions, PRs). **No owner data in Linear**: it is a third-party
service - no screenshots of the owner's windows, no clipboard or file contents, no secrets; fixture-app evidence only.

## The flow, by event

1. **Found something** - `linear.py file` with the matching template's sections and evidence; it lands in Triage
   with your `Found by`. Urgent: also inbox cu-coordinator `--urgent`.
2. **Triage** (cu-coordinator, every pass) - project, project milestone, priority, labels, state; duplicates
   related and closed; Urgent handled at once.
3. **Pick work** - `queue` (Todo in the cycle, unclaimed or yours), then `take`. At most two issues In Progress per
   seat. Safety-relevant or contract changes start with a design note reviewed by cu-verifier and cu-researcher.
4. **Progress** - `note` at each milestone of the work (evidence, not chatter). Blocked by another issue: add the
   relation and `note` it. Blocked on the owner: `ask` (adds Owner ask); keep working on something else (D-031).
   Stopping: `release` with where it stopped.
5. **Code** - branch `cu/<seat>-cu-<n>-<slug>`; PR title `Fixes CU-n` only on the PR that completes the issue,
   `Part of CU-n` (or `Refs CU-n`) on partial ones; `linear.py pr` links it; merge request to cu-integrator.
   A PR that mentions another issue only for context writes `skip CU-n` (Linear's GitHub automation otherwise links
   it and moves its state, as #231 moved CU-95 back on 6 Nov).
   Records, review and handover PRs carry no CU-n in their title or branch name (Linear links and moves an issue
   named there on merge, as CU-145 moved on 9 Nov); in a body, `Part of`, `Related to` or `Ref CU-n` links without
   moving. Never write fix, close or resolve before `#N` unless that PR is meant to close: GitHub closes it on merge
   (PR #274 on 9 Nov) - write `PR #N`.
6. **Merge** - cu-integrator lands after the two-phase gate; a complete PR moves the issue to Verify.
7. **Verify** - cu-verifier works the CU Verify queue every round: `verified` with the evidence (commit, run id,
   mutant) or `reopen` with the failing evidence. Never closes its own deliverables; cu-coordinator does.

## Cadence

| When | Who | What |
|---|---|---|
| every 15 minutes | cu-coordinator | Triage view empty; Verify queue older than an hour nudged; CU Stale (In Progress, no update 2 h) nudged, released after 6 h without a note; one member review |
| every round | every seat | `mine` and `queue` beside the inbox; notes on what moved |
| daily 10:00 UTC | cu-integrator | nightly no-model regression; red files a High issue with the failing step |
| Monday morning PT | cu-coordinator | close the cycle (done, rolled over, why); plan the new one in Todo by priority with two In Progress per seat at most; M7, M8, M9 project updates with health; owner summary in Chinese |
| when asked | owner | answer the CU Owner asks view; read the weekly project updates |

## Roles and responsibilities in Linear

| Seat | Linear duties |
|---|---|
| owner | answers Owner asks; lead of record for the projects; decides scope; owner items (GitHub app for dtadpole/computer-use, initiative scope) |
| cu-coordinator | triage captain (permanent); cycle planning and close; priorities; project updates; dedupe and relations; state hygiene (Stale, Verify age); closes cu-verifier's own deliverables; renews seat goals; never implements |
| cu-researcher | files findings, parity gaps and evaluation items (Found by), with cost estimates on model runs; red-teams design notes; logs run costs on the issue and the D-034 total |
| cu-developer-one | agent core and design: takes its issues, design notes first for contract changes, sub-issues for helper/driver halves |
| cu-developer-two | driver, live view, MCP and heddle: as above; files lock and harness issues it finds |
| cu-developer-three | CUHelper: as above; announces installs on the issue and the inbox; every helper PR names its issue |
| cu-verifier | owns Verify: `verified` / `reopen` with evidence; acceptance lists on design notes; never self-closes; the per-row verdict cites issues |
| cu-integrator | lands PRs; checks each PR names its issue with the right word; corrects automation mistakes (partial PR in Verify goes back); files the nightly's red |

## Records and Linear

Decisions stay in [decision-log.yaml](decision-log.yaml) (cite CU ids); member reviews in
`execution-review-log.jsonl`; the verdict in `_team_members_/cu-verifier/ultimate-goal-2-verdict.md`; run analyses
in `_context_/run-analysis/`. Linear comments carry links to them, not copies.
