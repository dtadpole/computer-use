import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { acquireDesktopRun, CONFIRM_BACKOFF_MS, CONFIRM_WAIT_MS, CONFIRMING_NAME, holdDesktop } from '../../_environments_/macos-desktop/run-lock.mjs'

// CU-203 (physical-confirmation.md, the lock half): while the owner uses the Mac, a run that would post input starts
// only on his hardware click, which the lock asks for itself over a channel the environment hands it - never a verdict.
// Scratch locks, injected clocks and idle readers, and a fake channel standing in for the helper (CU-117).

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'cu-confirm-')); dirs.push(d); return d }
const SEAT = 'cu-developer-two'
const T0 = Date.parse('2026-11-08T01:00:00Z')
const HARDWARE = Object.freeze({ pid: 0, state: 1, tagged: false, hardware: true })
const CONFIRMED = Object.freeze({ ok: true, confirmed: true, confirmationId: 'c-1', source: HARDWARE, outcome: 'confirmed' })
const log = (dir) => (existsSync(join(dir, 'hold.log')) ? readFileSync(join(dir, 'hold.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const channel = (answer) => { const calls = []; const fn = async (request) => { calls.push(request); return typeof answer === 'function' ? answer(request) : answer }; fn.calls = calls; return fn }
const run = (dir, extra = {}) => acquireDesktopRun({ seat: SEAT, runId: `r-${Math.random().toString(36).slice(2, 8)}`, dir, commit: null, now: () => T0, idleSeconds: () => 5, ...extra })

test('CU-203: with no channel an owner_active refusal is as before - no prompt, no marker', async () => {
  const dir = scratch()
  await assert.rejects(run(dir), (e) => e.details?.reason === 'owner_active')
  assert.equal(existsSync(join(dir, CONFIRMING_NAME)), false)
  assert.equal(log(dir).some((l) => l.action === 'confirm_requested'), false)
})

test('CU-203: a hardware confirmation admits that one run, rule confirmed with its id and source; the channel is asked once (seat, clipped task, the 60 s cap); the marker comes down', async () => {
  assert.equal(CONFIRM_WAIT_MS, 60_000)
  const dir = scratch()
  const confirmWith = channel(CONFIRMED)
  const slot = await run(dir, { confirmWith, task: `  Fill   the\nform ${'x'.repeat(120)}` })
  assert.equal(existsSync(slot.entryPath), true)
  slot.release()
  assert.equal(confirmWith.calls.length, 1)
  assert.deepEqual(confirmWith.calls[0], { seat: SEAT, task: `Fill the form ${'x'.repeat(66)}`, timeoutMs: 60_000 })
  assert.equal(existsSync(join(dir, CONFIRMING_NAME)), false, 'the marker comes down')
  const lines = log(dir)
  assert.deepEqual(lines.map((l) => l.action).filter((a) => ['refused', 'confirm_requested', 'confirmed', 'run_admitted'].includes(a)), ['refused', 'confirm_requested', 'confirmed', 'run_admitted'])
  const admitted = lines.find((l) => l.action === 'run_admitted')
  assert.deepEqual({ rule: admitted.rule, id: admitted.confirmationId, source: admitted.source }, { rule: 'confirmed', id: 'c-1', source: HARDWARE })
})

test('CU-203: anything but a hardware confirmation refuses not_confirmed, logged confirm_refused with its outcome - no entry, no marker', async () => {
  const cases = [
    [{ confirmed: false, outcome: 'cancelled' }, 'cancelled'],
    [{ confirmed: false, outcome: 'timeout' }, 'timeout'],
    [{ confirmed: true, confirmationId: 'c', source: { ...HARDWARE, hardware: false } }, 'not_hardware'],
    [{ confirmed: true, source: HARDWARE }, 'no_id'],
    [{ confirmed: true, id: 'c-1', source: HARDWARE }, 'no_id'], // the agreed field is confirmationId; a bare id is not it
    [() => { throw Object.assign(new Error('busy'), { code: 'busy' }) }, 'busy'],
    [() => { throw Object.assign(new Error('old'), { code: 'unknown_request' }) }, 'unknown_request'],
    [undefined, 'not_confirmed'],
    [() => new Promise(() => {}), 'no_answer'],
  ]
  for (const [answer, outcome] of cases) {
    const dir = scratch()
    await assert.rejects(run(dir, { confirmWith: channel(answer), confirmWaitMs: 20 }), (e) => e.details?.reason === 'not_confirmed' && e.details.outcome === outcome, outcome)
    assert.equal(existsSync(join(dir, 'run.json')), false, `${outcome}: no entry`)
    assert.equal(existsSync(join(dir, CONFIRMING_NAME)), false, `${outcome}: no marker`)
    assert.equal(log(dir).filter((l) => l.action === 'confirm_refused' && l.outcome === outcome).length, 1, outcome)
  }
})

test('CU-203 (Flow 5): after a refusal the seat waits 5 minutes - confirm_backoff without asking; another seat is not held back; then it may ask again', async () => {
  assert.equal(CONFIRM_BACKOFF_MS, 300_000)
  const dir = scratch()
  let t = T0
  const confirmWith = channel({ confirmed: false, outcome: 'cancelled' })
  await assert.rejects(run(dir, { confirmWith, now: () => t }), (e) => e.details?.outcome === 'cancelled')
  t = T0 + 60_000
  await assert.rejects(run(dir, { confirmWith, now: () => t }), (e) => e.details?.reason === 'confirm_backoff' && e.details.retryInSeconds === 240)
  assert.equal(confirmWith.calls.length, 1, 'no prompt during the backoff')
  await assert.rejects(acquireDesktopRun({ seat: 'cu-verifier', runId: 'v-1', dir, commit: null, now: () => t, idleSeconds: () => 5, confirmWith }), (e) => e.details?.outcome === 'cancelled')
  assert.equal(confirmWith.calls.length, 2, 'another seat may ask')
  t = T0 + CONFIRM_BACKOFF_MS + 1_000
  await assert.rejects(run(dir, { confirmWith, now: () => t }), (e) => e.details?.outcome === 'cancelled')
  assert.equal(confirmWith.calls.length, 3, 'after 5 minutes the seat may ask again')
})

test('CU-203 (Flow 5): one prompt at a time - a live marker refuses confirm_busy without asking; an expired one is ignored', async () => {
  const dir = scratch()
  const confirmWith = channel(CONFIRMED)
  writeFileSync(join(dir, CONFIRMING_NAME), JSON.stringify({ seat: 'cu-verifier', runId: 'v', startedAt: new Date(T0 - 1000).toISOString(), expiresAt: new Date(T0 + 30_000).toISOString() }))
  await assert.rejects(run(dir, { confirmWith }), (e) => e.details?.reason === 'confirm_busy')
  assert.equal(confirmWith.calls.length, 0)
  writeFileSync(join(dir, CONFIRMING_NAME), JSON.stringify({ seat: 'cu-verifier', runId: 'v', startedAt: new Date(T0 - 90_000).toISOString(), expiresAt: new Date(T0 - 1).toISOString() }))
  ;(await run(dir, { confirmWith })).release()
  assert.equal(confirmWith.calls.length, 1, 'an expired marker is ignored')
})

test('CU-203 (Flow 3): the wait holds no mutex, and every check reruns after it - another seat\'s hold taken during the wait still refuses first', async () => {
  const dir = scratch()
  const confirmWith = channel(async () => {
    await holdDesktop({ seat: 'cu-verifier', minutes: 10, dir, idleSeconds: () => 900, now: () => T0, lockTimeoutMs: 500 })
    return CONFIRMED
  })
  await assert.rejects(run(dir, { confirmWith }), (e) => e.code === 'resource_refused' && e.details?.reason !== 'owner_active' && /held|hold/i.test(`${e.details?.reason} ${e.message}`))
  assert.equal(existsSync(join(dir, 'run.json')), false)
})

test('CU-203: only owner_active asks - an unreadable idle time refuses owner_idle_unknown without a prompt', async () => {
  const dir = scratch()
  const confirmWith = channel(CONFIRMED)
  await assert.rejects(run(dir, { confirmWith, idleSeconds: () => null }), (e) => e.details?.reason === 'owner_idle_unknown')
  assert.equal(confirmWith.calls.length, 0)
})

test('CU-203: no caller can hand the lock a confirmation - a confirmation-shaped option admits nothing; confirmWith must be a function', async () => {
  const dir = scratch()
  await assert.rejects(run(dir, { confirmation: { id: 'x', source: HARDWARE }, confirmed: true }), (e) => e.details?.reason === 'owner_active')
  await assert.rejects(run(dir, { confirmWith: CONFIRMED }), (e) => e.code === 'invalid_argument' && e.details?.field === 'confirmWith')
})

test('CU-203: inside its own hold, a run refused because the owner came back may be confirmed - rule confirmed, not own_hold', async () => {
  const dir = scratch()
  await holdDesktop({ seat: SEAT, minutes: 30, dir, idleSeconds: () => 900, now: () => T0 })
  const confirmWith = channel(CONFIRMED)
  const slot = await acquireDesktopRun({ seat: SEAT, runId: 'own-1', dir, commit: null, now: () => T0 + 600_000, idleSeconds: () => 30, confirmWith })
  slot.release()
  assert.equal(log(dir).find((l) => l.action === 'run_admitted')?.rule, 'confirmed')
})
