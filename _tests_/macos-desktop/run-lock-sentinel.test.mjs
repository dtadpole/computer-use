import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { pidAlive } from '../../_tools_/agent-core/resource-gate.mjs'
import { acquireDesktopRun, checkoutCommit, ENTRY_NAME, HOLD_LOG_NAME, HOLD_NAME, main, SENTINEL_RUN_ID } from '../../_environments_/macos-desktop/run-lock.mjs'

/**
 * CU-106 (D-053): a hold taken through the CLI binds checkouts older than 010dd7b52 too. Those never read hold.json,
 * but they honour run.json with a live pid, so a keeper process keeps a sentinel entry there while the hold lasts.
 * Real processes throughout: a real keeper, a holder's run killed by a signal, a separate reader in a tight loop, and
 * the ACTUAL pre-hold run-lock module, kept verbatim in pre-hold-run-lock/ (cu-verifier: not a fake of the old behaviour).
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUN_LOCK = join(REPO, '_environments_', 'macos-desktop', 'run-lock.mjs')
const quiet = { write: () => {} }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
/**
 * CU-117: the wall-clock bounds here (a sentinel restored within 1 s, a lock taken within 1 s) hold on an idle machine;
 * a loaded gate can widen them all with CU_TEST_TIME_FACTOR (cu-verifier's suggestion). Unset, they are the design's.
 */
const FACTOR = Math.max(1, Number(process.env.CU_TEST_TIME_FACTOR) || 1)
const read = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }

async function until(check, ms = 3000) {
  const started = Date.now()
  while (Date.now() - started < ms * FACTOR) {
    const value = check()
    if (value) return value
    await sleep(20)
  }
  return null
}

/**
 * The run-lock module as it was just before the hold (010dd7b52^), with the two files it imports, in a temp tree.
 * The three files are kept verbatim in pre-hold-run-lock/ (this repository starts after that commit; its history is
 * kept privately), so the test still runs the ACTUAL old module.
 */
const PRE_HOLD = join(dirname(fileURLToPath(import.meta.url)), 'pre-hold-run-lock')
async function preHoldRunLock() {
  const tree = mkdtempSync(join(tmpdir(), 'cu-pre-hold-'))
  for (const path of ['_environments_/macos-desktop/run-lock.mjs', '_environments_/macos-desktop/errors.mjs', '_tools_/agent-core/resource-gate.mjs']) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    writeFileSync(join(tree, path), readFileSync(join(PRE_HOLD, path.split('/').at(-1))))
  }
  const source = readFileSync(join(tree, '_environments_/macos-desktop/run-lock.mjs'), 'utf8')
  assert.doesNotMatch(source, /hold\.json|HOLD_NAME/, 'the old module really knows nothing of holds')
  const module = await import(pathToFileURL(join(tree, '_environments_/macos-desktop/run-lock.mjs')).href)
  return { module, remove: () => rmSync(tree, { recursive: true, force: true }) }
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-sentinel-'))
  return { dir, entry: join(dir, ENTRY_NAME), hold: join(dir, HOLD_NAME), log: join(dir, HOLD_LOG_NAME) }
}

/** Release the hold, then make sure its keeper is gone and the directory removed. */
async function cleanUp({ dir, hold }, seat = 'cu-verifier') {
  const keeperPid = read(hold)?.keeperPid
  await main(['release', '--seat', seat, '--dir', dir], quiet)
  if (Number.isInteger(keeperPid)) await until(() => !pidAlive(keeperPid), 2000)
  if (Number.isInteger(keeperPid) && pidAlive(keeperPid)) process.kill(keeperPid, 'SIGKILL')
  rmSync(dir, { recursive: true, force: true })
}

const sentinelOf = (path) => { const entry = read(path); return entry?.sentinel === true && entry.runId === SENTINEL_RUN_ID ? entry : null }

