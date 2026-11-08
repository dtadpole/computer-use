import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dshRow } from '../../_tools_/computer-use-mcp/install-rows.mjs'
import { rowList, runExample, serverArgs } from './no-model-example.mjs'

/**
 * The no-model examples (CU-57) as tests: a CU Fixture read task through DSH's way in (the MCP server as the owner's
 * install row starts it) and through heddle's (the plugin), every step of the client cycle checked, and the fixture's
 * own judge deciding - pass for the right balance, wrong-answer for a wrong one.
 */

test('the server arguments are the install rows\' own; only server.mjs becomes the fake-helper entry', () => {
  const dsh = serverArgs('dsh', { keyFile: '/nonexistent/key', runsDir: '/tmp/r' })
  assert.match(dsh[0], /_tests_\/computer-use-mcp\/desktop-server\.mjs$/)
  assert.deepEqual(dsh.slice(1), ['--seat', 'cu-example', '--key-file', '/nonexistent/key', '--runs-dir', '/tmp/r'])
  const heddle = serverArgs('heddle', { keyFile: '/nonexistent/key', runsDir: '/tmp/r' })
  assert.deepEqual(heddle.slice(1), dsh.slice(1), 'both rows start the server with the same arguments')
  assert.deepEqual(rowList(dshRow({ project: '/p', seat: 's', keyFile: '/k' }), 'args'), ['/p/_tools_/computer-use-mcp/server.mjs', '--seat', 's', '--key-file', '/k'])
  assert.throws(() => serverArgs('cursor', { keyFile: '/k', runsDir: '/r' }), /unknown way in 'cursor'/)
})

for (const via of ['dsh', 'heddle']) {
  test(`${via}: a fixture read task through the whole client cycle, judged pass by the fixture's own judge`, { timeout: 90_000 }, async () => {
    const run = await runExample({ via })
    const prefix = via === 'dsh' ? 'mcp__cu__' : ''
    assert.deepEqual(run.toolNames, ['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control'].map((name) => prefix + name))
    assert.equal(run.started.environment, 'macos-desktop')
    assert.equal(run.started.view_url, null, 'no live view was asked for')
    assert.match(run.question.text, /currency sign/)
    assert.equal(run.responded.state, 'running', 'the answer continued the run')
    assert.equal(run.paused.state, 'paused')
    assert.equal(run.pausedState, 'paused', 'status shows the pause')
    assert.equal(run.resumed.state, 'running')
    assert.equal(run.final.state, 'finished')
    assert.equal(run.final.result.status, 'completed', run.final.result.error)
    assert.ok(run.final.result.finalMessage.includes(run.expected.balance))
    assert.ok(run.trajectoryOk, 'run.json and events.jsonl are in the trajectory')
    assert.match(run.final.trajectory.replay_command, new RegExp(`replay ${run.started.run_id}$`))
    assert.equal(run.screenshots, 1, 'the final screenshot reached the model once')
    assert.ok(run.screenshotMatches, 'byte for byte')
    assert.equal(run.verdict.verdict, 'pass')
    assert.ok(run.transcript.every((line) => line.startsWith(`${via}: `)))
  })

  test(`${via}: a wrong answer is judged wrong-answer, though the run completed`, { timeout: 90_000 }, async () => {
    const run = await runExample({ via, answer: 'The balance is $0.00.\nANSWER: $0.00' })
    // CU-117: the run's own error in the message, so a failure on a gate names its cause.
    assert.equal(run.final.result.status, 'completed', `the run said: ${run.final.result.error ?? '(no error)'}`)
    assert.equal(run.verdict.verdict, 'wrong-answer')
  })
}
