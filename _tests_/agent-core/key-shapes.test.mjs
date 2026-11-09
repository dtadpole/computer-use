import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { j } from '../fixture-shapes/shapes.mjs'

// CU-347 (High, cu-coordinator 14:23Z): an AWS secret access key, a Google API key and a credential assignment typed into
// any field asked nothing. Values are built from fragments at runtime (public hygiene).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const FIELD = { tag: 'input', inputType: 'text', role: 'textbox', name: 'Notes', editable: true }
const verdict = (text) => { const r = policy.classify({ type: 'type', text }, { url: 'https://app.example/settings', target: FIELD }); return r.decision === 'allow' ? 'allow' : r.class }
const AWS_SECRET = j('wJalrXUtnFEMI/K7MDENG/', 'bPxRfiCYEXAMPLEKEY')
const GOOGLE_KEY = j('AI', 'za', 'SyB', 'z'.repeat(32))

test('CU-347: an AWS secret, a Google API key and credential assignments ask sensitive_data', () => {
  for (const text of [AWS_SECRET, `aws_secret_access_key = ${AWS_SECRET}`, GOOGLE_KEY, `key=${GOOGLE_KEY}`, j('password', '=hunter2!'), j('TOKEN: ', 'tk_9f8e7d'), j('api_key: "', 'abc-123-def"'), j('client_secret=', 'x9Y8z7W6')]) {
    assert.equal(verdict(text), 'sensitive_data', text.slice(0, 12))
    assert.equal(looksSensitive(text), 'key')
  }
})

test('CU-347 negatives: prose about passwords and tokens, short values, ordinary long words', () => {
  for (const text of ['token: please see below', 'the password: is on the card', 'password = short', 'Lorem ipsum dolor sit amet consectetur adipiscing', 'AIza is not a key on its own', j('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn')]) {
    assert.equal(verdict(text), 'allow', text.slice(0, 20))
  }
})
