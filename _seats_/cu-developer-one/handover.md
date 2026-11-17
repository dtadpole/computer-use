---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-17T03:10:00Z
level: L1
version: 3.49.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 03:10Z, 17 November.

## Landed

- CU-483..561 (#633..#833), CU-462, CU-429; closed 16-17 Nov:
  CU-385 (#910/#919/#925), CU-413 (#934), CU-403 (#935, #940), CU-432 (#938), CU-364 (#946).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 (r11) #859. #851 awaits a ruling. To rebuild: #865 #877.
  Unbuilt: CU-578/579/582/583/584/587. In flight: #948 (CU-399). Filed: CU-598.
- METHOD: run `class-sweeps.mjs <class>` on main and the merge; cu-researcher's private sets decide. Build
  each class from a SOURCED, checked-in vocabulary (thesaurus / platform catalogue) x an object test, not
  regex growth; older classes lead (reclass CHANGED = narrowing, fix first).
- Rulings asked: 'Clear / Reset project'; three weak purchase CTAs; bare release verbs. Parked: 'Send <amount>' (after #847); own-storage exports (CU-573) for the ruling.

## Lessons

- Probe concrete objects (handles, hosts, emails, numbers, paths) and case variants before the first push.
- Build the CLASS, not the issue's examples: verb lexicons and synonym folds, object vocabularies read anywhere,
  wrappers stripped to a fixed point.
- A new broad class is a late UNION in the policy (after every row, only on a name nothing else classed), so it only
  adds; probes (CU-429 keep-refusal, brand strip) call it on derived names - test those (#854 r6, #859).
- EVERY node run goes through the run guard with the inbox checked in the same call; none from a phase-2 START until
  MERGED. The guard lives beside the worktree (`<worktree>.guard/`).

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
