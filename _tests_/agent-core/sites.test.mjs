import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SitePolicyConfigError,
  canonicalHost,
  createSitePolicy,
  isFixedDenied,
  originPattern,
  parsePattern,
} from '../../_tools_/agent-core/sites.mjs'
import { ip } from '../fixture-shapes/shapes.mjs'

const FIXTURE = 'http://127.0.0.1:43117'
const ALIASES = ['127.0.0.1', 'localhost', 'app.localhost', '[::1]', '127.9.9.9', '0.0.0.0', '[::ffff:127.0.0.1]', '2130706433']

test('every loopback alias canonicalises to one host', () => {
  for (const host of ['127.0.0.1', '127.9.9.9', 'localhost', 'LOCALHOST.', 'a.b.localhost', '[::1]', '::1', '0.0.0.0', '::', '[::ffff:7f00:1]', '::ffff:127.0.0.1']) {
    assert.equal(canonicalHost(host).host, 'loopback', host)
  }
  assert.deepEqual(canonicalHost(ip(10, 1, 2, 3)), { host: ip(10, 1, 2, 3), kind: 'private' })
  assert.equal(canonicalHost(ip(172, 16, 0, 1)).kind, 'private')
  assert.equal(canonicalHost('172.32.0.1').kind, 'public')
  assert.equal(canonicalHost(ip(192, 168, 1, 1)).kind, 'private')
  assert.equal(canonicalHost(ip(100, 64, 0, 1)).kind, 'private')
  assert.equal(canonicalHost('fd00::1').kind, 'private')
  assert.equal(canonicalHost(ip(169, 254, 169, 254)).kind, 'link_local')
  assert.equal(canonicalHost('fe80::1').kind, 'link_local')
  assert.equal(canonicalHost('[::ffff:a9fe:a9fe]').kind, 'link_local')
  assert.deepEqual(canonicalHost('Example.COM.'), { host: 'example.com', kind: 'name' })
})

test('site-filter test table: aliases of the allowed fixture origin are allowed', () => {
  const policy = createSitePolicy({ allow: [FIXTURE] })
  for (const host of ALIASES) assert.equal(policy(`http://${host}:43117/tasks/x/`), 'allow', host)
})

test('site-filter test table: every alias on a fixed-deny port is blocked, even when allowed', () => {
  const policy = createSitePolicy({ allow: [FIXTURE, 'http://127.0.0.1:3080', 'http://localhost:8082'] })
  for (const port of [3080, 8080, 8082, 3097, 8088]) {
    for (const host of ALIASES) {
      assert.deepEqual(policy(`http://${host}:${port}/`), { block: 'fixed_deny' }, `${host}:${port}`)
      assert.equal(isFixedDenied(`http://${host}:${port}/`), true, `${host}:${port}`)
    }
  }
  assert.deepEqual(policy('ws://localhost:3080/socket'), { block: 'fixed_deny' })
})

test('site-filter test table: other ports, private hosts and link-local are refused', () => {
  const policy = createSitePolicy({ allow: [FIXTURE] })
  assert.deepEqual(policy('http://127.0.0.1:43118/'), { block: 'not_allowed' })
  assert.deepEqual(policy(`http://${ip(192, 168, 1, 1)}/`), { block: 'not_allowed' })
  assert.deepEqual(policy(`http://${ip(10, 0, 0, 5)}:8080/`), { block: 'not_allowed' })
  assert.deepEqual(policy(`http://${ip(169, 254, 169, 254)}/latest/meta-data`), { block: 'fixed_deny' })
  assert.deepEqual(policy('file:///etc/hosts'), { block: 'fixed_deny' })
  assert.deepEqual(policy('chrome://settings'), { block: 'fixed_deny' })
  assert.deepEqual(policy('javascript:alert(1)'), { block: 'fixed_deny' })
  assert.deepEqual(policy('http://u@127.0.0.1:43117/'), { block: 'credentials_in_url' })
  assert.deepEqual(policy('not a url'), { block: 'malformed_url' })
})

test('loopback and private patterns need one exact origin', () => {
  for (const bad of ['http://localhost:*', 'http://127.0.0.1:*', `http://${ip(10, 0, 0, '*')}:80`, 'http://*.localhost:43117', `http://${ip(192, 168, 1, 1)}:*`, 'http://*', 'ftp://example.com', 'example.com']) {
    assert.throws(() => createSitePolicy({ allow: [bad] }), SitePolicyConfigError, bad)
  }
  assert.equal(parsePattern('http://localhost:43117').host, 'loopback')
})

test('wildcards cover subdomains at any depth but not the apex; scheme and port must match', () => {
  const policy = createSitePolicy({ allow: ['https://*.example.com', 'https://example.org:*'], block: ['https://bad.example.com'] })
  assert.equal(policy('https://a.example.com/'), 'allow')
  assert.equal(policy('https://a.b.example.com/x'), 'allow')
  assert.deepEqual(policy('https://example.com/'), { block: 'not_allowed' })
  assert.deepEqual(policy('https://notexample.com/'), { block: 'not_allowed' })
  assert.deepEqual(policy('http://a.example.com/'), { block: 'not_allowed' })
  assert.deepEqual(policy('https://bad.example.com/'), { block: 'blocked' })
  assert.equal(policy('https://example.org:8443/'), 'allow')
  assert.equal(policy('wss://a.example.com/ws'), 'allow')
})

test('the default allow list is the start origin only; allowOrigin adds an approved new site', () => {
  const policy = createSitePolicy({ startUrl: `${FIXTURE}/tasks/pickup/` })
  assert.equal(policy(`${FIXTURE}/other`), 'allow')
  assert.equal(policy('http://localhost:43117/'), 'allow')
  assert.deepEqual(policy('https://example.com/'), { block: 'not_allowed' })
  assert.equal(policy.allowOrigin('https://example.com/path'), true)
  assert.equal(policy('https://example.com/other'), 'allow')
  assert.equal(policy.allowOrigin('http://localhost:8088/'), false, 'a fixed-deny origin cannot be approved')
  assert.equal(originPattern('http://[::1]:5000/x'), 'http://127.0.0.1:5000')
})

test('non-network subresources pass; the live view port joins the fixed deny list', () => {
  const policy = createSitePolicy({ allow: [FIXTURE], extraDenyPorts: [51234] })
  assert.equal(policy('about:blank'), 'allow')
  assert.equal(policy('data:image/png;base64,AAAA'), 'allow')
  assert.deepEqual(policy('http://localhost:51234/events'), { block: 'fixed_deny' })
  assert.equal(policy.isFixedDenied('http://127.0.0.1:51234/'), true)
  assert.equal(isFixedDenied('http://127.0.0.1:51234/'), false, 'the static list has no live-view port')
  assert.equal(isFixedDenied('https://example.com/'), false)
  assert.equal(isFixedDenied('%%%'), true)
})