test('the pre-hold run-lock module (010dd7b52^) is refused while a CLI hold is live, the holder\'s own runs too, and admitted after release', async () => {
  const s = scratch()
  const old = await preHoldRunLock()
  try {
    assert.equal(await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--reason', 'CU-106 test', '--dir', s.dir], quiet), 0)
    const sentinel = await until(() => sentinelOf(s.entry))
    assert.ok(sentinel, 'the keeper wrote its sentinel')
    assert.equal(sentinel.pid, read(s.hold).keeperPid)
    await assert.rejects(old.module.acquireDesktopRun({ seat: 'cu-researcher', runId: 'old-other', dir: s.dir }), (e) => e.details?.reason === 'desktop_run_active')
    await assert.rejects(old.module.acquireDesktopRun({ seat: 'cu-verifier', runId: 'old-own', dir: s.dir }), (e) => e.details?.reason === 'desktop_run_active', 'the holder\'s runs from old code are refused too (documented)')
    assert.equal(await main(['release', '--seat', 'cu-verifier', '--dir', s.dir], quiet), 0)
    assert.equal(read(s.entry), null, 'released: the sentinel is gone at once')
    const slot = await old.module.acquireDesktopRun({ seat: 'cu-researcher', runId: 'old-after', dir: s.dir })
    slot.release()
    assert.ok(await until(() => !pidAlive(sentinel.pid), 2000), 'the keeper exited after the release')
  } finally {
    old.remove()
    await cleanUp(s)
  }
})

test('the holder\'s run swaps the sentinel out and back by rename: a reader in a tight loop never finds run.json without a live entry', async () => {
  const s = scratch()
  try {
    await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--dir', s.dir], quiet)
    assert.ok(await until(() => sentinelOf(s.entry)))
    // A separate process reads run.json as fast as it can for 1.5 s and counts any moment without a live entry.
    const reader = spawn(process.execPath, ['--input-type=module', '-e', `
      import { readFileSync } from 'node:fs'
      let gaps = 0, reads = 0
      const end = Date.now() + 1500
      while (Date.now() < end) {
        reads += 1
        let entry = null
        try { entry = JSON.parse(readFileSync(${JSON.stringify(s.entry)}, 'utf8')) } catch {}
        let alive = false
        try { process.kill(entry?.pid, 0); alive = true } catch (e) { alive = e.code === 'EPERM' }
        if (!alive) gaps += 1
      }
      process.stdout.write(JSON.stringify({ gaps, reads }))
    `], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    reader.stdout.on('data', (chunk) => { out += chunk })
    const done = new Promise((resolve) => reader.on('exit', resolve))
    await sleep(100)
    for (let i = 0; i < 5; i += 1) {
      const slot = await acquireDesktopRun({ seat: 'cu-verifier', runId: `run-${i}`, dir: s.dir })
      assert.equal(read(s.entry).runId, `run-${i}`)
      await sleep(30)
      slot.release()
      assert.ok(sentinelOf(s.entry), 'the sentinel is back the moment the run releases')
      await sleep(30)
    }
    await done
    const { gaps, reads } = JSON.parse(out)
    assert.ok(reads > 1000, `the reader read ${reads} times`)
    assert.equal(gaps, 0, `${gaps} of ${reads} reads found no live entry`)
    const actions = readFileSync(s.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line).action)
    assert.ok(actions.includes('sentinel_on') && actions.includes('sentinel_out') && actions.includes('sentinel_back'), actions.join(','))
  } finally {
    await cleanUp(s)
  }
})

test('a holder\'s run killed by a signal: the keeper restores the sentinel within a second, and the pre-hold module is refused again', async () => {
  const s = scratch()
  const old = await preHoldRunLock()
  try {
    await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--dir', s.dir], quiet)
    const sentinel = await until(() => sentinelOf(s.entry))
    const holder = spawn(process.execPath, ['--input-type=module', '-e', `
      import { acquireDesktopRun } from ${JSON.stringify(pathToFileURL(RUN_LOCK).href)}
      await acquireDesktopRun({ seat: 'cu-verifier', runId: 'killed-run', dir: ${JSON.stringify(s.dir)} })
      process.stdout.write('held')
      setInterval(() => {}, 1000)
    `], { stdio: ['ignore', 'pipe', 'inherit'] })
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    assert.equal(read(s.entry).runId, 'killed-run')
    holder.kill('SIGKILL')
    await new Promise((resolve) => holder.on('exit', resolve))
    const killedAt = Date.now()
    const restored = await until(() => sentinelOf(s.entry), 2000)
    assert.ok(restored, 'the sentinel came back')
    assert.ok(Date.now() - killedAt <= 1000 * FACTOR, `restored ${Date.now() - killedAt} ms after the kill`)
    assert.equal(restored.pid, sentinel.pid)
    await assert.rejects(old.module.acquireDesktopRun({ seat: 'cu-researcher', runId: 'old-slips', dir: s.dir }), (e) => e.details?.reason === 'desktop_run_active')
    assert.ok(readFileSync(s.log, 'utf8').includes('"sentinel_restored"'))
  } finally {
    old.remove()
    await cleanUp(s)
  }
})

test('the keeper leaves at the hold\'s end: the sentinel is removed and the Mac is free without a release', async () => {
  const s = scratch()
  try {
    await main(['hold', '--seat', 'cu-verifier', '--minutes', '0.03', '--dir', s.dir], quiet)
    const sentinel = await until(() => sentinelOf(s.entry))
    assert.ok(sentinel)
    assert.ok(await until(() => read(s.entry) === null, 4000), 'the sentinel was removed when the hold ended')
    assert.ok(await until(() => !pidAlive(sentinel.pid), 1000), 'the keeper exited')
    const slot = await acquireDesktopRun({ seat: 'cu-researcher', runId: 'after-end', dir: s.dir })
    slot.release()
    assert.ok(readFileSync(s.log, 'utf8').includes('"sentinel_removed"'))
  } finally {
    await cleanUp(s)
  }
})

test('a keeper killed by a signal: hold.json still refuses other seats in new code, and its dead sentinel is reclaimed as today', async () => {
  const s = scratch()
  try {
    await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--dir', s.dir], quiet)
    const sentinel = await until(() => sentinelOf(s.entry))
    process.kill(sentinel.pid, 'SIGKILL')
    assert.ok(await until(() => !pidAlive(sentinel.pid), 2000))
    await assert.rejects(acquireDesktopRun({ seat: 'cu-researcher', runId: 'other', dir: s.dir }), (e) => e.details?.reason === 'desktop_held')
    const slot = await acquireDesktopRun({ seat: 'cu-verifier', runId: 'own', dir: s.dir })
    assert.equal(read(s.entry).runId, 'own', 'the dead sentinel was reclaimed')
    slot.release()
    assert.equal(read(s.entry), null, 'with the keeper dead nothing is put back')
  } finally {
    await cleanUp(s)
  }
})

test('--wait-free counts the sentinel as free, and status names no run while it stands', async () => {
  const s = scratch()
  try {
    const lines = []
    const write = (line) => lines.push(JSON.parse(line))
    assert.equal(await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--dir', s.dir], quiet), 0)
    assert.ok(await until(() => sentinelOf(s.entry)))
    const started = Date.now()
    assert.equal(await main(['hold', '--seat', 'cu-verifier', '--minutes', '1', '--wait-free', '3', '--dir', s.dir], { write }), 0, 'free at once: the holder\'s own sentinel is not a run')
    assert.ok(Date.now() - started < 1500 * FACTOR)
    assert.equal(lines.at(-1).free, true)
    assert.equal(await main(['status', '--dir', s.dir], { write }), 0)
    assert.deepEqual([lines.at(-1).run, lines.at(-1).sentinel, lines.at(-1).hold.seat], [null, true, 'cu-verifier'])
    assert.equal(read(s.hold).keeperPid, sentinelOf(s.entry).pid, 'the extension kept the one keeper')
  } finally {
    await cleanUp(s)
  }
})

test('every run\'s entry records the checkout commit it came from, and status shows it; git failing or odd output gives null', async () => {
  const s = scratch()
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim()
    const slot = await acquireDesktopRun({ seat: 'cu-researcher', runId: 'with-commit', dir: s.dir })
    assert.equal(read(s.entry).commit, head)
    const lines = []
    await main(['status', '--dir', s.dir], { write: (line) => lines.push(JSON.parse(line)) })
    assert.equal(lines.at(-1).run.commit, head)
    slot.release()
    assert.equal(checkoutCommit({ run: () => { throw new Error('not a git repository') } }), null)
    assert.equal(checkoutCommit({ run: () => 'fatal: ambiguous argument HEAD' }), null)
    assert.equal(checkoutCommit({ run: () => `${'a'.repeat(40)}\n` }), 'a'.repeat(40))
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
})

/** A pid that was a real process and is now dead (killed by a signal, as a keeper can be). */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  const { pid } = child
  child.kill('SIGKILL')
  await new Promise((resolve) => child.once('exit', resolve))
  assert.ok(await until(() => !pidAlive(pid), 2000), 'the child is gone')
  return pid
}

test('CU-117: a mutex left by a holder killed mid-hold (its owner pid dead) is taken at once, not after the 60 s stale age', async () => {
  const s = scratch()
  try {
    const lock = join(s.dir, '.lock')
    mkdirSync(lock)
    writeFileSync(join(lock, 'owner'), `${await deadPid()}\n`)
    const started = Date.now()
    const slot = await acquireDesktopRun({ seat: 'cu-researcher', runId: 'after-dead-holder', dir: s.dir, lockTimeoutMs: 2000 * FACTOR })
    assert.ok(Date.now() - started < 1000 * FACTOR, `taken in ${Date.now() - started} ms`)
    assert.equal(existsSync(lock), false, 'the mutex is released after the acquire, owner file and all')
    slot.release()
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
})

test('CU-117: a live holder\'s mutex is still waited for, and a mutex without an owner (an older checkout\'s) keeps the age rule', async () => {
  const s = scratch()
  try {
    const lock = join(s.dir, '.lock')
    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'owner'), `${holder.pid}\n`)
      await assert.rejects(acquireDesktopRun({ seat: 'cu-researcher', runId: 'live-holder', dir: s.dir, lockTimeoutMs: 300 }), (e) => e.details?.reason === 'run_lock_busy')
    } finally {
      holder.kill('SIGKILL')
    }
    rmSync(join(lock, 'owner'))
    await assert.rejects(acquireDesktopRun({ seat: 'cu-researcher', runId: 'old-style', dir: s.dir, lockTimeoutMs: 300 }), (e) => e.details?.reason === 'run_lock_busy', 'no owner file: waited, as before')
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
})

