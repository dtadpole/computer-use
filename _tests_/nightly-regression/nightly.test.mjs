// The nightly regression (CU-59): its pure parts, and end-to-end runs of nightly.mjs on a throwaway repository with a
// private lock directory - no CUHelper, no fixture app, no model, no network.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHASE1_VERIFIERS, PHASE2_VERIFIERS, buildSteps, classify, detailOf, failingTests, launchesFixtureApp, mergeFlakes, nodeCounts,
  overall, parseArgs, renderReport, strippedEnv, summaryLine, verdictOf,
} from '../../_tools_/nightly-regression/logic.mjs'

const NIGHTLY = fileURLToPath(new URL('../../_tools_/nightly-regression/nightly.mjs', import.meta.url))

test('parseArgs: defaults, flags, values and refusals', () => {
  const d = parseArgs([])
  assert.equal(d.ref, 'origin/main')
  assert.equal(d.out, '/tmp/cu-nightly')
  assert.equal(d.fetch, true)
  assert.equal(d.lockWait, 900)
  assert.equal(d.seat, 'cu-integrator')
  const o = parseArgs(['--ref', 'HEAD', '--no-fetch', '--node-only', '--lock-wait', '30', '--out', '/tmp/x', '--on-lock', 'echo hi', '--keep-worktree'])
  assert.deepEqual([o.ref, o.fetch, o.nodeOnly, o.lockWait, o.out, o.onLock, o.keepWorktree], ['HEAD', false, true, 30, '/tmp/x', 'echo hi', true])
  assert.throws(() => parseArgs(['--bogus']), /unknown argument --bogus/)
  assert.throws(() => parseArgs(['--ref']), /--ref needs a value/)
  assert.throws(() => parseArgs(['--ref', '--no-fetch']), /--ref needs a value/)
  assert.throws(() => parseArgs(['--lock-wait', '1.5']), /whole seconds/)
  assert.throws(() => parseArgs(['--out', 'relative/dir']), /--out needs an absolute path/)
  assert.throws(() => parseArgs(['--yield-flag', 'flag']), /--yield-flag needs an absolute path/)
})

test('buildSteps: unlocked suites and fake-helper verifiers first, CUHelper and CU Fixture under the lock', () => {
  const steps = buildSteps({
    testFiles: ['_tests_/macos-helper/h.test.mjs', '_tests_/agent-core/b.test.mjs', '_tests_/desktop-suite/s.test.mjs', '_tests_/agent-core/a.test.mjs'],
    verifiers: ['desktop-helper-dryrun', 'desktop-consent', 'evaluation-suite', 'desktop-fixture', 'fixture-site'],
  })
  assert.deepEqual(steps.map((s) => [s.name, s.phase]), [
    ['node-tests', 1], ['verifier:evaluation-suite', 1], ['verifier:desktop-consent', 1],
    ['node-tests-helper', 2], ['node-tests-fixture', 2], ['verifier:desktop-fixture', 2], ['verifier:desktop-helper-dryrun', 2],
  ])
  assert.deepEqual(steps[0].files, ['_tests_/agent-core/a.test.mjs', '_tests_/agent-core/b.test.mjs'])
  assert.equal(steps.find((s) => s.name === 'verifier:desktop-fixture').timeout, 300)
  assert.ok(!steps.some((s) => s.name === 'verifier:fixture-site'), 'browser verifiers stay out')
  assert.ok(PHASE1_VERIFIERS.every((v) => !PHASE2_VERIFIERS.includes(v)))
})

test('launchesFixtureApp: a file importing desktop-fixture/build.mjs or client.mjs starts CU Fixture (CU-304)', () => {
  assert.equal(launchesFixtureApp(`import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'\n`), true)
  assert.equal(launchesFixtureApp(`import { buildFixtureApp } from "../../_tools_/desktop-fixture/build.mjs"\n`), true)
  assert.equal(launchesFixtureApp(`import { planAction } from '../../_environments_/macos-desktop/input-plan.mjs'\n`), false)
  assert.equal(launchesFixtureApp('// the stand-in lives in desktop-fixture/client.mjs and is never imported here\n'), false)
  assert.equal(launchesFixtureApp("write('x.test.mjs', `import { launchFixture } from '../desktop-fixture/client.mjs'`)\n"), false, 'a string is no import')
  assert.equal(launchesFixtureApp(`import {\n  launchFixture,\n} from '../../_tools_/desktop-fixture/client.mjs'\n`), true, 'a multi-line import')
  // built from fragments, so this test file is not itself read as one that launches CU Fixture
  assert.equal(launchesFixtureApp(`const { buildFixtureApp } = await ${'imp'}ort('../../_tools_/desktop-fixture/build.mjs')\n`), true, 'a dynamic import')
})

