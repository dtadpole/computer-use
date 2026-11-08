---
title: Consent limits - the routes the consent rules leave unjudged, named for the verdict
created: 2026-11-08T11:23:17Z
modified: 2026-11-08T18:29:05Z
level: L1
version: 0.2.9
description: The D-059 table's named limits (D-063) - routes the consent rules do not judge, on purpose or by parity, each with its issue; split out of consent-routes.md so the route table keeps its budget.
status: unverified
grounded_in:
  - source: consent-routes.md 1.0.11 (its Named limits section, moved here unchanged)
  - source: D-063 (a named limit is named in the verdict, not an open row) and D-072 (CU-241, a page's own shortcut keys)
  - source: CU-232 note 0.1.1 and menu-key.md (a window button's key equivalent, a view's own key handling)
---

# Consent limits

The named limits of the D-059 table (D-063): judged no further than said here, named in the verdict, never an open
row. The routes the rules do judge are in [consent-routes.md](consent-routes.md).

- Unnamed targets, drop points and default buttons are allowed, counted per batch.
- Scroll is not judged.
- A form without a submit button is judged by field name; a chat app's or compose-named field's Return asks (CU-253).
- A control's name is normalised before it is judged (CU-266, CU-268); one word mixing Latin with another script's
  letters asks (a disguised control). Not seen: a CJK glyph used as a look-alike, the braille blank, a word split
  once ('De lete'). A brand name mixing scripts asks (accepted over-ask).
- A bare "Reply" is free only with every entry on its page or window read empty (CU-157, live on both).
- A web page's own shortcut keys - a webmail's `#` deletes, `e` archives, Command-Enter sends - are judged by the
  focused element, not by what the page's script does with the key (CU-241, D-072; ChatGPT relies on the model's
  own confirmation here). A guard for a printable or Delete key outside a text input is measured on the fixture
  site before any decision.
- Its desktop twin: a key a view handles itself (a custom keyDown, web content inside an app) and a window button's
  own key equivalent are judged by their keys; only menu-bar items are read (CU-232's named limit, D-072).
- A default Services chord is refused (CU-249) unless one enabled app item binds it (CU-256). An owner-defined Service -
  another chord, another title - is refused by the helper's Services mark (CU-250).
- A Writing Tools item, or one naming another vendor's AI, is refused like a Service (CU-277); a read menu path decides.
  An approved app's own AI feature under its own menu counts as the app (named, cu-coordinator).
- A link to a non-web scheme - facetime:, tel:, mailto:, file:, an app's own - asks permission (CU-265); data: and
  blob: links ask too (accepted over-ask until they count as web schemes).
- A standing choice in an approved app's own dialog - 'Always Allow', 'Always Trust', "Don't ask again", 'Never for
  This Website', 'Set as Default', 'Always use this app', 'Do not ask me again', Finder's 'Change All…' - asks
  permission (CU-258). System prompts are refused (CU-76).