test('CU-117 end to end: a process killed inside the mutex (its own take wrote the owner) frees the lock for the next caller at once', async () => {
  const s = scratch()
  try {
    // An entry in run.json makes the child's acquire ask isAlive inside the mutex - where the child kills itself.
    writeFileSync(s.entry, `${JSON.stringify({ seat: 'cu-other-seat', runId: 'old', pid: 999999, startedAt: new Date().toISOString() })}\n`)
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { acquireDesktopRun } from ${JSON.stringify(pathToFileURL(RUN_LOCK).href)}
      await acquireDesktopRun({ seat: 'cu-verifier', runId: 'dies-inside', dir: ${JSON.stringify(s.dir)}, isAlive: () => process.kill(process.pid, 'SIGKILL') })
    `], { stdio: 'ignore' })
    await new Promise((resolve) => child.once('exit', resolve))
    assert.ok(existsSync(join(s.dir, '.lock')), 'the killed child left the mutex behind')
    assert.equal(Number(readFileSync(join(s.dir, '.lock', 'owner'), 'utf8')), child.pid, 'its own take named it')
    const started = Date.now()
    const slot = await acquireDesktopRun({ seat: 'cu-researcher', runId: 'next', dir: s.dir, lockTimeoutMs: 2000 * FACTOR, isAlive: (pid) => pid !== 999999 && pidAlive(pid) })
    assert.ok(Date.now() - started < 1000 * FACTOR, `the next caller got it in ${Date.now() - started} ms, not after the stale age`)
    slot.release()
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
})

test('CU-117: two waiters breaking the same dead holder\'s mutex take turns - the one that paused never drops the fresh mutex the other took', async () => {
  const s = scratch()
  let children = []
  try {
    const lock = join(s.dir, '.lock')
    mkdirSync(lock)
    writeFileSync(join(lock, 'owner'), `${await deadPid()}\n`)
    const flag = (name) => join(s.dir, name)
    const mutexModule = JSON.stringify(pathToFileURL(RUN_LOCK).href)
    const common = `
      import { existsSync, writeFileSync } from 'node:fs'
      import { takeLockMutex, dropLockMutex } from ${mutexModule}
      const flag = (name) => ${JSON.stringify(s.dir)} + '/' + name
      // CU-127: every wait has a deadline and every take a bounded timeout, so a regression fails in seconds, not hangs.
      const wait = async (name) => {
        const deadline = Date.now() + ${10_000 * FACTOR}
        while (!existsSync(flag(name))) {
          if (Date.now() > deadline) { console.error('timed out waiting for ' + name); process.exit(2) }
          await new Promise((r) => setTimeout(r, 10))
        }
      }
      const opts = { now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), lockTimeoutMs: ${5_000 * FACTOR}, staleLockMs: 60000 }
      const lock = ${JSON.stringify(lock)}
    `
    // B decides to break the dead holder's mutex, then pauses until A is inside its fresh one.
    const b = spawn(process.execPath, ['--input-type=module', '-e', common + `
      await takeLockMutex(lock, { ...opts, beforeBreak: async () => { writeFileSync(flag('b-decided'), ''); await wait('a-in') } })
      writeFileSync(flag('b-in'), String(Date.now()))
      writeFileSync(flag('b-out'), String(Date.now()))
      dropLockMutex(lock)
    `], { stdio: ['ignore', 'ignore', 'inherit'] })
    // A starts once B has decided: it breaks the stale mutex, takes a fresh one and holds it 300 ms.
    const a = spawn(process.execPath, ['--input-type=module', '-e', common + `
      await wait('b-decided')
      await takeLockMutex(lock, opts)
      writeFileSync(flag('a-in'), String(Date.now()))
      await new Promise((r) => setTimeout(r, 300))
      writeFileSync(flag('a-out'), String(Date.now()))
      dropLockMutex(lock)
    `], { stdio: ['ignore', 'ignore', 'inherit'] })
    children = [a, b]
    const exited = Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))))
    // The deadline's timer is cleared once the race is decided, or it alone would keep the test file alive.
    let timer
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(true), 25_000 * FACTOR) })
    const late = await Promise.race([exited.then(() => false), deadline])
    clearTimeout(timer)
    assert.equal(late, false, 'both children exited in time')
    const missing = ['a-in', 'a-out', 'b-in'].filter((name) => !existsSync(flag(name)))
    assert.deepEqual(missing, [], `a child never got the mutex: ${missing.join(', ')} missing`)
    const at = (name) => Number(readFileSync(flag(name), 'utf8'))
    const [aIn, aOut, bIn] = [at('a-in'), at('a-out'), at('b-in')]
    assert.ok(bIn >= aOut, `B entered at ${bIn - aIn} ms after A, while A held the mutex until ${aOut - aIn} ms - two holders`)
    assert.equal(existsSync(lock), false, 'both released')
  } finally {
    // CU-127: a child that is still waiting is killed, so a failure never leaves the runner waiting on it.
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    rmSync(s.dir, { recursive: true, force: true })
  }
})
