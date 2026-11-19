import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

// CU-369: the two default-seat tests (they delete CU_VERIFY_SEAT to pin seat cu-verifier) must never take a real D-005 browser
// slot, or a gate's node step holds the slot cu-verifier's live rows need. On main they do not (cu-developer-two measured an
// empty /tmp/cu-browsers registry during both runs, 16 Nov); this guard keeps it so. It reads the sources, so it starts nothing.
const root = join(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const CHECK_BROWSER = '_tools_/verify-kit/check-browser.mjs'
const CHECK_BROWSER_TEST = '_tests_/verify-kit/check-browser.test.mjs'
const LIVE_PROBE_TEST = '_tests_/live-view/live-probe.test.mjs'
const DEFAULT_SEAT_TESTS = [CHECK_BROWSER_TEST, LIVE_PROBE_TEST]

/** The parameter names of startCheckBrowser's destructured defaults that reach a real effect (everything but seat / size). */
function sideEffectSeams() {
  const source = read(CHECK_BROWSER)
  const signature = source.match(/export async function startCheckBrowser\(\{([\s\S]*?)\}\s*=\s*\{\}\)/)
  assert.ok(signature, 'startCheckBrowser keeps its injectable-defaults signature')
  return [...signature[1].matchAll(/^\s*(\w+)\s*=/gm)].map((m) => m[1]).filter((name) => !['seat', 'width', 'height'].includes(name))
}

test('CU-369: startCheckBrowser still names its real-effect seams (registry, memory gate, Chrome, profile, downloads)', () => {
  const seams = sideEffectSeams()
  for (const seam of ['register', 'gate', 'open', 'available', 'makeProfile', 'removeProfile', 'deny']) assert.ok(seams.includes(seam), seam)
})

test('CU-369: check-browser.test.mjs fakes every real-effect seam, so no test there reaches the D-005 registry or Chrome', () => {
  const source = read(CHECK_BROWSER_TEST)
  const deps = source.match(/deps:\s*\{([\s\S]*?)\n\s{4}\},/)
  assert.ok(deps, 'the fakes() helper keeps one deps object')
  const faked = new Set([...deps[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]))
  for (const seam of sideEffectSeams()) assert.ok(faked.has(seam), `fakes() injects ${seam}`)
})

test('CU-369: neither default-seat test names the real registry, memory gate or browser launcher at all (static, dynamic or bare import)', () => {
  for (const file of DEFAULT_SEAT_TESTS) {
    const source = read(file)
    for (const banned of ['browser-registry', 'browser-gate', 'browser-use', 'registerBrowser', 'openPage', 'openBrowser']) {
      assert.ok(!source.includes(banned), `${file} never mentions ${banned}`)
    }
  }
})

// cu-developer-three (#1102 r1): live-probe.test.mjs imports live-probe.mjs, which imports the vendored launcher, so a source read
// alone cannot rule out a call one hop down. This runs both files in a child whose module hooks replace the real registry entry
// and browser launch with stand-ins that record the call and throw: the run must pass with nothing recorded.
test('CU-369: at run time neither default-seat test reaches the real registerBrowser, openPage or openBrowser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu369-'))
  const mark = join(dir, 'reached')
  try {
    const hooks = pathToFileURL(join(import.meta.dirname, 'default-seat-guard-hooks.mjs')).href
    const preload = `data:text/javascript,import { register } from 'node:module'; register(${JSON.stringify(hooks)})`
    // A child of the test runner inherits NODE_TEST_CONTEXT and would not run its own files; drop it so the child really runs them.
    const env = { ...process.env, CU369_MARK: mark }
    delete env.NODE_TEST_CONTEXT
    const run = spawnSync(process.execPath, ['--import', preload, '--test', '--test-reporter=tap', ...DEFAULT_SEAT_TESTS.map((f) => join(root, f))], {
      cwd: root, env, encoding: 'utf8', timeout: 240_000,
    })
    const ran = Number((run.stdout || '').match(/^# tests (\d+)$/m)?.[1] ?? 0)
    assert.ok(ran >= 15, `the child ran the default-seat tests (${ran} reported)`)
    assert.ok(!existsSync(mark), `nothing real was reached: ${existsSync(mark) ? readFileSync(mark, 'utf8') : ''}`)
    assert.equal(run.status, 0, `the default-seat tests pass under the guard hooks:\n${(run.stdout || '').slice(-1500)}${run.stderr || ''}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-369: both default-seat tests put an ambient CU_VERIFY_SEAT back after they delete it', () => {
  for (const file of DEFAULT_SEAT_TESTS) {
    const source = read(file)
    assert.match(source, /const ambientSeat = process\.env\.CU_VERIFY_SEAT/, `${file} saves the ambient seat`)
    assert.match(source, /after\(\(\) => \{ if \(ambientSeat === undefined\) delete process\.env\.CU_VERIFY_SEAT; else process\.env\.CU_VERIFY_SEAT = ambientSeat \}\)/, `${file} restores it`)
  }
})