test('buildSteps: a test file that launches CU Fixture leaves phase 1 for node-tests-fixapps under the lock (CU-304)', () => {
  const steps = buildSteps({
    testFiles: ['_tests_/agent-core/a.test.mjs', '_tests_/desktop-fixture/grid.test.mjs', '_tests_/live-view/probe.test.mjs',
      '_tests_/desktop-suite/s.test.mjs', '_tests_/macos-helper/h.test.mjs'],
    verifiers: ['desktop-consent', 'desktop-fixture'],
    fixtureAppFiles: ['_tests_/live-view/probe.test.mjs', '_tests_/desktop-fixture/grid.test.mjs', '_tests_/desktop-suite/s.test.mjs'],
  })
  assert.deepEqual(steps.map((s) => [s.name, s.phase]), [
    ['node-tests', 1], ['verifier:desktop-consent', 1],
    ['node-tests-helper', 2], ['node-tests-fixture', 2], ['node-tests-fixapps', 2], ['verifier:desktop-fixture', 2],
  ])
  const byName = Object.fromEntries(steps.map((s) => [s.name, s]))
  assert.deepEqual(byName['node-tests'].files, ['_tests_/agent-core/a.test.mjs'])
  assert.deepEqual(byName['node-tests-fixapps'].files, ['_tests_/desktop-fixture/grid.test.mjs', '_tests_/live-view/probe.test.mjs'])
  assert.deepEqual(byName['node-tests-fixture'].files, ['_tests_/desktop-suite/s.test.mjs'], 'a locked suite keeps its own step')
  assert.ok(steps.filter((s) => s.phase === 1).every((s) => !(s.files ?? []).some((f) => f.includes('desktop-fixture/'))), 'no app starts in phase 1')
  assert.equal(byName['node-tests-fixapps'].timeout, 300)
})

const SPEC = `▶ desktop driver
  ✔ maps a click (0.8ms)
  ✖ refuses an excluded app (1.2ms)
    AssertionError: expected refusal
✖ desktop driver (3.1ms)
✖ times out cleanly (1.5s)
ℹ tests 3
ℹ suites 1
ℹ pass 1
ℹ fail 2
ℹ cancelled 0

✖ failing tests:

test at _tests_/x/y.test.mjs:3:1
✖ refuses an excluded app (1.2ms)
`

test('failingTests, nodeCounts and verdictOf read node --test and verifier output', () => {
  assert.deepEqual(failingTests(SPEC), ['refuses an excluded app', 'desktop driver', 'times out cleanly'])
  assert.deepEqual(nodeCounts(SPEC), { tests: 3, suites: 1, pass: 1, fail: 2, cancelled: 0 })
  assert.deepEqual(failingTests('ℹ tests 2\nℹ pass 2\n'), [])
  assert.equal(verdictOf('step 1 ok\nverdict fail 3/4\nverdict pass 4/4 (54 plans)\n'), 'verdict pass 4/4 (54 plans)')
  assert.equal(verdictOf('no verdict here'), null)
})

test('classify: pass, flake, fail, skipped', () => {
  assert.equal(classify({ exit: 0 }, null), 'pass')
  assert.equal(classify({ exit: 1 }, { exit: 0 }), 'flake')
  assert.equal(classify({ exit: 1 }, { exit: 1 }), 'fail')
  assert.equal(classify({ exit: 124 }, null), 'fail')
  assert.equal(classify(null, null), 'skipped')
})

const node = (name, status, attempts) => ({ name, phase: 1, kind: 'node', status, attempts })
const verifier = (name, status, attempts, phase = 1) => ({ name, phase, kind: 'verifier', status, attempts })

