import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-264 (cu-researcher; cu-coordinator: High): whole-Mac tools are never operated, approval or not.
const TOOLS = ['com.apple.DiskUtility', 'com.apple.bootcampassistant', 'com.apple.MigrateAssistant', 'com.apple.backup.launcher', 'com.apple.TimeMachine', 'com.apple.ActivityMonitor']
const tmp = mkdtempSync(join(tmpdir(), 'cu-264-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-264: Disk Utility, Boot Camp, Migration Assistant, Time Machine and Activity Monitor are excluded as os_security, any case', () => {
  const exclusions = createExclusions()
  for (const id of TOOLS) {
    assert.equal(exclusions.isExcludedApp(id)?.kind, 'os_security', id)
    assert.equal(exclusions.isExcludedApp(id.toLowerCase())?.kind, 'os_security', `${id} lower-cased`)
  }
  for (const id of ['com.apple.Console', 'com.apple.TextEdit', 'com.apple.finder']) assert.equal(exclusions.isExcludedApp(id).excluded, false, `${id} stays operable (Console: a named limit, read-only)`)
})

test('CU-264: an approval cannot be given, and a click in Disk Utility is refused as an excluded target', () => {
  const store = createAppApprovals({ path: join(tmp, 'a.json') })
  for (const id of TOOLS) assert.throws(() => store.grantAlways(id, { by: 'api' }), /can never be approved/, id)
  const policy = createAppPolicy({ scope: [], approvals: store })
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { frontmostBundleId: 'com.apple.DiskUtility', target: { origin: 'com.apple.DiskUtility', role: 'AXButton', name: 'Partition', fingerprint: 'p' } })
  assert.equal(v.decision, 'block')
  assert.match(v.rule, /excluded/)
})
