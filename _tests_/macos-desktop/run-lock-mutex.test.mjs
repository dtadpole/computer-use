import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dropLockMutex, takeLockMutex } from '../../_environments_/macos-desktop/run-lock.mjs'

/**
 * CU-131: the run-lock mutex in one process, on an injected clock: `sleep` advances it. The spin detector sits in
 * `isAlive`, which takeMutex asks on every look at a named holder outside any catch (its clock reads sit inside
 * `try ... catch { continue }`, which would swallow it): 1000 asks without a sleep is a spin, and it throws.
 */
function clock() {
  let t = Date.now()
  let asks = 0
  const sleeps = []
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms)
      asks = 0
      t += ms
    },
    // As pidAlive: a pid <= 0 is never alive. 4242 and anything from 7000 up are dead holders.
    isAlive: (pid) => {
      // A waiting loop looks once or twice per sleep; a thousand looks without one is a spin (a mutant that kept
      // retrying failed re-checks did ~8750 between the rare sleeps it fell into, so a looser bound missed it).
      if (++asks > 1000) throw new Error('spinning: 1000 looks without a sleep')
      return pid > 0 && pid !== 4242 && pid < 7000
    },
    sleeps,
  }
}

/** A `.lock` whose named holder (pid 4242) is dead to the clock's `isAlive`. */
function deadHolderLock() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mutex-'))
  const lock = join(dir, '.lock')
  mkdirSync(lock)
  writeFileSync(join(lock, 'owner'), '4242\n')
  return { dir, lock }
}

test('CU-131: a dead holder\'s mutex while another breaker holds the break mutex is waited for - sleeps, then run_lock_busy at lockTimeoutMs - never spun', async () => {
  const { dir, lock } = deadHolderLock()
  try {
    mkdirSync(`${lock}.break`) // another waiter is breaking it right now (fresh, so not a dead breaker)
    const c = clock()
    await assert.rejects(
      takeLockMutex(lock, { now: c.now, sleep: c.sleep, lockTimeoutMs: 1000, staleLockMs: 60_000, isAlive: c.isAlive }),
      (e) => e.details?.reason === 'run_lock_busy',
    )
    assert.ok(c.sleeps.length >= 9, `it waited between looks (${c.sleeps.length} sleeps), and the timeout held`)
    assert.ok(existsSync(lock) && existsSync(`${lock}.break`), 'nothing was dropped under the other breaker')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-131: a break mutex left by a breaker that died (older than 5 s) is cleared, and the dead holder\'s mutex is then taken', async () => {
  const { dir, lock } = deadHolderLock()
  try {
    mkdirSync(`${lock}.break`)
    const old = new Date(Date.now() - 10_000)
    utimesSync(`${lock}.break`, old, old)
    const c = clock()
    await takeLockMutex(lock, { now: c.now, sleep: c.sleep, lockTimeoutMs: 1000, staleLockMs: 60_000, isAlive: c.isAlive })
    assert.equal(existsSync(`${lock}.break`), false, 'the dead breaker\'s mutex is gone')
    dropLockMutex(lock)
    assert.equal(existsSync(lock), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-131: a re-check that finds a new, live owner leaves the mutex and waits - the timeout still holds', async () => {
  const { dir, lock } = deadHolderLock()
  try {
    const c = clock()
    // Between the decision (holder 4242 dead) and the break, another waiter took the mutex: owner 5151, alive.
    const beforeBreak = async () => { writeFileSync(join(lock, 'owner'), '5151\n') }
    await assert.rejects(
      takeLockMutex(lock, { now: c.now, sleep: c.sleep, lockTimeoutMs: 1000, staleLockMs: 60_000, isAlive: c.isAlive, beforeBreak }),
      (e) => e.details?.reason === 'run_lock_busy',
    )
    assert.ok(existsSync(lock), 'the live owner\'s mutex was left alone')
    assert.ok(c.sleeps.length >= 9)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-131: an ownerless mutex (an older checkout\'s) older than staleLockMs is taken by the age rule; a young one is waited for', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mutex-'))
  try {
    const lock = join(dir, '.lock')
    mkdirSync(lock) // no owner file: an older checkout's mutex
    const c = clock()
    await assert.rejects(
      takeLockMutex(lock, { now: c.now, sleep: c.sleep, lockTimeoutMs: 500, staleLockMs: 60_000, isAlive: c.isAlive }),
      (e) => e.details?.reason === 'run_lock_busy',
      'a young ownerless mutex is a live holder\'s, as far as anyone can tell',
    )
    const old = new Date(Date.now() - 120_000)
    utimesSync(lock, old, old)
    const d = clock()
    // If an ownerless mutex ever read as a dead holder (owner -1), the re-check could never match and the age rule
    // would never run: one orphaned mutex would block every desktop run until deleted by hand.
    await takeLockMutex(lock, { now: d.now, sleep: d.sleep, lockTimeoutMs: 500, staleLockMs: 60_000, isAlive: d.isAlive })
    dropLockMutex(lock)
    assert.equal(existsSync(lock), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-131: a re-check that never matches (the holder changes on every look) waits between looks and times out - a failed re-check is never a drop', async () => {
  const { dir, lock } = deadHolderLock()
  try {
    const c = clock()
    let next = 7000
    // Every break attempt finds a different dead holder than it decided on, so nothing may ever be dropped.
    const beforeBreak = async () => { writeFileSync(join(lock, 'owner'), `${next++}\n`) }
    await assert.rejects(
      takeLockMutex(lock, { now: c.now, sleep: c.sleep, lockTimeoutMs: 1000, staleLockMs: 60_000, isAlive: c.isAlive, beforeBreak }),
      (e) => e.details?.reason === 'run_lock_busy',
    )
    assert.ok(c.sleeps.length >= 9, `it slept between looks (${c.sleeps.length})`)
    assert.ok(existsSync(lock), 'nothing was dropped')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
