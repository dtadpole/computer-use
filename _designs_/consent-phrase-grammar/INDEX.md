---
title: Consent phrase grammar (draft)
created: 2026-11-10T15:40:00Z
modified: 2026-11-10T16:00:00Z
version: 0.3.1
description: Draft design note - replace agent-core's enumerated consent phrases with a verb-class x object-class grammar plus folding rules and free guards, so the next near form is caught by structure instead of a new filing. Doc only; cu-developer-one owns any code, cu-coordinator rules first.
grounded_in:
  - source: cu-coordinator's requests of 2026-11-10 14:14Z and 15:23Z (pattern of word-list Highs CU-408..422; draft the note now, doc only)
  - source: cu-coordinator's ruling of 2026-11-10 15:31Z on draft 0.1 (window ceiling, person objects, device class, plan accepted in principle)
  - source: cu-coordinator's rulings of 2026-11-10 15:34Z and 15:36Z on cu-developer-one's review (F1, F2, F3, F5; backup class)
  - source: Linear CU-386, CU-400, CU-401, CU-403, CU-404, CU-407..CU-422 (the rulings whose rows are replayed below)
  - source: _context_/team-operations/decision-log.yaml (D-099 both routes, D-106 keys judged by the click classifier, D-107)
---

# Consent phrase grammar (draft 0.3)

**State: draft 0.3. cu-coordinator's 15:31Z ruling on 0.1 and 15:34Z/15:36Z ruling on cu-developer-one's review (F1, F2, F3, F5, the backup class) are folded in, and the plan is accepted in principle. Code starts only after the open Highs land and cu-developer-one has reviewed 0.2. Nothing here is built.**

## Problem

Today agent-core decides most asks by matching a control's name against enumerated phrases (`policy.mjs` word heads
and regexes). On 10 Nov alone, fifteen High or Medium filings (CU-408 to CU-422) were the same defect: a missing
phrase or a near form of a ruled one. 'Turn on heater' asked but 'Turn on space heater' did not. 'Make public' asked
but 'Make repository public' did not. 'Rotate key' asked but 'Rotate keys' did not. Each fix added phrases, and each
review found new near forms (2 to 15 per PR).

## Proposal

Judge a name by structure: a **verb class** followed (within a small window) by an **object class** gives an ask
class. Folding rules normalise the name first, and free guards catch the safe readings. The grammar only adds asks.
Every existing rule stays as it is (15:08Z: a fix never lowers an older rule).

### Normalisation (folding rules)

1. Case, punctuation and hyphens fold (`Force-push` = `force push`, `eSign` = `e sign`).
2. Articles and possessives drop: a, an, the, my, your, our, their, this, these, that.
3. Plurals fold to the singular on every token (`keys` = `key`, `instances` = `instance`), but never on `-ss` or
   `-us` (`antivirus`).
4. Amounts and counts fold to one token `<n>` (`Refund $20`, `Leverage 10x`, `Admit 3 people`).
5. Parenthesised text drops (`Reserve table ($20 deposit)`).
6. A window of up to two filler or adjective tokens may stand between verb and object (`Turn on space heater`,
   `Drop the production database`, `Launch 3 instances`). Two is the ceiling, and the free guards are checked first (15:31Z).
7. Object-between forms: `make <noun> public`, `let <guest|visitor|them> in`.

### Verb classes (abridged; the full table is the inventory)

| Verb class | Verbs |
|---|---|
| destroy | delete, remove, drop, truncate, terminate, destroy, wipe, erase, purge, deactivate, close, cancel, clear, reset, factory reset, offboard, kick, force push, move to (trash) |
| cost | launch, create, provision, spin up, scale up |
| pay | pay, buy, purchase, order, book, reserve, rent, redeem, refund, reimburse, release, send, transfer, withdraw, cash out, tip, give, donate, pledge, renew, run, process, issue, raise, increase, approve, confirm, complete, place, bet, mint, bridge, convert, sell, swap, stake, deposit, bid, set up, switch to, reactivate, resume, capture, charge, gift |
| grant | grant, make, add, invite, assign, promote, admit, let, allow, trust, remember, authorize, leave, unlink, go (public), enable |
| act-as | impersonate, log in as, login as, sign in as, act as, view as |
| unguard | disable, turn off, pause, unprotect, remove |
| sign / agree / consent | sign, e-sign, adopt and sign, sign and submit, accept (terms), I consent, give consent |
| credential | add, create, new, generate, regenerate, rotate, reset, revoke, export, reveal, show, view, copy, get, download, print, link, connect, change, edit, update |
| physical-on / physical-off | unlock, open, start, remote start, turn on, preheat, light, buzz in, let / disable, disarm, turn off, pause |
| install | install, update, keep, open/run/download/install ... anyway, add (to Chrome), enable (extension), relaunch |
| send | vote, cast, resign, quit, decline, apply, enroll, file, submit, post, publish, broadcast, message, email, notify, text, deploy, end, rate, leave (review), repost, report, push, sync, join, answer, call, distribute, upload |

