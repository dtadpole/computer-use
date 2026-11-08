---
title: Site filter
created: 2026-11-01T09:39:00Z
modified: 2026-11-08T09:30:55Z
level: L1
version: 0.7.2
description: The one function that decides every URL the agent's browser may reach - canonical hosts with loopback aliases folded, the fixed deny list, allow and block patterns with exact loopback ports, residual risks, and an allowed and a blocked test per alias.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-sdk-browser-toolset.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-isolation-and-approvals.md@1.0.0
  - source: cu-coordinator review of the 0.1 draft, inbox 20261101T093101 (loopback aliases bypass the deny list)
---

# Site filter (R2, R32)

`createSitePolicy(config)` in `agent-core/sites.mjs` returns one function, `(url) => 'allow' | { block: reason }`.
It serves [policy](action-policy.md) for `navigate` and the foreground page, and the driver's `sitePolicy` for every
request, redirect hop and popup at the network layer. Nothing else decides a URL.

## Canonicalisation, before any match

1. Parse with the WHATWG `URL` parser: hosts are lower-cased and IPv4 written as `2130706433`, `0x7f.1` or `127.1`
   becomes `127.0.0.1`. A trailing dot is dropped. URLs with credentials (`user@host`) are blocked.
2. The port is explicit or the scheme's default; `ws` matches as `http`, `wss` as `https`.
3. Every loopback alias becomes the host `loopback`: `127.0.0.0/8`, `localhost` and `*.localhost`, `::1`,
   IPv4-mapped `::ffff:127.0.0.0/104` in any notation, `0.0.0.0` and `::`.

## Decision order

1. **Fixed deny**, which no configuration lifts: `loopback` on ports 3080 (DSH Web), 8080 (DSH Web gate), 8082
   and 3097 (heddle), 8088 (gateway) and the live view's port; link-local `169.254/16` and `fe80::/10`; any
   scheme other than `http`, `https`, `ws` and `wss`, except `about:blank` and `data:` or `blob:` subresources.
   `isFixedDenied(url)` is exported for the driver's floor rules.
2. The configured `block` patterns.
3. The configured `allow` patterns, by default the start URL's origin only, plus origins a person approved for this
   run as `new_site`.
4. Anything else is blocked.

Patterns are `scheme://host:port`, matched on the canonical parts, never by prefix; `*.example.com` means every
subdomain at any depth but not `example.com` itself, and `*` may also stand for a port, **except on `loopback` and private addresses (`10/8`, `172.16/12`, `192.168/16`,
`100.64/10`, `fc00::/7`), where an allow pattern must be one exact origin**, because this Mac and its network run
many services. Those addresses are therefore denied unless a caller names the exact origin, as for the fixture site.
Patterns canonicalise too: `localhost:43117` and `127.0.0.1:43117` are one origin.

## Residual risks

- **Known gap until M2's proxy:** a public name that resolves to loopback or a private address (DNS rebinding)
  passes host matching. The driver's M2 proxy resolves names itself and refuses such addresses before connecting;
  until then the default allow list limits exposure, and each response's `remoteIPAddress` is checked afterwards.
- WebSocket and WebRTC traffic is not paused by `Fetch`; the driver's `INDEX.md` lists it.

## Tests (R51), with `allow: ["http://127.0.0.1:43117"]`

| URL | Expected |
|---|---|
| `127.0.0.1:43117`, and the aliases `localhost`, `app.localhost`, `[::1]`, `127.9.9.9`, `0.0.0.0`, `[::ffff:127.0.0.1]`, `2130706433` on port 43117 | allow |
| each of those eight hosts on 3080, 8080, 8082, 3097 and 8088, even with those ports added to `allow` | block, `fixed_deny` |
| `127.0.0.1:43118` | block, `not_allowed` |
| `http://<private-ip>/` and `http://<private-ip>:8080/`, for a host in `192.168/16` and one in `10/8` | block, `not_allowed` |
| `http://localhost:*`, or a host wildcard inside `10/8` on port 80, in `allow` | the configuration is refused at start |
| the link-local metadata address in 169.254/16, `file:///etc/hosts`, `chrome://settings`, `http://u@127.0.0.1:43117` | block |
| a fixture redirect to `localhost:8082` | blocked at the network layer, `blocked` event recorded |
