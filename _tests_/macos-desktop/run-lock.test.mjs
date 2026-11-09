import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { acquireDesktopRun, ENTRY_NAME, HOLD_CHAIN_GAP_MINUTES, HOLD_LOG_MAX_BYTES, HOLD_LOG_NAME, HOLD_NAME, holdDesktop, main, MAX_HOLD_CHAIN_MINUTES, MAX_HOLD_MINUTES, readHold, releaseHold, RUN_LOCK_DIR, waitForFree } from '../../_environments_/macos-desktop/run-lock.mjs'
import { scratch, stdioLink, stopFake } from './harness.mjs'

/**
 * The desktop-run lock (D-024): one desktop run team-wide. Every test uses a directory under `os.tmpdir()` and a fake
 * `isAlive`, so the team's real `/tmp/cu-desktop-run` is never touched and no real pid decides anything.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const root = scratch()
after(() => root.remove())
let dirs = 0
const freshDir = () => join(root.dir, `run-${(dirs += 1)}`)

/** Exit hooks recorded instead of installed on the test process. */
function hooks() {
  const installed = new Set()
  return { installed, onExit: (fn) => installed.add(fn), offExit: (fn) => installed.delete(fn) }
}

/** acquireDesktopRun with test defaults: pids 1001 and up are alive unless listed dead. */
function acquire(dir, fields = {}, dead = new Set()) {
  return acquireDesktopRun({ seat: 'cu-developer-two', runId: 'run-a', dir, pid: 1001, isAlive: (pid) => Number.isInteger(pid) && !dead.has(pid), ...hooks(), ...fields })
}

