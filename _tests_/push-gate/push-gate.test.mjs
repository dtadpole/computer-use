// CU-337 (D-097): the push gate - the public-hygiene gate's exit status alone decides a push. A fake gate stands in for
// the real one (which reads a private list): it logs each range it is given and exits as the row says.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { check, HOOKS_PATH, install } from '../../_tools_/push-gate/install.mjs'
import { GATE_ENV, parsePushLines, prePush, rangeFor, resolveGate, ZERO_SHA } from '../../_tools_/push-gate/push-gate.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'cu-push-gate-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const line = (localRef, localSha, remoteRef, remoteSha) => `${localRef} ${localSha} ${remoteRef} ${remoteSha}`

/** A fake gate: appends its --range to FAKE_GATE_LOG; exits 1 when the range contains FAKE_GATE_FAIL_ON, else FAKE_GATE_EXIT (0). */
const fakeGate = join(dir, 'fake-gate.mjs')
writeFileSync(fakeGate, `import { appendFileSync } from 'node:fs'
const range = process.argv[process.argv.indexOf('--range') + 1]
if (process.env.FAKE_GATE_LOG) appendFileSync(process.env.FAKE_GATE_LOG, range + '\\n')
if (process.env.FAKE_GATE_FAIL_ON && range.includes(process.env.FAKE_GATE_FAIL_ON)) process.exit(1)
process.exit(Number(process.env.FAKE_GATE_EXIT ?? 0))
`)
let logs = 0
function gateEnv(extra = {}) {
  const log = join(dir, `gate-${(logs += 1)}.log`)
  writeFileSync(log, '')
  return { env: { ...process.env, [GATE_ENV]: fakeGate, FAKE_GATE_LOG: log, ...extra }, ranges: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) }
}
const quiet = () => {}

test('CU-337: the pushed refs are read strictly - four fields, two full shas; anything else refuses', () => {
  assert.deepEqual(parsePushLines(`${line('refs/heads/x', A, 'refs/heads/x', B)}\n`), [{ localRef: 'refs/heads/x', localSha: A, remoteRef: 'refs/heads/x', remoteSha: B }])
  assert.equal(parsePushLines('').length, 0)
  for (const bad of ['refs/heads/x abc refs/heads/x def', `refs/heads/x ${A} refs/heads/x`, `refs/heads/x ${A} refs/heads/x ${B} extra`]) {
    assert.throws(() => parsePushLines(bad), /cannot read the pushed ref/)
  }
})

test('CU-337: the range is what the ref adds - an update from the remote sha, a new branch from <remote>/main, a delete nothing', () => {
  assert.equal(rangeFor({ localSha: A, remoteSha: B }), `${B}..${A}`)
  assert.equal(rangeFor({ localSha: A, remoteSha: ZERO_SHA }, 'upstream'), `upstream/main..${A}`)
  assert.equal(rangeFor({ localSha: ZERO_SHA, remoteSha: B }), null)
})

test('CU-337: a clean gate lets the push go; a gate that finds terms (1) or cannot run (2) refuses it, naming the status', () => {
  const clean = gateEnv()
  assert.equal(prePush({ input: line('refs/heads/x', A, 'refs/heads/x', B), env: clean.env, log: quiet }), 0)
  assert.deepEqual(clean.ranges(), [`${B}..${A}`])
  for (const [status, words] of [[1, /exited 1 .*found terms/], [2, /exited 2 .*could not run/]]) {
    const failing = gateEnv({ FAKE_GATE_EXIT: String(status) })
    const said = []
    assert.equal(prePush({ input: line('refs/heads/x', A, 'refs/heads/x', B), env: failing.env, log: (l) => said.push(l) }), 1)
    assert.match(said.join('\n'), words)
    assert.match(said.join('\n'), /push refused/)
  }
})

test('CU-337: a branch delete (zero local sha) passes without running the gate', () => {
  const gate = gateEnv({ FAKE_GATE_EXIT: '1' })
  assert.equal(prePush({ input: line('(delete)', ZERO_SHA, 'refs/heads/old', B), env: gate.env, log: quiet }), 0)
  assert.deepEqual(gate.ranges(), [], 'the gate never ran')
})

