import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-441 (High): patient-portal acts - medical orders and consent submit; cancelling a prescription or appointment deletes;
// joining a video visit, adding a proxy, sharing or releasing records ask permission. Grammar table rows. Click, Return and
// Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://portal.example/health'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Pharmacy', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-441: medical orders and consent submit; cancellations delete; visits, proxies and records ask permission', () => {
  const rows = [['Refill prescription', 'submit'], ['Request refill', 'submit'], ['Request prescription', 'submit'], ['Request appointment', 'submit'],
    ['Consent to treatment', 'submit'], ['Cancel prescription', 'delete'], ['Cancel appointment', 'delete'], ['Join visit', 'permission'],
    ['Start video visit', 'permission'], ['Add proxy', 'permission'], ['Grant proxy access', 'permission'], ['Share records', 'permission'], ['Release records', 'permission']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named: 'Sign consent form' asks permission (the signature rows lead; ruled submit - it asks either way).
  assert.equal(click('Sign consent form'), 'permission', 'signature class leads')
  for (const [name, cls] of [['Refill my prescription', 'submit'], ['Request a new appointment', 'submit'], ['Add a caregiver', 'permission']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-441 negatives: lists, summaries, results, messages and the proxy list stay free', () => {
  for (const name of ['Prescriptions', 'Appointments', 'Visit summary', 'Test results', 'Messages', 'Proxy access', 'Refill', 'Request']) assert.equal(click(name), 'allow', name)
})
