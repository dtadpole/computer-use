import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { UsageError, exitCode, main, parseArgs, parseBounds, parsePreApproval, parseSecrets, parseViewport, liveViewLines } from '../../_tools_/agent-core/cli.mjs'
import { createRecorder } from '../../_tools_/agent-core/trajectory.mjs'

test('arguments: values, = form, repeatable flags, positionals, missing values', () => {
  const parsed = parseArgs(['run', '--task', 'find it', '--allow', 'http://a.example', '--allow=http://b.example', '--max-steps=5', 'extra'])
  assert.equal(parsed.command, 'run')
  assert.deepEqual(parsed.options, { task: 'find it', allow: ['http://a.example', 'http://b.example'], 'max-steps': '5' })
  assert.deepEqual(parsed.positional, ['extra'])
  assert.deepEqual(parseArgs(['run', '--no-live', '--task', 't']).options, { 'no-live': true, task: 't' })
  assert.throws(() => parseArgs(['run', '--task']), UsageError)
  assert.throws(() => parseArgs(['run', '--task', '--plan', 'x']), UsageError)
})

test('pre-approvals, viewport, bounds and exit codes', () => {
  assert.deepEqual(parsePreApproval('submit'), { class: 'submit' })
  assert.deepEqual(parsePreApproval('submit@http://127.0.0.1:43117'), { class: 'submit', origin: 'http://127.0.0.1:43117' })
  assert.deepEqual(parseViewport('1280x800'), { width: 1280, height: 800 })
  assert.deepEqual(parseViewport(), { width: 1440, height: 900 })
  assert.throws(() => parseViewport('big'), UsageError)
  assert.deepEqual(parseBounds({ 'max-steps': '8', 'max-minutes': '2', 'max-cost': '0.5' }), { maxSteps: 8, maxWallMs: 120_000, maxCostUsd: 0.5 })
  assert.throws(() => parseBounds({ 'max-cost': '-1' }), UsageError)
  assert.equal(exitCode('completed'), 0)
  for (const status of ['needs_input', 'escalated', 'declined']) assert.equal(exitCode(status), 2)
  for (const status of ['error', 'max_steps', 'cancelled']) assert.equal(exitCode(status), 1)
})

test('secrets are references, read only when asked for', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-cli-test-'))
  try {
    writeFileSync(join(dir, 'pw'), 'from-file\n')
    const resolve = parseSecrets(['a=env:CU_TEST_SECRET', `b=file:${join(dir, 'pw')}`], { env: { CU_TEST_SECRET: 'from-env' } })
    assert.equal(resolve('a'), 'from-env')
    assert.equal(resolve('b'), 'from-file')
    assert.throws(() => resolve('c'), /no secret named/)
    assert.throws(() => parseSecrets(['a=value']), UsageError)
    assert.throws(() => parseSecrets(['a=env:MISSING'], { env: {} })('a'), /empty/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('replay prints a recorded run; unknown commands and missing run flags are usage errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-cli-test-'))
  try {
    const recorder = createRecorder({ dir, runId: '20261101T000000Z-000001' })
    recorder.writeHeader({ task: { text: 'demo' } })
    recorder.event('model_turn', 1, { stop: 'final', message: 'done' })
    recorder.end({ status: 'completed', finalMessage: 'done' })
    let out = ''
    const code = await main(['replay', '20261101T000000Z-000001', '--runs-dir', dir], { write: (t) => { out += t } })
    assert.equal(code, 0)
    assert.match(out, /run 20261101T000000Z-000001 {2}task: demo/)
    assert.match(out, /result completed: done/)
    await assert.rejects(main(['dance']), UsageError)
    await assert.rejects(main(['run', '--task', 'x']), /run needs --start-url/)
    await assert.rejects(main(['run', '--task', 'x', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-verifier']), /needs --plan/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('control-link prints the control URL only to a terminal; a tool or a pipe is refused', async () => {
  const home = mkdtempSync(join(tmpdir(), 'cu-cli-home-'))
  try {
    mkdirSync(join(home, 'control'))
    writeFileSync(join(home, 'control', '20261101T000000Z-abcdef'), 'http://127.0.0.1:5/?token=secret-control\n', { mode: 0o600 })
    let out = ''
    const write = (t) => { out += t }
    await assert.rejects(
      main(['control-link', '20261101T000000Z-abcdef'], { write, isTerminal: () => false, env: { CU_HOME: home } }),
      /prints only to a terminal/,
    )
    assert.equal(out, '', 'nothing is printed without a terminal')
    const code = await main(['control-link', '20261101T000000Z-abcdef'], { write, isTerminal: () => true, env: { CU_HOME: home } })
    assert.equal(code, 0)
    assert.equal(out, 'http://127.0.0.1:5/?token=secret-control\n')
    await assert.rejects(main(['control-link', 'missing'], { write, isTerminal: () => true, env: { CU_HOME: home } }), /no live control link/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the control URL reaches stderr only on a terminal and without --no-control-line (CU-27)', () => {
  const run = { viewUrl: 'http://127.0.0.1:9/view', controlUrl: 'http://127.0.0.1:9/?token=s3cret', runId: 'R1' }
  const piped = liveViewLines({ ...run, stderrIsTTY: false })
  assert.match(piped, /live view \(watch\): http:\/\/127\.0\.0\.1:9\/view/)
  assert.ok(!piped.includes('s3cret'), 'a pipe never carries the control token')
  assert.match(piped, /cli\.mjs control-link R1/)
  assert.match(liveViewLines({ ...run, stderrIsTTY: true }), /live view \(control\): http:\/\/127\.0\.0\.1:9\/\?token=s3cret/)
  assert.ok(!liveViewLines({ ...run, stderrIsTTY: true, noControlLine: true }).includes('s3cret'))
  assert.equal(parseArgs(['run', '--no-control-line']).options['no-control-line'], true)
})

