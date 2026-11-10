import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-443's driver item (cu-coordinator 21:03Z, final shape): a verb-less row that starts a call asks submit - (b) dialHref on any
// page, (c) a call-verb hint on a /call|voice|phone|dial/ URL, (a) a bare row click on a /call|dial/ URL (fail closed; named
// over-ask: opening a profile from a dialer list). A list name alone is not a signal. Lands with the browser driver's read.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (target, url) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'listitem', name: 'Alex Morgan', ...target } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('dial row (b): a tel:/sip: href on or near the row asks submit on any page', () => {
  for (const url of ['https://crm.example/people/42', 'https://phone.example/contacts', 'https://app.example/settings']) assert.equal(press({ dialHref: true }, url), 'submit', url)
  for (const role of ['option', 'treeitem', 'row']) assert.equal(press({ role, dialHref: true }, 'https://crm.example/people'), 'submit', `role ${role}`)
})

test('dial row (c): a call-verb hint asks on a call / voice / phone / dial URL', () => {
  for (const url of ['https://phone.example/voice/people', 'https://x.example/phone/list']) assert.equal(press({ rowContext: { list: 'People', hints: ['Call'] } }, url), 'submit', url)
  assert.equal(press({ rowContext: { hints: ['Call'] } }, 'https://crm.example/contacts'), 'allow', 'a hint off a call URL')
})

test('dial row (a): a bare row click on a /call or /dial URL asks (fail closed); named over-ask - opening a profile there', () => {
  assert.equal(press({}, 'https://phone.example/call/recents'), 'submit')
  assert.equal(press({ role: 'row' }, 'https://phone.example/dial'), 'submit')
  assert.equal(press({ role: 'gridcell' }, 'https://phone.example/call'), 'submit')
})

test('dial row negatives: a /contacts or /settings URL without dialHref, a list name alone, message hints and non-rows stay free', () => {
  assert.equal(press({}, 'https://phone.example/contacts'), 'allow', '/contacts')
  assert.equal(press({}, 'https://phone.example/settings'), 'allow', '/settings')
  assert.equal(press({ rowContext: { list: 'Contacts' } }, 'https://phone.example/contacts'), 'allow', 'list name alone')
  assert.equal(press({ rowContext: { hints: ['Message', 'Email'] } }, 'https://phone.example/voice'), 'allow', 'message hints')
  assert.equal(press({ role: 'textbox' }, 'https://phone.example/call'), 'allow', 'an entry field is not a row')
})
