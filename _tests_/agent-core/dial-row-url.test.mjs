import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-476 (High; cu-coordinator 03:05Z): CU-443's dial-row page check reads the WHOLE web URL - a hash route, a query or a 'call.' host -
// and only an http(s) URL is a page.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const row = (url, extra = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'listitem', name: 'Alex Kim', ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-476: a verb-less row on a dialer page by hash route, query or host places a call (submit)', () => {
  for (const url of ['https://app.example/page/x#/call', 'https://app.example/page/x?page=call', 'https://call.example/page/x', 'https://app.example/call/page/x', 'https://app.example/Calls/x',
    'https://app.example/page/x#/calls']) assert.equal(row(url), 'submit', url)
  assert.equal(row('https://app.example/page/x#/voice', { rowContext: { hints: ['Call'] } }), 'submit', 'a Call hint on a voice hash route')
})

test('CU-476 negatives: other routes stay free; a desktop app: context is never a dialer page', () => {
  for (const url of ['https://app.example/page/x#/contacts', 'https://app.example/page/x?page=contacts', 'https://contacts.example/page/x', 'https://dialogflow.example/agents',
    'https://app.example/page/x?callback=done', 'https://recall.example/list']) assert.equal(row(url), 'allow', url)
  for (const url of ['app:com.apple.FaceTime', 'app:com.example.phone']) assert.equal(row(url, { role: 'AXRow' }), 'allow', `desktop ${url}`)
  assert.equal(row('app:com.example.phone', { inRow: true }), 'allow', 'a desktop context with inRow stays as today')
})
