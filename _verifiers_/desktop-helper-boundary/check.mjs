import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import net from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { buildCUHelper, buildWindowTable } from '../../_tools_/verify-kit/helper-build.mjs'
import { sutRoot } from '../../_tools_/verify-kit/sut.mjs'

/**
 * ULTIMATE_GOAL 2.0 environment row, the helper's peer boundary (D-029), before the grant: CUHelper with
 * --enforce-boundary refuses a driver that is not this project's (an impostor entry, code-loading flags) before it
 * sends a byte; accepts a project driver; shows an on-screen indicator while connected (by the window table); serves
 * one run at a time; and leaves when no driver comes within 10 s. CUHelper is built from the code under test; no
 * input, no capture, no prompt. Each run is announced: the indicator shows on the owner's display for about a second.
 */

const STAND_IN = fileURLToPath(new URL('./stand-in-driver.mjs', import.meta.url))
const NOT_AN_ENTRY = fileURLToPath(new URL('./not-an-entry.mjs', import.meta.url))
// The helper accepted only a script inside one of the owner's checkouts under the home directory: reflection's
// (~/reflection or ~/reflection--<seat>, the project under _projects_/heddle/_projects_/computer-use/) until the cutover
// (CU-7), and the standalone repository's (~/computer-use or ~/computer-use--<seat>, the project at its root, D-039)
// once the helper under test lists that layout (CU-2). A verifier run from elsewhere (an integrator's /tmp worktree),
// or from a layout the helper does not list yet, cannot judge the accepted case.
const HOME_PATTERN = homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const STAND_IN_REAL = realpathSync(STAND_IN)
const IN_REFLECTION = new RegExp(`^${HOME_PATTERN}/reflection(--[a-z0-9-]+)?/_projects_/heddle/_projects_/computer-use/`).test(STAND_IN_REAL)
const IN_REPOSITORY = new RegExp(`^${HOME_PATTERN}/computer-use(--[a-z0-9-]+)?/`).test(STAND_IN_REAL)
const helperListsRepository = () => {
  try {
    return readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/PeerCheck.swift'), 'utf8').includes('("computer-use", "")')
  } catch {
    return false
  }
}
// CU-295/CU-299: since 0.2.58 the helper also admits the checkouts this Mac's local config names (helperCheckouts) - an
// exact checkout or one named child of a worktrees parent, by real path - and from 0.2.60 only those. Read the file the
// helper reads, with its entry shape; a missing or malformed config admits nothing.
const ENTRY = /^~\/([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(\/\*)?$/
const configuredRoots = () => {
  try {
    const config = JSON.parse(readFileSync(join(homedir(), '.config/computer-use/config.json'), 'utf8'))
    const entries = Array.isArray(config?.helperCheckouts) ? config.helperCheckouts : []
    return entries.filter((entry) => typeof entry === 'string' && ENTRY.test(entry) && !entry.split('/').some((part) => part === '.' || part === '..'))
      .flatMap((entry) => {
        const parent = entry.endsWith('/*')
        try { return [{ parent, real: realpathSync(join(homedir(), entry.slice(2).replace(/\/\*$/, ''))) }] } catch { return [] }
      })
  } catch {
    return []
  }
}
const IN_CONFIGURED = configuredRoots().some(({ parent, real }) => STAND_IN_REAL.startsWith(`${real}/`) && (!parent || STAND_IN_REAL.slice(real.length + 1).includes('/')))
const helperListsConfigured = () => {
  try {
    return readFileSync(join(sutRoot(), '_environments_/macos-desktop/helper/Sources/PeerCheck.swift'), 'utf8').includes('helperCheckouts')
  } catch {
    return false
  }
}
const IN_HOME_CHECKOUT = IN_REFLECTION || (IN_REPOSITORY && helperListsRepository()) || (IN_CONFIGURED && helperListsConfigured())
const CHECKOUT_WHY = IN_REPOSITORY ? 'this verifier is in a ~/computer-use checkout, a layout the helper under test does not list (the compiled roots went in 0.2.60, CU-299)'
  : 'this verifier is not inside a checkout the local config names (helperCheckouts) or one the helper under test compiles in'
let helper
let windowTable
before(() => {
  helper = buildCUHelper(sutRoot())
  windowTable = helper.executable ? buildWindowTable() : null
})
const guard = (t) => {
  if (!skipUnless(t, Boolean(helper.executable), helper.why)) return false
  const [major, minor] = helper.version ?? [0, 0]
  return skipUnless(t, major > 0 || minor >= 2, `CUHelper ${helper.version?.join('.') ?? '?'} predates the D-029 boundary (0.2.0)`)
}

/** Run the stand-in driver as `node [flags] <script>` with a clean NODE_OPTIONS; resolves its JSON report. */
function driver(script, flags = [], env = {}) {
  return new Promise((resolve, reject) => {
    // A driver's environment must not load other code (the helper refuses DYLD_*, LD_*, NODE_OPTIONS, NODE_PATH, ...);
    // a case that tests one sets it explicitly.
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(DYLD_|LD_)/.test(name) && !['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)))
    Object.assign(environment, env)
    const child = spawn(process.execPath, [...flags, script, helper.executable, windowTable ?? '-'], { stdio: ['ignore', 'pipe', 'pipe'], env: environment })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.once('exit', () => {
      try {
        resolve(JSON.parse(out.trim().split('\n').at(-1)))
      } catch {
        reject(new Error(`no report from the stand-in driver: ${err.slice(-300)}`))
      }
    })
  })
}

test('an impostor driver - a copy named like agent core\'s cli.mjs outside the project - is refused before a byte is sent', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const root = mkdtempSync('/tmp/cu-verifier-impostor-')
  try {
    // Named like the real entry point in either layout (reflection's and the standalone repository's), outside home.
    for (const layout of ['_projects_/heddle/_projects_/computer-use/', '']) {
      const entry = join(root, layout, '_tools_/agent-core/cli.mjs')
      mkdirSync(join(entry, '..'), { recursive: true })
      copyFileSync(STAND_IN, entry)
      const report = await driver(entry)
      assert.equal(report.exit, 3, `${layout || 'repository root'}: exit ${report.exit}: ${report.stderr}`)
      assert.match(report.stderr, /not an allowed entry point/, `${layout || 'repository root'}: refused for another reason: ${report.stderr}`)
      assert.equal(report.bytes, 0, `${layout || 'repository root'}: the helper sent bytes to an impostor`)
      assert.equal(report.hello, null)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a project driver started with code-loading options is refused before a byte is sent', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const dir = mkdtempSync('/tmp/cu-verifier-preload-')
  try {
    const preload = join(dir, 'preload.cjs')
    writeFileSync(preload, '// loaded before the driver\n')
    for (const [name, flags, env] of [['--require', ['--require', preload], {}], ['NODE_OPTIONS', [], { NODE_OPTIONS: `--require=${preload}` }]]) {
      const report = await driver(STAND_IN, flags, env)
      assert.equal(report.exit, 3, `${name}: exit ${report.exit}: ${report.stderr}`)
      assert.match(report.stderr, /loads? other code/, `${name}: refused for another reason: ${report.stderr}`)
      assert.equal(report.bytes, 0, `${name}: the helper sent bytes`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an in-project script that is not a listed entry point is refused before a byte is sent (design 0.3.3)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  // From outside a home checkout the location rule would refuse it first, so only a home checkout judges the entry list.
  if (!skipUnless(t, IN_HOME_CHECKOUT, `the entry-list case: ${CHECKOUT_WHY}`)) return
  const report = await driver(NOT_AN_ENTRY)
  assert.equal(report.exit, 3, `exit ${report.exit}: ${report.stderr}`)
  assert.match(report.stderr, /not an allowed entry point/, `refused for another reason: ${report.stderr}`)
  assert.equal(report.bytes, 0, 'the helper sent bytes to a non-entry script')
})

/** Whether the helper under test lists the stand-in driver (helper-boundary.md 0.3.5). */
const standInListed = () => {
  const source = join(sutRoot(), '_environments_/macos-desktop/helper/Sources/PeerCheck.swift')
  return existsSync(source) && readFileSync(source, 'utf8').includes('_verifiers_/desktop-helper-boundary/stand-in-driver.mjs')
}

test('the listed stand-in driver is accepted, and the indicator is on screen while it is connected', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, IN_HOME_CHECKOUT, `the accepted case: ${CHECKOUT_WHY}`)) return
  if (!skipUnless(t, standInListed(), 'the helper does not list the stand-in driver yet (helper-boundary.md 0.3.5)')) return
  const report = await driver(STAND_IN)
  assert.equal(report.exit, 0, `exit ${report.exit}: ${report.stderr}`)
  assert.ok(report.hello, 'no hello for the listed stand-in')
  assert.equal(report.tokenMatches, true, 'the hello did not carry the token back')
  assert.ok(Array.isArray(report.windowsWhileConnected) && report.windowsWhileConnected.some((w) => w.alpha > 0 && w.bounds?.Width > 0 && w.bounds?.Height > 0), `no on-screen window owned by the helper while connected: ${JSON.stringify(report.windowsWhileConnected)}`)
})

test('the stand-in driver only waits for the hello and sends bye: its one socket write is a bye (the condition of its listing)', () => {
  const source = readFileSync(STAND_IN, 'utf8')
  const writes = source.match(/socket\.write\(/g) ?? []
  assert.equal(writes.length, 1, `${writes.length} socket writes in the stand-in`)
  assert.match(source, /socket\.write\(`\$\{JSON\.stringify\(\{ id: 1, type: 'bye' \}\)\}\\n`\)/, 'the one write is not a bye')
  for (const request of ['scope', 'capture', 'input', 'hitTest', 'focused', 'screenText', 'watch', 'pauseOnLocalInput', 'simulateLocalInput']) {
    assert.ok(!new RegExp(`type: '${request}'`).test(source), `the stand-in names the ${request} request`)
  }
  assert.ok(!/import .* from '\.\.\//.test(source), 'the stand-in imports code from outside its folder')
})

test('one helper at a time, and none lingers without a driver: a second exits 4, a driverless one exits 2 within 12 s', { timeout: 40_000 }, async (t) => {
  if (!guard(t)) return
  const dir = mkdtempSync('/tmp/cu-verifier-helper-')
  chmodSync(dir, 0o700)
  writeFileSync(join(dir, 'token'), 'x', { mode: 0o600 })
  const start = (args) => {
    const child = spawn(helper.executable, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
    return { child, exited }
  }
  try {
    const started = Date.now()
    // A private lock (--lock-path), so this check never meets a real run's helper.
    const lock = ['--lock-path', join(dir, 'helper.lock')]
    const waiting = start(['--socket', join(dir, 'nobody.sock'), '--token-file', join(dir, 'token'), '--enforce-boundary', ...lock])
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const server = net.createServer()
    await new Promise((resolve) => server.listen(join(dir, 'second.sock'), resolve))
    const second = start(['--socket', join(dir, 'second.sock'), '--token-file', join(dir, 'token'), '--enforce-boundary', ...lock])
    const secondExit = await Promise.race([second.exited, new Promise((resolve) => setTimeout(() => resolve('running'), 8000))])
    server.close()
    if (secondExit === 'running') second.child.kill('SIGKILL')
    assert.equal(secondExit, 4, `a second helper ${secondExit === 'running' ? 'kept running' : `exited ${secondExit}`}`)
    const firstExit = await Promise.race([waiting.exited, new Promise((resolve) => setTimeout(() => resolve('running'), 12_000 - (Date.now() - started)))])
    if (firstExit === 'running') waiting.child.kill('SIGKILL')
    assert.equal(firstExit, 2, `a driverless helper ${firstExit === 'running' ? 'lingered past 12 s' : `exited ${firstExit}`}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
