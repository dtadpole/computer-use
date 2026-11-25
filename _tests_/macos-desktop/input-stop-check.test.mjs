import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { refusalOf } from '../../_tools_/agent-core/loop.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-791 (P2; found from the Last War seat's run 20261125T032015Z-66f569): a mid-action stop because an app outside the
// scope came to the front carries the helper's check word 'front'; the input path dropped it, so the CU-199 refusal field
// read only {reason: out_of_scope}. It now names the check, and the front app when the helper names one.
const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
}

async function stoppedDrag(stopAfter) {
  const started = await launchOnFake({ ...WORLD, quirks: { stopAfter } })
  await logged(started.child, 3)
  try {
    let refusal = null
    await assert.rejects(started.env.perform({ type: 'drag', path: [{ x: 50, y: 300 }, { x: 300, y: 300 }] }),
      (e) => { refusal = e; return e instanceof EnvironmentError && e.code === 'out_of_scope' })
    return refusal
  } finally {
    await started.env.close()
    await stopFake(started.child)
  }
}

test('CU-791: a front-app stop mid-drag records its check word and the front app in the refusal field', async () => {
  const refusal = await stoppedDrag({ at: 3, code: 'out_of_scope', check: 'front', bundleId: 'com.example.outside', message: "an app outside the scope came to the front; it is the person's" })
  assert.equal(refusal.details.check, 'front')
  assert.deepEqual(refusalOf(refusal), { reason: 'out_of_scope', check: 'front', bundleId: 'com.example.outside' })
  assert.equal(refusal.details.cancelledDrag, true, 'the cancelled drag is still told')
})

test('CU-791: with no bundle id from the helper, the check word alone is recorded', async () => {
  const refusal = await stoppedDrag({ at: 3, code: 'out_of_scope', check: 'front', message: "an app outside the scope came to the front; it is the person's" })
  assert.deepEqual(refusalOf(refusal), { reason: 'out_of_scope', check: 'front' })
})
