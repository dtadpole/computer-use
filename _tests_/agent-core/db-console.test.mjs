import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-525 (High; cu-coordinator 21:36Z), table PR 32: a database console. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://db.example/project/abc/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-525: the ruled rows ask their class', () => {
  for (const [name, cls] of [['Disable RLS', 'permission'], ['Allow all IPs', 'permission'], ['Add 0.0.0.0/0', 'permission'], ['Disable SSL enforcement', 'permission'], ['Restore backup', 'delete'], ['Restore to point in time', 'delete'], ['Restore from backup', 'delete'], ['Reveal service role key', 'credential'], ['Show connection string', 'credential'], ['Copy connection string', 'credential']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
})

test('CU-525 negatives and older rows', () => {
  for (const name of ['Backups', 'RLS policies', 'Connection pooling', 'SSL certificate', 'View backups', 'Network restrictions']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Disable row level security').includes('permission'), 'older row unchanged')
})

test('#746 round 2 (cu-researcher 21:39Z): bare SSL, restore to this point, service_role', () => {
  for (const [name, cls] of [['Disable SSL', 'permission'], ['Turn off SSL', 'permission'], ['Restore to this point', 'delete'], ['Restore to the selected point', 'delete'], ['Show service_role key', 'credential'], ['Reveal service_role key', 'credential']]) assert.ok(classesOf(name).includes(cls), name)
  for (const name of ['SSL', 'Restore points', 'anon key', 'Show anon key']) assert.deepEqual(classesOf(name), [], name)
})

test('#746 round 2 (cu-developer-two 21:40Z): singular IP forms; database URI / URL', () => {
  for (const name of ['Allowlist any IP address', 'Allow any address']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Get database URI', 'Copy database URL', 'Show DB URL']) assert.ok(classesOf(name).includes('credential'), name)
  for (const name of ['Database URL format', 'IP address']) assert.deepEqual(classesOf(name), [], name)
})
