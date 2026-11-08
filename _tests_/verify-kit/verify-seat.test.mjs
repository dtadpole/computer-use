import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DEFAULT_VERIFY_SEAT, verifySeat } from '../../_tools_/verify-kit/seat.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

test('CU-156: verifySeat is CU_VERIFY_SEAT when it names a seat, else cu-verifier; anything else is refused', () => {
  assert.equal(DEFAULT_VERIFY_SEAT, 'cu-verifier')
  assert.equal(verifySeat({}), 'cu-verifier', 'unset: the suite runs as before')
  assert.equal(verifySeat({ CU_VERIFY_SEAT: '' }), 'cu-verifier', 'empty is unset')
  assert.equal(verifySeat({ CU_VERIFY_SEAT: 'cu-integrator' }), 'cu-integrator', 'the gate runs as its own seat')
  assert.equal(verifySeat({ CU_VERIFY_SEAT: 'cu-developer-two' }), 'cu-developer-two')
  for (const bad of ['cu verifier', 'CU-INTEGRATOR', '../cu-x', 'cu-', 'integrator', 'cu-a-b-c-d-e', 'cu-x\n']) {
    assert.throws(() => verifySeat({ CU_VERIFY_SEAT: bad }), /not a seat name/, JSON.stringify(bad))
  }
})

/** Every .mjs file under a folder. */
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : name.endsWith('.mjs') ? [path] : []
  })
}

// Whole 'cu-verifier' literals that are not a seat, stripped before the check: the fake helper's handshake token and
// the MCP client name. Anything else spelled as the whole name, in any quotes, is a seat - including a direct read of
// the knob (CU_VERIFY_SEAT || 'cu-verifier'), which skips verifySeat()'s validation.
const NOT_A_SEAT = [/FAKE_HELPER_TOKEN: 'cu-verifier'/g, /\btoken: 'cu-verifier'/g, /clientInfo: \{ name: 'cu-verifier'/g]
const WHOLE_NAME = /(['"`])cu-verifier\1/
// A throwaway profile path must follow the seat too.
const PROFILE = /cu-verifier-chrome-/

/** The lines of a source that hardcode the seat cu-verifier (comments aside). */
function seatOffences(source) {
  return source.split('\n').filter((line) => {
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) return false
    const rest = NOT_A_SEAT.reduce((text, form) => text.replace(form, ''), line)
    return WHOLE_NAME.test(rest) || PROFILE.test(rest)
  })
}

test('CU-156: the guard sees a hardcoded seat in any spelling, and leaves alone what is not a seat', () => {
  for (const line of ["  seat: 'cu-verifier',", 'const SEAT = "cu-verifier"', '  seat: `cu-verifier`,', "  args: ['run', '--seat', 'cu-verifier']", "  .filter((name) => name.startsWith('cu-verifier-chrome-'))", '  const seat = "cu-verifier"', "const SEAT = process.env.CU_VERIFY_SEAT || 'cu-verifier'"]) {
    assert.equal(seatOffences(line).length, 1, line)
  }
  for (const line of ["  const dir = mkdtempSync('/tmp/cu-verifier-runs-')", "env: { FAKE_HELPER_TOKEN: 'cu-verifier' }", "connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 })", "clientInfo: { name: 'cu-verifier', version: '1' }", " * a profile under /tmp/cu-verifier-chrome-*", "  seat: SEAT,"]) {
    assert.equal(seatOffences(line).length, 0, line)
  }
})

// The roots a seat can hide in: verifiers, every tool (verify-kit, live-view...), the evaluators (desktop-suite and
// task-suite run the CLI) and the environments. cu-integrator found three in _evaluators_ and _tools_/live-view that the
// first guard (verifiers and verify-kit only) could not see.
const ROOTS = ['_verifiers_', '_tools_', '_evaluators_', '_environments_']

test('CU-156: no verifier, tool, evaluator or environment module hardcodes the seat cu-verifier - each takes verifySeat()', () => {
  const offenders = ROOTS.flatMap((root) => sources(join(ROOT, root)))
    .filter((path) => !path.endsWith('/verify-kit/seat.mjs'))
    .filter((path) => seatOffences(readFileSync(path, 'utf8')).length > 0)
    .map((path) => `${path.slice(ROOT.length)}: ${seatOffences(readFileSync(path, 'utf8'))[0].trim().slice(0, 80)}`)
  assert.deepEqual(offenders, [], 'a hardcoded seat makes gate and developer runs compete for cu-verifier\'s one browser (D-005)')
})
