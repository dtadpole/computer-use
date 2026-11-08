import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { absentReason, buildSources, commitIn, HISTORY_ENV, locateBuild, readLocalConfig, REFLECTION_ENV } from '../../_tools_/verify-kit/build-sources.mjs'

// CU-222: evaluation-suite check 2 looks a recorded build up here, then in reflection, then in the private history
// checkout named only by the local config or CU_VERIFY_HISTORY.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const scratch = mkdtempSync(join(tmpdir(), 'cu-build-sources-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const home = () => '/home/someone'
const noFile = () => { throw Object.assign(new Error('absent'), { code: 'ENOENT' }) }

test('the local config: absent is {}, unreadable JSON or a non-object is an error naming the file; CU_CONFIG moves it', () => {
  assert.deepEqual(readLocalConfig({ env: {}, home, readFile: noFile }), {})
  let read = null
  readLocalConfig({ env: {}, home, readFile: (path) => { read = path; return '{}' } })
  assert.equal(read, '/home/someone/.config/computer-use/config.json')
  readLocalConfig({ env: { CU_CONFIG: '~/other.json' }, home, readFile: (path) => { read = path; return '{}' } })
  assert.equal(read, '/home/someone/other.json')
  assert.throws(() => readLocalConfig({ env: {}, home, readFile: () => '{nope' }), /config\.json is not valid JSON/)
  assert.throws(() => readLocalConfig({ env: {}, home, readFile: () => '[]' }), /must hold a JSON object/)
})

test('the history checkout comes only from CU_VERIFY_HISTORY or paths.historyRepo - with neither it is absent and says how to supply it', () => {
  const exists = () => true
  const history = (env, config) => buildSources({ env, home, config, exists }).find((source) => source.name === 'history')
  assert.deepEqual(history({}, {}), { name: 'history', dir: null, how: 'not configured (set paths.historyRepo in the local config, or CU_VERIFY_HISTORY)', present: false })
  assert.deepEqual(history({}, { paths: { historyRepo: '~/old/history' } }), { name: 'history', dir: '/home/someone/old/history', how: 'paths.historyRepo', present: true })
  assert.equal(history({ [HISTORY_ENV]: '/elsewhere' }, { paths: { historyRepo: '~/old/history' } }).dir, '/elsewhere', 'the environment wins')
  assert.equal(history({}, { paths: { historyRepo: 'relative/path' } }).present, false, 'a relative path is never looked in')
  assert.equal(history({}, { paths: { historyRepo: '' } }).dir, null)
  assert.equal(buildSources({ env: {}, home, config: { paths: { historyRepo: '/h' } }, exists: () => false })[2].present, false, 'no checkout there')
})

test('the order is this repository, reflection (CU_VERIFY_REFLECTION, else ~/reflection), history; this repository is always present', () => {
  const sources = buildSources({ env: {}, home, config: {}, exists: () => true })
  assert.deepEqual(sources.map((s) => [s.name, s.dir, s.present]), [['this repository', '.', true], ['reflection', '/home/someone/reflection', true], ['history', null, false]])
  assert.equal(buildSources({ env: { [REFLECTION_ENV]: '/r' }, home, config: {}, exists: () => true })[1].dir, '/r')
  const none = buildSources({ env: {}, home, config: {}, exists: () => false })
  assert.deepEqual(none.map((s) => s.present), [true, false, false])
  assert.equal(absentReason(none), 'reflection: no checkout at /home/someone/reflection (from ~/reflection); history: not configured (set paths.historyRepo in the local config, or CU_VERIFY_HISTORY)')
})

test('locateBuild: the first present source that has it; an absent source is never asked; none found is a failure only when every source is present', () => {
  const sources = [{ name: 'this repository', dir: '.', present: true }, { name: 'reflection', dir: '/r', present: true }, { name: 'history', dir: '/h', present: false }]
  const asked = []
  const has = (dir, commit) => { asked.push(dir); return dir === '/r' && commit === 'abc1234' }
  assert.deepEqual(locateBuild('abc1234', sources, has), { found: 'reflection' })
  assert.deepEqual(asked, ['.', '/r'])
  assert.deepEqual(locateBuild('abc1234', sources, (dir) => dir === '/h'), { found: null, absent: ['history'] }, 'the absent history is not asked')
  const all = sources.map((s) => ({ ...s, present: true }))
  assert.deepEqual(locateBuild('fff0000', all, () => false), { found: null, absent: [] })
})

const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' }).trim()
function repo(name) {
  const dir = join(scratch, name)
  mkdirSync(dir)
  git(dir, 'init', '-q')
  git(dir, 'commit', '-q', '--allow-empty', '-m', name)
  return { dir, head: git(dir, 'rev-parse', 'HEAD') }
}

test('commitIn: a commit of the checkout is found, a missing one is not, and an id that is not hex never reaches git', () => {
  const { dir, head } = repo('one')
  assert.equal(commitIn(dir, head), true)
  assert.equal(commitIn(dir, head.slice(0, 9)), true)
  assert.equal(commitIn(dir, 'f'.repeat(40)), false)
  for (const bad of ['--help', 'HEAD', 'main', '', null, 42]) assert.equal(commitIn(dir, bad), false, String(bad))
})

// The record-set mutant: the verifier must fail a row whose build is in none of three present sources, hold one whose
// build is only in the history checkout, and leave unjudged a row it cannot find while the history checkout is absent.
const RUNNER = join(ROOT, '_vendor_/browser-use/_tools_/verify-runner/run.mjs')
const CHECK = join(ROOT, '_verifiers_/evaluation-suite/check.mjs')
function check2(commit, historyDir) {
  const results = mkdtempSync(join(scratch, 'results-'))
  const row = { runId: 'r1', taskId: 'badge-form', kind: 'task', verdict: 'pass', model: 'scripted', controller: 'cli', build: { commit, dirty: false } }
  writeFileSync(join(results, 'results.jsonl'), `${JSON.stringify(row)}\n`)
  // The child runs its own node --test: a parent's NODE_TEST_CONTEXT would make it report to us instead of printing TAP.
  const { NODE_TEST_CONTEXT, ...inherited } = process.env
  const env = { ...inherited, CU_VERIFY_RESULTS_DIR: results, [REFLECTION_ENV]: reflection.dir, [HISTORY_ENV]: historyDir, CU_CONFIG: join(scratch, 'no-config.json') }
  let out
  try {
    out = execFileSync(process.execPath, [RUNNER, CHECK, '--list'], { cwd: ROOT, env, encoding: 'utf8' })
  } catch (error) {
    out = error.stdout
  }
  const line = out.split('\n').find((l) => l.includes('on a build that exists'))
  return { status: line?.split(/\s+/)[0], line }
}
const reflection = repo('reflection')
const history = repo('history')

test('evaluation-suite check 2: a build only in the history checkout holds; one in no present source fails; with history absent it is unjudged, naming why', () => {
  assert.equal(check2(history.head, history.dir).status, 'pass')
  assert.equal(check2(reflection.head, history.dir).status, 'pass')
  assert.equal(check2('0123456789abcdef0123456789abcdef01234567', history.dir).status, 'fail', 'a build in none of the three sources')
  const absent = check2(history.head, join(scratch, 'no-checkout'))
  assert.equal(absent.status, 'skip')
  assert.match(absent.line, /1 rows name builds in no present source .*history: no checkout at .*no-checkout \(from CU_VERIFY_HISTORY\)/)
})
