import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createFakeEnvironment, createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { acquireDesktopRun } from '../../_environments_/macos-desktop/run-lock.mjs'
import { createRunManager } from '../../_tools_/computer-use-mcp/runs.mjs'
import { checkStart } from '../../_tools_/computer-use-mcp/tools.mjs'
import { makePng } from '../macos-desktop/png.mjs'
import { alwaysApproved, clickPlan, fakeDesktop, FIXTURE, WORLD } from './desktop-fake.mjs'

/**
 * Desktop runs through the run manager: against a stubbed startRun for the argument mapping and the status shape, and
 * against agent core's real startRun with the macos-desktop driver on the fake helper for whole runs - covered, asked
 * of a person, declined unattended, and refused when another run holds the Mac.
 */

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-desktop-'))
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

async function untilFinished(manager, runId) {
  for (let i = 0; i < 60; i += 1) {
    const reply = await manager.status({ runId, waitSeconds: 1 })
    if (reply.body.state === 'finished') return reply
  }
  throw new Error('the run did not finish')
}

/** A run manager whose desktop runs use the real startRun, the driver and a fresh fake helper each. */
function onFake(dir, { covered = [FIXTURE], ...extra } = {}) {
  const desktop = fakeDesktop({ lockDir: join(dir, 'run-lock') })
  const manager = createRunManager({
    seat: 'cu-test-seat', runsDirectory: join(dir, 'runs'), appApprovals: alwaysApproved(join(dir, 'app-approvals.json'), covered),
    environmentOptions: desktop.environmentOptions, ...extra,
  })
  return { desktop, manager }
}

test('a desktop start reaches startRun with the caller apps as candidates, its controller and seat, and no browser', async () => {
  const { dir, remove } = scratch()
  const calls = []
  const shot = join(dir, 'final.png')
  writeFileSync(shot, makePng(4, 3))
  const manager = createRunManager({
    seat: 'cu-test-seat',
    runsDirectory: join(dir, 'runs'),
    launchEnvironment: async () => { throw new Error('the browser driver was launched for a desktop run') },
    startRun: async (options) => {
      calls.push(options)
      const control = createRunControl({ runId: 'desk-1' })
      const result = { runId: 'desk-1', status: 'completed', finalMessage: 'ok', steps: 1, finalScreenshot: shot, trajectoryDir: join(dir, 'runs', 'desk-1'), replayUrl: null, replayCommand: 'node cli.mjs replay desk-1' }
      return { runId: 'desk-1', control, viewUrl: null, controlUrl: null, done: new Promise((resolve) => setTimeout(() => { control.finish(result); resolve(result) }, 20)) }
    },
  })
  try {
    const plan = clickPlan(dir)
    const started = await manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], exclude_apps: ['com.example.other'], model: 'scripted', plan, live_view: false, pre_approve: ['submit', `unknown_target@${FIXTURE}`], max_steps: 4 }))
    assert.deepEqual([started.run_id, started.environment, started.view_url], ['desk-1', 'macos-desktop', null])
    const options = calls[0]
    assert.deepEqual([options.environment, options.seat, options.apps, options.excludeApps, options.live], ['macos-desktop', 'cu-test-seat', [FIXTURE], ['com.example.other'], false])
    assert.equal(options.controller.kind, 'mcp')
    assert.deepEqual(options.preApprovals, [{ class: 'submit' }, { class: 'unknown_target', app: FIXTURE }], 'unknown_target@app reaches the app policy as that app only')
    assert.equal(options.bounds.maxSteps, 4)
    assert.equal(options.startUrl, undefined)
    assert.ok(!('appApprovals' in options), 'the always store stays agent core\'s own: the server passes none')
    const { body, content } = await untilFinished(manager, 'desk-1')
    assert.equal(body.result.status, 'completed')
    assert.deepEqual(body.trajectory, { run_dir: join(dir, 'runs', 'desk-1'), replay_url: null, replay_command: 'node cli.mjs replay desk-1' })
    assert.deepEqual(content.map((block) => block.type), ['text', 'image'])
    assert.equal(content[1].mimeType, 'image/png')
  } finally {
    remove()
  }
})

test('status has the same shape for a desktop run as for a browser run', async () => {
  const { dir, remove } = scratch()
  const { desktop, manager } = onFake(dir, { launchEnvironment: async (options) => createFakeEnvironment({ control: options.control }) })
  try {
    const plan = clickPlan(dir)
    const browser = await manager.start(checkStart({ task: 'click once', start_url: 'http://127.0.0.1:43117/', model: 'scripted', plan, live_view: false }))
    const browserStatus = await untilFinished(manager, browser.run_id)
    const desk = await manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan, live_view: false }))
    const deskStatus = await untilFinished(manager, desk.run_id)
    assert.deepEqual(Object.keys(deskStatus.body), Object.keys(browserStatus.body))
    assert.deepEqual(Object.keys(deskStatus.body.trajectory), Object.keys(browserStatus.body.trajectory))
    assert.deepEqual(deskStatus.content.map((block) => [block.type, block.mimeType ?? null]), browserStatus.content.map((block) => [block.type, block.mimeType ?? null]))
  } finally {
    await desktop.stop()
    remove()
  }
})