### Object classes and the ask table

| Verb class | Object class (examples) | Ask class |
|---|---|---|
| destroy | data: account, data, database, table, schema, collection, instance, server, cluster, VM, stack, environment, disk, repository, branch, booking, reservation, trip, appointment, user, employee, participant, download, file; devices (15:31Z): phone, laptop, Mac, iPad, device, computer | delete |
| cost | instance, cluster, VM, server | purchase |
| pay | money: payment, payroll, refund, invoice, card, limit, ticket, flight, hotel, room, car, trip, seat, table, credit, license, points, rewards, gift card, subscription, plan, position, liquidity, loan, offer, bid, known tokens (USDC ... MATIC), tip, fund, money; a person after pay, tip, send, give or transfer (15:31Z: `Tip the driver`, `Pay Jane`) | purchase |
| grant / act-as | access: owner, co-owner, admin, host, co-host, collaborator, member, access, guest, visitor, device, organization, team, workspace, public | permission |
| unguard | guard: protection, firewall, antivirus, Defender, FileVault, SIP, 2FA, alerts, accessibility | permission |
| sign / agree / consent | document, agreement, contract, form, consent, terms; records (release, share) | permission (a petition is submit) |
| credential | secret: key, token, credential, password, keychain, vault, secret, backup/recovery codes, bank account, card, PayPal, payment method, email, phone | credential |
| physical-on | door, garage, gate, car, engine, vehicle, oven, stove, heater, burner, fireplace, guest, visitor | physical |
| physical-off | alarm, camera, security | physical |
| install | extension, plugin, update, profile, helper, configuration, package, theme; any `... anyway` | install |
| send | ballot, vote, application, job, offer, taxes, return, review, stars, campaign, production, "all/everyone" | submit |

A few bare verbs are the act on their own, as a button: Destroy, Wipe, Broadcast, Vote, Resign, Pledge, Swap,
Trade, Stake, Deposit, Bid, Rent, Donate, Preheat, Admit, Impersonate, Kick, Offboard, Refund, Renew, Reactivate,
Factory reset, Buzz in, Remote start, Let in. `<pay verb> now` asks purchase (`Bid now`, `Sell now`, `Tip now`).

### Free guards (checked first)

- A trailing list or settings noun: settings, history, controls, FAQ, policy, rates, balance, details, notes,
  options, notifications, preferences (`Payroll settings`, `Change email preferences`).
- A bare plural noun is a list or tab (`Reposts`, `Gift cards`, `Instances`).
- Safe directions: turn off oven/stove/heater/burner/fireplace/engine; turn on lights, alarm, camera, security;
  lock; hide; cancel or turn off a payment or autopay.