test('detailOf: counts, verdicts, timeouts, skip reasons', () => {
  assert.equal(detailOf(node('node-tests', 'pass', [{ exit: 0, counts: { tests: 970, pass: 970 } }])), '970/970')
  assert.equal(detailOf(node('node-tests', 'fail', [{ exit: 1 }, { exit: 124, timedOut: true }])), 'exit 124 (timed out)')
  assert.equal(detailOf(verifier('verifier:desktop-fixture', 'pass', [{ exit: 0, verdict: 'verdict pass 54/54' }])), 'verdict pass 54/54')
  assert.equal(detailOf({ name: 'x', kind: 'verifier', status: 'skipped', reason: 'node-only', attempts: [] }), 'node-only')
})

test('mergeFlakes: counts per step and test, keeps firstSeen, the last five heads, and leaves its input alone', () => {
  const flake = node('node-tests', 'flake', [{ exit: 1, failing: ['refuses an excluded app'] }, { exit: 0 }])
  const whole = verifier('verifier:desktop-consent', 'flake', [{ exit: 1 }, { exit: 0 }])
  const passing = node('node-tests-helper', 'pass', [{ exit: 0 }])
  const one = mergeFlakes({}, { results: [flake, whole, passing], head: 'aaaa', at: 't1' })
  assert.deepEqual(Object.keys(one).sort(), ['node-tests :: refuses an excluded app', 'verifier:desktop-consent :: (whole step)'])
  let list = one
  for (const [i, head] of ['b', 'c', 'd', 'e', 'f', 'b'].entries()) list = mergeFlakes(list, { results: [flake], head, at: `t${i + 2}` })
  const e = list['node-tests :: refuses an excluded app']
  assert.deepEqual([e.count, e.firstSeen, e.lastSeen], [7, 't1', 't7'])
  assert.deepEqual(e.heads, ['c', 'd', 'e', 'f', 'b'])
  assert.equal(one['node-tests :: refuses an excluded app'].count, 1, 'the earlier list is unchanged')
})

