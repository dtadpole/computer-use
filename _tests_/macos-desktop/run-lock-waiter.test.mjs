import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { clearWaiter, HOLD_LOG_NAME, holdDesktop, main, readWaiter, registerWaiter, releaseHold, WAITER_MAX_MS, WAITING_NAME } from '../../_environments_/macos-desktop/run-lock.mjs'
import { scratch } from './harness.mjs'

/**
 * CU-276 (D-073): 'before a new hold, let a waiting phase 2 take the lock first' - enforced by the lock, not left to the
 * inbox. A waiting gate registers (registerWaiter / 'run-lock.mjs wait'); while it is live, another seat's fresh hold,
 * re-hold or extension is refused phase2_waiting. The live hold itself is never cut short.
 */

const root = scratch()
after(() => root.remove())
let dirs = 0
const freshDir = () => join(root.dir, `waiter-${(dirs += 1)}`)
const t0 = Date.parse('2026-11-08T16:00:00Z')
const alive = (pids) => (pid) => pids.has(pid)
const waiting = (seat) => (error) => error instanceof EnvironmentError && error.code === 'resource_refused' && error.details?.reason === 'phase2_waiting' && error.details.waiter.seat === seat

test('CU-276: with a phase 2 waiting, another seat\'s fresh hold is refused phase2_waiting, naming the waiter and its wait', async () => {
  const dir = freshDir()
  const isAlive = alive(new Set([900]))
  await registerWaiter({ seat: 'cu-integrator', reason: 'gate for #75', dir, pid: 900, now: () => t0, isAlive })
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 6, reason: 'rows', dir, now: () => t0 + 540_000, isAlive }), (error) => waiting('cu-integrator')(error) && /waited 540 s/.test(error.message) && /gate for #75/.test(error.message))
  const own = await holdDesktop({ seat: 'cu-integrator', minutes: 2, reason: 'phase 2', dir, now: () => t0 + 541_000, isAlive })
  assert.equal(own.seat, 'cu-integrator', 'the waiter\'s own seat is not refused')
})

test('CU-276: the live hold is never cut short, but neither extended nor re-held by its seat while a phase 2 waits', async () => {
  const dir = freshDir()
  const isAlive = alive(new Set([901]))
  const hold = await holdDesktop({ seat: 'cu-verifier', minutes: 6, dir, now: () => t0, isAlive })
  await registerWaiter({ seat: 'cu-integrator', dir, pid: 901, now: () => t0 + 60_000, isAlive })
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 6, dir, now: () => t0 + 120_000, isAlive }), waiting('cu-integrator'), 'an extension')
  assert.equal(JSON.parse(readFileSync(join(dir, 'hold.json'), 'utf8')).until, hold.until, 'the live hold keeps its own end')
  await releaseHold({ seat: 'cu-verifier', dir, now: () => t0 + 180_000 })
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 6, dir, now: () => t0 + 190_000, isAlive }), waiting('cu-integrator'), 'a re-hold within the chain gap')
})

test('CU-276: a waiter whose process is gone, one older than WAITER_MAX_MS, or one cleared counts for nothing', async () => {
  const dir = freshDir()
  const pids = new Set([902])
  const isAlive = alive(pids)
  await registerWaiter({ seat: 'cu-integrator', dir, pid: 902, now: () => t0, isAlive })
  pids.delete(902)
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 1, dir, now: () => t0 + 1000, isAlive })).seat, 'cu-verifier', 'a dead waiter')
  await releaseHold({ seat: 'cu-verifier', dir, now: () => t0 + 2000 })
  pids.add(903)
  await registerWaiter({ seat: 'cu-integrator', dir, pid: 903, now: () => t0 + 3000, isAlive })
  assert.equal((await holdDesktop({ seat: 'cu-researcher', minutes: 1, dir, now: () => t0 + 3000 + WAITER_MAX_MS + 1, isAlive })).seat, 'cu-researcher', 'an expired waiter')
  await releaseHold({ seat: 'cu-researcher', dir, now: () => t0 + 3000 + WAITER_MAX_MS + 2 })
  await registerWaiter({ seat: 'cu-integrator', dir, pid: 903, now: () => t0 + 3000 + WAITER_MAX_MS + 3, isAlive })
  assert.equal(await clearWaiter({ seat: 'cu-verifier', dir, pid: null, isAlive }), false, 'another seat cannot clear it')
  assert.equal(await clearWaiter({ seat: 'cu-integrator', dir, pid: 903, isAlive }), true)
  assert.equal(readWaiter({ dir, isAlive }), null)
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 1, dir, now: () => t0 + 3000 + WAITER_MAX_MS + 4, isAlive })).seat, 'cu-verifier', 'a cleared waiter')
  const log = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8')
  assert.match(log, /"action":"wait"/)
  assert.match(log, /"action":"wait_end"/)
})

test('CU-276: one waiter at a time - another seat\'s live registration refuses waiter_present; the same seat re-registers', async () => {
  const dir = freshDir()
  const isAlive = alive(new Set([904, 905]))
  await registerWaiter({ seat: 'cu-integrator', dir, pid: 904, now: () => t0, isAlive })
  await assert.rejects(registerWaiter({ seat: 'cu-verifier', dir, pid: 905, now: () => t0 + 1000, isAlive }), (error) => error.details?.reason === 'waiter_present')
  const again = await registerWaiter({ seat: 'cu-integrator', dir, pid: 905, now: () => t0 + 2000, isAlive })
  assert.equal(again.pid, 905)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, WAITING_NAME), 'utf8')).pid, 905)
})

test('CU-276: the CLI - wait registers until it is done and then clears; status shows the waiter', async () => {
  const dir = freshDir()
  const lines = []
  let statusDuring = null
  const code = await main(['wait', '--seat', 'cu-integrator', '--reason', 'gate', '--dir', dir], {
    write: (line) => lines.push(JSON.parse(line)),
    seams: {
      waitUntilDone: async () => {
        const seen = []
        await main(['status', '--dir', dir], { write: (line) => seen.push(JSON.parse(line)) })
        statusDuring = seen[0]
      },
    },
  })
  assert.equal(code, 0)
  assert.equal(lines[0].waiting.seat, 'cu-integrator')
  assert.equal(statusDuring.waiter.seat, 'cu-integrator', 'status names the waiter while it waits')
  const after = []
  await main(['status', '--dir', dir], { write: (line) => after.push(JSON.parse(line)) })
  assert.equal(after[0].waiter, null, 'cleared when the wait ends')
})
