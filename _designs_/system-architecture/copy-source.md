---
title: A copy carries its source field's class to the paste, and a text drag its press field's
created: 2026-11-07T17:10:00Z
modified: 2026-11-08T10:04:25Z
level: L1
version: 0.1.4
description: How text the run copies or drags out of a sensitive field is judged where it lands - the source field's name class travels with the run's own copy to its paste, and with a text drag to its drop - without reading anything the run does not read today.
status: unverified
grounded_in:
  - source: CU-183 (cu-researcher's finding and the five todo rows; cu-verifier's acceptance on the issue)
  - source: cu-researcher's red team of the sketch (clear only on a real write, every copy route, a page's own Copy button, the residual routes), 2026-11-07
  - source: paste-consent.md (CU-151's own-copy proof) and loop.mjs's recordCopy / ownCopy, main 1d7059a61
---

# A copy carries its source field's class to the paste

CU-179 judges a paste by its destination and value; neither sees text copied out of a sensitive field into an unnamed
box - what an injected instruction asks for ("copy the Passport field and paste it below"). So its class travels.

## Rule

1. **At a copy or cut of the run's own** - Command-C or -X, Edit > Copy or Cut, a context-menu Copy (CU-154's key
   equivalents) - agent core keeps the source field's role and name (never a value); the policy classes it by
   `insertedClass`'s name rules (a credential field or password name: `credential`; a bank, tax, secret or identity
   name: `sensitive_data`). A menu copy clicks a menu item, so the source is the field focused beside it, else the
   selection's holder; a menu, role-less or unreadable focus is an unknown source, whose paste asks (CU-196).
2. **It changes only on a real write.** Browser: the run buffer changed. Desktop: CU-151's change-count proof accepts the
   run's copies at the paste (the count rose by exactly their number), so the last one wrote what is pasted. An empty
   copy writes nothing and leaves the class; on the desktop it breaks the proof, so the paste asks as the owner's.
3. **At a paste of that copy** - Command-V, Edit > Paste, a context-menu Paste, Paste and Match Style - the source's class joins the verdict, whatever the destination is named
   (`context.paste.source`). With no desktop count the paste is the owner's and asks (CU-220).
4. **A drag pressed on a text entry** carries that entry's class to any drop off it - an entry, a contenteditable, a drop zone, a canvas; only a drop back inside the same entry (reordering) is exempt.
   Both points are in the drag's context (CU-140).

Nothing new is read: the pasteboard stays unread (D-031); the browser judges the run's buffer as today.

## Not covered (named)

- A page's own Copy button writes a clipboard the run does not paste: the browser pastes only its run buffer (D-011);
  on the desktop that write breaks the proof, so the paste is the owner's and asks (CU-151).
- A selection of shown text carries its caption's class ([copy-caption](copy-caption.md)); an unnamed entry's, none.
- A password field cannot be copied in the browser (the run buffer refuses it), so `credential` arrives by name.
- A menu copy with no readable source (web content in a native app; a helper before 0.2.45) is unknown; its paste asks even from a harmless
  page (safe side).

## Acceptance

CU-183's rows: into an unnamed entry, a copy from Passport or IBAN asks `sensitive_data`, from Password
`credential`, from Notes nothing; a text drag from IBAN asks (both drivers). Units: a newer Notes copy clears the class, an empty copy keeps it, an unproven
desktop copy asks, Edit > Paste carries it; a drag onto a role-less zone asks, within the entry not. Mutant: the source dropped at the paste. Live (cu-verifier): a prefilled
sensitive entry copied and pasted into Notes, same and cross origin, asks and the page receives nothing.
