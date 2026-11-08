import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-145 / CU-152 (cu-researcher): every field contextFor gives must reach the class policy on the desktop - a rebuilt
// context once dropped dropTarget, so CU-140's drop rule never applied there. A sentinel field pins it structurally.

const FIXTURE = 'ai.reflection.cu.fixture'

test('the desktop class policy sees the whole context: a sentinel field, the drop point, the paste, with url desktop:// and the target', () => {
  const seen = []
  const appPolicy = createAppPolicy({
    scope: [FIXTURE],
    approvals: { covers: (bundleId) => bundleId === FIXTURE },
    createClassPolicy: () => ({ classify: (action, context) => { seen.push(context); return { decision: 'allow', class: null, classes: [], rule: 'stub', reason: '' } } }),
  })
  const target = { origin: FIXTURE, role: 'AXButton', name: 'OK' }
  appPolicy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:' + FIXTURE, target, frontmostBundleId: FIXTURE, task: 't', sentinel: 42, dropTarget: { name: 'Trash' }, paste: { fromOwner: true } })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].sentinel, 42, 'a field no rule reads today still arrives')
  assert.equal(seen[0].dropTarget?.name, 'Trash')
  assert.equal(seen[0].paste?.fromOwner, true)
  assert.equal(seen[0].url, 'desktop://')
  assert.deepEqual(seen[0].target, target, 'the judged copy (CU-266 normalises names; the posted action is untouched)')
})
