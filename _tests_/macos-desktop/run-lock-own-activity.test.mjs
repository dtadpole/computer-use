import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, holdDesktop, LAST_INPUT_NAME, OWN_ACTIVITY_SLACK_SECONDS } from '../../_environments_/macos-desktop/run-lock.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-204 (cu-researcher): a hold is idle-checked only when taken, and our input and the owner's reset the same idle
// counter. So a run inside the seat's own hold is admitted only when the idle time is older than the seat's own last
// activity - the hold's start or its runs' last posted input. Scratch locks, injected clocks and idle readers (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-own-activity-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const T0 = Date.parse('2026-11-07T22:00:00Z')
const holdLog = (dir) => (existsSync(join(dir, 'hold.log')) ? readFileSync(join(dir, 'hold.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const runIn = (dir, at, idle, extra = {}) => acquireDesktopRun({ seat: SEAT, runId: `r-${at}`, dir, commit: null, now: () => at, idleSeconds: () => idle, ...extra })
const heldAt = async (dir, at) => holdDesktop({ seat: SEAT, minutes: 30, dir, idleSeconds: () => 900, now: () => at })

test('CU-204: inside its own hold a run is admitted when nobody used the Mac since the hold began', async () => {
  const dir = scratch()
  await heldAt(dir, T0)
  const slot = await runIn(dir, T0 + 600_000, 720)
  slot.release()
  const admitted = holdLog(dir).filter((l) => l.action === 'run_admitted')
  assert.deepEqual(admitted.map(({ rule, idleSeconds }) => ({ rule, idleSeconds })), [{ rule: 'own_hold', idleSeconds: 720 }])
})

test('CU-204: input after the hold began - the owner came back - refuses the run inside the hold (owner_active, logged, no entry)', async () => {
  const dir = scratch()
  await heldAt(dir, T0)
  await assert.rejects(runIn(dir, T0 + 600_000, 30),
    (e) => e.code === 'resource_refused' && e.details?.reason === 'owner_active' && e.details?.sinceOwnSeconds === 600 && /30 s ago, after this seat's own last input or hold start 600 s ago/.test(e.message))
  assert.equal(existsSync(join(dir, 'run.json')), false, 'no run entry')
  const refused = holdLog(dir).filter((l) => l.action === 'refused')
  assert.deepEqual(refused.map(({ reason, rule, idleSeconds, sinceOwnSeconds }) => ({ reason, rule, idleSeconds, sinceOwnSeconds })), [{ reason: 'owner_active', rule: 'own_hold', idleSeconds: 30, sinceOwnSeconds: 600 }])
})

test('CU-204: the seat\'s own posted input moves the baseline - admitted when the idle time is at least that old (within the slack), refused when younger', async () => {
  assert.equal(OWN_ACTIVITY_SLACK_SECONDS, 2)
  const dir = scratch()
  await heldAt(dir, T0)
  let t = T0 + 60_000
  const first = await acquireDesktopRun({ seat: SEAT, runId: 'r1', dir, commit: null, now: () => t, idleSeconds: () => 960 })
  t = T0 + 120_000
  first.noteInput()
  first.release()
  t = T0 + 200_000
  first.noteInput()
  assert.deepEqual(JSON.parse(readFileSync(join(dir, LAST_INPUT_NAME), 'utf8')), { seat: SEAT, at: new Date(T0 + 120_000).toISOString() }, 'noted while running, not after release')
  ;(await runIn(dir, T0 + 300_000, 178)).release()
  await assert.rejects(runIn(dir, T0 + 300_000, 177), (e) => e.details?.reason === 'owner_active' && e.details.sinceOwnSeconds === 180, 'younger than our last input by more than the slack')
})

test('CU-204: a wall clock stepped back past the seat\'s own last stamp refuses (owner_idle_unknown) - a negative gap must not admit anything', async () => {
  const dir = scratch()
  await heldAt(dir, T0)
  await assert.rejects(runIn(dir, T0 - 60_000, 200), (e) => e.details?.reason === 'owner_idle_unknown' && /clock is behind/.test(e.message))
  assert.equal(existsSync(join(dir, 'run.json')), false)
  // CU-208: idle alone past the fresh-hold test admits whatever the clock says - a fresh hold reads no stamps either.
  ;(await runIn(dir, T0 - 60_000, 300)).release()
})

test('CU-208: input inside the hold no longer dead-ends it - once nobody has used the Mac for 300 s the next run is admitted own_hold; at 299 s it still refuses; the threshold is the rule\'s', async () => {
  const dir = scratch()
  await heldAt(dir, T0)
  const hourIn = T0 + 1_200_000 // 20 minutes in, inside the 30-minute hold
  await assert.rejects(runIn(dir, hourIn, 299), (e) => e.details?.reason === 'owner_active' && /no input for 300 s/.test(e.message))
  ;(await runIn(dir, hourIn, 300)).release()
  const admitted = readFileSync(join(dir, 'hold.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.action === 'run_admitted')
  assert.deepEqual(admitted.map(({ rule, idleSeconds }) => ({ rule, idleSeconds })), [{ rule: 'own_hold', idleSeconds: 300 }])
  ;(await runIn(dir, hourIn + 1, 120, { minIdleSeconds: 120 })).release()
})

test('CU-204: another seat\'s input record is not ours, and an unreadable idle time refuses inside the hold', async () => {
  const dir = scratch()
  await heldAt(dir, T0)
  writeFileSync(join(dir, LAST_INPUT_NAME), JSON.stringify({ seat: 'cu-verifier', at: new Date(T0 + 590_000).toISOString() }))
  await assert.rejects(runIn(dir, T0 + 600_000, 60), (e) => e.details?.reason === 'owner_active' && e.details.sinceOwnSeconds === 600, 'the baseline stays the hold start')
  for (const value of [null, NaN, -1, '900']) {
    await assert.rejects(runIn(dir, T0 + 600_000, value), (e) => e.details?.reason === 'owner_idle_unknown', String(value))
  }
})

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const box = (x, y, width, height) => ({ x, y, width, height })
const WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'CU Fixture', rect: box(0, 0, 800, 600) }],
  frontmost: FIXTURE,
  elements: [{ rect: box(100, 300, 100, 30), element: { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Save', frame: box(100, 300, 100, 30), secure: false } }],
}

test('CU-204: the driver notes every input request on the lock - posted or stopped part-way - and none for an observation', async () => {
  // A helper that refuses part-way replies; one that dies mid-request makes the request itself throw - both may have posted.
  for (const [quirks, refused] of [[undefined, false], [{ stopAfter: { at: 1, code: 'timeout' } }, true], [{ exitOn: 'input' }, true]]) {
    let notes = 0
    const seam = () => ({ release() {}, noteInput() { notes += 1 } })
    const { env, child } = await launchOnFake(quirks ? { ...WORLD, quirks } : WORLD, { runLock: seam })
    try {
      await logged(child, 3)
      await env.perform({ type: 'wait', ms: 1 })
      assert.equal(notes, 0, 'an observation posts nothing')
      const click = env.perform({ type: 'click', x: 140, y: 315, button: 'left' })
      if (refused) await assert.rejects(click)
      else await click
      assert.equal(notes, 1, refused ? 'a request stopped part-way is noted too' : 'a posted click is noted')
    } finally {
      await env.close().catch(() => {})
      await stopFake(child)
    }
  }
})
