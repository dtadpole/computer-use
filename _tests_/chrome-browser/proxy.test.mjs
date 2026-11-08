import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { test } from 'node:test'

import { EventEmitter } from 'node:events'

import { checkedAddress, decideProxied, isNonPublicAddress, proxiedUrls, startProxy } from '../../_environments_/chrome-browser/proxy.mjs'
import { ip as ipv4 } from '../fixture-shapes/shapes.mjs'

// This suite opens loopback sockets (no browser, no network beyond 127.0.0.1).

test('proxied requests are judged as URLs: CONNECT as both schemes, plain requests as their absolute URI', () => {
  assert.deepEqual(proxiedUrls('CONNECT', 'example.com:443'), ['http://example.com:443/', 'https://example.com/'])
  assert.deepEqual(proxiedUrls('CONNECT', '127.0.0.1:43117'), ['http://127.0.0.1:43117/', 'https://127.0.0.1:43117/'])
  assert.deepEqual(proxiedUrls('CONNECT', '[::1]:8088'), ['http://[::1]:8088/', 'https://[::1]:8088/'])
  assert.deepEqual(proxiedUrls('GET', 'http://127.0.0.1:43117/a?b=1'), ['http://127.0.0.1:43117/a?b=1'])
  for (const [method, target] of [['CONNECT', 'example.com'], ['CONNECT', 'example.com:0'], ['CONNECT', 'example.com:70000'],
    ['CONNECT', 'user@example.com:443'], ['GET', '/relative'], ['GET', 'file:///etc/hosts'], ['GET', '']]) {
    assert.equal(proxiedUrls(method, target), null, `${method} ${target}`)
  }
})

test('a tunnel is allowed if either scheme is allowed, and refused if either is fixed-denied', () => {
  const ctx = {
    sitePolicy: (url) => (url.startsWith('http://127.0.0.1:43117/') ? 'allow' : { block: 'not_allowed' }),
    isFixedDenied: (url) => url.includes(':8088/'),
  }
  assert.equal(decideProxied('CONNECT', '127.0.0.1:43117', ctx).allow, true, 'a ws: connection to the http fixture')
  assert.deepEqual(decideProxied('CONNECT', 'evil.example:443', ctx), { url: 'https://evil.example/', allow: false, rule: 'not_allowed' })
  assert.equal(decideProxied('CONNECT', '127.0.0.1:8088', { ...ctx, sitePolicy: () => 'allow' }).rule, 'fixed_deny')
  assert.equal(decideProxied('CONNECT', 'nonsense', ctx).rule, 'malformed_url')
})

