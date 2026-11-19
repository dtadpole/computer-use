import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

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

test('CU-369: neither default-seat test imports the real registry, memory gate or browser launcher', () => {
  for (const file of DEFAULT_SEAT_TESTS) {
    const imports = [...read(file).matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1])
    for (const banned of ['browser-registry.mjs', 'browser-gate.mjs', '_vendor_/browser-use/']) {
      assert.ok(!imports.some((path) => path.includes(banned)), `${file} imports nothing from ${banned}`)
    }
  }
})

test('CU-369: both default-seat tests put an ambient CU_VERIFY_SEAT back after they delete it', () => {
  for (const file of DEFAULT_SEAT_TESTS) {
    const source = read(file)
    assert.match(source, /const ambientSeat = process\.env\.CU_VERIFY_SEAT/, `${file} saves the ambient seat`)
    assert.match(source, /after\(\(\) => \{ if \(ambientSeat === undefined\) delete process\.env\.CU_VERIFY_SEAT; else process\.env\.CU_VERIFY_SEAT = ambientSeat \}\)/, `${file} restores it`)
  }
})
