import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { buildResultContent, countImages } from '../../_tools_/agent-core/adapter-claude.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { NO_APP_WINDOW_MAX_MS, NO_APP_WINDOW_NOTE, runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-99 (no-app-window.md): a capture with no approved window is never shown to the model as a screen - a note is,
// the trajectory marks it, and a run that sees no approved window for NO_APP_WINDOW_MAX_MS ends no_app_window.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-no-window-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** `windows`: one entry per capture after the first - true when an approved window is on screen. Each capture moves the clock 6 s. */
async function run(windows, turns = windows.length, action = { type: 'screenshot' }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  let clock = 1_000_000
  let captures = 0
  const shot = environment.screenshot.bind(environment)
  environment.screenshot = async (options) => {
    const frame = await shot(options)
    const index = captures
    captures += 1
    if (index > 0) clock += 6_000
    return index === 0 || windows[index - 1] ? frame : { ...frame, noAppWindow: true }
  }
  const inputs = []
  let turn = 0
  const model = createScriptedAdapter((input) => {
    inputs.push(input)
    turn += 1
    return turn <= turns ? { actions: [action] } : { final: 'done' }
  })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const result = await runTask({ task: 'look', environment, model, control, now: () => clock, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, consent: { mode: 'unattended' } })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { result, events, inputs }
}

test('a capture with no approved window reaches the model as the note and no image; its observation event is marked', async () => {
  const { inputs, events } = await run([false, true])
  const blank = inputs[1]
  assert.equal(blank.screenshot, null)
  assert.ok(blank.notes.includes(NO_APP_WINDOW_NOTE))
  assert.ok(inputs[2].screenshot, 'a capture with a window is shown again')
  assert.ok(!inputs[2].notes.includes(NO_APP_WINDOW_NOTE))
  const marked = events.filter((e) => e.kind === 'observation' && e.noAppWindow === true)
  assert.equal(marked.length, 1)
})

test(`no approved window for ${NO_APP_WINDOW_MAX_MS / 1000} s ends the run no_app_window, never helper_lost`, async () => {
  const { result, events } = await run([false, false, false, false])
  assert.equal(result.status, 'error')
  // CU-104: it names the run's apps, as the driver's first-capture stop does.
  assert.match(result.error, /^no_app_window: no window of ai\.reflection\.cu\.fixture has been on screen for 15 s/)
  assert.doesNotMatch(result.error, /helper_lost/)
  assert.equal(events.filter((e) => e.kind === 'observation' && e.noAppWindow === true).length, 3, 'the third blank capture (18 s) ends it, and is recorded first')
})

test('a capture with a window in between resets the bound', async () => {
  const { result } = await run([false, false, true, false, false])
  assert.equal(result.status, 'completed')
})

test('the first blank capture of a streak says whether the model\'s own input came right before it (waits do not count)', async () => {
  const clicked = await run([false], 1, { type: 'click', x: 10, y: 10, button: 'left' })
  assert.equal(clicked.events.find((e) => e.kind === 'observation' && e.noAppWindow === true).precededByModelAction, true)
  const looked = await run([false, false], 2)
  const blanks = looked.events.filter((e) => e.kind === 'observation' && e.noAppWindow === true)
  assert.equal(blanks.length, 2)
  assert.equal(blanks[0].precededByModelAction, false, 'a screenshot is not input')
  assert.equal('precededByModelAction' in blanks[1], false, 'only the first of a streak')
  const waited = await run([false], 1, { type: 'wait', duration_ms: 1 })
  assert.equal(waited.events.find((e) => e.kind === 'observation' && e.noAppWindow === true).precededByModelAction, false, 'a wait is not input')
})

test('the Claude adapter sends a null screenshot as text only: no image block, nothing for the prune count', () => {
  const blocks = [{ id: 't1', member: true }]
  const content = buildResultContent(blocks, [{ status: 'done', type: 'click' }], { screenshot: null, notes: [NO_APP_WINDOW_NOTE] })
  const images = JSON.stringify(content).match(/"type":"image"/g) ?? []
  assert.equal(images.length, 0)
  assert.ok(JSON.stringify(content).includes('No window of an approved app is on screen'))
  assert.equal(countImages([{ role: 'user', content }]), 0)
})

test('a blank final capture is marked noAppWindow too - e.g. after a first-capture stop, never an unmarked end state', async () => {
  // The first capture stops the run no_app_window (the driver's start wait ran out); the run's closing capture then
  // comes back as the helper's blank frame. That final observation must be marked, so no judge reads it as a screen.
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const shot = environment.screenshot.bind(environment)
  let calls = 0
  environment.screenshot = async (options) => {
    calls += 1
    if (calls === 1) throw Object.assign(new Error('no window of ai.reflection.cu.fixture is on screen'), { code: 'no_app_window' })
    return { ...(await shot(options)), noAppWindow: true }
  }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const model = createScriptedAdapter(() => ({ final: 'done' }))
  const result = await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, consent: { mode: 'unattended' } })
  assert.match(result.error, /^no_app_window: /)
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const final = events.find((e) => e.kind === 'observation' && e.final === true)
  assert.ok(final, 'the closing capture is recorded')
  assert.equal(final.noAppWindow, true)
})

test('a closing blank that starts a streak says the model acted, so an earlier streak never decides', async () => {
  // cu-researcher's case: the app vanishes on its own (a blank after a wait - not the model's doing), comes back; later
  // the model's click closes it and the person stops the run before it observes, so the only blank after it is the
  // closing capture.
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  let blankNow = false
  const shot = environment.screenshot.bind(environment)
  environment.screenshot = async (options) => ({ ...(await shot(options)), ...(blankNow ? { noAppWindow: true } : {}) })
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    const done = await perform(action)
    if (action.type === 'click') { blankNow = true; control.send('stop', { source: 'api' }) }
    return done
  }
  let turn = 0
  const model = createScriptedAdapter(() => {
    turn += 1
    if (turn === 1) { blankNow = true; return { actions: [{ type: 'wait', duration_ms: 100 }] } }
    if (turn === 2) { blankNow = false; return { actions: [{ type: 'wait', duration_ms: 100 }] } }
    if (turn === 3) return { actions: [{ type: 'click', x: 10, y: 10, button: 'left' }, { type: 'keypress', keys: ['A'] }] }
    return { final: 'done' }
  })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const result = await runTask({ task: 'look', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, consent: { mode: 'unattended' } })
  assert.equal(result.status, 'cancelled')
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const blanks = events.filter((e) => e.kind === 'observation' && e.noAppWindow === true)
  assert.equal(blanks.length, 2, 'the early blank and the closing blank')
  assert.equal(blanks[0].precededByModelAction, false, 'the early streak followed only a wait')
  assert.equal(blanks[1].final, true)
  assert.equal(blanks[1].precededByModelAction, true, 'the closing streak followed the model\'s click')
})

