import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-495 (High; cu-coordinator 11:06Z): an e-signature asks permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const ENVELOPE = 'https://esign.example/envelope/42'
const at = (name, url = ENVELOPE, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-495: signing verbs ask permission anywhere, like Adopt and Sign', () => {
  assert.equal(at('Adopt and Sign'), 'permission')
  for (const name of ['Sign', 'Sign here', 'Click to sign', 'Agree and sign', 'Apply signature', 'Complete signing', 'Sign all']) {
    assert.equal(at(name, 'https://app.example/home'), 'permission', name)
    assert.equal(at(name, ENVELOPE, true), 'permission', `Space: ${name}`)
  }
})

test('CU-495: a bare Finish / Complete / Confirm asks permission on an e-signature URL only', () => {
  for (const url of [ENVELOPE, 'https://x.example/sign/abc', 'https://x.example/signing', 'https://x.example/esign?id=1']) for (const name of ['Finish', 'Complete', 'Confirm']) assert.equal(at(name, url), 'permission', `${name} on ${url}`)
  for (const url of ['https://app.example/home', 'https://x.example/signup', 'https://x.example/signature-help']) assert.equal(at('Finish', url), 'allow', url)
})

test('CU-495 negatives: review, next, decline, and the login rows keep their class', () => {
  for (const name of ['Review document', 'Next', 'Decline to sign']) assert.equal(at(name), 'allow', name)
  assert.equal(at('Sign in'), 'allow', 'Sign in keeps its login row')
  assert.equal(at('Sign up'), at('Sign up', 'https://app.example/home'), 'Sign up keeps its row')
})
