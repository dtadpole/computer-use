---
title: The browser driver follows the focus into a cross-origin frame and names the frame's URL
created: 2026-11-08T23:55:00Z
modified: 2026-11-08T23:55:00Z
level: L1
version: 0.1.0
description: "CU-300 (CU-297's driver half): focusedElement() describes the element focused inside a cross-origin iframe through the frame's own session, as inspectPoint already does for a point, keeping the iframe element whenever that read fails; every target inside a frame carries frameUrl (origin and path) and, through a cross-origin frame, its host's name; an editable frame body is an editable target."
status: proposed
grounded_in:
  - source: "CU-300 and cu-developer-one's ask (inbox 2026-11-08 23:47Z): (a) follow the frame session, (b) frameUrl, (c) an editable body"
  - source: "CU-297 note 0.1 (cu-developer-one) and its reviews - cu-researcher's amendment 3 (frameUrl judged in memory, never recorded), cu-verifier's live rows on the fixture site's card-frames and frame-editor pages (#171)"
  - source: "_environments_/chrome-browser/environment.mjs on main c7fb862 - inspectPoint and #insideFrame (lines 280-379), focusedElement (382-392), #describe (481-574); session.mjs #attachedFrame (307-323)"
---

# Frame focus (CU-300)

**Today.** `focusedElement()` runs `deepActiveElement` in the page's isolated world. That script descends through
same-origin frames and open shadow roots, but it stops at a cross-origin `<iframe>`, because the frame's document lives
in another renderer. So a CVV typed into Braintree's or Stripe's hosted field is judged against the iframe element and
its title. Agent core's frame-host rules (CU-297, #175) treat that title as the field's name; they are a fallback, and
they stay one. `inspectPoint` already looks inside such a frame through the frame session `session.mjs` keeps for it
(`page.frameSessions`, one level deep).

## The change (driver only)

1. **Follow the focus.** When the page's focus ends on an `IFRAME` or `FRAME` whose frame session is ready,
   `focusedElement()` runs the same `deepActiveElement` in that session's isolated world, and describes the result with
   the frame target and offset that `#insideFrame` uses. Both callers share one helper, so a field gets the same
   `fingerprint` and `fieldKey` from `inspectPoint` (the click) and `focusedElement` (the typing). The read is one level
   deep: a cross-origin frame inside the frame resolves to its own iframe element, and the frame-host rules judge that
   element.
2. **Fail closed to today's answer.** Whenever the read fails, the answer is the iframe element exactly as now, so the
   frame-host rules keep judging. Failure covers: no frame session, a session that is not ready, any protocol error, a
   read past 2 s, or a document whose focus is its plain `<body>`.
3. **`frameUrl`.** It is set on every target described inside a frame (same-origin or cross-origin, from either method)
   and absent on the top document. An http(s) frame gives its origin plus path, with no query, fragment or credentials.
   Any other scheme gives the scheme alone (`about:`, `data:`, `blob:`), so a `data:` URL never carries its payload.
   This lets CU-263 hand off `www.google.com/recaptcha/...` without a google.com-wide rule.
4. **`frameHost`.** It is set on a target read through a cross-origin frame (from either method) and holds the host
   element's `{ tag, role, name }`, the facts the frame-host rules read today. Then a field that names nothing itself
   (an unnamed hosted CVV input) can still be judged by its frame's title. Agent core decides how (cu-developer-one):
   proposed, the inner target is judged by its own name and by `frameHost.name`, and it asks if either asks.
5. **An editable body.** A frame `<body>` that is `isContentEditable`, or whose document is in `designMode`, is
   described as an editable target, named from its host's title or aria-label (CU-241's iframe editor). A non-editable
   body stays as in point 2, or null in a same-origin frame, as today.
6. **The frame's own form.** `defaultButton` (`#implicitSubmit`) is read in the frame target's world, so a Return in a
   hosted sign-in field names the frame's submit button. If that read fails, `defaultButton` is null, as today.

## Privacy and identity

`frameUrl` and `frameHost` stay outside the fingerprint and are never recorded, following cu-researcher's amendment 3:
a path can carry a checkout token. `recordedWebTarget` keeps recording only origin, role and the allowed name, and the
trajectory gains nothing. The fingerprint keeps its inputs: the frame target id and loader, the backend node, role,
name, tag and type. So a focus that moves from the host to the inner field between a proposal and its consent recheck
changes the fingerprint, and the recheck fails closed.

## Named limits

- Only one cross-origin level is followed.
- A same-origin frame inside the cross-origin frame takes the cross-origin frame's main world for its extra facts.
  That world cannot reach the element, so `textEntered` is null and the policy asks, as on the page today.
- An untransformed iframe is assumed for the box, as in `#insideFrame`.

## Tests

- **Unit, on `fake-cdp`.** The followed focus gives the inner field with `frameUrl`, `frameHost` and the same
  fingerprint as `inspectPoint`. Each failure in point 2 gives the host. A query, fragment, credentials or a `data:`
  payload is stripped from `frameUrl`. The editable body is named from the host. The frame's `defaultButton` is read.
- **Mutants.** Not following the frame fails the inner-field row. Keeping the query fails the `frameUrl` row.
  Answering null instead of the host on a failure fails the fallback rows.
- **Live smoke, real Chrome, fixture site** (D-005, one browser).
  - On a cross-site frame page with an entry (the card-frames page of #171 once it lands, else an entry added to
    `/frame-host`), focusing the inner entry gives its name, `frameUrl` and the same fingerprint as `inspectPoint`.
  - cu-verifier re-runs CU-297's card-frames and frame-editor rows once this lands. They must hold with the inner
    field's own name.
