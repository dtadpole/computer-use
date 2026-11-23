import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, CARRY_NAME, ownerIdleSeconds } from '../../_environments_/macos-desktop/run-lock.mjs'

// CU-720 (cu-coordinator 10:49Z): between runs the owner's idle was HIDIdleTime alone, which every HID-level event resets -
// another team's bridge's included - so back-to-back runs kept a D-066 gate under 300 s with nobody at the Mac. An armed
// run's owner-idle base now outlives its release while no event came since. Scratch locks, injected clock and reader (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-idle-carry-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const T0 = Date.parse('2026-11-23T11:00:00.000Z')

async function lock() {
  const dir = scratch()
  const clock = { at: T0 }
  const run = async (runId, admitIdle, { armed = true, owner = null, noInput = false } = {}) => {
    const slot = await acquireDesktopRun({ seat: SEAT, runId, dir, commit: null, pid: 4242, isAlive: () => true, now: () => clock.at, idleSeconds: () => admitIdle, noInput, minIdleSeconds: 0 })
    if (armed) await slot.mark({ armed: true })
    if (owner !== null) await slot.mark({ lastOwnerInputAt: owner })
    return slot
  }
  const read = (hid) => ownerIdleSeconds({ dir, now: () => clock.at, isAlive: () => true, idleSeconds: () => hid })
  return { dir, clock, run, read }
}

test('CU-720: after an armed run is released, the owner idle carries its base while HIDIdleTime still covers the time since the release', async () => {
  const l = await lock()
  const slot = await l.run('20261123T110000Z-carry1', 400)
  l.clock.at = T0 + 120_000
  slot.release()
  const carry = JSON.parse(readFileSync(join(l.dir, CARRY_NAME), 'utf8'))
  assert.deepEqual(carry, { since: T0 - 400_000, releasedAt: T0 + 120_000, seat: SEAT, runId: '20261123T110000Z-carry1' })
  l.clock.at = T0 + 180_000
  assert.deepEqual(l.read(61), { seconds: 580, rule: 'carried' }, 'the last event came before the release (our own input): 400 + 180 s')
  assert.deepEqual(l.read(59.4), { seconds: 59, rule: 'hid' }, 'an event after the release (a hand, another bridge, an unarmed run) ends the carry')
})

test('CU-720: the owner\'s own input stamped during the run is the base, never earlier', async () => {
  const l = await lock()
  const slot = await l.run('20261123T110000Z-carry2', 400, { owner: T0 + 30_000 })
  l.clock.at = T0 + 60_000
  slot.release()
  l.clock.at = T0 + 90_000
  assert.deepEqual(l.read(45), { seconds: 60, rule: 'carried' })
})

test('CU-720: nothing carries from an unarmed run, a noInput run, or a run with no kept idleAtStart', async () => {
  const l = await lock()
  const unarmed = await l.run('20261123T110000Z-carry3', 400, { armed: false })
  unarmed.release()
  assert.equal(existsSync(join(l.dir, CARRY_NAME)), false, 'unarmed: its local-input stop was off')
  const quiet = await l.run('20261123T110000Z-carry4', 400, { armed: false, noInput: true })
  quiet.release()
  assert.equal(existsSync(join(l.dir, CARRY_NAME)), false, 'noInput')
  const long = await l.run('20261123T110000Z-carry5', 90_000)
  long.release()
  assert.equal(existsSync(join(l.dir, CARRY_NAME)), false, 'an idle above 86400 s is never kept, so never carried')
  assert.deepEqual(l.read(30), { seconds: 30, rule: 'hid' })
})

test('CU-720: a carry older than 6 h, a clock behind its release, an unreadable HIDIdleTime or a malformed file never stands in', async () => {
  const l = await lock()
  const slot = await l.run('20261123T110000Z-carry6', 400)
  slot.release()
  l.clock.at = T0 + 6 * 3600 * 1000 + 1
  assert.equal(l.read(1e9).rule, 'hid', 'stale')
  l.clock.at = T0 - 1_000
  assert.equal(l.read(1e9).rule, 'hid', 'clock behind the release')
  l.clock.at = T0 + 10_000
  assert.deepEqual(l.read(null), { seconds: null, rule: 'hid' }, 'no HIDIdleTime, no carry')
  for (const bad of ['not json', '{"since":"x","releasedAt":1}', `{"since":${T0 + 99_000},"releasedAt":${T0}}`]) {
    writeFileSync(join(l.dir, CARRY_NAME), bad)
    assert.equal(l.read(1e9).rule, 'hid', bad)
  }
})

test('CU-720: chained runs keep the base - the next admission reads the carried idle, so its own armed formula continues it', async () => {
  const l = await lock()
  const first = await l.run('20261123T110000Z-carry7', 400)
  l.clock.at = T0 + 150_000
  first.release()
  l.clock.at = T0 + 160_000
  const second = await acquireDesktopRun({ seat: SEAT, runId: '20261123T110000Z-carry8', dir: l.dir, commit: null, pid: 4243, isAlive: () => true, now: () => l.clock.at, idleSeconds: () => 11, minIdleSeconds: 300 })
  const entry = JSON.parse(readFileSync(second.entryPath, 'utf8'))
  assert.equal(entry.idleAtStart, 560, 'admitted on 400 + 160 s, not on the 11 s HIDIdleTime our first run left')
  second.release()
  l.clock.at = T0 + 170_000
  await assert.rejects(acquireDesktopRun({ seat: SEAT, runId: '20261123T110000Z-carry9', dir: l.dir, commit: null, pid: 4244, isAlive: () => true, now: () => l.clock.at, idleSeconds: () => 2, minIdleSeconds: 300 }),
    (error) => error.code === 'resource_refused', 'an event after the last release (HIDIdleTime 2 s < 10 s since it) is the owner: D-066 refuses as before')
})

test("CU-720 r2 (cu-developer-three's case 19): an owner stamp still queued when release() runs is the carry's base - never the older one", async () => {
  const l = await lock()
  const slot = await l.run('20261123T110000Z-carry10', 400)
  l.clock.at = T0 + 60_000
  const queued = slot.mark({ lastOwnerInputAt: T0 + 58_000 }) // the owner's touch, not yet applied
  slot.release()
  assert.equal(await queued, false, 'the queued mark never lands after release')
  l.clock.at = T0 + 90_000
  const read = l.read(32)
  assert.ok(read.seconds <= 32, `at most the time since the touch, not 490 s: ${JSON.stringify(read)}`)
  assert.deepEqual(read, { seconds: 32, rule: 'carried' })
})

test("CU-720 r2 (cu-developer-three's case 20): the driver's close order - 'armed: false' queued, then release() - still carries; an awaited disarm does not", async () => {
  const l = await lock()
  const slot = await l.run('20261123T110000Z-carry11', 400)
  l.clock.at = T0 + 30_000
  const disarm = slot.mark({ armed: false }) // environment.mjs #close: queued, then the synchronous release on the next line
  slot.release()
  await disarm
  l.clock.at = T0 + 40_000
  assert.deepEqual(l.read(15), { seconds: 440, rule: 'carried' }, 'the run was armed through its last input')
  const other = await lock()
  const awaited = await other.run('20261123T110000Z-carry12', 400)
  await awaited.mark({ armed: false })
  awaited.release()
  assert.equal(existsSync(join(other.dir, CARRY_NAME)), false, 'a run disarmed before its release carries nothing (its later input would be unstamped)')
})