test('the default directory is the team-wide one; a second acquire is refused naming the holder seat, never its pid', async () => {
  assert.equal(RUN_LOCK_DIR, '/tmp/cu-desktop-run')
  const dir = freshDir()
  const first = await acquire(dir, { pid: 4242, now: () => Date.parse('2026-11-02T09:00:00Z'), commit: 'c'.repeat(40) })
  try {
    // CU-106: the entry also names the checkout commit the run came from.
    assert.deepEqual(first.entry, { seat: 'cu-developer-two', runId: 'run-a', pid: 4242, startedAt: '2026-11-02T09:00:00.000Z', commit: 'c'.repeat(40) })
    assert.deepEqual(JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8')), first.entry, 'one entry file holds the run')
    for (const fields of [{ seat: 'cu-developer-one', runId: 'run-b', pid: 5151 }, { seat: 'cu-developer-two', runId: 'run-c', pid: 4242 }]) {
      await assert.rejects(acquire(dir, fields), (error) => {
        assert.equal(error.code, 'resource_refused')
        assert.equal(error.details.reason, 'desktop_run_active')
        assert.deepEqual(error.details.holder, { seat: 'cu-developer-two', runId: 'run-a', startedAt: '2026-11-02T09:00:00.000Z' })
        assert.match(error.message, /seat cu-developer-two/)
        assert.match(error.message, /D-024/)
        assert.doesNotMatch(error.message, /4242/, 'the pid is never in the message')
        assert.doesNotMatch(JSON.stringify(error.details), /4242/, 'nor in the details')
        return true
      }, JSON.stringify(fields))
    }
    assert.deepEqual(JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8')).runId, 'run-a', 'a refusal leaves the holder in place')
    assert.equal(existsSync(join(dir, '.lock')), false, 'the mutex is released after a refusal')
  } finally {
    first.release()
  }
  const next = await acquire(dir, { seat: 'cu-developer-one', runId: 'run-b', pid: 5151 })
  assert.equal(next.entry.seat, 'cu-developer-one', 'after release the next seat gets the Mac')
  next.release()
})

test('an entry whose pid is dead, or that does not parse, is reclaimed', async () => {
  const dir = freshDir()
  mkdirSync(dir)
  writeFileSync(join(dir, ENTRY_NAME), `${JSON.stringify({ seat: 'cu-developer-one', runId: 'old', pid: 999, startedAt: '2026-11-01T00:00:00.000Z' })}\n`)
  const reclaimed = await acquire(dir, {}, new Set([999]))
  assert.equal(JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8')).runId, 'run-a')
  reclaimed.release()
  writeFileSync(join(dir, ENTRY_NAME), '{"seat": "cu-developer-one", "runId": ')
  const afterCorrupt = await acquire(dir)
  assert.equal(JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8')).runId, 'run-a')
  afterCorrupt.release()
  writeFileSync(join(dir, ENTRY_NAME), `${JSON.stringify({ seat: 'cu-developer-one', runId: 'nopid' })}\n`)
  const afterNoPid = await acquire(dir)
  afterNoPid.release()
})

test('a stale mutex (older than 60 s) is removed; a fresh one held past the timeout refuses run_lock_busy', async () => {
  const dir = freshDir()
  mkdirSync(join(dir, '.lock'), { recursive: true })
  const old = (Date.now() - 61_000) / 1000
  utimesSync(join(dir, '.lock'), old, old)
  const slot = await acquire(dir)
  assert.equal(existsSync(join(dir, '.lock')), false)
  slot.release()
  mkdirSync(join(dir, '.lock'))
  let clock = Date.now()
  const sleeps = []
  await assert.rejects(acquire(dir, { now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += 2500 } }),
    (error) => code('resource_refused')(error) && error.details.reason === 'run_lock_busy')
  assert.equal(sleeps.length, 4, 'retried for 10 s, then refused')
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false, 'no entry was written')
})

test('release is idempotent, removes the exit hook, and never deletes a later run\'s entry', async () => {
  const dir = freshDir()
  const exits = hooks()
  const slot = await acquire(dir, exits)
  assert.equal(exits.installed.size, 1, 'an exit hook guards the entry')
  slot.release()
  slot.release()
  assert.equal(slot.released, true)
  assert.equal(exits.installed.size, 0)
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false)
  // A run whose entry was reclaimed (here: its pid reported dead) must not remove its successor's entry.
  const stale = await acquire(dir, { pid: 2002 })
  const successor = await acquire(dir, { seat: 'cu-developer-one', runId: 'run-b', pid: 3003 }, new Set([2002]))
  stale.release()
  assert.equal(JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8')).runId, 'run-b')
  successor.release()
})

test('the exit hook removes the entry when the process ends without release', async () => {
  const dir = freshDir()
  const exits = hooks()
  await acquire(dir, exits)
  assert.equal(existsSync(join(dir, ENTRY_NAME)), true)
  for (const fn of exits.installed) fn()
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false)
})

test('a bad seat, run id or directory is refused before anything is written', async () => {
  const dir = freshDir()
  await assert.rejects(acquire(dir, { seat: 'hd-coordinator' }), code('invalid_argument'))
  await assert.rejects(acquire(dir, { seat: undefined }), code('invalid_argument'))
  await assert.rejects(acquire(dir, { runId: '../x' }), code('invalid_argument'))
  await assert.rejects(acquire(dir, { runId: 7 }), code('invalid_argument'))
  await assert.rejects(acquire('relative/dir'), code('invalid_argument'))
  assert.equal(existsSync(dir), false)
  const target = freshDir()
  mkdirSync(target)
  const link = freshDir()
  symlinkSync(target, link)
  await assert.rejects(acquire(link), (error) => code('resource_refused')(error) && error.details.reason === 'run_lock_unsafe')
  assert.equal(existsSync(join(target, ENTRY_NAME)), false, 'nothing written through the symlink')
})

/** A `runLock` seam over a test directory that records each acquire and release. */
function recordingLock(dir, fields = {}) {
  const log = []
  const runLock = async (args) => {
    const slot = await acquire(dir, { ...fields, ...args })
    log.push(`acquire ${args.seat} ${args.runId}`)
    return { entry: slot.entry, release: () => { log.push('release'); slot.release() } }
  }
  return { log, runLock }
}

test('the environment takes the lock before the helper starts and releases it on close', async () => {
  const dir = freshDir()
  const { log, runLock } = recordingLock(dir)
  let child = null
  const connect = async () => {
    log.push('connect')
    assert.equal(existsSync(join(dir, ENTRY_NAME)), true, 'the lock is held before any helper starts')
    const started = await stdioLink({})
    child = started.child
    return started.link
  }
  const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runId: 'env-run', runLock, connect })
  try {
    assert.deepEqual(env.run, { seat: 'cu-developer-two', runId: 'env-run' })
    let connected = 0
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-one', runLock, connect: async () => { connected += 1 } }),
      (error) => code('resource_refused')(error) && error.details.reason === 'desktop_run_active' && error.details.holder.seat === 'cu-developer-two')
    assert.equal(connected, 0, 'a refused run starts no helper')
  } finally {
    await env.close()
    await env.close()
    await stopFake(child)
  }
  assert.deepEqual(log, ['acquire cu-developer-two env-run', 'connect', 'release'], 'released once, after the helper was told bye')
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false)
})

