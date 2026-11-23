import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, main, ownerIdleSeconds } from '../../_environments_/macos-desktop/run-lock.mjs'

// Idle (A) (cu-coordinator 14:48Z, settled 16:30Z / 16:32Z 10 Nov; contract with cu-developer-three): a waiting gate reads
// the owner's idle, but our own synthetic input resets HIDIdleTime. While a live run is ARMED (its helper's local-input
// stop is on, via eventTap) the owner's idle is now - max(admittedAt - idleAtStart, lastOwnerInputAt); anything else
// reads HIDIdleTime alone. Every test runs on a scratch lock with an injected idle reader and clock (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-idle-at-start-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const RUN = '20261111T201500Z-idlea1'
const T0 = Date.parse('2026-11-11T20:00:00.000Z')

/** A run admitted at `admittedIdle` seconds of idle, at T0, on a scratch lock; `clock.at` moves the shared clock. */
async function admitted(admittedIdle, extra = {}) {
  const dir = scratch()
  const clock = { at: T0 }
  const dead = new Set()
  const slot = await acquireDesktopRun({ seat: SEAT, runId: RUN, dir, commit: null, pid: 4242, isAlive: (pid) => !dead.has(pid), now: () => clock.at, idleSeconds: () => admittedIdle, ...extra })
  const read = (hid) => ownerIdleSeconds({ dir, now: () => clock.at, isAlive: (pid) => !dead.has(pid), idleSeconds: () => hid })
  return { dir, clock, dead, slot, read, entry: () => JSON.parse(readFileSync(slot.entryPath, 'utf8')) }
}

test('idle (A): the admission keeps the idle it read as idleAtStart (run-lock\'s own reader, whole seconds); noInput keeps none', async () => {
  const run = await admitted(400.7)
  assert.equal(run.entry().idleAtStart, 400)
  run.slot.release()
  const quiet = await admitted(12, { noInput: true })
  assert.equal('idleAtStart' in quiet.entry(), false, 'a noInput run reads no idle')
  quiet.slot.release()
})

test('idle (A) row: a run admitted at idle 400 s that then posts synthetic input counts 400 s plus elapsed while armed', async () => {
  const run = await admitted(400)
  assert.equal(await run.slot.mark({ armed: true }), true)
  run.clock.at = T0 + 90_000
  assert.deepEqual(run.read(1.2), { seconds: 490, rule: 'armed_run' }, 'HIDIdleTime 1.2 s is our own input')
  run.slot.release()
})

test('idle (A) row: the owner\'s own input, stamped while armed (a consent answer typed by hand included), restarts the count from that moment', async () => {
  const run = await admitted(400)
  await run.slot.mark({ armed: true })
  await run.slot.mark({ lastOwnerInputAt: T0 + 60_000 })
  run.clock.at = T0 + 100_000
  assert.deepEqual(run.read(0.5), { seconds: 40, rule: 'armed_run' })
  run.slot.release()
})

test('idle (A) row: not armed (never, or disarmed once its local-input stop is off) reads HIDIdleTime only', async () => {
  const run = await admitted(400)
  run.clock.at = T0 + 30_000
  assert.deepEqual(run.read(3.9), { seconds: 3, rule: 'hid' }, 'never armed')
  await run.slot.mark({ armed: true })
  assert.equal(run.read(3.9).rule, 'armed_run')
  await run.slot.mark({ armed: false })
  assert.deepEqual(run.read(3.9), { seconds: 3, rule: 'hid' }, 'disarmed: HIDIdleTime only')
  run.slot.release()
})

test('idle (A) row: a released run, or a run whose pid is gone, reads HIDIdleTime even if its record lingers', async () => {
  const run = await admitted(400)
  await run.slot.mark({ armed: true })
  run.clock.at = T0 + 30_000
  run.dead.add(4242)
  assert.deepEqual(run.read(7), { seconds: 7, rule: 'hid' }, 'a dead pid never extends idle')
  run.dead.delete(4242)
  run.slot.release()
  assert.deepEqual(run.read(7), { seconds: 7, rule: 'hid' }, 'released')
  assert.equal(await run.slot.mark({ armed: true }), false, 'mark is a no-op once released')
})

