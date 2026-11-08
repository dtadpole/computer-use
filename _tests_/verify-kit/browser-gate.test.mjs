import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, test } from 'node:test'

import {
  closeBrowser,
  floorFromEnv,
  isThrowawayProfile,
  memoryGate,
  MIN_FREE_PERCENT,
  parseMemoryFree,
  removeThrowawayProfile,
  throwawayProfile,
} from '../../_tools_/verify-kit/browser-gate.mjs'

const SAMPLE = `The system has 17179869184 (4194304 pages with a page size of 4096).
Pages free: 120000
System-wide memory free percentage: 32%
`

describe('parseMemoryFree', () => {
  test('reads the free percentage line', () => {
    assert.equal(parseMemoryFree(SAMPLE), 32)
    assert.equal(parseMemoryFree('System-wide memory free percentage: 0%'), 0)
  })

  test('is null when the line is missing or out of range', () => {
    assert.equal(parseMemoryFree('nothing here'), null)
    assert.equal(parseMemoryFree(undefined), null)
    assert.equal(parseMemoryFree('System-wide memory free percentage: 140%'), null)
  })
})

describe('memoryGate', () => {
  test('the floor is the 25 percent of D-005', () => {
    assert.equal(MIN_FREE_PERCENT, 25)
  })

  test('opens at or above the floor and closes below it', () => {
    assert.deepEqual(memoryGate({ read: () => SAMPLE }), { ok: true, freePercent: 32, reason: 'memory 32% free' })
    assert.equal(memoryGate({ read: () => 'System-wide memory free percentage: 25%' }).ok, true)
    const closed = memoryGate({ read: () => 'System-wide memory free percentage: 24%' })
    assert.equal(closed.ok, false)
    assert.match(closed.reason, /below the 25% floor/)
  })

  test('CU_MIN_FREE_PERCENT can raise the floor but never lower it', () => {
    assert.equal(floorFromEnv({}), 25)
    assert.equal(floorFromEnv({ CU_MIN_FREE_PERCENT: '101' }), 101)
    assert.equal(floorFromEnv({ CU_MIN_FREE_PERCENT: '5' }), 25)
    assert.equal(floorFromEnv({ CU_MIN_FREE_PERCENT: '-1' }), 25)
    assert.equal(floorFromEnv({ CU_MIN_FREE_PERCENT: 'abc' }), 25)
    assert.equal(memoryGate({ minFreePercent: floorFromEnv({ CU_MIN_FREE_PERCENT: '101' }), read: () => SAMPLE }).ok, false)
  })

  test('an unreadable reading keeps the gate closed', () => {
    assert.equal(memoryGate({ read: () => 'garbage' }).ok, false)
    const failed = memoryGate({
      read: () => {
        throw new Error('not found')
      },
    })
    assert.equal(failed.ok, false)
    assert.match(failed.reason, /could not run: not found/)
  })
})

describe('throwaway profiles', () => {
  test('only /tmp/<seat>-chrome-XXXXXX paths count as throwaway', () => {
    assert.equal(isThrowawayProfile('/tmp/cu-verifier-chrome-AbC123'), true)
    for (const path of ['/tmp', '/tmp/', '/tmp/cu-', '/tmp/other-chrome-abc123', '/tmp/cu-verifier-AbC123', '/tmp/cu-developer-two-scratch', '/tmp/cu-verifier-chrome-AbC123/..', '/tmp/cu-x-chrome-AbC123/sub', 'tmp/cu-x-chrome-AbC123', '/Users/x/cu-x-chrome-AbC123', '', undefined]) {
      assert.equal(isThrowawayProfile(path), false, String(path))
    }
  })

  test('removeThrowawayProfile refuses anything else and never calls remove for it', () => {
    let called = false
    assert.throws(() => removeThrowawayProfile('/tmp', () => (called = true)), /refusing/)
    assert.throws(() => removeThrowawayProfile(undefined, () => (called = true)), /refusing/)
    assert.equal(called, false)
  })

  test('a real profile is created under /tmp/<seat>-chrome- and removed', () => {
    const path = throwawayProfile('cu-verifier')
    assert.equal(isThrowawayProfile(path), true, path)
    assert.ok(existsSync(path))
    removeThrowawayProfile(path)
    assert.equal(existsSync(path), false)
  })

  test('a bad seat name is refused', () => {
    assert.throws(() => throwawayProfile('../x', () => '/tmp/x'), /bad seat/)
    assert.throws(() => throwawayProfile('verifier', () => '/tmp/x'), /bad seat/, 'a seat key begins cu-')
  })
})

describe('closeBrowser', () => {
  test('a prompt close is enough and nothing is stopped', async () => {
    let stopped = false
    const result = await closeBrowser({ close: async () => {}, browser: { running: 'r' } }, { timeoutMs: 200, stop: async () => (stopped = true) })
    assert.equal(result, 'closed')
    assert.equal(stopped, false)
  })

  test('a close that hangs or fails is followed by a forced stop of that Chrome', async () => {
    const stoppedWith = []
    const hang = { close: () => new Promise(() => {}), browser: { running: 'hung' } }
    const started = Date.now()
    assert.equal(await closeBrowser(hang, { timeoutMs: 100, stop: async (running) => stoppedWith.push(running) }), 'forced')
    assert.ok(Date.now() - started < 1000)
    const fail = { close: async () => { throw new Error('gone') }, browser: { running: 'failed' } }
    assert.equal(await closeBrowser(fail, { timeoutMs: 100, stop: async (running) => stoppedWith.push(running) }), 'forced')
    assert.deepEqual(stoppedWith, ['hung', 'failed'])
  })

  test('no handle is nothing to close', async () => {
    assert.equal(await closeBrowser(undefined), 'closed')
  })
})
