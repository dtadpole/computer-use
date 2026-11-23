// CU-335: one helper build at a time on this Mac - the host-wide lock that build.sh and build.mjs share. No compiler
// runs here: the rows hold the lock with a sleeper and time how long a second build waits for it.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'

import { cacheComplete, cachePaths, HELPER_DIR, underBuildLock } from './build.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cu-build-lock-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const unlocked = () => { const env = { ...process.env }; delete env.CU_HELPER_BUILD_LOCKED; return env }

/**
 * Hold `lock` for `seconds` in a sleeper; resolves once the sleeper holds it. A fixed 300 ms pause used to stand in for
 * "holds it", and under load lockf had not yet taken the lock, so the row's own build took it at once (the timeout row's
 * "Missing expected exception", #500's gate 07:09Z, 12 Nov). Now a non-blocking probe (`lockf -k -t 0`, which keeps the
 * file, so the holder's inode stays the lock) is retried until it is refused (exit 75): only then does the sleeper hold it.
 */
async function holdLock(lock, seconds) {
  const holder = spawn('/usr/bin/lockf', ['-k', lock, '/bin/sleep', String(seconds)], { stdio: 'ignore' })
  const deadline = Date.now() + 10_000
  for (;;) {
    const probe = spawnSync('/usr/bin/lockf', ['-k', '-t', '0', lock, '/usr/bin/true'])
    if (probe.status === 75) return holder
    if (Date.now() > deadline) { holder.kill(); throw new Error(`the sleeper never took ${lock} (probe exit ${probe.status})`) }
    await pause(25)
  }
}

test('CU-335: a second build waits for the lock instead of compiling alongside', async () => {
  const lock = join(dir, 'wait.lock')
  const holder = await holdLock(lock, 2)
  const started = Date.now()
  underBuildLock(['/usr/bin/true'], { lock, waitSeconds: 10, env: unlocked() })
  const waited = Date.now() - started
  holder.kill()
  assert.ok(waited >= 1200, `it waited for the holder (${waited} ms)`)
})

test('CU-335: a caller that holds the lock (CU_HELPER_BUILD_LOCKED=1, e.g. a gate wrapping its helper step) runs at once', async () => {
  const lock = join(dir, 'held.lock')
  const holder = await holdLock(lock, 3)
  const started = Date.now()
  underBuildLock(['/usr/bin/true'], { lock, waitSeconds: 10, env: { ...process.env, CU_HELPER_BUILD_LOCKED: '1' } })
  holder.kill()
  assert.ok(Date.now() - started < 1000, 'no wait for its own hold')
})

test('CU-335: a wait past the bound fails, naming the lock', async () => {
  const lock = join(dir, 'timeout.lock')
  const holder = await holdLock(lock, 4)
  try {
    assert.throws(() => underBuildLock(['/usr/bin/true'], { lock, waitSeconds: 1, env: unlocked() }), /another helper build held .*timeout\.lock for 1 s/)
  } finally {
    holder.kill()
  }
})

test('CU-335: build.sh takes the same lock itself (install.sh and the verifiers\' builds), unless its caller holds it', async () => {
  const lock = join(dir, 'script.lock')
  const env = { ...process.env, CU_HELPER_BUILD_LOCK: lock, CU_HELPER_BUILD_WAIT: '10' }
  delete env.CU_HELPER_BUILD_LOCKED
  const holder = await holdLock(lock, 2)
  // No output dir: the script prints its usage and exits 2 - but only after it holds the lock.
  let started = Date.now()
  const waited = spawnSync('bash', [join(HELPER_DIR, 'build.sh')], { env, encoding: 'utf8' })
  const ms = Date.now() - started
  assert.equal(waited.status, 2)
  assert.match(waited.stderr, /usage: bash build\.sh/)
  assert.ok(ms >= 1200, `build.sh waited for the lock (${ms} ms)`)
  holder.kill()
  const again = await holdLock(lock, 3)
  started = Date.now()
  const nested = spawnSync('bash', [join(HELPER_DIR, 'build.sh')], { env: { ...env, CU_HELPER_BUILD_LOCKED: '1' }, encoding: 'utf8' })
  assert.equal(nested.status, 2)
  assert.ok(Date.now() - started < 1000, 'a caller that holds the lock (build.mjs) is not made to wait for itself')
  again.kill()
})

test('CU-335: buildAll compiles only under the lock, in a child that re-checks the cache once it holds it', () => {
  const source = readFileSync(new URL('./build.mjs', import.meta.url), 'utf8')
  const buildAll = source.slice(source.indexOf('export function buildAll('), source.indexOf('function buildLocked('))
  assert.match(buildAll, /underBuildLock\(\[process\.execPath, fileURLToPath\(import\.meta\.url\), '--build', hash, cacheRoot\]\)/)
  assert.doesNotMatch(buildAll, /execFileSync\('(bash|swiftc)'/, 'no compile outside the lock')
  assert.match(buildAll, /if \(cacheComplete\(cache\)\) return \{ root/, 'CU-653: the fast path trusts only a whole cache, too')
  const locked = source.slice(source.indexOf('function buildLocked('))
  assert.match(locked, /if \(cacheComplete\(cache\)\) return/, 're-checks the cache first')
  assert.match(locked, /rmSync\(root, \{ recursive: true, force: true \}\)/, 'and removes a broken one before building')
})

test('CU-653: a cache counts only when the bundle is whole - executable, unit tests, Info.plist and a verified seal', () => {
  const root = mkdtempSync(join(dir, 'cache-'))
  const cache = cachePaths('0123456789abcdef', root)
  const plist = join(cache.app, 'Contents', 'Info.plist')
  mkdirSync(dirname(cache.executable), { recursive: true })
  for (const path of [cache.executable, cache.unitTests, plist]) writeFileSync(path, 'x')
  let verified = 0
  const sealed = { verify: () => { verified += 1 } }
  assert.equal(cacheComplete(cache, sealed), true, 'every part present and the seal verifies')
  const refused = Object.assign(new Error('a sealed resource is missing'), { status: 1 })
  assert.equal(cacheComplete(cache, { verify: () => { throw refused } }), false, 'a broken seal: codesign exits non-zero')
  const timedOut = Object.assign(new Error('spawnSync /usr/bin/codesign ETIMEDOUT'), { code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' })
  assert.equal(cacheComplete(cache, { verify: () => { throw timedOut } }), true, 'a codesign timeout says nothing about the bundle: keep the cache')
  rmSync(plist)
  verified = 0
  assert.equal(cacheComplete(cache, sealed), false, 'Info.plist gone (what the 20 Nov tmp cleaner took)')
  assert.equal(verified, 0, 'a missing part fails before codesign runs')
  writeFileSync(plist, 'x')
  rmSync(cache.unitTests)
  assert.equal(cacheComplete(cache, sealed), false, 'the unit-test binary gone')
  writeFileSync(cache.unitTests, 'x')
  assert.equal(cacheComplete(cache), false, 'the real codesign refuses an unsigned stand-in bundle')
})
