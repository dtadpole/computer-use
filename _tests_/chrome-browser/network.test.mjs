import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRequestHandler, decideRequest, FLOOR_SCHEMES } from '../../_environments_/chrome-browser/network.mjs'

const FIXTURE = 'http://127.0.0.1:43117'
const sitePolicy = (url) => (url.startsWith(FIXTURE) ? 'allow' : { block: 'not_allowed' })
const isFixedDenied = (url) => /:(3080|8088)\//.test(url)
const ctx = { sitePolicy, isFixedDenied }

test('allowed origin passes; anything else is blocked with the policy rule', () => {
  assert.deepEqual(decideRequest({ url: `${FIXTURE}/tasks/pickup` }, ctx), { allow: true })
  assert.deepEqual(decideRequest({ url: 'https://example.com/' }, ctx), { allow: false, rule: 'not_allowed' })
})

test('the fixed deny list wins over an allow', () => {
  const allowAll = { sitePolicy: () => 'allow', isFixedDenied }
  assert.deepEqual(decideRequest({ url: 'http://127.0.0.1:3080/' }, allowAll), { allow: false, rule: 'fixed_deny' })
  assert.deepEqual(decideRequest({ url: 'http://127.0.0.1:8088/v1/messages' }, allowAll), { allow: false, rule: 'fixed_deny' })
})

test('floor schemes are refused in page frames even if every policy allows them', () => {
  const permissive = { sitePolicy: () => 'allow', isFixedDenied: () => false }
  for (const scheme of FLOOR_SCHEMES) {
    const url = `${scheme}//x/y`
    assert.deepEqual(decideRequest({ url }, permissive), { allow: false, rule: 'fixed_deny' }, url)
  }
  assert.deepEqual(decideRequest({ url: 'file:///etc/hosts' }, permissive), { allow: false, rule: 'fixed_deny' })
})

test("chrome-extension requests pass only outside page frames", () => {
  const url = 'chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js'
  assert.deepEqual(decideRequest({ url, isPageFrame: false }, ctx), { allow: true })
  assert.deepEqual(decideRequest({ url, isPageFrame: true }, ctx), { allow: false, rule: 'fixed_deny' })
  assert.deepEqual(decideRequest({ url }, ctx), { allow: false, rule: 'fixed_deny' }, 'unknown frames count as page frames')
})

test('malformed URLs, throwing policies and odd answers fail closed', () => {
  assert.deepEqual(decideRequest({ url: 'not a url' }, ctx), { allow: false, rule: 'malformed_url' })
  assert.deepEqual(decideRequest({ url: `${FIXTURE}/` }, { sitePolicy: () => { throw new Error('boom') }, isFixedDenied }), { allow: false, rule: 'policy_error' })
  assert.deepEqual(decideRequest({ url: `${FIXTURE}/` }, { sitePolicy, isFixedDenied: () => { throw new Error('boom') } }), { allow: false, rule: 'policy_error' })
  for (const answer of [true, 'yes', undefined, null, {}, { block: '' }]) {
    assert.deepEqual(decideRequest({ url: `${FIXTURE}/` }, { sitePolicy: () => answer, isFixedDenied }), { allow: false, rule: 'policy_error' }, String(answer))
  }
  assert.deepEqual(decideRequest({ url: `${FIXTURE}/` }, { sitePolicy, isFixedDenied: () => 'yes' }), { allow: false, rule: 'fixed_deny' }, 'only false lets a URL past the fixed list')
})

test('the handler continues allowed requests, aborts blocked documents and fails other blocked requests, once each', async () => {
  const sent = []
  const blocked = []
  const handler = createRequestHandler({
    send: async (method, params) => sent.push([method, params]),
    sitePolicy, isFixedDenied,
    isPageFrame: (frameId) => frameId !== 'extension-frame',
    onBlocked: (entry) => blocked.push(entry),
  })
  await handler({ requestId: 'r1', request: { url: `${FIXTURE}/` }, resourceType: 'Document', frameId: 'main' })
  await handler({ requestId: 'r2', request: { url: 'http://blocked.example/after-redirect' }, resourceType: 'Document', frameId: 'main' })
  await handler({ requestId: 'r3', request: { url: 'chrome-extension://abc/x.js' }, resourceType: 'Script', frameId: 'extension-frame' })
  await handler({ requestId: 'r4', request: { url: 'https://tracker.example/pixel.gif' }, resourceType: 'Image', frameId: 'main' })
  assert.deepEqual(sent, [
    ['Fetch.continueRequest', { requestId: 'r1' }],
    ['Fetch.failRequest', { requestId: 'r2', errorReason: 'Aborted' }],
    ['Fetch.continueRequest', { requestId: 'r3' }],
    ['Fetch.failRequest', { requestId: 'r4', errorReason: 'BlockedByClient' }],
  ])
  assert.deepEqual(blocked.map((entry) => entry.url), ['http://blocked.example/after-redirect', 'https://tracker.example/pixel.gif'])
  assert.deepEqual(blocked[0], { url: 'http://blocked.example/after-redirect', rule: 'not_allowed', resourceType: 'Document', frameId: 'main' })
})

test('a recorder or transport failure never leaves a request unanswered or throws', async () => {
  const sent = []
  const handler = createRequestHandler({
    send: async (method, params) => { sent.push(method); throw new Error('socket closed') },
    sitePolicy, isFixedDenied,
    onBlocked: () => { throw new Error('recorder broke') },
  })
  assert.deepEqual(await handler({ requestId: 'r9', request: { url: 'https://evil.example/' } }), { allow: false, rule: 'not_allowed' })
  assert.deepEqual(sent, ['Fetch.failRequest'])
  assert.throws(() => createRequestHandler({ send: async () => {} }), TypeError)
})
