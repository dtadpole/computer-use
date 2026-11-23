import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, ownerIdleSeconds } from '../../_environments_/macos-desktop/run-lock.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * Idle (A), both halves together: the real desktop-run lock (a scratch dir, an injected idle reader) and the driver on
 * the fake helper. The run's entry carries idleAtStart (the admission's own read), armed (an event-tap arm) and the
 * person's lastOwnerInputAt; ownerIdleSeconds reads 'armed_run' from them while HIDIdleTime says 0 (our own input), drops
 * to about 0 once the person touches the Mac, and the entry is gone after close.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-idle-a-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const box = (x, y, width, height) => ({ x, y, width, height })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: box(0, 0, 800, 600) }],
  frontmost: FIXTURE,
  elements: [{ rect: box(100, 300, 100, 30), element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: box(100, 300, 100, 30), secure: false } }],
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const entry = () => JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))

test('idle (A) end to end: the entry carries idleAtStart / armed / lastOwnerInputAt and ownerIdleSeconds reads armed_run', async () => {
  const runLock = (args) => acquireDesktopRun({ ...args, dir, commit: null, idleSeconds: () => 900 })
  const { env, child } = await launchOnFake({ ...WORLD, quirks: { localInputAfter: 1 } }, { runLock })
  try {
    await logged(child, 3)
    await pause(100)
    assert.equal(entry().armed, true)
    assert.equal(entry().idleAtStart, 900)
    const atArm = ownerIdleSeconds({ dir, idleSeconds: () => 0 })
    assert.equal(atArm.rule, 'armed_run')
    assert.ok(atArm.seconds >= 900, JSON.stringify(atArm))
    await assert.rejects(env.perform({ type: 'click', x: 140, y: 315, button: 'left' }), (e) => e.code === 'taken_over')
    await pause(200)
    assert.equal(typeof entry().lastOwnerInputAt, 'number')
    const afterInput = ownerIdleSeconds({ dir, idleSeconds: () => 0 })
    assert.equal(afterInput.rule, 'armed_run')
    assert.ok(afterInput.seconds <= 2, JSON.stringify(afterInput))
  } finally {
    await env.close()
    await stopFake(child)
  }
  assert.equal(existsSync(join(dir, 'run.json')), false, 'released')
  assert.equal(ownerIdleSeconds({ dir, idleSeconds: () => 0 }).rule, 'hid', 'no run: HIDIdleTime alone')
})
