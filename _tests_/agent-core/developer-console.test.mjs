import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-510 (High; cu-coordinator 16:51Z), table PR 23: a developer console's key / OAuth widening asks. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://console.example/apis/credentials'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-510: the ruled rows and their verb families ask', () => {
  for (const name of ['Make key unrestricted', 'Set API key unrestricted', 'Unrestrict key', 'Give all scopes', 'Grant all permissions', 'Select all scopes', 'Allow all origins', 'Allow any origin', 'Disable CORS checks', 'Disable webhook signing', 'Turn off webhook signature verification', 'Allow localhost redirects', 'Enable loopback redirect URIs']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Add redirect URI', 'Add callback URL', 'Add a redirect URL', 'New redirect URI', 'Edit authorized redirect URIs']) {
    assert.ok(classesOf(name).includes('credential'), name)
    assert.ok(classesOf(name, true).includes('credential'), `Space: ${name}`)
  }
})

test('CU-510 negatives and older rows: listing and restricting stay free; the older asks keep their class', () => {
  for (const name of ['API keys', 'Restrict key', 'Scopes', 'Redirect URIs', 'Webhooks', 'Allowed origins']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Grant full access').length > 0, 'older row asks')
  assert.ok(classesOf('Turn off signature verification').length > 0, 'older row asks')
  assert.deepEqual(classesOf('Remove key restrictions'), ['delete'], 'the older remove row keeps its class (D-108); it asks')
})
