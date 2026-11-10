import { isIP } from 'node:net'

/**
 * The site filter (design: site-filter.md). One function decides every URL the agent's browser may reach: the
 * policy for `navigate` and the foreground page, and the driver's `sitePolicy` at the network layer (R2, R32).
 *
 * Hosts are canonicalised before any match: the WHATWG parser folds numeric IPv4 forms, and every loopback alias
 * (127.0.0.0/8, localhost, *.localhost, ::1, IPv4-mapped 127/8, 0.0.0.0, ::) becomes the host `loopback`.
 */

/** Loopback ports no configuration can open: DSH Web, its gate, heddle (two builds), the gateway. */
export const FIXED_DENY_LOOPBACK_PORTS = Object.freeze([3080, 8080, 8082, 3097, 8088])
// CU-394 (cu-coordinator 02:57Z): a remote-desktop web client is a window onto another machine, like the remote_surface
// apps - denied whatever the allow list says (subdomains too).
export const FIXED_DENY_HOSTS = Object.freeze(['remotedesktop.google.com'])

const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])
const MATCH_SCHEME = Object.freeze({ 'http:': 'http', 'https:': 'https', 'ws:': 'http', 'wss:': 'https' })
const DEFAULT_PORT = Object.freeze({ http: 80, https: 443 })

/** Configuration the site filter refuses at start. */
export class SitePolicyConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SitePolicyConfigError'
    this.code = 'invalid_site_config'
  }
}

function ipv4Parts(text) {
  const parts = text.split('.').map(Number)
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null
}

function classifyIpv4(parts) {
  const [a, b] = parts
  if (a === 127 || (a === 0 && parts.every((n) => n === 0))) return 'loopback'
  if (a === 169 && b === 254) return 'link_local'
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
    return 'private'
  }
  return 'public'
}

/** Expand an IPv6 address (no brackets) to eight 16-bit numbers, or null. */
function ipv6Groups(text) {
  let head = text
  let tail4 = null
  const lastColon = text.lastIndexOf(':')
  if (text.slice(lastColon + 1).includes('.')) {
    tail4 = ipv4Parts(text.slice(lastColon + 1))
    if (tail4 === null) return null
    head = text.slice(0, lastColon + 1) + '0:0'
  }
  const halves = head.split('::')
  if (halves.length > 2) return null
  const toNums = (s) => (s === '' ? [] : s.split(':').map((g) => parseInt(g, 16)))
  const left = toNums(halves[0])
  const right = halves.length === 2 ? toNums(halves[1]) : []
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0
  const groups = [...left, ...Array(Math.max(fill, 0)).fill(0), ...right]
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null
  if (tail4 !== null) {
    groups[6] = (tail4[0] << 8) | tail4[1]
    groups[7] = (tail4[2] << 8) | tail4[3]
  }
  return groups
}

function classifyIpv6(groups) {
  if (groups.every((g) => g === 0)) return 'loopback' // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return 'loopback' // ::1
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  if (mapped) return classifyIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff])
  if ((groups[0] & 0xffc0) === 0xfe80) return 'link_local'
  if ((groups[0] & 0xfe00) === 0xfc00) return 'private'
  return 'public'
}

/**
 * Canonical form of a WHATWG hostname: `{ host, kind }`, where `kind` is `loopback`, `private`, `link_local`,
 * `public` (an IP) or `name`. Every loopback alias has `host` `loopback`.
 */
export function canonicalHost(hostname) {
  let host = String(hostname ?? '').toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  while (host.endsWith('.')) host = host.slice(0, -1)
  if (host === '') return { host: '', kind: 'name' }
  if (host === 'localhost' || host.endsWith('.localhost')) return { host: 'loopback', kind: 'loopback' }
  const family = isIP(host)
  if (family === 4) {
    const kind = classifyIpv4(ipv4Parts(host))
    return { host: kind === 'loopback' ? 'loopback' : host, kind }
  }
  if (family === 6) {
    const groups = ipv6Groups(host)
    const kind = groups === null ? 'public' : classifyIpv6(groups)
    return { host: kind === 'loopback' ? 'loopback' : host, kind }
  }
  return { host, kind: 'name' }
}

/** Parse a URL into the parts the filter matches on, or null when it does not parse. */
export function parseSiteUrl(url) {
  let parsed
  try {
    parsed = new URL(String(url))
  } catch {
    return null
  }
  const scheme = MATCH_SCHEME[parsed.protocol] ?? null
  const { host, kind } = canonicalHost(parsed.hostname)
  const port = scheme === null ? null : parsed.port === '' ? DEFAULT_PORT[scheme] : Number(parsed.port)
  return {
    protocol: parsed.protocol,
    scheme,
    host,
    kind,
    port,
    hasCredentials: parsed.username !== '' || parsed.password !== '',
    href: parsed.href,
  }
}

function passesWithoutNetwork(parts) {
  return parts.href === 'about:blank' || parts.protocol === 'data:' || parts.protocol === 'blob:'
}

/**
 * Whether the fixed deny list refuses a URL; no configuration lifts it. `extraPorts` adds loopback ports such as the
 * live view's. Anything that does not parse is denied.
 */