test('overall, summaryLine and renderReport', () => {
  const pass = node('node-tests', 'pass', [{ exit: 0, counts: { tests: 10, pass: 10 }, seconds: 2 }])
  const flaky = verifier('verifier:desktop-consent', 'flake', [{ exit: 1, seconds: 1 }, { exit: 0, verdict: 'verdict pass', seconds: 1 }])
  const fail = verifier('verifier:desktop-fixture', 'fail', [{ exit: 1, verdict: 'verdict fail 53/54' }, { exit: 1, verdict: 'verdict fail 53/54' }], 2)
  const skip = { name: 'verifier:desktop-helper-dryrun', phase: 2, kind: 'verifier', status: 'skipped', reason: 'lock not taken', attempts: [] }
  assert.deepEqual(overall([pass]), { verdict: 'GREEN', exit: 0 })
  assert.deepEqual(overall([pass, flaky]), { verdict: 'GREEN (flaky)', exit: 0 })
  assert.deepEqual(overall([pass, skip]), { verdict: 'PARTIAL', exit: 3 })
  assert.deepEqual(overall([pass, fail, skip]), { verdict: 'RED', exit: 1 })
  const run = { head: '94e2b1b0be1e', ref: 'origin/main', startedAt: 's', finishedAt: 'f', seat: 'cu-integrator', lockNote: 'held 200s', results: [pass, flaky, fail, skip], killed: [], ...overall([pass, flaky, fail, skip]) }
  assert.equal(summaryLine(run), 'nightly 94e2b1b0b RED: node 10/10, verifiers 1/3 (1 skipped), flaky steps 1')
  const flakes = mergeFlakes({}, { results: run.results, head: run.head, at: 'f' })
  const md = renderReport(run, flakes)
  assert.match(md, /^# Nightly regression - origin\/main 94e2b1b0b - RED$/m)
  assert.match(md, /^\| verifier:desktop-fixture \| 2 \| fail \| verdict fail 53\/54 \| 0\.0 \|$/m)
  assert.match(md, /^\| verifier:desktop-consent \| 1 \| flake \| verdict pass \| 2\.0 \|$/m)
  assert.match(md, /^Flaky steps this run: verifier:desktop-consent \(whole step\)\.$/m)
  assert.match(md, /^- verifier:desktop-consent :: \(whole step\) - 1x, last f on 94e2b1b0b$/m)
  assert.match(renderReport({ ...run, results: [pass], ...overall([pass]) }, {}), /^Flake list, all runs: empty\.$/m)
})

test('strippedEnv drops model keys and a test runner context, and keeps the rest', () => {
  const env = strippedEnv({ PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'k', OPENAI_BASE_URL: 'u', DEEPSEEK_API_KEY: 'k', MY_API_KEY: 'k', GH_TOKEN: 't', NODE_TEST_CONTEXT: 'child-v8' }, { CU_HOME: '/c' })
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h', GH_TOKEN: 't', CU_HOME: '/c' })
})

// A throwaway repository shaped like this one: one node suite, a fake-helper verifier that fails once and then passes,
// and a phase-2 verifier, so a run exercises both phases, the retry, the flake list, the hooks and a private lock.
function scratchRepo({ failingTest = false, fixtureApp = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'cu-nightly-repo-'))
  const write = (rel, text) => { mkdirSync(join(repo, rel, '..'), { recursive: true }); writeFileSync(join(repo, rel), text) }
  write('_tests_/unit/ok.test.mjs', `import { test } from 'node:test'\ntest('adds', () => { if (1 + 1 !== 2) throw new Error('math') })\n`
    + (failingTest ? `test('always fails', () => { throw new Error('broken') })\n` : ''))
  // CU-304: a file that would launch CU Fixture - its import does not resolve here, so running it in phase 1 fails.
  if (fixtureApp) write('_tests_/desktop-fixture/app.test.mjs', `import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'\nimport { test } from 'node:test'\ntest('opens the fixture', () => launchFixture)\n`)
  write('_verifiers_/desktop-consent/verify.sh', 'if [ -f .tried ]; then echo "verdict pass 1/1"; exit 0; fi\n: > .tried; echo "verdict fail 0/1"; exit 1\n')
  write('_verifiers_/desktop-helper-dryrun/verify.sh', 'echo "verdict pass 2/2 (dry run)"\n')
  const env = { ...process.env, GIT_AUTHOR_NAME: 'n', GIT_AUTHOR_EMAIL: 'n@example.invalid', GIT_COMMITTER_NAME: 'n', GIT_COMMITTER_EMAIL: 'n@example.invalid' }
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'scratch']]) execFileSync('git', ['-C', repo, ...args], { env, stdio: 'ignore' })
  return repo
}

