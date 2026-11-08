---
title: Consent limits - the routes the consent rules leave unjudged, named for the verdict
created: 2026-11-08T11:23:17Z
modified: 2026-11-08T13:09:00Z
level: L1
version: 0.2.2
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
- A bare "Reply" is free only with every entry on its page or window read empty (CU-157, live on both).
- A web page's own shortcut keys - a webmail's `#` deletes, `e` archives, Command-Enter sends - are judged by the
  focused element, not by what the page's script does with the key (CU-241, D-072; ChatGPT relies on the model's
  own confirmation here). A guard for a printable or Delete key outside a text input is measured on the fixture
  site before any decision.
- Its desktop twin: a key a view handles itself (a custom keyDown, web content inside an app) and a window button's
  own key equivalent are judged by their keys; only menu-bar items are read (CU-232's named limit, D-072).
- Owner-defined macOS Services - a shortcut on another chord, an item with another title - are not refused; the
  default ones are (CU-249). The helper sending a clicked menu item's path closes it (CU-250).
- A standing choice in an approved app's own dialog - 'Always Allow', 'Always Trust', "Don't ask again", 'Never for
  This Website' - is not asked until CU-258's fix; system prompts are refused (CU-76).
