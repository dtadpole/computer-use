---
title: Consent limits - the routes the consent rules leave unjudged, named for the verdict
created: 2026-11-08T11:23:17Z
modified: 2026-11-11T08:45:00Z
level: L1
version: 0.3.9
description: The D-059 table's named limits (D-063) - routes the consent rules do not judge, on purpose or by parity, each with its issue; split out of consent-routes.md so the route table keeps its budget.
status: unverified
grounded_in:
  - source: consent-routes.md 1.0.11 (its Named limits section, moved here unchanged)
  - source: D-063 (a named limit is named in the verdict, not an open row) and D-072 (CU-241, a page's own shortcut keys)
  - source: CU-232 note 0.1.1 and menu-key.md (a window button's key equivalent, a view's own key handling)
  - source: cu-coordinator's rulings of 10-11 Nov on CU-442, CU-443, CU-474, CU-476, CU-483, CU-485, CU-486 and CU-488, each closed live by cu-verifier with its run ids on the issue
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
- In an IDE, Run, Debug, Build, Test and their chords ask launch_code (CU-271); 'Build Settings…' over-asks. Typing
  into a terminal panel is refused by its name (E5); a localized label running node is not yet (CU-279).
- A link to a non-web scheme - facetime:, tel:, mailto:, file:, an app's own - asks permission (CU-265).
- In a known messaging app (Messages, Slack, Teams, WhatsApp, Telegram, Discord, Signal) any compose field asks on
  Return, whatever its name; elsewhere the name decides.
- Names are judged in English and Chinese, Simplified and Traditional (#145): 发送 / 傳送, 移到废纸篓 / 丟到垃圾桶,
  a field named 密码 or 身份证号, Firefox's 记住此决定 (#151). Other languages go unasked. Secure fields, key equivalents, file extensions and excluded apps do not depend on it.
- Some rows are bound to the page, and the page is read from its URL (a title is private and never reaches the
  policy); off that URL they stay free. A bare 'Add time' asks purchase only on a parking, charging or meter URL
  (CU-442). 'Start recording' asks permission only on a call, voice or phone URL (CU-443). 'Edit DNS', 'Update DNS',
  'Change DNS' and '... DNS records / settings' ask permission only on a registrar, domain or DNS URL (CU-485). A bare
  'Sell' and the brokerage rows ask only on a trading URL, read with a whole-segment edge
  (/trade, /order, /brokerage, /portfolio) so '/trade-in' or a marketplace 'Sell' stays free (CU-483). 'Turn off
  auto-lock' asks permission on a password-vault URL; a door's auto-lock stays physical everywhere (CU-474, CU-468).
  Only an http(s) URL counts as a page (CU-476); a 'call.' host cannot be run locally and is named, not measured.
- A verb-only control takes its setting's label as its name when the label is its quiet sibling in a two-part row
  (a span, <dt>/<dd>, a table row, aria-labelledby) (CU-488). A verb-only button under a section heading with text
  between is not read that way and goes by its bare verb.
- 'Grant <n> more minutes' and 'Give <n> more minutes' are not bound to the screen-time row; they keep the older
  permission ask on every page (CU-485).
- Compound spellings (autolock, e-mail, log-in, e-sim, optin, checkin, add-on) are tried only for names of 200
  characters or fewer, so the 80k-character budget holds (CU-486, CU-272).
- An older class is kept when a new row would give another ('Click to add deploy key' asks submit, not credential):
  the name asks either way. Turning off biometric unlock on a vault page stays free - it leaves the master password as
  the only way in (CU-474).
- A standing choice in an approved app's own dialog - 'Always Allow', 'Always Trust', "Don't ask again", 'Never for
  This Website', 'Set as Default', 'Always use this app', 'Do not ask me again', Finder's 'Change All…' - asks
  permission (CU-258). System prompts are refused (CU-76).
