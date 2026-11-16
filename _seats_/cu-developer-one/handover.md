---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-16T08:30:00Z
level: L1
version: 3.39.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 08:30Z, 16 November.

## Landed

- CU-483..561 table / canonical PRs (#633..#833), CU-462 (#742, #841), CU-429 rounds 2-5.

## Open (built before triage; cu-coordinator rules priority)

- OKs standing after cu-researcher's 08:13-08:17Z variant check: #843, #847, #851, #856 (both); #863, #865,
  #866 (first). RETRACTED (object / case variants): #846 (lower / upper case with a tail), #853 ('Sponsor @octocat',
  'Lease the 2024 Model Y'), #854 (r7 pushed: any token as object), #859 (r3 pushed: hosts, start + gerund), #862
  ('Set Ana as recovery contact', 'Unlink +1 555 0100', 'Make sam@partner.example the account owner'). Next: #862,
  #853, #846. Gerunds (CU-578) and concrete tails (CU-579) are families of their own.
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
