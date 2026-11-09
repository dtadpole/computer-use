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

test('CU-337: the range is what the ref adds beyond the remote main - an update and a new branch alike from <remote>/main, a delete nothing', () => {
  assert.equal(rangeFor({ localSha: A, remoteSha: B }), `origin/main..${A}`, 'never <remote sha>..<local sha>: a main merge would bring in main\'s commits')
  assert.equal(rangeFor({ localSha: A, remoteSha: ZERO_SHA }, 'upstream'), `upstream/main..${A}`)
  assert.equal(rangeFor({ localSha: ZERO_SHA, remoteSha: B }), null)
})

test('CU-337: a clean gate lets the push go; a gate that finds terms (1) or cannot run (2) refuses it, naming the status', () => {
  const clean = gateEnv()
  assert.equal(prePush({ input: line('refs/heads/x', A, 'refs/heads/x', B), env: clean.env, log: quiet }), 0)
  assert.deepEqual(clean.ranges(), [`origin/main..${A}`])
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
  assert.deepEqual(clean.ranges(), [`origin/main..${A}`, `origin/main..${C}`])
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

test('CU-337 end to end: a branch that merged origin/main (D-079/D-090) pushes clean - main\'s own commits, under a foreign identity, are not judged again', () => {
  const git = (args, cwd, env = process.env) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const base = join(dir, 'merged')
  const remote = join(base, 'remote.git')
  const work = join(base, 'work')
  mkdirSync(base, { recursive: true })
  git(['init', '-q', '--bare', '-b', 'main', remote], base)
  git(['init', '-q', '-b', 'main', work], base)
  for (const file of ['_tools_/push-gate/push-gate.mjs', '_tools_/push-gate/install.mjs', '_tools_/push-gate/hooks/pre-push', '_tools_/agent-core/local-config.mjs']) {
    mkdirSync(join(work, dirname(file)), { recursive: true })
    copyFileSync(join(ROOT, file), join(work, file))
  }
  execFileSync('chmod', ['755', join(work, HOOKS_PATH, 'pre-push')])
  const seat = ['-c', 'user.name=push-gate seat', '-c', 'user.email=seat@example.invalid']
  const github = ['-c', 'user.name=GitHub', '-c', 'user.email=noreply@github.example']
  git([...seat, 'add', '-A'], work)
  git([...seat, 'commit', '-q', '-m', 'base'], work)
  git(['remote', 'add', 'origin', remote], work)
  // A gate that refuses any commit in its range committed under the foreign identity (the real gate's identity rule).
  const identityGate = join(base, 'identity-gate.mjs')
  writeFileSync(identityGate, `import { execFileSync } from 'node:child_process'
const range = process.argv[process.argv.indexOf('--range') + 1]
const committers = execFileSync('git', ['log', '--format=%ce', range], { encoding: 'utf8' }).split('\\n').filter(Boolean)
process.exit(committers.some((email) => email === 'noreply@github.example') ? 1 : 0)
`)
  const env = { ...process.env, [GATE_ENV]: identityGate }
  install(work)
  const push = (ref) => spawnSync('git', ['push', '-q', 'origin', ref], { cwd: work, env, encoding: 'utf8' })
  assert.equal(spawnSync('git', ['push', '-q', '--no-verify', 'origin', 'HEAD:refs/heads/main'], { cwd: work, env, encoding: 'utf8' }).status, 0, 'main seeded')
  git(['fetch', '-q', 'origin'], work)
  git(['checkout', '-q', '-b', 'feature'], work)
  writeFileSync(join(work, 'feature.txt'), 'one\n')
  git([...seat, 'add', 'feature.txt'], work)
  git([...seat, 'commit', '-q', '-m', 'feature one'], work)
  assert.equal(push('feature').status, 0, 'the branch, first push')
  // main moves on under GitHub's identity (a PR merged on GitHub), and the seat merges it into the branch.
  git(['checkout', '-q', 'main'], work)
  writeFileSync(join(work, 'main.txt'), 'landed\n')
  git([...github, 'add', 'main.txt'], work)
  git([...github, 'commit', '-q', '-m', 'Merge pull request on GitHub'], work)
  assert.equal(spawnSync('git', ['push', '-q', '--no-verify', 'origin', 'main'], { cwd: work, env, encoding: 'utf8' }).status, 0)
  git(['fetch', '-q', 'origin'], work)
  git(['checkout', '-q', 'feature'], work)
  git([...seat, 'merge', '-q', '--no-edit', 'origin/main'], work)
  const merged = push('feature')
  assert.equal(merged.status, 0, `a main merge pushes clean: ${merged.stderr}`)
  assert.equal(git(['rev-parse', 'refs/heads/feature'], remote).trim(), git(['rev-parse', 'HEAD'], work).trim())
  // The branch's own foreign-identity commit is still refused: only main's commits are left out.
  writeFileSync(join(work, 'feature.txt'), 'two\n')
  git([...github, 'add', 'feature.txt'], work)
  git([...github, 'commit', '-q', '-m', 'not the seat'], work)
  assert.notEqual(push('feature').status, 0, 'a new commit of the branch is judged as before')
})
