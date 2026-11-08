import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import net from 'node:net'

import { decideRequest } from './network.mjs'

/**
 * The second network layer (design: environment-behaviour.md, Network): a short-lived HTTP proxy on 127.0.0.1 in the
 * driver's process (D-009), which Chrome uses for everything (`--proxy-server`, `--proxy-bypass-list=<-loopback>`).
 *
 * Measured: browser-level `Fetch` never pauses WebSocket handshakes. Chrome tunnels `wss:` and `ws:` (and `https:`)
 * through `CONNECT host:port` and sends plain `http:` as absolute-URI requests, so every connection Chrome opens
 * reaches this proxy, where the same `sitePolicy` and floor rules decide it. With
 * `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, WebRTC can only use the proxy too. A refused
 * connection is answered 403 and recorded; it never reaches its target.
 */

/**
 * The URLs a proxied request is judged as. A tunnel carries no scheme - Chrome tunnels `https:`, `wss:` and `ws:`
 * alike - so `CONNECT host:port` is judged as both `http://host:port/` and `https://host:port/`; a plain request is its
 * absolute URI. Null when the target is malformed.
 */
export function proxiedUrls(method, target) {
  if (typeof target !== 'string' || target.length === 0) return null
  if (method === 'CONNECT') {
    const match = /^(\[[0-9a-fA-F:.]+\]|[^:/\s@]+):(\d{1,5})$/.exec(target)
    if (match === null) return null
    const port = Number(match[2])
    if (port < 1 || port > 65535) return null
    return [`http://${match[1]}:${port}/`, `https://${match[1]}:${port}/`].map((url) => new URL(url).href)
  }
  try {
    const url = new URL(target)
    return url.protocol === 'http:' || url.protocol === 'ws:' ? [url.href] : null
  } catch {
    return null
  }
}

/** One verdict for a proxied request: any fixed deny refuses, else any allowed candidate permits. */
export function decideProxied(method, target, { sitePolicy, isFixedDenied }) {
  const urls = proxiedUrls(method, target)
  if (urls === null) return { url: String(target), allow: false, rule: 'malformed_url' }
  const verdicts = urls.map((url) => ({ url, ...decideRequest({ url }, { sitePolicy, isFixedDenied }) }))
  const denied = verdicts.find((verdict) => verdict.rule === 'fixed_deny' || verdict.rule === 'policy_error')
  if (denied !== undefined) return denied
  return verdicts.find((verdict) => verdict.allow) ?? verdicts.at(-1)
}

/** Whether an IP address is loopback, private, link-local, carrier-grade NAT, unique-local or unspecified. */
export function isNonPublicAddress(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  const address = mapped ? mapped[1] : ip
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase()
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
  }
  return true // not an address: never treated as public
}

/**
 * Resolve the host once and check it (DNS rebinding): a name - not an IP literal and not localhost, which the site
 * policy already judges by name - that resolves to any non-public address is refused, so a public-looking allowed name
 * cannot reach loopback or the private network. The caller connects to the checked address, never resolving again.
 */
export async function checkedAddress(host, { lookup = (name) => dnsLookup(name, { all: true }) } = {}) {
  const bare = host.replace(/^\[|\]$/g, '')
  if (net.isIP(bare)) return { ok: true, address: bare }
  const isLocalhost = bare === 'localhost' || bare.endsWith('.localhost')
  let addresses
  try {
    addresses = (await lookup(bare)).map((entry) => entry.address)
  } catch {
    return { ok: false, rule: 'dns_unresolved', address: null }
  }
  if (addresses.length === 0) return { ok: false, rule: 'dns_unresolved', address: null }
  // IPv4 first: a server listening on 127.0.0.1 only must not be missed because localhost also resolves to ::1.
  addresses.sort((a, b) => Number(net.isIPv6(a)) - Number(net.isIPv6(b)))
  const nonPublic = addresses.find((address) => isNonPublicAddress(address))
  if (nonPublic !== undefined && !isLocalhost) return { ok: false, rule: 'dns_private_address', address: nonPublic }
  return { ok: true, address: addresses[0] }
}