export function isFixedDenied(url, extraPorts = []) {
  const parts = parseSiteUrl(url)
  if (parts === null) return true
  if (!NETWORK_SCHEMES.has(parts.protocol)) return !passesWithoutNetwork(parts)
  if (parts.kind === 'link_local') return true
  const host = String(parts.hostname ?? parts.host ?? '').toLowerCase().replace(/\.$/, '')
  if (FIXED_DENY_HOSTS.some((denied) => host === denied || host.endsWith(`.${denied}`))) return true
  if (parts.kind === 'loopback') {
    return FIXED_DENY_LOOPBACK_PORTS.includes(parts.port) || extraPorts.includes(parts.port)
  }
  return false
}

/**
 * Parse an allow or block pattern `scheme://host[:port]`. `*.example.com` matches every subdomain at any depth but
 * not the apex; `*` may stand for the port. Loopback and private hosts need one exact origin.
 */
export function parsePattern(pattern) {
  const text = String(pattern ?? '').trim()
  const match = /^(https?|wss?):\/\/(\*\.)?([^/:]+|\[[0-9a-fA-F:.]+\])(?::(\*|\d{1,5}))?\/?$/.exec(text)
  if (match === null) throw new SitePolicyConfigError(`site pattern '${pattern}' is not scheme://host[:port]`)
  const scheme = MATCH_SCHEME[`${match[1]}:`]
  const wildcard = match[2] !== undefined
  const { host, kind } = canonicalHost(match[3])
  if (host === '' || host === '*') throw new SitePolicyConfigError(`site pattern '${pattern}' names no host`)
  if (kind === 'name' && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
    throw new SitePolicyConfigError(`site pattern '${pattern}' has an invalid host`)
  }
  if (kind === 'name' && /^[0-9.]+$/.test(host)) {
    throw new SitePolicyConfigError(`site pattern '${pattern}' is neither a full IP address nor a domain`)
  }
  const port = match[4] === undefined ? DEFAULT_PORT[scheme] : match[4] === '*' ? '*' : Number(match[4])
  if (port !== '*' && (port < 1 || port > 65535)) throw new SitePolicyConfigError(`site pattern '${pattern}' has an invalid port`)
  if ((kind === 'loopback' || kind === 'private') && (wildcard || port === '*')) {
    throw new SitePolicyConfigError(`site pattern '${pattern}': loopback and private hosts need one exact origin`)
  }
  if (wildcard && kind !== 'name') throw new SitePolicyConfigError(`site pattern '${pattern}': a wildcard needs a domain name`)
  return Object.freeze({ scheme, host, wildcard, port, kind })
}

function matches(pattern, parts) {
  if (pattern.scheme !== parts.scheme) return false
  if (pattern.port !== '*' && pattern.port !== parts.port) return false
  if (pattern.wildcard) return parts.kind === 'name' && parts.host.endsWith(`.${pattern.host}`)
  return pattern.host === parts.host
}

/** The origin pattern of a URL, as the default allow list and a `new_site` approval use it. */
export function originPattern(url) {
  const parts = parseSiteUrl(url)
  if (parts === null || parts.scheme === null || parts.host === '') return null
  const host = parts.host === 'loopback' ? '127.0.0.1' : parts.host.includes(':') ? `[${parts.host}]` : parts.host
  return `${parts.scheme}://${host}:${parts.port}`
}

/**
 * Build the site policy: a function `(url) => 'allow' | { block: reason }` with `isFixedDenied(url)` and
 * `allowOrigin(url)` attached. `allow` defaults to the start URL's origin; reasons are `malformed_url`,
 * `credentials_in_url`, `fixed_deny`, `blocked` and `not_allowed`.
 */
export function createSitePolicy({ startUrl = null, allow = null, block = [], extraDenyPorts = [] } = {}) {
  const allowSource = allow ?? (startUrl === null ? [] : [originPattern(startUrl)])
  if (allowSource.some((p) => p === null)) throw new SitePolicyConfigError('the start URL has no origin to allow')
  const allowed = allowSource.map(parsePattern)
  const blocked = block.map(parsePattern)
  const ports = extraDenyPorts.map(Number)
  const fixed = (url) => isFixedDenied(url, ports)

  function sitePolicy(url) {
    const parts = parseSiteUrl(url)
    if (parts === null) return { block: 'malformed_url' }
    if (parts.hasCredentials) return { block: 'credentials_in_url' }
    if (fixed(url)) return { block: 'fixed_deny' }
    if (!NETWORK_SCHEMES.has(parts.protocol)) return 'allow' // about:blank, data:, blob: (fixed() refused the rest)
    if (blocked.some((p) => matches(p, parts))) return { block: 'blocked' }
    if (allowed.some((p) => matches(p, parts))) return 'allow'
    return { block: 'not_allowed' }
  }
  sitePolicy.isFixedDenied = fixed
  /** Add the origin of a URL for the rest of the run (a person approved it as `new_site`). */
  sitePolicy.allowOrigin = (url) => {
    const pattern = originPattern(url)
    if (pattern === null || fixed(url)) return false
    allowed.push(parsePattern(pattern))
    return true
  }
  return sitePolicy
}