test('runLockDir: the environment takes acquireDesktopRun in that directory, a second run there is refused, close releases it', async () => {
  const dir = freshDir()
  let child = null
  const connect = async () => {
    const started = await stdioLink({})
    child = started.child
    return started.link
  }
  const env = await launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runId: 'dir-run', runLockDir: dir, connect })
  try {
    const entry = JSON.parse(readFileSync(join(dir, ENTRY_NAME), 'utf8'))
    assert.deepEqual([entry.seat, entry.runId, entry.pid], ['cu-developer-two', 'dir-run', process.pid], 'the entry is written in runLockDir')
    let connected = 0
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-one', runLockDir: dir, connect: async () => { connected += 1 } }),
      (error) => code('resource_refused')(error) && error.details.reason === 'desktop_run_active' && error.details.holder.seat === 'cu-developer-two' && error.details.holder.runId === 'dir-run')
    assert.equal(connected, 0, 'a refused run starts no helper')
  } finally {
    await env.close()
    await stopFake(child)
  }
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false, 'released on close')
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLockDir: dir, connect: async () => { throw new EnvironmentError('helper_lost', 'no helper') } }), code('helper_lost'))
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false, 'released on a failed launch')
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLockDir: dir, runLock: async () => ({ release() {} }), connect }), code('invalid_argument'))
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLockDir: 'relative/lock', connect }), code('invalid_argument'))
})

test('the environment releases the lock on every launch failure: connect, start and the socket path', async () => {
  const dir = freshDir()
  const { log, runLock } = recordingLock(dir)
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLock, connect: async () => { throw new EnvironmentError('helper_lost', 'no helper') } }), code('helper_lost'))
  const first = log.splice(0)
  assert.match(first[0], /^acquire cu-developer-two desktop-[0-9a-f]{8}$/, 'without runId or control a fresh run id is made')
  assert.deepEqual(first.slice(1), ['release'])
  let child = null
  const connect = async () => {
    const started = await stdioLink({ grants: { screen: false, accessibility: true } })
    child = started.child
    return started.link
  }
  try {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runId: 'no-screen', runLock, connect }), code('not_granted'))
  } finally {
    if (child !== null) await stopFake(child)
  }
  assert.deepEqual(log.splice(0), ['acquire cu-developer-two no-screen', 'release'])
  const tmp = scratch()
  try {
    const launch = async () => {} // starts nothing, so the helper never connects
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runId: 'no-helper', runLock, cuHome: tmp.dir, runDir: join(tmp.dir, 'run'), launch, connectTimeoutMs: 50 }), code('timeout'))
  } finally {
    tmp.remove()
  }
  assert.deepEqual(log.splice(0), ['acquire cu-developer-two no-helper', 'release'])
  assert.equal(existsSync(join(dir, ENTRY_NAME)), false)
  const control = { runId: 'from-control', signal: new AbortController().signal }
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', control, runLock, connect: async () => { throw new EnvironmentError('helper_lost', 'no helper') } }), code('helper_lost'))
  assert.deepEqual(log.splice(0), ['acquire cu-developer-two from-control', 'release'], 'the run id defaults to the control\'s')
})

