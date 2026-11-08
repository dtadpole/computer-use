import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { historyDirection } from '../../_environments_/chrome-browser/input-plan.mjs'

// CU-153: a browser reload, back or forward onto an entry whose page was the direct answer to a POST resends the form.

const START = 'http://127.0.0.1:43117/tasks/demo/'

async function run(keys, history) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-history-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    // The browser environment's own table (cu-developer-two's historyDirection, the path planChord performs) - the
    // loop hands it the validated action.
    environment.historyAction = (action) => (action.type === 'keypress' ? historyDirection(action.keys) : null)
    const baseState = environment.state.bind(environment)
    environment.state = async () => ({ ...(await baseState()), ...(history === undefined ? {} : { history }) })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys }] }, { final: 'done' }] })
    const result = await runTask({ task: 'check the order', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    return { event, performed: environment.log.length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const post = { postResult: true }
const prg = { postResult: false }

test('reload on a page that was a POST\'s direct answer asks submit; unattended it never reloads', async () => {
  for (const keys of [['F5'], ['META', 'R']]) {
    const { event, performed } = await run(keys, { current: post, back: null, forward: null })
    assert.deepEqual([event.decision, event.class], ['confirm', 'submit'], keys.join('+'))
    assert.equal(performed, 0)
  }
})

test('back or forward onto a POST result asks; onto a redirect-answered (PRG) entry is allowed', async () => {
  assert.equal((await run(['ALT', 'LEFT'], { current: prg, back: post, forward: null })).event.class, 'submit')
  assert.equal((await run(['META', ']'], { current: prg, back: null, forward: post })).event.class, 'submit')
  assert.equal((await run(['META', '['], { current: post, back: prg, forward: null })).event.decision, 'allow', 'back onto a PRG entry, though the current one is a POST result')
  assert.equal((await run(['F5'], { current: prg, back: null, forward: null })).event.decision, 'allow')
})

test('no history reported (an older driver) or no such entry: as today', async () => {
  assert.equal((await run(['F5'], undefined)).event.decision, 'allow')
  assert.equal((await run(['ALT', 'LEFT'], { current: post, back: null, forward: null })).event.decision, 'allow', 'no back entry')
  assert.equal((await run(['META', 'A'], { current: post, back: null, forward: null })).event.decision, 'allow', 'not a history chord')
})

test('the action event records the history entry as judged - move and postResult (null when unreported)', async () => {
  assert.deepEqual((await run(['F5'], { current: post, back: null, forward: null })).event.history, { move: 'reload', postResult: true })
  assert.deepEqual((await run(['ALT', 'LEFT'], { current: post, back: prg, forward: null })).event.history, { move: 'back', postResult: false })
  assert.deepEqual((await run(['F5'], undefined)).event.history, { move: 'reload', postResult: null })
  assert.equal((await run(['META', 'A'], { current: post, back: null, forward: null })).event.history, undefined, 'not a history chord')
})
