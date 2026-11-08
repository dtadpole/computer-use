import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { ResourceRefusedError, memoryFloor, parseMemoryPressure, resourceGate } from '../../_tools_/agent-core/resource-gate.mjs'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-gate-test-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const noExit = { onExit: () => {}, offExit: () => {} }
const opts = (extra = {}) => ({ dir, freeMemoryPercent: async () => 60, isAlive: (pid) => pid < 1000, ...noExit, ...extra })
const entries = () => readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
const refusedWith = (reason) => (error) => error instanceof ResourceRefusedError && error.code === 'resource_refused' && error.reason === reason

test('a free slot writes the D-014 entry, records the chrome pid and removes it on release', async () => {
  const slot = await resourceGate(opts({ seat: 'cu-developer-one', pid: 101, profile: '/tmp/cu-developer-one-chrome-x' }))
  assert.deepEqual(entries(), ['cu-developer-one-101.json'])
  const entry = JSON.parse(readFileSync(slot.entryPath, 'utf8'))
  assert.equal(entry.seat, 'cu-developer-one')
  assert.equal(entry.pid, 101)
  assert.equal(entry.profile, '/tmp/cu-developer-one-chrome-x')
  assert.ok(Date.parse(entry.startedAt))
  slot.setChromePid(4321)
  assert.equal(JSON.parse(readFileSync(slot.entryPath, 'utf8')).chromePid, 4321)
  assert.ok(!existsSync(join(dir, '.lock')), 'the lock is released')
  slot.release()
  slot.release()
  assert.deepEqual(entries(), [])
})

test('a second browser for the same seat is refused', async () => {
  await resourceGate(opts({ seat: 'cu-verifier', pid: 101 }))
  await assert.rejects(resourceGate(opts({ seat: 'cu-verifier', pid: 102 })), refusedWith('seat_has_browser'))
})

test('a third browser for the team is refused; dead owners are pruned first', async () => {
  await resourceGate(opts({ seat: 'cu-verifier', pid: 101 }))
  await resourceGate(opts({ seat: 'cu-developer-two', pid: 102 }))
  await assert.rejects(resourceGate(opts({ seat: 'cu-developer-one', pid: 103 })), refusedWith('team_cap'))
  writeFileSync(join(dir, 'cu-researcher-5000.json'), JSON.stringify({ seat: 'cu-researcher', pid: 5000 }))
  writeFileSync(join(dir, 'garbage.json'), '{not json')
  // pid 102 dies: its entry and the dead and broken ones go, and the slot frees up
  const slot = await resourceGate(opts({ seat: 'cu-developer-one', pid: 103, isAlive: (pid) => pid === 101 || pid === 103 }))
  assert.deepEqual(entries(), ['cu-developer-one-103.json', 'cu-verifier-101.json'])
  slot.release()
})

test('the memory floor refuses and removes the entry; the environment may only raise the floor', async () => {
  await assert.rejects(resourceGate(opts({ seat: 'cu-verifier', pid: 101, freeMemoryPercent: async () => 24 })), refusedWith('memory_floor'))
  assert.deepEqual(entries(), [])
  await assert.rejects(
    resourceGate(opts({ seat: 'cu-verifier', pid: 101, freeMemoryPercent: async () => 30, env: { CU_MIN_FREE_PERCENT: '40' } })),
    refusedWith('memory_floor'),
  )
  await assert.rejects(resourceGate(opts({ seat: 'cu-verifier', pid: 101, freeMemoryPercent: async () => null })), refusedWith('memory_unknown'))
  const slot = await resourceGate(opts({ seat: 'cu-verifier', pid: 101, freeMemoryPercent: async () => 26, env: { CU_MIN_FREE_PERCENT: '5' } }))
  slot.release()
  assert.equal(memoryFloor({}), 25)
  assert.equal(memoryFloor({ CU_MIN_FREE_PERCENT: '10' }), 25)
  assert.equal(memoryFloor({ CU_MIN_FREE_PERCENT: '35' }), 35)
  assert.equal(memoryFloor({ CU_MIN_FREE_PERCENT: 'x' }), 25)
})

test('a held lock is waited for and then refused; a stale lock is removed', async () => {
  mkdirSync(join(dir, '.lock'))
  let clock = 1_000_000
  utimesSync(join(dir, '.lock'), new Date(clock), new Date(clock))
  await assert.rejects(
    resourceGate(opts({ seat: 'cu-verifier', pid: 101, now: () => clock, sleep: async () => { clock += 2_000 }, lockTimeoutMs: 10_000, staleLockMs: 60_000 })),
    refusedWith('registry_busy'),
  )
  clock += 61_000
  const slot = await resourceGate(opts({ seat: 'cu-verifier', pid: 101, now: () => clock, sleep: async () => { clock += 1_000 } }))
  slot.release()
})

test('an exit handler is registered and removed with the slot', async () => {
  const handlers = new Set()
  const slot = await resourceGate(opts({ seat: 'cu-verifier', pid: 101, onExit: (fn) => handlers.add(fn), offExit: (fn) => handlers.delete(fn) }))
  assert.equal(handlers.size, 1)
  ;[...handlers][0]()
  assert.deepEqual(entries(), [], 'the exit handler removes the entry')
  slot.release()
  assert.equal(handlers.size, 0)
})

test('seat keys are checked and memory_pressure output parses', async () => {
  await assert.rejects(resourceGate(opts({ seat: 'developer-one' })), TypeError)
  assert.equal(parseMemoryPressure('...\nSystem-wide memory free percentage: 63%\n'), 63)
  assert.equal(parseMemoryPressure('nothing'), null)
})