test('CU-337: several refs in one push - each added range is gated, and the push refuses if any one fails', () => {
  const input = [line('refs/heads/one', A, 'refs/heads/one', B), line('refs/heads/two', C, 'refs/heads/two', ZERO_SHA)].join('\n')
  const clean = gateEnv()
  assert.equal(prePush({ input, env: clean.env, log: quiet }), 0)
  assert.deepEqual(clean.ranges(), [`${B}..${A}`, `origin/main..${C}`])
  const second = gateEnv({ FAKE_GATE_FAIL_ON: C })
  assert.equal(prePush({ input, env: second.env, log: quiet }), 1, 'the second ref has findings')
})

test('CU-337: no gate configured, or a configured path that is no file, refuses the push (fail closed)', () => {
  const env = { ...process.env, [GATE_ENV]: '', CU_HEDDLE_REPO: join(dir, 'no-such-heddle') }
  const said = []
  assert.equal(prePush({ input: line('refs/heads/x', A, 'refs/heads/x', B), env, cfg: {}, log: (l) => said.push(l) }), 1)
  assert.match(said.join('\n'), /no public-hygiene gate .*set CU_HYGIENE_GATE or paths.hygieneGate/)
  assert.throws(() => resolveGate({ env: { ...process.env, [GATE_ENV]: join(dir, 'missing.mjs') }, cfg: {} }), /no public-hygiene gate/)
  assert.throws(() => resolveGate({ env: { ...process.env, [GATE_ENV]: dir }, cfg: {} }), /no public-hygiene gate/, 'a folder is no gate')
  assert.equal(resolveGate({ env: { ...process.env, [GATE_ENV]: '' }, cfg: { paths: { hygieneGate: fakeGate } } }), fakeGate, 'the local config names it')
})

test('CU-337 end to end: with the hook installed, git push to a bare remote is refused on a finding and goes through when clean; --check reports it', () => {
  const git = (args, cwd, env = process.env) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const remote = join(dir, 'remote.git')
  const work = join(dir, 'work')
  git(['init', '-q', '--bare', '-b', 'main', remote], dir)
  git(['init', '-q', '-b', 'main', work], dir)
  for (const file of ['_tools_/push-gate/push-gate.mjs', '_tools_/push-gate/install.mjs', '_tools_/push-gate/hooks/pre-push', '_tools_/agent-core/local-config.mjs']) {
    mkdirSync(join(work, dirname(file)), { recursive: true })
    copyFileSync(join(ROOT, file), join(work, file))
  }
  execFileSync('chmod', ['755', join(work, HOOKS_PATH, 'pre-push')])
  const id = ['-c', 'user.name=push-gate test', '-c', 'user.email=push-gate@example.invalid']
  git([...id, 'add', '-A'], work)
  git([...id, 'commit', '-q', '-m', 'push gate under test'], work)
  git(['remote', 'add', 'origin', remote], work)
  assert.equal(check(work).ok, false, 'not installed yet')
  assert.equal(install(work).ok, true)
  assert.equal(git(['config', '--get', 'core.hooksPath'], work).trim(), HOOKS_PATH)
  const push = (extra) => spawnSync('git', ['push', '-q', 'origin', 'HEAD:refs/heads/main'], { cwd: work, env: gateEnv(extra).env, encoding: 'utf8' })
  const refused = push({ FAKE_GATE_EXIT: '1' })
  assert.notEqual(refused.status, 0, 'a finding stops the push')
  assert.match(refused.stderr, /push refused/)
  assert.throws(() => git(['rev-parse', '--verify', 'refs/heads/main'], remote), 'nothing reached the remote')
  const clean = push({})
  assert.equal(clean.status, 0, clean.stderr)
  assert.equal(git(['rev-parse', 'refs/heads/main'], remote).trim(), git(['rev-parse', 'HEAD'], work).trim())
})