- Settings-sense apply: Apply filters, Apply changes, bare Apply. `Sign in as guest`.
- Bare verbs that need context stay free and keep their context rules: Sell, Tip, Bet, Leverage, Long, Short
  (CU-409's asset context decides).

## Replay of the kept matrices

I extracted every ruled row from my kept matrices for CU-386, 400, 401, 403, 404 and 407 to 422: 424 ask rows and
160 free rows, from 20 matrices. I replayed them through a prototype of this grammar (`grammar-proto.py`, local only,
not in the tree).

| Run | Ask rows asked in the ruled class | Free rows free |
|---|---|---|
| First pass, written from the inventory before any tuning | 289 / 424 | 151 / 160 |
| After filling the verb and object tables from the rows (in-sample fit) | 424 / 424 | 160 / 160 |
| Held out v1 (0.1): 28 fresh near forms and 35 fresh negatives, written after the fit | 26 / 28 | 34 / 35 |
| **Held out v2 (0.2): 27 new near forms and 25 new negatives, written before the 0.2 changes** | **26 / 27** | **25 / 25** |
| 0.2 in-sample replay (regression) | 424 / 424 | 160 / 160 |

The in-sample line is a fit and proves nothing about new names. The held-out lines are the measure. v1 missed
`Wipe my phone` (no device object class yet) and `Tip the driver` (tip plus a person), and it over-asked on
`Refunds` (a bare plural tab, which a prototype exception let through to the refund rule). Each of the three is a table
entry or an ordering fix, not a new phrase. 0.2 folds them in as ruled at 15:31Z: the device class, person objects for
pay verbs, and the bare-plural guard ordered before the refund rule. Because those three came from held-out v1, v1
is no longer clean, so held-out v2 was written before the 0.2 changes and measured once after them. Its one miss is
`Delete all backups` (backup is not yet in the data class). It is reported here and left untuned, so it stays a
held-out result.

The grammar decides every one of the 424 ask rows and 160 free rows in the replay, except these, which stay outside it:

- **Older asks kept** (15:08Z): bare `Security` and `Privacy & Security` ask permission from older rules.
- **Superseded free rows**, where a later ruling made an earlier free row ask: `Rent` and `Renew` (CU-386, now
  CU-410), `List item` (CU-409 r2), `Leave a review` (CU-419) and `Reset password` (CU-411 r2).

Matrices outside the phrase grammar (CU-363 to CU-381, CU-392 to CU-398): these test keys, chords, focus, switch
direction and loop context, not names, so they stay as they are.

## What the grammar does not decide

- Context rules stay separate: CU-409's asset context, CU-412's default candidates, CU-373 and CU-418's switch
  direction, CU-157's textEntered. The grammar supplies the class of a named control; those rules supply the
  context.
- The class order (PRECEDENCE) and askEachTime for physical stay as they are.
- Desktop and web read the same names (D-099); Return and Space go through the click classifier (D-106).

## Plan (accepted in principle, 15:31Z)

1. cu-developer-one writes the tables as data (verb classes, object classes, the ask table, guards) beside the
   existing rules. The existing word lists stay; the grammar is an extra source of asks.
2. A conformance suite replays every kept matrix row (the 424 and 160 above) plus a held-out set that nobody tunes
   against. A mutant that drops one table entry must fail it (15:31Z).
3. Two weeks of sweeps on both routes. Then a Medium per word list proposes retiring the phrases the grammar
   already covers, each with its own matrix (a fix never lowers a rule silently).

## Rulings on 0.1 (cu-coordinator, 15:31Z)

1. Two filler tokens is the ceiling; the guards are checked first (`Delete old filter history` stays free on the
   `history` guard).
2. A person object counts as money context for pay verbs (`Tip the driver`, `Pay Jane` ask purchase).
3. A device class (phone, laptop, Mac, iPad, device, computer) joins data for destroy verbs (`Wipe my phone`,
   `Erase iPad` ask delete).
4. The plan is accepted in principle: additive only; a conformance suite with an untouched held-out set and a
   table-drop mutant; no phrase retires without two weeks of sweeps and its own Medium. Code starts after the open
   Highs land and cu-developer-one's review of 0.2.

## Held-out discipline

Each future filing adds its near forms to a new held-out set before any tuning pass. A set that has informed a
change is retired from measurement and kept only as regression rows. v1 is retired; v2 is the current measure.

## Review findings folded in 0.3 (cu-developer-one's review, cu-coordinator 15:34Z / 15:36Z)

### F1 - object homonyms need a sense table

Some object words have a risky sense and a harmless one. I measured the 0.2 prototype on a homonym list. It
over-asks on `Reset table view` (delete), `Clear table` (delete), `Show card` (credential), `Copy email`
(credential), `Change key` (credential), `Open order` (purchase) and `Post office` (submit). It stays free on
`Change sort order`, `Release notes`, `Record video`, `Edit profile`, `Flip card`, `Find a branch`, `Floor plan`
and `Raise rate limit`. The sense table resolves each homonym by its verb class, a qualifier, or a trailing UI noun:

| Object | Risky sense (asks) | Harmless sense (free) | Resolver |
|---|---|---|---|
| table | database table (destroy) | UI table, view, layout; restaurant table only with a pay verb | trailing UI noun (view, layout, column, row, filter, sort) is a free guard; `clear` needs a data qualifier |
| card | payment card (credential, pay) | UI card, flashcard | credential only with add, link, remove, or a qualifier (number, details, credit, debit) |
| email | address (credential: change, edit, update, remove, recovery) | a message (copy, email support) | credential only with the change family |
| key | API, SSH, GPG, access, deploy, security, secret key | keyboard key, music key | credential only with a key qualifier |
| profile | configuration profile (install) | user profile (edit, view) | install sense only with install, download |
| order | a purchase (place, submit, confirm) | sort order, open orders list | `open` is not a pay verb for order; sort order is a free guard |
| post | a verb at the start with nothing or an object after it | a noun before another noun (post office, post card) | a noun-noun pair is free |
| limit, invoice, branch, plan, record, release | pay, destroy or share senses as in the ask table | rate limit, view invoice, bank branch, floor plan, record video, release notes | qualifier or verb class, as listed |

### F2 - guards suppress grammar asks only

A free guard can only stop an ask that the grammar itself would add. It never removes an ask from an older rule.
The grammar runs after the existing rules and can only add classes, so every older ask survives (15:08Z), including
the over-asks that the 0.1 replay listed as superseded or older.

### F3 - bounded tokenising (CU-272 budget)

Names are cut to the first 12 tokens before folding. Tokenising is one linear pass with no backtracking regex, and
the tables are precompiled sets. Measured on the Python prototype: 40 us per name over the 584 replay names, and
202 us for a 48-word name. A JavaScript build with precompiled sets should be well under that, and inside the
CU-272 per-action classification budget. The conformance suite records this timing.

### Backup class (15:36Z)

backup, snapshot and archive join the data class. `Delete all backups`, held-out v2's one miss, now asks delete.
v2 informed that change, so v2 retires to regression rows, and the next filing's held-out set (v3) becomes the
measure.

### F5 - real-name false-positive rate

The cost of breadth is new over-asks on names that no current rule asks. F5 measures it on two sources. The first is
target names from recorded trajectories of real-site and real-app runs. The second is cu-developer-two's sweep
controls. The method runs the grammar and the current policy on each distinct (role, name), and counts the names
where only the grammar asks. A reader then marks each one as right (an under-ask the grammar catches) or false (an
over-ask). The proposed ceiling is at most 1 false new ask per 200 distinct real names; above it, the table entry
responsible is narrowed before any code lands.

No real-site trajectories exist (no model runs under D-034), and cu-developer-two's sweep names are curated. So the
real-name corpus is the English UI strings shipped in 25 installed Apple apps (Mail, Calendar, Notes, Music,
Photos, Maps, Home, Keynote, Pages, Numbers, System Settings and others). That gives 16,394 distinct strings of 1 to
5 words. It includes labels as well as buttons, so it is a stress test rather than a sample of clicked targets.

| Measure (0.3 prototype, untuned on this corpus) | Count |
|---|---|
| Strings the grammar asks on | 235 |
| ... that the current policy (main a1f3cb5e) already asks | 110 |
| ... grammar-only new asks | 125 |
| ... of those, right: under-asks the grammar catches | 50 |
| ... of those, false: new over-asks | **75, about 1 per 218 strings, just inside the 1-per-200 ceiling** |

The 75 false asks fall into a few clusters, each a sense-table entry rather than a phrase:

- `open` as a pay verb (12: Open Message, Open Project, Open Profile ...): limit `open` to trading objects
  (position, long, short).
- show, copy, edit or export with card, code or token (11): needs a qualifier (access, backup, recovery,
  verification code; card number or details; API token).
- add or make with item, point, credit, license, room, table, position or cap (14): these objects are money only
  after a pay verb.
- accept change(s), apply to all, and accept all in track changes (9): `change` and `all` leave the send objects.
- move to with a table or columns (4): needs trash or bin. View as (3): needs a person or user.
- cancel with a download or message, resume all, get all new mail, set up now, start audio (11): cancel is a pay
  verb only for subscription, plan or membership; the rest are bare-quantifier or UI forms.

The 50 right asks include strings that the current policy leaves free today:

- credential: `Update iCloud Account Password`, `Add Password`, `New Password`; access codes (`Change`, `Create`
  and `Edit Access Code` in Home) now ask permission, as CU-423 rules (15:50Z). Ruled classes win in the tables;
- permission: `Allow Photo Library Access`, `Make Playlist Public Anyway`;
- submit: `Message All Participants`.

Some are already covered by open PRs: update forms in #501, push in #477, star ratings in #538. The rest are
reported separately as a filing.

To keep this honest, the corpus that exposed these clusters is now spent, like a held-out set. After the sense
table is applied, F5 must be re-measured on a fresh corpus (other apps, or the first real-site trajectories).
