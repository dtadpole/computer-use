// CU-335: one helper build at a time on this Mac - the host-wide lock that build.sh and build.mjs share. No compiler
// runs here: the rows hold the lock with a sleeper and time how long a second build waits for it.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { HELPER_DIR, underBuildLock } from './build.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cu-build-lock-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const unlocked = () => { const env = { ...process.env }; delete env.CU_HELPER_BUILD_LOCKED; return env }

/** Hold `lock` for `seconds` in a sleeper; resolves once the sleeper holds it. */
async function holdLock(lock, seconds) {
  const holder = spawn('/usr/bin/lockf', ['-k', lock, '/bin/sleep', String(seconds)], { stdio: 'ignore' })
  await pause(300)
  return holder
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
  const locked = source.slice(source.indexOf('function buildLocked('))
  assert.match(locked, /if \(existsSync\(executable\) && existsSync\(unitTests\)\) return/, 're-checks the cache first')
})