test('idle (A): an unreadable HIDIdleTime with no armed run gives seconds null; an armed run still stands in', async () => {
  const run = await admitted(400)
  assert.deepEqual(run.read(null), { seconds: null, rule: 'hid' })
  await run.slot.mark({ armed: true })
  run.clock.at = T0 + 1_000
  assert.deepEqual(run.read(null), { seconds: 401, rule: 'armed_run' })
  run.slot.release()
})

test('idle (A): mark takes only { armed: boolean, lastOwnerInputAt: epoch ms } and updates this run\'s entry only', async () => {
  const run = await admitted(400)
  for (const bad of [null, [], {}, { armed: 'yes' }, { lastOwnerInputAt: -1 }, { lastOwnerInputAt: Number.NaN }, { idleAtStart: 9999 }, { armed: true, seat: 'cu-verifier' }]) {
    await assert.rejects(run.slot.mark(bad), (e) => e.code === 'invalid_argument', JSON.stringify(bad))
  }
  const before = run.entry()
  await run.slot.mark({ armed: true, lastOwnerInputAt: T0 + 5 })
  const afterMark = run.entry()
  assert.deepEqual({ ...afterMark, armed: undefined, lastOwnerInputAt: undefined }, { ...before, armed: undefined, lastOwnerInputAt: undefined }, 'nothing else changes')
  assert.equal(afterMark.idleAtStart, 400, 'idleAtStart is never the seat\'s to set')
  run.slot.release()
})

test('idle (A): an idleAtStart outside [0, 86400], or a clock behind the admission, never stands in', async () => {
  const run = await admitted(400)
  await run.slot.mark({ armed: true })
  run.clock.at = T0 - 5_000
  assert.equal(run.read(2).rule, 'hid', 'clock behind the admission')
  run.slot.release()
  const long = await admitted(90_000)
  assert.equal('idleAtStart' in long.entry(), false, 'an idle above 86400 s is not kept')
  long.slot.release()
})

test('idle (A): status prints ownerIdle with its rule', async () => {
  const run = await admitted(400, { pid: process.pid })
  await run.slot.mark({ armed: true })
  const lines = []
  const code = await main(['status', '--dir', run.dir], { write: (line) => lines.push(line), seams: { idleSeconds: () => 2 } })
  assert.equal(code, 0)
  const { ownerIdle } = JSON.parse(lines[0])
  assert.equal(ownerIdle.rule, 'armed_run', 'the real clock is past T0')
  assert.ok(ownerIdle.seconds >= 400)
  run.slot.release()
})

test('idle (A): mark() calls apply in call order even when the mutex\'s waiters would retry out of order', async () => {
  // A sleep seam that wakes later callers first: without the per-slot chain, 'armed: false' could land before
  // 'armed: true' and leave a disarmed run claiming the armed formula (overstating the owner's idle).
  let pending = 0
  const reversing = () => new Promise((resolve) => setTimeout(resolve, 30 - Math.min(25, 5 * pending++)))
  const run = await admitted(400, { sleep: reversing })
  // The first call holds the mutex; the next two wait on it, and the seam wakes the later one ('armed: false') first.
  const calls = [run.slot.mark({ lastOwnerInputAt: T0 + 10 }), run.slot.mark({ armed: true }), run.slot.mark({ armed: false })]
  assert.deepEqual(await Promise.all(calls), [true, true, true])
  assert.equal(run.entry().armed, false, 'the last call wins')
  run.slot.release()
})

test('idle (A): lastOwnerInputAt never moves back - an older stamp written late keeps the newer one', async () => {
  const run = await admitted(400)
  await run.slot.mark({ armed: true })
  await run.slot.mark({ lastOwnerInputAt: T0 + 50_000 })
  await run.slot.mark({ lastOwnerInputAt: T0 + 20_000 })
  assert.equal(run.entry().lastOwnerInputAt, T0 + 50_000)
  run.clock.at = T0 + 60_000
  assert.deepEqual(run.read(0), { seconds: 10, rule: 'armed_run' })
  run.slot.release()
})