test('a lock seam that throws a plain error or grants no slot refuses the run without its text', async () => {
  let connected = 0
  const connect = async () => { connected += 1 }
  const plain = async () => { throw Object.assign(new Error('EACCES: permission denied, mkdir \'/tmp/cu-desktop-run\''), { code: 'EACCES' }) }
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLock: plain, connect }),
    (error) => code('resource_refused')(error) && error.details.reason === 'EACCES' && !error.message.includes('/tmp'))
  await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: 'cu-developer-two', runLock: async () => ({}), connect }), code('resource_refused'))
  assert.equal(connected, 0)
})

// The hold (CU-75): a seat's announced multi-run hold, enforced by the lock.
const held = (seat) => (error) => code('resource_refused')(error) && error.details.reason === 'desktop_held' && error.details.holder.seat === seat

test('a hold keeps the Mac for its seat across runs: another seat between two of them is refused desktop_held, never by pid', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T07:00:00Z')
  const hold = await holdDesktop({ seat: 'cu-verifier', minutes: 10, reason: 'Q-D15 probe set', dir, now: () => t0 })
  assert.match(hold.token, /^[0-9a-f]{16}$/, 'CU-327: a fresh hold names its token')
  assert.deepEqual(hold, { seat: 'cu-verifier', since: '2026-11-06T07:00:00.000Z', heldAt: '2026-11-06T07:00:00.000Z', until: '2026-11-06T07:10:00.000Z', reason: 'Q-D15 probe set', token: hold.token })
  assert.deepEqual(JSON.parse(readFileSync(join(dir, HOLD_NAME), 'utf8')), hold)
  const at = () => t0 + 60_000
  const first = await acquire(dir, { seat: 'cu-verifier', runId: 'probe-1', now: at })
  first.release()
  // The gap between the holder's runs: the gate that took the Mac at 07:07:48 is refused now.
  let refusal = null
  await assert.rejects(acquire(dir, { seat: 'cu-integrator', runId: 'gate-152', pid: 5150, now: at }), (e) => { refusal = e; return held('cu-verifier')(e) })
  assert.deepEqual(refusal.details.holder, { seat: 'cu-verifier', until: '2026-11-06T07:10:00.000Z', reason: 'Q-D15 probe set' })
  assert.match(refusal.message, /seat cu-verifier holds this Mac until 2026-11-06T07:10:00.000Z \(Q-D15 probe set\)/)
  assert.doesNotMatch(refusal.message + JSON.stringify(refusal.details), /5150|1001/, 'no pid in what reaches the model')
  assert.ok(!existsSync(join(dir, ENTRY_NAME)), 'the refused run wrote nothing')
  const second = await acquire(dir, { seat: 'cu-verifier', runId: 'probe-2', now: at })
  second.release()
  // Expired: ignored, the other seat starts.
  const later = await acquire(dir, { seat: 'cu-integrator', runId: 'gate-152', now: () => t0 + 11 * 60_000 })
  later.release()
})

test('a hold is never taken over: another seat\'s live hold refuses holdDesktop; the same seat extends its own', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T07:00:00Z')
  const first = await holdDesktop({ seat: 'cu-researcher', minutes: 8, reason: 'CU-74 check', dir, now: () => t0 })
  await assert.rejects(holdDesktop({ seat: 'cu-developer-three', minutes: 5, dir, now: () => t0 + 1000 }), held('cu-researcher'))
  const extended = await holdDesktop({ seat: 'cu-researcher', minutes: 12, reason: 'CU-74 check, second pass', token: first.token, dir, now: () => t0 + 60_000 })
  assert.equal(extended.until, '2026-11-06T07:13:00.000Z')
  assert.equal(readHold({ dir, now: () => t0 + 60_000 }).reason, 'CU-74 check, second pass')
  // Expired, another seat may hold.
  assert.equal((await holdDesktop({ seat: 'cu-developer-three', minutes: 5, dir, now: () => t0 + 14 * 60_000 })).seat, 'cu-developer-three')
})

