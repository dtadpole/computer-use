import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'

// CU-156: these tests pin the DEFAULT seat (cu-verifier). The seat follows CU_VERIFY_SEAT, which a gate exports for its
// verifier runs, so an ambient value must not leak in here - else they fail for whoever has it set (cu-integrator, 08:18Z).
const ambientSeat = process.env.CU_VERIFY_SEAT
before(() => { delete process.env.CU_VERIFY_SEAT })
after(() => { if (ambientSeat === undefined) delete process.env.CU_VERIFY_SEAT; else process.env.CU_VERIFY_SEAT = ambientSeat })

/** Fakes that log the order of every step. */
function fakes({ available = true, registered = true, memory = true, openFails = false } = {}) {
  const log = []
  const slot = { setChromePid: (pid) => log.push(`pid ${pid}`), release: () => log.push('release') }
  const handle = { browser: { running: { child: { pid: 777 } } } }
  return {
    log,
    handle,
    deps: {
      available: () => available,
      makeProfile: (seat) => (log.push(`profile ${seat}`), '/tmp/cu-verifier-chrome-AbC123'),
      removeProfile: (path) => log.push(`remove ${path}`),
      register: async ({ seat, profile }) => (log.push(`register ${seat} ${profile}`), registered ? { ok: true, slot } : { ok: false, reason: 'team_cap', message: 'the team already runs 2 browsers' }),
      gate: () => (log.push('memory'), memory ? { ok: true, reason: 'memory 40% free' } : { ok: false, reason: 'memory 20% free, below the 25% floor (D-005)' }),
      open: async ({ profile, width, height }) => {
        log.push(`open ${profile} ${width}x${height}`)
        if (openFails) throw new Error('chrome failed')
        return handle
      },
      deny: async () => log.push('deny downloads'),
    },
  }
}

describe('startCheckBrowser', () => {
  test('follows the D-014 order: profile, registry, memory, launch, pid, downloads', async () => {
    const { log, deps, handle } = fakes()
    const started = await startCheckBrowser(deps)
    assert.equal(started.ready, true)
    assert.equal(started.handle, handle)
    assert.deepEqual(log, ['profile cu-verifier', 'register cu-verifier /tmp/cu-verifier-chrome-AbC123', 'memory', 'open /tmp/cu-verifier-chrome-AbC123 1024x768', 'pid 777', 'deny downloads'])
  })

  test('no Chrome is unjudged and takes nothing', async () => {
    const { log, deps } = fakes({ available: false })
    assert.deepEqual(await startCheckBrowser(deps), { ready: false, reason: 'no Chrome or Chromium on this machine' })
    assert.deepEqual(log, [])
  })

  test('a registry refusal gives the profile back and never launches', async () => {
    const { log, deps } = fakes({ registered: false })
    const started = await startCheckBrowser(deps)
    assert.equal(started.ready, false)
    assert.match(started.reason, /browser registry refused \(team_cap\)/)
    assert.deepEqual(log, ['profile cu-verifier', 'register cu-verifier /tmp/cu-verifier-chrome-AbC123', 'remove /tmp/cu-verifier-chrome-AbC123'])
  })

  test('a closed memory gate releases the slot and the profile and never launches', async () => {
    const { log, deps } = fakes({ memory: false })
    const started = await startCheckBrowser(deps)
    assert.deepEqual(started, { ready: false, reason: 'memory 20% free, below the 25% floor (D-005)' })
    assert.deepEqual(log.slice(-2), ['release', 'remove /tmp/cu-verifier-chrome-AbC123'])
    assert.ok(!log.some((line) => line.startsWith('open')))
  })

  test('a failed launch gives everything back and rethrows', async () => {
    const { log, deps } = fakes({ openFails: true })
    await assert.rejects(startCheckBrowser(deps), /chrome failed/)
    assert.deepEqual(log.slice(-2), ['release', 'remove /tmp/cu-verifier-chrome-AbC123'])
  })
})

describe('stopCheckBrowser', () => {
  test('closes, removes the profile and releases the slot, even when closing throws', async () => {
    const log = []
    const started = { ready: true, handle: {}, profile: '/tmp/p', slot: { release: () => log.push('release') } }
    await stopCheckBrowser(started, { close: async () => log.push('close'), removeProfile: (p) => log.push(`remove ${p}`) })
    assert.deepEqual(log, ['close', 'remove /tmp/p', 'release'])
    log.length = 0
    await assert.rejects(stopCheckBrowser(started, { close: async () => { throw new Error('x') }, removeProfile: (p) => log.push(`remove ${p}`) }), /x/)
    assert.deepEqual(log, ['remove /tmp/p', 'release'])
  })

  test('nothing started is nothing to stop', async () => {
    await stopCheckBrowser({ ready: false, reason: 'r' })
    await stopCheckBrowser(undefined)
  })
})