test('a run on a scratch repo: green with one flake, phase 2 under a private lock, hooks, cleanup', () => {
  const repo = scratchRepo()
  const out = mkdtempSync(join(tmpdir(), 'cu-nightly-out-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'cu-nightly-lock-'))
  const marks = join(out, 'marks.txt')
  try {
    const r = spawnSync('node', [NIGHTLY, '--repo', repo, '--ref', 'HEAD', '--no-fetch', '--out', out, '--lock-dir', lockDir, '--lock-wait', '5',
      '--on-lock', `echo "lock $NIGHTLY_RUN_ID $NIGHTLY_SEAT" >> ${marks}`, '--on-release', `echo release >> ${marks}`], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^# Nightly regression - HEAD [0-9a-f]{9} - GREEN \(flaky\)$/m)
    assert.match(r.stdout, /^\| node-tests \| 1 \| pass \| 1\/1 \|/m)
    assert.match(r.stdout, /^\| verifier:desktop-consent \| 1 \| flake \| verdict pass 1\/1 \|/m)
    assert.match(r.stdout, /^\| verifier:desktop-helper-dryrun \| 2 \| pass \| verdict pass 2\/2 \(dry run\) \|/m)
    assert.match(readFileSync(marks, 'utf8'), /^lock nightly-\S+ cu-integrator\nrelease\n$/)
    assert.ok(!existsSync(join(lockDir, 'run.json')), 'the lock is released')
    const flakes = JSON.parse(readFileSync(join(out, 'flakes.json'), 'utf8'))
    assert.equal(flakes['verifier:desktop-consent :: (whole step)'].count, 1)
    assert.equal(readFileSync(join(out, 'latest.md'), 'utf8'), r.stdout, 'latest.md is the printed report')
    const worktrees = execFileSync('git', ['-C', repo, 'worktree', 'list'], { encoding: 'utf8' }).trim().split('\n')
    assert.equal(worktrees.length, 1, 'the worktree is removed')
  } finally {
    for (const dir of [repo, out, lockDir]) rmSync(dir, { recursive: true, force: true })
  }
})

test('a node-only run with a broken test: RED, phase 2 skipped, the lock never taken', () => {
  const repo = scratchRepo({ failingTest: true })
  const out = mkdtempSync(join(tmpdir(), 'cu-nightly-out-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'cu-nightly-lock-'))
  try {
    const r = spawnSync('node', [NIGHTLY, '--repo', repo, '--ref', 'HEAD', '--no-fetch', '--out', out, '--lock-dir', lockDir, '--node-only'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /^\| node-tests \| 1 \| fail \| 1\/2 \|/m)
    assert.match(r.stdout, /^\| verifier:desktop-helper-dryrun \| 2 \| skipped \| node-only \|/m)
    assert.ok(!existsSync(join(lockDir, 'run.json')))
    const runs = execFileSync('ls', [out], { encoding: 'utf8' }).split('\n').filter((n) => /^\d{4}-/.test(n))
    assert.equal(runs.length, 1)
    const report = JSON.parse(readFileSync(join(out, runs[0], 'report.json'), 'utf8'))
    assert.deepEqual(report.results.find((x) => x.name === 'node-tests').attempts.map((a) => a.failing), [['always fails'], ['always fails']])
  } finally {
    for (const dir of [repo, out, lockDir]) rmSync(dir, { recursive: true, force: true })
  }
})

test('a node-only run on a repo with a fixture-launching test: it never runs in phase 1, phase 2 reports it skipped (CU-304)', () => {
  const repo = scratchRepo({ fixtureApp: true })
  const out = mkdtempSync(join(tmpdir(), 'cu-nightly-out-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'cu-nightly-lock-'))
  try {
    const r = spawnSync('node', [NIGHTLY, '--repo', repo, '--ref', 'HEAD', '--no-fetch', '--out', out, '--lock-dir', lockDir, '--node-only'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 3, r.stdout + r.stderr)
    assert.match(r.stdout, /^\| node-tests \| 1 \| pass \| 1\/1 \|/m)
    assert.match(r.stdout, /^\| node-tests-fixapps \| 2 \| skipped \| node-only \|/m)
    assert.ok(!existsSync(join(lockDir, 'run.json')))
  } finally {
    for (const dir of [repo, out, lockDir]) rmSync(dir, { recursive: true, force: true })
  }
})

test('bad arguments exit 2 with the usage', () => {
  const r = spawnSync('node', [NIGHTLY, '--bogus'], { encoding: 'utf8', timeout: 20_000 })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown argument --bogus/)
  assert.match(r.stderr, /^usage: node _tools_\/nightly-regression\/nightly\.mjs/m)
})

test('another seat\'s desktop hold (CU-75) makes phase 2 wait, then skip - not fail on desktop_held', async () => {
  const { holdDesktop } = await import('../../_environments_/macos-desktop/run-lock.mjs')
  const repo = scratchRepo()
  const out = mkdtempSync(join(tmpdir(), 'cu-nightly-out-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'cu-nightly-lock-'))
  try {
    await holdDesktop({ seat: 'cu-verifier', minutes: 5, reason: 'step 4', dir: lockDir })
    const r = spawnSync('node', [NIGHTLY, '--repo', repo, '--ref', 'HEAD', '--no-fetch', '--out', out, '--lock-dir', lockDir, '--lock-wait', '2'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 3, 'phase 2 skipped, as for a run holding the lock')
    assert.match(r.stdout + r.stderr, /not taken within 2s, held by cu-verifier until \S+/)
    assert.doesNotMatch(r.stdout + r.stderr, /desktop_held:/, 'never reported as an error')
    assert.ok(!existsSync(join(lockDir, 'run.json')), 'no run entry was written')
  } finally {
    for (const dir of [repo, out, lockDir]) rmSync(dir, { recursive: true, force: true })
  }
})