test('a run already active continues under a new hold; the holder waits for it like anyone (desktop_run_active)', async () => {
  const dir = freshDir()
  const running = await acquire(dir, { seat: 'cu-integrator', runId: 'gate', pid: 2002 })
  await holdDesktop({ seat: 'cu-verifier', minutes: 5, dir })
  await assert.rejects(acquire(dir, { seat: 'cu-verifier', runId: 'step4' }), (e) => code('resource_refused')(e) && e.details.reason === 'desktop_run_active')
  running.release()
  const mine = await acquire(dir, { seat: 'cu-verifier', runId: 'step4' })
  mine.release()
})

test('releaseHold ends only the seat\'s own hold; an unreadable or expired hold is ignored and cleared', async () => {
  const dir = freshDir()
  await holdDesktop({ seat: 'cu-verifier', minutes: 5, dir })
  assert.equal(await releaseHold({ seat: 'cu-integrator', dir }), false, 'another seat cannot end it')
  assert.equal(readHold({ dir }).seat, 'cu-verifier')
  assert.equal(await releaseHold({ seat: 'cu-verifier', dir }), true)
  assert.equal(readHold({ dir }), null)
  assert.equal(JSON.parse(readFileSync(join(dir, HOLD_NAME), 'utf8')).released, true, 'ended, kept as the chain\'s memory')
  assert.equal(await releaseHold({ seat: 'cu-verifier', dir }), false, 'nothing left to release')
  assert.ok(existsSync(join(dir, HOLD_NAME)), 'the seat\'s own ended hold stays for the chain gap')
  writeFileSync(join(dir, HOLD_NAME), '{not json')
  assert.equal(readHold({ dir }), null)
  const run = await acquire(dir, { seat: 'cu-integrator', runId: 'gate' })
  run.release()
  assert.equal(await releaseHold({ seat: 'cu-integrator', dir }), false)
  assert.ok(!existsSync(join(dir, HOLD_NAME)), 'an unreadable hold is cleared by a release')
  writeFileSync(join(dir, HOLD_NAME), JSON.stringify({ seat: 'not a seat', until: '2999-01-01T00:00:00Z' }))
  assert.equal(readHold({ dir }), null, 'a hold without a seat key is not a hold')
})

test('holdDesktop refuses a bad seat, a length outside 0 to MAX_HOLD_MINUTES, or a long reason', async () => {
  const dir = freshDir()
  assert.equal(MAX_HOLD_MINUTES, 30)
  for (const [fields, field] of [[{ seat: 'owner' }, 'seat'], [{ minutes: 0 }, 'minutes'], [{ minutes: 31 }, 'minutes'], [{ minutes: Number.NaN }, 'minutes'], [{ reason: 'x'.repeat(201) }, 'reason']]) {
    await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 5, dir, ...fields }), (e) => code('invalid_argument')(e) && e.details?.field === field, JSON.stringify(fields))
  }
  assert.equal(readHold({ dir }), null)
})

test('the CLI: hold, status, a refused hold (exit 1), release, and usage (exit 2), one JSON line each', async () => {
  const dir = freshDir()
  const lines = []
  const run = (argv) => main([...argv, '--dir', dir], { write: (line) => lines.push(JSON.parse(line)) })
  assert.equal(await run(['hold', '--seat', 'cu-verifier', '--minutes', '15', '--reason', 'step 4 with the owner']), 0)
  assert.equal(lines.at(-1).held.seat, 'cu-verifier')
  assert.equal(await run(['status']), 0)
  assert.deepEqual([lines.at(-1).hold.seat, lines.at(-1).hold.reason, lines.at(-1).run], ['cu-verifier', 'step 4 with the owner', null])
  assert.equal(await run(['hold', '--seat', 'cu-integrator', '--minutes', '5']), 1)
  assert.equal(lines.at(-1).reason, 'desktop_held')
  assert.equal(await run(['release', '--seat', 'cu-verifier']), 0)
  assert.equal(lines.at(-1).released, true)
  assert.equal(await run(['hold', '--seat', 'cu-verifier', '--minutes', '45']), 2, 'past the cap')
  assert.equal(await run(['grab']), 2)
  assert.equal(await main(['hold', '--seat'], { write: (line) => lines.push(JSON.parse(line)) }), 2, 'a flag without its value')
})

