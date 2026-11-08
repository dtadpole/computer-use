import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { CONFIRM_LINK_MARGIN_MS, launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { launchApproved, quiet, scratchLocks, stdioLink, stopFake } from './harness.mjs'

// CU-203 (physical-confirmation.md, Flow 2): with askOwner, a run refused owner_active launches the helper unscoped and
// lets the lock ask the owner's hardware click over it; the same link then carries the run. Hermetic: a scratch lock
// whose idle reader says the owner is at the Mac, and the fake helper standing in for the prompt (CU-117).

const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const HARDWARE = Object.freeze({ pid: 0, state: 1, tagged: false, hardware: true })
const ownerAtTheMac = () => scratchLocks({ idleSeconds: () => 5 })
const holdLog = (locks) => { const p = join(locks.dir, 'lock-1', 'hold.log'); return existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] }
const counting = (config) => {
  const s = { calls: 0, child: null }
  s.connect = async () => { s.calls += 1; const { child, link } = await stdioLink(config); s.child = child; return link }
  return s
}
const exited = (child) => new Promise((resolve) => { if (child.exitCode !== null || child.signalCode !== null) return resolve(true); child.once('exit', () => resolve(true)); setTimeout(() => resolve(false), 3000) })

test('CU-203: askOwner while the owner is at the Mac - the helper is launched then, asked confirmPhysical first (seat, task, the 60 s cap); a hardware confirmation starts the run on that same link, rule confirmed', async () => {
  const locks = ownerAtTheMac()
  const s = counting({ confirm: { outcome: 'confirmed', source: HARDWARE, confirmationId: 'c-9' } })
  let env
  try {
    env = await launchApproved(s.connect, { apps: [FIXTURE], seat: SEAT, runLock: locks.next(), askOwner: true, task: 'Fill the badge form' })
    assert.equal(s.calls, 1, 'one helper, one link: the run reuses it')
    const requests = await quiet(s.child)
    assert.equal(requests[0].type, 'confirmPhysical', 'asked before any other request, unscoped')
    assert.deepEqual({ seat: requests[0].seat, task: requests[0].task, timeoutMs: requests[0].timeoutMs }, { seat: SEAT, task: 'Fill the badge form', timeoutMs: 60_000 })
    assert.ok(requests.some((r) => r.type === 'scope'), 'the run went on to set its scope on the same link')
    const admitted = holdLog(locks).find((l) => l.action === 'run_admitted')
    assert.deepEqual({ rule: admitted?.rule, id: admitted?.confirmationId }, { rule: 'confirmed', id: 'c-9' })
  } finally {
    await env?.close().catch(() => {})
    if (s.child) await stopFake(s.child)
    locks.remove()
  }
})

test('CU-203: without askOwner an owner_active refusal launches nothing', async () => {
  const locks = ownerAtTheMac()
  const s = counting({ confirm: { outcome: 'confirmed', source: HARDWARE } })
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect: s.connect }), (e) => e.details?.reason === 'owner_active')
    assert.equal(s.calls, 0)
  } finally { locks.remove() }
})

test('CU-203: Cancel, the prompt\'s own refusals and an older helper all refuse not_confirmed with the helper\'s own code, and the helper launched for the prompt is closed', async () => {
  const cases = [[{ confirm: { outcome: 'cancelled', source: HARDWARE } }, 'cancelled'], [{ confirm: { refuse: 'busy' } }, 'busy'], [{ confirm: { refuse: 'no_display' } }, 'no_display'], [{ quirks: { noConfirm: true } }, 'unknown_request']]
  for (const [config, outcome] of cases) {
    const locks = ownerAtTheMac()
    const s = counting(config)
    try {
      await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect: s.connect, askOwner: true }), (e) => e.details?.reason === 'not_confirmed' && e.details.outcome === outcome, outcome)
      assert.equal(s.calls, 1, outcome)
      assert.equal(await exited(s.child), true, `${outcome}: the helper launched for the prompt is closed`)
      assert.equal(holdLog(locks).filter((l) => l.action === 'confirm_refused' && l.outcome === outcome).length, 1, outcome)
    } finally {
      if (s.child) await stopFake(s.child)
      locks.remove()
    }
  }
})

test('CU-203: a noInput run never asks; askOwner must be true or false', async () => {
  const locks = ownerAtTheMac()
  const s = counting({ confirm: { outcome: 'confirmed', source: HARDWARE } })
  let env
  try {
    env = await launchApproved(s.connect, { apps: [FIXTURE], seat: SEAT, runLock: locks.next(), askOwner: true, noInput: true })
    assert.equal((await quiet(s.child)).some((r) => r.type === 'confirmPhysical'), false)
    assert.equal(holdLog(locks).find((l) => l.action === 'run_admitted')?.rule, 'no_input')
  } finally {
    await env?.close().catch(() => {})
    if (s.child) await stopFake(s.child)
    locks.remove()
  }
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: () => { throw new Error('not reached') }, askOwner: 'yes' }), (e) => e.code === 'invalid_argument' && e.details?.field === 'askOwner')
})

test('CU-203: the channel waits past the prompt\'s cap, so the helper\'s own timeout answer arrives (the link\'s default is 30 s)', async () => {
  const locks = ownerAtTheMac()
  let asked = null
  const link = { request: async (type, fields, options) => { asked = { type, fields, options }; return { confirmed: false, outcome: 'timeout', source: null, confirmationId: 'c-t' } }, close() {} }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, runLock: locks.next(), connect: async () => link, askOwner: true }), (e) => e.details?.outcome === 'timeout')
    assert.deepEqual({ type: asked.type, timeoutMs: asked.options.timeoutMs }, { type: 'confirmPhysical', timeoutMs: 60_000 + CONFIRM_LINK_MARGIN_MS })
  } finally { locks.remove() }
})