test('a desktop run on the fake helper completes through startRun: the click reaches the helper, status carries the final PNG and a working trajectory link', async () => {
  const { dir, remove } = scratch()
  const { desktop, manager } = onFake(dir)
  try {
    const started = await manager.start(checkStart({ task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }))
    assert.equal(started.trajectory_dir, join(dir, 'runs', started.run_id))
    const { body, content } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'completed', body.result.error)
    assert.equal(body.result.finalMessage, 'Done: clicked.')
    assert.ok(body.steps >= 1, 'the steps were followed from events.jsonl')
    assert.match(body.last_step, /^step \d+: /)
    assert.ok(desktop.requests().some((r) => r.type === 'input' && r.events.some((e) => e.kind === 'down')), 'the click never reached the helper')
    const header = JSON.parse(readFileSync(join(body.trajectory.run_dir, 'run.json'), 'utf8'))
    assert.deepEqual([header.environment.kind, header.environment.site, header.policy.kind], ['desktop', 'desktop:macos-local', 'app'])
    assert.ok(existsSync(join(body.trajectory.run_dir, 'events.jsonl')))
    assert.match(body.trajectory.replay_command, new RegExp(`replay ${started.run_id}$`))
    assert.ok(body.result.finalScreenshot.startsWith(`${body.trajectory.run_dir}/`))
    assert.equal(content[1].type, 'image')
    assert.deepEqual(readFileSync(body.result.finalScreenshot), Buffer.from(content[1].data, 'base64'), 'the image is the final screenshot, byte for byte')
    assert.equal(Buffer.from(content[1].data, 'base64').subarray(1, 4).toString(), 'PNG')
  } finally {
    await desktop.stop()
    remove()
  }
})

test('an app nobody approved, without a live view, is declined unattended: nothing is captured or posted', async () => {
  const { dir, remove } = scratch()
  const { desktop, manager } = onFake(dir, { covered: [] })
  try {
    const started = await manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }))
    const { body, content } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'declined')
    assert.match(body.result.finalMessage, /no app was approved/)
    const types = desktop.requests().map((r) => r.type)
    assert.ok(!types.some((type) => ['scope', 'capture', 'input'].includes(type)), `the helper was asked for ${types.join(', ')}`)
    assert.equal(content.length, 1, 'no screenshot exists, so none is returned')
  } finally {
    await desktop.stop()
    remove()
  }
})

test('with a live view, a start app waits for a person: the caller sees it but cannot answer it; the person approves and the run completes', async () => {
  const { dir, remove } = scratch()
  const liveView = async () => ({ port: 1, origin: 'http://127.0.0.1:1', viewUrl: 'http://127.0.0.1:1/?token=view-token', controlUrl: 'http://127.0.0.1:1/?token=control-token', attach() {}, close: async () => {} })
  const { desktop, manager } = onFake(dir, { covered: [], startLiveView: liveView })
  try {
    const started = await manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir) }))
    assert.equal(started.view_url, 'http://127.0.0.1:1/?token=view-token')
    let waiting = null
    for (let i = 0; i < 20 && waiting === null; i += 1) waiting = (await manager.status({ runId: started.run_id, waitSeconds: 1 })).body.waiting_for_person
    assert.equal(waiting.class, 'new_app')
    assert.match(waiting.what, new RegExp(FIXTURE.replace(/\./g, '\\.')))
    assert.match(waiting.how, /live view themselves/)
    assert.ok(!desktop.requests().some((r) => r.type === 'capture'), 'nothing is captured before the approval')
    const control = manager.runs.get(started.run_id).control
    const pending = control.pending()[0]
    assert.throws(() => manager.respond({ runId: started.run_id, questionId: pending.id, answer: 'yes' }), /not pending/)
    assert.equal(control.send({ command: 'consent', id: pending.id, approved: true }, { source: 'caller' }).ok, false, 'the caller channel cannot consent')
    assert.equal(control.pending().length, 1)
    // The person, in the live view (the control token's channel):
    assert.equal(control.send({ command: 'consent', id: pending.id, approved: true, lifetime: 'once' }, { source: 'control' }).ok, true)
    const { body } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'completed', body.result.error)
    assert.equal(body.view_url, null, 'startRun closed the live view with the run')
    assert.doesNotMatch(JSON.stringify(body), /control-token|control_?url/i, 'the control URL never reaches the caller')
  } finally {
    await desktop.stop()
    remove()
  }
})