test('the CLI runs when started through a symlinked path (macOS /tmp is /private/tmp): a hold through a link is a real hold', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const dir = freshDir()
  mkdirSync(dir, { recursive: true })
  const link = join(root.dir, `repo-link-${dirs}`)
  symlinkSync(repo, link)
  const cli = join(link, '_environments_/macos-desktop/run-lock.mjs')
  const held = spawnSync(process.execPath, [cli, 'hold', '--seat', 'cu-verifier', '--minutes', '1', '--reason', 'via a link', '--dir', dir], { encoding: 'utf8' })
  assert.equal(held.status, 0, held.stderr)
  assert.equal(JSON.parse(held.stdout).held.seat, 'cu-verifier', 'it printed the hold')
  assert.equal(readHold({ dir }).reason, 'via a link', 'and the hold is really there')
  const status = spawnSync(process.execPath, [cli, 'status', '--dir', dir], { encoding: 'utf8' })
  assert.equal(JSON.parse(status.stdout).hold.seat, 'cu-verifier')
  // Imported (not started), it runs nothing.
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(cli)})`], { encoding: 'utf8' })
  assert.equal([imported.status, imported.stdout].join('|'), '0|')
})

test('a chain of one seat\'s holds ends at an hour: extending past since + 60 min is refused desktop_hold_cap; releasing and holding again continues it; a 10-minute gap starts afresh', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T08:00:00Z')
  const min = (m) => () => t0 + m * 60_000
  assert.deepEqual([MAX_HOLD_CHAIN_MINUTES, HOLD_CHAIN_GAP_MINUTES], [60, 10])
  const { token } = await holdDesktop({ seat: 'cu-verifier', minutes: 30, reason: 'step 4', dir, now: min(0) })
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 30, token, dir, now: min(25) })).since, '2026-11-06T08:00:00.000Z', 'an extension keeps the chain\'s start')
  let refusal = null
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 30, token, dir, now: min(50) }), (e) => { refusal = e; return code('resource_refused')(e) && e.details.reason === 'desktop_hold_cap' })
  assert.deepEqual([refusal.details.since, refusal.details.capUntil], ['2026-11-06T08:00:00.000Z', '2026-11-06T09:00:00.000Z'])
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 10, token, dir, now: min(50) })).until, '2026-11-06T09:00:00.000Z', 'up to the cap exactly')
  // A loop that releases and holds again does not start a fresh hour.
  assert.equal(await releaseHold({ seat: 'cu-verifier', dir, now: min(55) }), true)
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 30, dir, now: min(56) }), (e) => e.details?.reason === 'desktop_hold_cap')
  // Another seat may hold in the gap; the first seat's chain is over once the gap passed.
  const other = await holdDesktop({ seat: 'cu-researcher', minutes: 5, dir, now: min(57) })
  assert.equal(other.since, '2026-11-06T08:57:00.000Z')
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 30, dir, now: min(75) })).since, '2026-11-06T09:15:00.000Z', 'a new chain after the gap')
  // An expired own hold, held again within the gap, continues its chain too.
  const dir2 = freshDir()
  const own = await holdDesktop({ seat: 'cu-verifier', minutes: 30, dir: dir2, now: min(0) })
  await holdDesktop({ seat: 'cu-verifier', minutes: 30, token: own.token, dir: dir2, now: min(25) })
  await assert.rejects(holdDesktop({ seat: 'cu-verifier', minutes: 30, dir: dir2, now: min(60) }), (e) => e.details?.reason === 'desktop_hold_cap', 'expired at 55, held again at 60: same chain')
  assert.equal((await holdDesktop({ seat: 'cu-verifier', minutes: 30, dir: dir2, now: min(66) })).since, '2026-11-06T09:06:00.000Z', 'gap of 11 minutes: new chain')
})

test('every hold, extension and release is one line of hold.log', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T09:00:00Z')
  const { token } = await holdDesktop({ seat: 'cu-verifier', minutes: 10, reason: 'overlap pass', dir, now: () => t0 })
  await holdDesktop({ seat: 'cu-verifier', minutes: 20, reason: 'overlap pass, longer', token, dir, now: () => t0 + 60_000 })
  await releaseHold({ seat: 'cu-verifier', dir, now: () => t0 + 120_000 })
  const lines = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(lines.map((line) => [line.action, line.seat]), [['hold', 'cu-verifier'], ['extend', 'cu-verifier'], ['release', 'cu-verifier']])
  assert.deepEqual([lines[0].at, lines[1].until, lines[1].reason], ['2026-11-06T09:00:00.000Z', '2026-11-06T09:21:00.000Z', 'overlap pass, longer'])
})

test('waitForFree: true at once when no live run holds the Mac, true once the run ends, false on timeout - and hold --wait-free does both in the race-free order', async () => {
  const dir = freshDir()
  assert.equal(await waitForFree({ dir, timeoutMs: 0 }), true, 'nothing there')
  const running = await acquire(dir, { seat: 'cu-integrator', runId: 'gate', pid: 3003 })
  let t = 0
  const clock = { now: () => t, sleep: async (ms) => { t += ms } }
  assert.equal(await waitForFree({ dir, timeoutMs: 2000, isAlive: () => true, ...clock }), false, 'the run outlasted the wait')
  assert.equal(await waitForFree({ dir, timeoutMs: 2000, isAlive: () => false, ...clock }), true, 'a dead pid is not a run')
  // The run ends while the waiter polls.
  let polls = 0
  const ending = { now: () => t, sleep: async (ms) => { t += ms; polls += 1; if (polls === 2) running.release() } }
  assert.equal(await waitForFree({ dir, timeoutMs: 10_000, isAlive: (pid) => pid === 3003, ...ending }), true)
  // The CLI: hold first, then wait; a run that outlasts the wait exits 3 with the hold kept.
  const busy = await acquire(dir, { seat: 'cu-integrator', runId: 'gate-2', pid: 3004 })
  const lines = []
  const write = (line) => lines.push(JSON.parse(line))
  const code3 = await main(['hold', '--seat', 'cu-verifier', '--minutes', '5', '--reason', 'step 4', '--wait-free', '1', '--dir', dir], { write, waitSeams: { isAlive: () => true, now: () => t, sleep: async (ms) => { t += ms } } })
  assert.equal(code3, 3)
  assert.deepEqual([lines.at(-1).held.seat, lines.at(-1).free], ['cu-verifier', false])
  assert.equal(readHold({ dir }).seat, 'cu-verifier', 'the hold stays: other seats cannot start while the run finishes')
  await assert.rejects(acquire(dir, { seat: 'cu-researcher', runId: 'r' }), held('cu-verifier'))
  busy.release()
  assert.equal(await main(['hold', '--seat', 'cu-verifier', '--minutes', '5', '--wait-free', '1', '--dir', dir], { write }), 0, 'the same seat re-holds and finds the Mac free')
  assert.equal(lines.at(-1).free, true)
  assert.equal(await main(['hold', '--seat', 'cu-verifier', '--minutes', '5', '--wait-free', 'soon', '--dir', dir], { write }), 2)
})

test('hold.log keeps its newer half once it passes HOLD_LOG_MAX_BYTES, cut at a line, and the newest line is always kept (CU-80)', async () => {
  const dir = freshDir()
  mkdirSync(dir, { recursive: true })
  const old = `${JSON.stringify({ at: '2026-11-01T00:00:00.000Z', action: 'hold', seat: 'cu-old', reason: 'x'.repeat(100) })}\n`
  writeFileSync(join(dir, HOLD_LOG_NAME), old.repeat(Math.ceil(HOLD_LOG_MAX_BYTES / old.length) + 10))
  const t0 = Date.parse('2026-11-06T10:00:00Z')
  await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'the newest', dir, now: () => t0 })
  const text = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8')
  assert.ok(text.length <= HOLD_LOG_MAX_BYTES / 2 + old.length, `trimmed to about half (${text.length} bytes)`)
  assert.ok(text.length > HOLD_LOG_MAX_BYTES / 4, 'not emptied')
  const lines = text.trim().split('\n').map((line) => JSON.parse(line)) // every kept line is whole JSON
  assert.deepEqual([lines.at(-1).seat, lines.at(-1).reason], ['cu-verifier', 'the newest'])
  assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.trim-')), [], 'the temp file was renamed over the log, none left')
  assert.ok(Buffer.byteLength(text) <= HOLD_LOG_MAX_BYTES / 2 + Buffer.byteLength(old), 'half in bytes')
  // Below the cap nothing is trimmed.
  const small = freshDir()
  await holdDesktop({ seat: 'cu-verifier', minutes: 5, dir: small, now: () => t0 })
  await releaseHold({ seat: 'cu-verifier', dir: small, now: () => t0 + 60_000 })
  assert.equal(readFileSync(join(small, HOLD_LOG_NAME), 'utf8').trim().split('\n').length, 2)
})

test('CU-120: heldAt is this hold\'s own start beside since, the chain\'s - a re-hold within the gap keeps since and starts a fresh heldAt; past the gap both are fresh; an extension keeps heldAt', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T07:00:00Z')
  const at = (minutes) => t0 + minutes * 60_000
  const iso = (minutes) => new Date(at(minutes)).toISOString()
  const first = await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'first', dir, now: () => at(0) })
  assert.equal(first.since, iso(0))
  assert.equal(first.heldAt, iso(0))
  // An extension of the live hold keeps its heldAt.
  const extended = await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'first, longer', token: first.token, dir, now: () => at(3) })
  assert.equal(extended.since, iso(0))
  assert.equal(extended.heldAt, iso(0), 'an extension is the same hold')
  // Released, then held again within the gap: the chain continues (since), the hold is new (heldAt).
  await releaseHold({ seat: 'cu-verifier', dir, now: () => at(4) })
  assert.equal(JSON.parse(readFileSync(join(dir, HOLD_NAME), 'utf8')).heldAt, iso(0), 'the ended hold keeps its heldAt')
  const again = await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'second', dir, now: () => at(6) })
  assert.equal(again.since, iso(0), 'within the gap: the chain\'s start')
  assert.equal(again.heldAt, iso(6), 'but a fresh hold')
  const live = readHold({ dir, now: () => at(7) })
  assert.equal(live.since, iso(0))
  assert.equal(live.heldAt, iso(6), 'readHold (and the CLI status) reports it')
  const logged = readFileSync(join(dir, HOLD_LOG_NAME), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(logged.filter((line) => line.action !== 'release').map((line) => [line.action, line.heldAt]), [['hold', iso(0)], ['extend', iso(0)], ['hold', iso(6)]])
  // Past the gap, a fresh chain: both are the new hold's time.
  await releaseHold({ seat: 'cu-verifier', dir, now: () => at(8) })
  const later = await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'third', dir, now: () => at(8 + HOLD_CHAIN_GAP_MINUTES + 1) })
  assert.equal(later.since, iso(8 + HOLD_CHAIN_GAP_MINUTES + 1))
  assert.equal(later.heldAt, iso(8 + HOLD_CHAIN_GAP_MINUTES + 1))
})

test('CU-120: a live hold from an older checkout (no heldAt) still reads, and an extension takes its since as heldAt', async () => {
  const dir = freshDir()
  const t0 = Date.parse('2026-11-06T07:00:00Z')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, HOLD_NAME), `${JSON.stringify({ seat: 'cu-verifier', since: new Date(t0).toISOString(), until: new Date(t0 + 600_000).toISOString(), reason: 'old' })}\n`)
  assert.equal(readHold({ dir, now: () => t0 + 60_000 }).heldAt, null)
  const extended = await holdDesktop({ seat: 'cu-verifier', minutes: 5, dir, now: () => t0 + 120_000 })
  assert.equal(extended.heldAt, new Date(t0).toISOString())
})