/**
 * Start the proxy. `onBlocked({ url, rule, via: 'proxy' })` records refusals. Resolves to `{ port, address, close() }`.
 * `connectTo(host, port)` and `lookup(name)` are test seams for the outgoing connection and name resolution.
 */
export async function startProxy({ sitePolicy, isFixedDenied, onBlocked = () => {}, connectTo = (host, port) => net.connect(port, host), lookup } = {}) {
  const sockets = new Set()
  const decide = (method, target) => {
    const verdict = decideProxied(method, target, { sitePolicy, isFixedDenied })
    if (process.env.CU_PROXY_TRACE) process.stderr.write(`[proxy] ${method} ${target} -> ${verdict.allow ? 'allow' : verdict.rule}\n`)
    return verdict
  }
  const refuse = (url, rule) => {
    try {
      onBlocked({ url, rule, via: 'proxy', at: Date.now() })
    } catch {
      // A recorder that throws does not change the refusal.
    }
  }

  const server = http.createServer(async (req, res) => {
    const verdict = decide(req.method, req.url)
    const forbid = (url, rule) => {
      refuse(url, rule)
      res.writeHead(403, { 'content-type': 'text/plain', connection: 'close' })
      res.end('blocked by the computer-use site filter')
    }
    if (!verdict.allow) return forbid(verdict.url, verdict.rule)
    const target = new URL(req.url)
    const checked = await checkedAddress(target.hostname, lookup ? { lookup } : {})
    if (!checked.ok) return forbid(verdict.url, checked.rule)
    const headers = { ...req.headers }
    delete headers['proxy-connection']
    delete headers['proxy-authorization']
    const upstream = http.request({ host: checked.address, port: target.port || 80, method: req.method, path: target.pathname + target.search, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end()
    })
    req.pipe(upstream)
  })

  // CONNECT tunnels (https, wss, ws) and plain upgrades both arrive here as raw sockets.
  const tunnel = async (req, client, head, isConnect) => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => client.destroy())
    const verdict = decide(isConnect ? 'CONNECT' : req.method, req.url)
    if (!verdict.allow) {
      refuse(verdict.url, verdict.rule)
      client.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\ncontent-length: 0\r\n\r\n')
      return
    }
    let host
    let port
    if (isConnect) {
      const split = req.url.lastIndexOf(':')
      host = req.url.slice(0, split).replace(/^\[|\]$/g, '')
      port = Number(req.url.slice(split + 1))
    } else {
      const target = new URL(req.url)
      host = target.hostname.replace(/^\[|\]$/g, '')
      port = Number(target.port || 80)
    }
    const checked = await checkedAddress(host, lookup ? { lookup } : {})
    if (!checked.ok) {
      refuse(verdict.url, checked.rule)
      client.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\ncontent-length: 0\r\n\r\n')
      return
    }
    const upstream = connectTo(checked.address, port)
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    upstream.on('error', () => {
      if (isConnect && !client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\ncontent-length: 0\r\n\r\n')
      else client.destroy()
    })
    upstream.on('connect', () => {
      if (isConnect) {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      } else {
        const target = new URL(req.url)
        const lines = [`${req.method} ${target.pathname}${target.search} HTTP/1.1`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          if (!/^proxy-/i.test(req.rawHeaders[i])) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
        }
        upstream.write(lines.join('\r\n') + '\r\n\r\n')
      }
      if (head?.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
  }
  server.on('connect', (req, client, head) => tunnel(req, client, head, true))
  server.on('upgrade', (req, client, head) => tunnel(req, client, head, false))
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  let closed = false
  return {
    port,
    address: `127.0.0.1:${port}`,
    async close() {
      if (closed) return
      closed = true
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
