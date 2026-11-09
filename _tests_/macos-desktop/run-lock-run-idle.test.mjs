import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, holdDesktop, OWNER_IDLE_SECONDS } from '../../_environments_/macos-desktop/run-lock.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// D-066 (cu-coordinator): the owner-idle rule follows input. A desktop run that can post synthetic input needs an idle
// Mac exactly as a fresh hold does (CU-191), unless it declares noInput or its seat already holds the Mac. D-068: there
// is no owner exemption until a physical confirmation exists. Every test runs on a scratch lock with an injected idle
// reader (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-run-idle-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const OTHER = 'cu-verifier'
const RUN = '20261107T222500Z-d066aa'
const holdLog = (dir) => (existsSync(join(dir, 'hold.log')) ? readFileSync(join(dir, 'hold.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const acquire = (dir, extra = {}) => acquireDesktopRun({ seat: SEAT, runId: RUN, dir, commit: null, ...extra })
const entryOf = (slot) => JSON.parse(readFileSync(slot.entryPath, 'utf8'))

test('D-066: a run that can post input, started within the window, refuses owner_active - no entry written, the refusal logged with its run id', async () => {
  const dir = scratch()
  await assert.rejects(acquire(dir, { idleSeconds: () => 42 }),
    (e) => e.code === 'resource_refused' && e.details?.reason === 'owner_active' && e.details?.idleSeconds === 42 && /42 s ago; a desktop run that can post input needs 300 s/.test(e.message) && /\(D-066\)/.test(e.message)
      && !/hold.*waits/.test(e.message))
  assert.equal(existsSync(join(dir, 'run.json')), false, 'no run entry')
  assert.deepEqual(holdLog(dir).map(({ action, reason, runId, idleSeconds }) => ({ action, reason, runId, idleSeconds })), [{ action: 'refused', reason: 'owner_active', runId: RUN, idleSeconds: 42 }])
  const idle = scratch()
  ;(await acquire(idle, { idleSeconds: () => 640.5 })).release()
  assert.deepEqual(holdLog(idle).map(({ action, rule, runId, idleSeconds }) => ({ action, rule, runId, idleSeconds })), [{ action: 'run_admitted', rule: 'idle', runId: RUN, idleSeconds: 640 }], 'a checked start logs the idle seconds it passed at')
})

test('D-066: an unreadable idle time refuses the run too (owner_idle_unknown); idle for the whole window it starts, the boundary is OWNER_IDLE_SECONDS', async () => {
  for (const value of [null, NaN, -1, '600']) {
    await assert.rejects(acquire(scratch(), { idleSeconds: () => value }), (e) => e.details?.reason === 'owner_idle_unknown' && /not started \(D-066\)/.test(e.message), String(value))
  }
  const slot = await acquire(scratch(), { idleSeconds: () => OWNER_IDLE_SECONDS })
  assert.equal(slot.entry.seat, SEAT)
  slot.release()
  await assert.rejects(acquire(scratch(), { idleSeconds: () => OWNER_IDLE_SECONDS - 0.1 }), (e) => e.details?.reason === 'owner_active')
})

const admitted = (dir) => holdLog(dir).filter((l) => l.action === 'run_admitted').map(({ rule, idleSeconds }) => ({ rule, idleSeconds }))

test('D-066: the two exemptions - noInput (recorded on the entry) and the seat\'s own live hold - start with the owner active and log which rule let them; D-068: an owner flag is none', async () => {
  const quietDir = scratch()
  const quiet = await acquire(quietDir, { idleSeconds: () => 5, noInput: true })
  assert.equal(entryOf(quiet).noInput, true, 'the entry says the run posts nothing')
  quiet.release()
  assert.deepEqual(admitted(quietDir), [{ rule: 'no_input', idleSeconds: undefined }])
  const dir = scratch()
  await holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => 900 })
  const held = await acquire(dir, { idleSeconds: () => 5 })
  assert.equal(entryOf(held).noInput, undefined)
  held.release()
  assert.deepEqual(admitted(dir), [{ rule: 'own_hold', idleSeconds: 5 }], 'CU-204: an own-hold admission reads, and logs, the idle time too')
  for (const claim of ['terminal', 'mcp', true]) {
    await assert.rejects(acquire(scratch(), { idleSeconds: () => 5, ownerRun: claim }), (e) => e.details?.reason === 'owner_active', `ownerRun ${JSON.stringify(claim)} exempts nothing (D-068)`)
  }
})

test('D-066: another seat\'s live hold refuses first (desktop_held), before any idle read; a scratch lock with no reader checks nothing', async () => {
  const dir = scratch()
  await holdDesktop({ seat: OTHER, minutes: 5, dir, idleSeconds: () => 900 })
  await assert.rejects(acquire(dir, { idleSeconds: () => { throw new Error('read the idle time') } }), (e) => e.details?.reason === 'desktop_held')
  const slot = await acquire(scratch())
  assert.equal(slot.entry.seat, SEAT, 'hermetic: no reader on a scratch lock')
  slot.release()
})

test('CU-191 follow-up (cu-verifier): a fresh hold\'s log line carries the idle seconds it was checked at, so the log proves it; an extension (not checked) carries none', async () => {
  const dir = scratch()
  const { token } = await holdDesktop({ seat: SEAT, minutes: 5, dir, idleSeconds: () => 912.7 })
  await holdDesktop({ seat: SEAT, minutes: 6, token, dir, idleSeconds: () => 3 })
  assert.deepEqual(holdLog(dir).map(({ action, idleSeconds }) => ({ action, idleSeconds })), [{ action: 'hold', idleSeconds: 912 }, { action: 'extend', idleSeconds: undefined }])
})

test('D-066: noInput is true or false', async () => {
  for (const [field, bad] of [['noInput', 'yes'], ['noInput', 1], ['noInput', null]]) {
    await assert.rejects(acquire(scratch(), { [field]: bad }), (e) => e.code === 'invalid_argument' && e.details?.field === field, `${field}=${JSON.stringify(bad)}`)
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

test('D-066: a noInput desktop run refuses every input action before the helper sees it, and still observes; noInput reaches the lock only when set', async () => {
  const asked = []
  const seam = (args) => { asked.push(args); return { release() {} } }
  const { env, child } = await launchOnFake(WORLD, { noInput: true, runLock: seam })
  try {
    await logged(child, 3)
    for (const action of [{ type: 'click', x: 140, y: 315, button: 'left' }, { type: 'type', text: 'x' }, { type: 'scroll', x: 140, y: 315, scrollX: 0, scrollY: 3 }]) {
      await assert.rejects(env.perform(action), (e) => e.code === 'resource_refused' && e.details?.reason === 'no_input_run' && /nothing was posted/.test(e.message), action.type)
    }
    await env.perform({ type: 'wait', ms: 1 })
    assert.equal(child.requests.filter((r) => r.type === 'input' || r.type === 'hitTest').length, 0, 'no input and no hit test reached the helper')
  } finally {
    await env.close().catch(() => {})
    await stopFake(child)
  }
  assert.equal(asked[0].noInput, true)
  const plain = []
  const started = await launchOnFake(WORLD, { runLock: (args) => { plain.push(args); return { release() {} } } })
  await started.env.close().catch(() => {})
  await stopFake(started.child)
  assert.deepEqual(Object.keys(plain[0]).sort(), ['runId', 'seat'], 'an unset noInput is not passed')
})