/** A target server that records every request and upgrade it receives. */
async function target() {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    res.end('hello from target')
  })
  server.on('upgrade', (req, socket) => {
    seen.push(`UPGRADE ${req.url}`)
    socket.end('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: upgrade\r\n\r\n')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { seen, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** Send raw bytes to the proxy and collect what comes back until the socket closes or a pause. */
function raw(port, text, { waitMs = 300 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    let data = ''
    socket.on('data', (chunk) => { data += chunk })
    socket.on('connect', () => socket.write(text))
    const finish = () => { socket.destroy(); resolve(data) }
    socket.on('close', finish)
    setTimeout(finish, waitMs)
  })
}

test('the proxy tunnels and forwards allowed traffic and refuses the rest before it reaches its target', async () => {
  const allowed = await target()
  const other = await target()
  const blocked = []
  const sitePolicy = (url) => (new URL(url).port === String(allowed.port) ? 'allow' : { block: 'not_allowed' })
  const proxy = await startProxy({ sitePolicy, isFixedDenied: () => false, onBlocked: (entry) => blocked.push(entry) })
  try {
    const tunnelled = await raw(proxy.port, `CONNECT 127.0.0.1:${allowed.port} HTTP/1.1\r\nhost: 127.0.0.1:${allowed.port}\r\n\r\nGET /through-tunnel HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`)
    assert.match(tunnelled, /^HTTP\/1\.1 200 Connection Established/)
    assert.match(tunnelled, /hello from target/)
    const forwarded = await raw(proxy.port, `GET http://127.0.0.1:${allowed.port}/plain?q=1 HTTP/1.1\r\nhost: 127.0.0.1:${allowed.port}\r\nproxy-connection: keep-alive\r\nconnection: close\r\n\r\n`)
    assert.match(forwarded, /hello from target/)
    const upgraded = await raw(proxy.port, `GET http://127.0.0.1:${allowed.port}/socket HTTP/1.1\r\nhost: 127.0.0.1:${allowed.port}\r\nconnection: upgrade\r\nupgrade: websocket\r\n\r\n`)
    assert.match(upgraded, /101 Switching Protocols/)
    assert.deepEqual(allowed.seen, ['GET /through-tunnel', 'GET /plain?q=1', 'UPGRADE /socket'])

    const refusedTunnel = await raw(proxy.port, `CONNECT 127.0.0.1:${other.port} HTTP/1.1\r\nhost: x\r\n\r\n`)
    const refusedPlain = await raw(proxy.port, `GET http://127.0.0.1:${other.port}/ HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n`)
    const refusedUpgrade = await raw(proxy.port, `GET http://127.0.0.1:${other.port}/ws HTTP/1.1\r\nhost: x\r\nconnection: upgrade\r\nupgrade: websocket\r\n\r\n`)
    for (const answer of [refusedTunnel, refusedPlain, refusedUpgrade]) assert.match(answer, /^HTTP\/1\.1 403/)
    assert.deepEqual(other.seen, [], 'a refused connection never reaches its target')
    assert.deepEqual(blocked.map((entry) => [entry.rule, entry.via]), [['not_allowed', 'proxy'], ['not_allowed', 'proxy'], ['not_allowed', 'proxy']])
  } finally {
    await proxy.close()
    await proxy.close()
    await allowed.close()
    await other.close()
  }
})

test('the proxy listens on 127.0.0.1 only and stops accepting after close', async () => {
  const proxy = await startProxy({ sitePolicy: () => 'allow', isFixedDenied: () => false })
  assert.match(proxy.address, /^127\.0\.0\.1:\d+$/)
  await proxy.close()
  const refused = await new Promise((resolve) => {
    const socket = net.connect(proxy.port, '127.0.0.1')
    socket.on('error', () => resolve(true))
    socket.on('connect', () => { socket.destroy(); resolve(false) })
  })
  assert.equal(refused, true)
})

test('non-public addresses: loopback, private, link-local, CGNAT, unique-local, unspecified, mapped IPv4', () => {
  for (const ip of ['127.0.0.1', ipv4(10, 1, 2, 3), ipv4(172, 16, 0, 1), ipv4(172, 31, 255, 255), ipv4(192, 168, 1, 1), ipv4(169, 254, 169, 254), ipv4(100, 64, 0, 1), '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isNonPublicAddress(ip), true, ip)
  }
  for (const ip of ['93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8']) assert.equal(isNonPublicAddress(ip), false, ip)
})

test('DNS rebinding: a name resolving to a non-public address is refused; literals and localhost are left to the site policy', async () => {
  const lookup = async (name) => ({ 'rebind.example': [{ address: '93.184.216.34' }, { address: '127.0.0.1' }], 'public.example': [{ address: '93.184.216.34' }], localhost: [{ address: '127.0.0.1' }] })[name] ?? []
  assert.deepEqual(await checkedAddress('rebind.example', { lookup }), { ok: false, rule: 'dns_private_address', address: '127.0.0.1' })
  assert.deepEqual(await checkedAddress('public.example', { lookup }), { ok: true, address: '93.184.216.34' })
  assert.deepEqual(await checkedAddress('127.0.0.1', { lookup }), { ok: true, address: '127.0.0.1' })
  assert.deepEqual(await checkedAddress('[::1]', { lookup }), { ok: true, address: '::1' })
  assert.deepEqual(await checkedAddress('localhost', { lookup }), { ok: true, address: '127.0.0.1' })
  assert.deepEqual(await checkedAddress('localhost', { lookup: async () => [{ address: '::1' }, { address: '127.0.0.1' }] }), { ok: true, address: '127.0.0.1' }, 'IPv4 first')
  assert.equal((await checkedAddress('nowhere.example', { lookup })).rule, 'dns_unresolved')
})

test('the proxy refuses a rebinding tunnel before connecting, and connects to the checked address otherwise', async () => {
  const blocked = []
  const connections = []
  const lookup = async (name) => (name === 'rebind.example' ? [{ address: ipv4(10, 0, 0, 5) }] : [{ address: '93.184.216.34' }])
  const connectTo = (host, port) => {
    connections.push([host, port])
    const socket = new EventEmitter()
    socket.destroy = () => {}
    setImmediate(() => { socket.emit('error', new Error('no network in tests')); socket.emit('close') })
    return socket
  }
  const proxy = await startProxy({ sitePolicy: () => 'allow', isFixedDenied: () => false, onBlocked: (entry) => blocked.push(entry), connectTo, lookup })
  try {
    const refused = await raw(proxy.port, 'CONNECT rebind.example:443 HTTP/1.1\r\nhost: rebind.example:443\r\n\r\n')
    assert.match(refused, /^HTTP\/1\.1 403/)
    assert.deepEqual(blocked.map((entry) => entry.rule), ['dns_private_address'])
    await raw(proxy.port, 'CONNECT public.example:443 HTTP/1.1\r\nhost: public.example:443\r\n\r\n')
    assert.deepEqual(connections, [['93.184.216.34', 443]], 'only the public name was connected, to the address that was checked')
  } finally {
    await proxy.close()
  }
})