test('a desktop run another seat holds the Mac for is refused by name before any helper starts, and is recorded', async () => {
  const { dir, remove } = scratch()
  const { desktop, manager } = onFake(dir)
  const held = await acquireDesktopRun({ seat: 'cu-other-seat', runId: 'held-run', dir: join(dir, 'run-lock') })
  try {
    await assert.rejects(
      manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false })),
      /the desktop run could not start: resource_refused: another desktop run holds this Mac \(seat cu-other-seat, run held-run/,
    )
    assert.equal(desktop.helpers.length, 0, 'no fake helper was started')
    const [run] = [...manager.runs.values()]
    assert.equal((await manager.status({ runId: run.runId })).body.result.status, 'error')
    held.release()
    const next = await manager.start(checkStart({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }))
    // CU-117: the run's own error in the message, so a failure on a gate names its cause (it failed once during a hold).
    const { body: nextBody } = await untilFinished(manager, next.run_id)
    assert.equal(nextBody.result.status, 'completed', `a refused start does not block the next one - the run said: ${nextBody.result.error ?? '(no error)'}`)
  } finally {
    held.release()
    await desktop.stop()
    remove()
  }
})

test('stopping a desktop run ends it cancelled and closes the helper', async () => {
  const { dir, remove } = scratch()
  const { desktop, manager } = onFake(dir)
  try {
    const plan = clickPlan(dir, [{ actions: [{ type: 'wait', duration_ms: 3000 }] }, { actions: [{ type: 'wait', duration_ms: 3000 }] }, { final: 'never' }])
    const started = await manager.start(checkStart({ task: 'wait', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan, live_view: false }))
    manager.control({ runId: started.run_id, command: 'stop', text: 'enough' })
    const { body } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'cancelled')
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.ok(desktop.requests().some((r) => r.type === 'bye'), 'the driver said bye to the helper')
  } finally {
    await desktop.stop()
    remove()
  }
})

test('CU-100 end to end: with no window of the approved app on screen, the caller sees a no_app_window error naming the app and the fix - never helper_lost, nothing posted', async () => {
  const { dir, remove } = scratch()
  // helper 0.2.32's blank capture on every request (a large count: the fake's config crosses as JSON); a short start wait.
  const desktop = fakeDesktop({ lockDir: join(dir, 'run-lock'), world: { ...WORLD, quirks: { noAppWindow: 1_000_000 } } })
  const manager = createRunManager({
    seat: 'cu-test-seat', runsDirectory: join(dir, 'runs'), appApprovals: alwaysApproved(join(dir, 'app-approvals.json')),
    environmentOptions: () => ({ ...desktop.environmentOptions(), appWindowWaitMs: 300, appWindowPollMs: 20 }),
  })
  try {
    const started = await manager.start(checkStart({ task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }))
    const { body, content } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'error')
    assert.match(body.result.error, /no_app_window/)
    assert.match(body.result.error, /no window of ai\.reflection\.cu\.fixture is on screen \(not running, every window closed, minimized or hidden, or on another Space or display\); open it and run again/)
    assert.doesNotMatch(body.result.error, /helper_lost/)
    assert.match(content[0].text, /no_app_window/, 'the text part the caller reads names it too')
    assert.ok(!desktop.requests().some((r) => r.type === 'input'), 'nothing was posted')
  } finally {
    await desktop.stop()
    remove()
  }
})

test('CU-100 timing end to end: with no app window, the run ends within the start wait plus a margin - the final screenshot does not wait again', { timeout: 30_000 }, async () => {
  const { dir, remove } = scratch()
  const desktop = fakeDesktop({ lockDir: join(dir, 'run-lock'), world: { ...WORLD, quirks: { noAppWindow: 1_000_000 } } })
  const waitMs = 1500
  const manager = createRunManager({
    seat: 'cu-test-seat', runsDirectory: join(dir, 'runs'), appApprovals: alwaysApproved(join(dir, 'app-approvals.json')),
    environmentOptions: () => ({ ...desktop.environmentOptions(), appWindowWaitMs: waitMs, appWindowPollMs: 50 }),
  })
  try {
    const started = Date.now()
    const run = await manager.start(checkStart({ task: 'click once in CU Fixture', environment: 'macos-desktop', apps: [FIXTURE], model: 'scripted', plan: clickPlan(dir), live_view: false }))
    const { body } = await untilFinished(manager, run.run_id)
    const elapsed = Date.now() - started
    assert.match(body.result.error, /^no_app_window: /)
    assert.ok(elapsed >= waitMs, `it waited the start wait (${elapsed} ms)`)
    assert.ok(elapsed < waitMs + 1000, `ended ${elapsed} ms after the start, not after a second wait (${2 * waitMs} ms or more)`)
  } finally {
    await desktop.stop()
    remove()
  }
})
