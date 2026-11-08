import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { launchDesktopEnvironment } from '../../_environments_/macos-desktop/environment.mjs'
import { connectStdio } from '../../_environments_/macos-desktop/helper-link.mjs'
import { apiController, createAppApprovals, createRunControl, createScriptedAdapter, startRun } from '../../_tools_/agent-core/lib.mjs'
import { DESKTOP_INPUT_REFUSAL, desktopFacts, localInputEvent, pointCoveredEvent, startLiveView } from '../../_tools_/live-view/server.mjs'
import { consentView, initialView, noAppWindowShown, noticeFor, reduce, waitingForApp } from '../../_tools_/live-view/ui-logic.mjs'
import { cleanEnvironment } from '../../_tools_/verify-kit/sut.mjs'
import { scratchLocks, spawnFake, stdioLink, stopFake } from '../macos-desktop/harness.mjs'

/**
 * The live view on desktop runs (desktop-extension human-control.md): the macOS desktop driver on the fake helper (a
 * Node child speaking the helper protocol - never CUHelper.app, no grant, no screen, no input), each run with its own
 * desktop-run lock directory, and agent core's real run control; plus one plain fake desktop object where the driver
 * would hide what the live view does, and, for CU-38's consent request, agent core's own startRun on the fake helper
 * in a private CU_HOME. Loopback sockets only.
 */

const FIXTURE = 'com.example.fixture'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll `check` until it returns something truthy (resolved) or the time is up (rejected with `what`). */
async function until(check, what, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(10)
  }
}

/**
 * A run as startRun composes it: the live view first, then the driver on a fresh fake helper with the same run
 * control and a private lock directory, then `attach`. `approve` adds the fixture as agent core does after a person
 * approves it. `config` is the fake helper's world (its default: the fixture alone, full screen).
 */
async function desktopRun({ approve = false, config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-live-desktop-'))
  const control = createRunControl({ runId: 'desk-1' })
  const live = await startLiveView({ control, runId: 'desk-1', linkPath: null })
  let child = null
  const connect = async () => {
    const started = await stdioLink(config)
    child = started.child
    return started.link
  }
  let env
  try {
    env = await launchDesktopEnvironment({ seat: 'cu-developer-two', apps: [FIXTURE], control, connect, runLockDir: join(dir, 'lock') })
    if (approve) await env.addApp(FIXTURE)
  } catch (error) {
    await env?.close()
    if (child !== null) await stopFake(child)
    await live.close()
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  live.attach(env)
  const requests = (type) => child.requests.filter((request) => request.type === type)
  return {
    control, env, child, live, requests,
    cleanup: async () => {
      await live.close()
      await env.close()
      await stopFake(child)
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Collect a token's event stream; `seen` fills with every parsed event, `next(predicate)` waits for one. */
function events(port, token) {
  const seen = []
  const req = http.get({ host: '127.0.0.1', port, path: `/events?token=${token}` }, (res) => {
    let buffer = ''
    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (let at = buffer.indexOf('\n\n'); at !== -1; at = buffer.indexOf('\n\n')) {
        for (const line of buffer.slice(0, at).split('\n')) if (line.startsWith('data: ')) seen.push(JSON.parse(line.slice(6)))
        buffer = buffer.slice(at + 2)
      }
    })
  })
  req.on('error', () => {})
  return { seen, next: (predicate, what) => until(() => seen.find(predicate), what), close: () => req.destroy() }
}

/** Watch `/screen`; `text()` is everything received so far (latin1), `headers` once the response began. */
function screen(port, token) {
  const chunks = []
  const watcher = { headers: null, text: () => Buffer.concat(chunks).toString('latin1') }
  const req = http.get({ host: '127.0.0.1', port, path: `/screen?token=${token}` }, (res) => {
    watcher.headers = res.headers
    res.on('data', (chunk) => chunks.push(chunk))
  })
  req.on('error', () => {})
  watcher.close = () => req.destroy()
  return watcher
}

function post(port, path, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

test('desktop frames: none before the first approved app (the page waits), PNG parts after addApp at a low rate, the watch only while someone watches', async () => {
  const run = await desktopRun()
  try {
    const stream = events(run.live.port, run.control.viewToken)
    const hello = await stream.next((e) => e.type === 'hello', 'the hello')
    assert.deepEqual([hello.environmentKind, hello.environmentState.scope, hello.environmentState.pauseArmed], ['desktop', [], true])
    assert.equal(waitingForApp(reduce(initialView(), hello)), true, 'the page shows the waiting state')
    const watcher = screen(run.live.port, run.control.viewToken)
    await until(() => watcher.headers, 'the screen response')
    await sleep(200)
    assert.match(watcher.headers['content-type'], /^multipart\/x-mixed-replace; boundary=cu-live-frame/, 'not an error: the stream is open')
    assert.equal(watcher.text().includes('--cu-live-frame'), false, 'a frame before any app was approved')
    assert.deepEqual([run.requests('watch').length, run.requests('capture').length], [0, 0], 'nothing captured before approval')

    await run.env.addApp(FIXTURE)
    await until(() => watcher.text().includes('content-type: image/png'), 'a PNG frame part')
    const [watch] = run.requests('watch')
    assert.ok(watch.fps > 0 && watch.fps <= 2, `watch at ${watch.fps} fps`)
    const facts = await stream.next((e) => e.type === 'environment_state' && e.environmentState.scope.includes(FIXTURE), 'the new scope')
    assert.equal(waitingForApp([hello, facts].reduce(reduce, initialView())), false, 'the waiting state ends with the scope')
    assert.equal(JSON.stringify(facts).includes('Fixture'), false, 'no window title reaches the stream')

    watcher.close()
    await until(() => run.requests('unwatch').length === 1, 'the unwatch once nobody watches')
    stream.close()
  } finally {
    await run.cleanup()
  }
})

test('POST /input is refused by name on a desktop run in every state and nothing reaches the helper; take over and hand back (with note) only change the state', async () => {
  const run = await desktopRun({ approve: true })
  const { port } = run.live
  const ctl = run.control.controlToken
  try {
    const input = { type: 'mouse', action: 'down', fx: 0.5, fy: 0.5, button: 'left' }
    assert.equal((await post(port, '/input', run.control.viewToken, input)).status, 403, 'the view token is refused first, as before')
    assert.deepEqual(await post(port, '/input', ctl, input), { status: 409, json: { ok: false, state: 'running', error: 'unsupported_on_desktop', message: DESKTOP_INPUT_REFUSAL } })
    assert.equal((await post(port, '/control', ctl, { command: 'take_over' })).json.state, 'taken_over')
    for (const body of [input, { type: 'key', action: 'down', key: 'a' }, { type: 'text', text: 'x' }, { type: 'navigate', direction: 'back' }]) {
      const refused = await post(port, '/input', ctl, body)
      assert.deepEqual([refused.status, refused.json.error, refused.json.state], [409, 'unsupported_on_desktop', 'taken_over'], body.type)
    }
    const back = await post(port, '/control', ctl, { command: 'hand_back', note: 'closed a dialog myself' })
    assert.deepEqual(back.json, { ok: true, state: 'running' })
    assert.match(run.control.drainGuidance().notes.join(' '), /may have changed the page\. closed a dialog myself/)
    assert.deepEqual((await post(port, '/control', ctl, { command: 'pause' })).json, { ok: true, state: 'paused' })
    assert.deepEqual((await post(port, '/control', ctl, { command: 'resume' })).json, { ok: true, state: 'running' })
    assert.deepEqual((await post(port, '/control', ctl, { command: 'stop', reason: 'test' })).json, { ok: true, state: 'finished' })
    assert.equal(run.requests('input').length, 0, 'an input request reached the helper')
  } finally {
    await run.cleanup()
  }
})

test('the local-input pause reaches the stream as a state change from local_input and a localInput event with only at and kind; only a person with the control token resumes', async () => {
  const run = await desktopRun({ approve: true })
  const { port } = run.live
  try {
    const stream = events(port, run.control.controlToken)
    await stream.next((e) => e.type === 'hello', 'the hello')
    // The design's seam: the fake helper reports a person's key through the idle guard; nothing is posted.
    const reported = await run.env.simulateLocalInput({ kind: 'key', via: 'idle' })
    const paused = await stream.next((e) => e.type === 'state' && e.state === 'paused', 'the pause')
    assert.deepEqual([paused.prior, paused.source], ['running', 'local_input'])
    const local = await stream.next((e) => e.type === 'localInput', 'the localInput event')
    assert.deepEqual(Object.keys(local).sort(), ['at', 'kind', 'type'], `more than time and kind: ${JSON.stringify(local)}`)
    assert.deepEqual([local.kind, local.at], ['key', Date.parse(reported.at)])
    const held = await stream.next((e) => e.type === 'environment_state' && e.environmentState.localInput !== null, 'the facts with the local input')
    assert.equal(held.environmentState.localInput, reported.at)
    const notice = noticeFor(stream.seen.reduce(reduce, initialView()))
    assert.deepEqual([notice.kind, notice.resume], ['local_input', true])
    assert.match(notice.text, /own key press on the Mac paused the agent/)

    // The person's input cannot resume; a page that reconnects learns who paused; the view token cannot resume.
    assert.equal(run.control.send({ command: 'resume' }, { source: 'local_input' }).ok, false)
    const watcher = events(port, run.control.viewToken)
    const hello = await watcher.next((e) => e.type === 'hello', 'the second hello')
    assert.deepEqual([hello.state, hello.pausedBy, hello.environmentState.localInput], ['paused', 'local_input', reported.at])
    assert.deepEqual([noticeFor(reduce(initialView(), hello)).kind, noticeFor(reduce(initialView(), hello)).resume], ['local_input', false])
    assert.deepEqual((await post(port, '/control', run.control.viewToken, { command: 'resume' })).json, { ok: false, state: 'paused', error: 'not_allowed_for_sender' })
    assert.deepEqual((await post(port, '/control', run.control.controlToken, { command: 'resume' })).json, { ok: true, state: 'running' })
    await stream.next((e) => e.type === 'environment_state' && e.environmentState.localInput === null, 'the stop cleared')
    assert.equal(noticeFor(stream.seen.reduce(reduce, initialView())), null)
    assert.match(run.control.drainGuidance().notes.join(' '), /used the computer while the run was paused/)
    stream.close()
    watcher.close()
  } finally {
    await run.cleanup()
  }
})

test('new_app consent on the live view names the bundle id; the control token approves it for always, the view token cannot answer', async () => {
  const run = await desktopRun()
  const { port } = run.live
  try {
    const answer = run.control.requestConsent({
      kind: 'action', origin: 'policy', step: 0, index: null, class: 'new_app', classes: ['new_app'], rule: 'app:start', action: null,
      target: { origin: FIXTURE, role: null }, what: `use ${FIXTURE} in this run (a start app)`, recipient: FIXTURE, screenshot: null, lifetimes: ['once', 'run', 'always'],
    }, { timeoutMs: 0 })
    const stream = events(port, run.control.viewToken)
    const hello = await stream.next((e) => e.type === 'hello', 'the hello')
    assert.equal(hello.state, 'awaiting_consent')
    const [request] = hello.pending
    assert.match(consentView(request, true).text, /use com\.example\.fixture\?/)
    assert.ok(consentView(request, true).choices.some((c) => c.lifetime === 'always' && c.label.includes(FIXTURE)))
    const refused = await post(port, '/control', run.control.viewToken, { command: 'consent', id: request.id, approved: true, lifetime: 'always' })
    assert.deepEqual([refused.status, refused.json.ok], [403, false])
    assert.deepEqual((await post(port, '/control', run.control.controlToken, { command: 'consent', id: request.id, approved: true, lifetime: 'always' })).json, { ok: true, state: 'running' })
    assert.deepEqual(await answer, { approved: true, lifetime: 'always', answeredBy: 'live' })
    stream.close()
  } finally {
    await run.cleanup()
  }
})

test('the watch token on a desktop run sees frames and state but never takes over, resumes, hands back, answers or sends input', async () => {
  const run = await desktopRun({ approve: true })
  const { port } = run.live
  const view = run.control.viewToken
  try {
    const stream = events(port, view)
    const hello = await stream.next((e) => e.type === 'hello', 'the hello')
    assert.deepEqual([hello.source, hello.environmentKind, hello.environmentState.scope], ['view', 'desktop', [FIXTURE]])
    const watcher = screen(port, view)
    await until(() => watcher.text().includes('content-type: image/png'), 'a frame for the watcher')
    watcher.close()
    for (const body of [{ command: 'take_over' }, { command: 'resume' }, { command: 'hand_back' }, { command: 'guide', text: 'go' }]) {
      assert.deepEqual(await post(port, '/control', view, body), { status: 403, json: { ok: false, state: 'running', error: 'not_allowed_for_sender' } }, body.command)
    }
    assert.equal((await post(port, '/input', view, { type: 'text', text: 'x' })).status, 403)
    assert.equal(run.control.state, 'running')
    stream.close()
  } finally {
    await run.cleanup()
  }
})

test('a plain desktop environment: the screencast asks for a low frame rate only, frames keep their PNG type, input never reaches humanInput', async () => {
  const listeners = {}
  const calls = []
  const env = {
    kind: 'desktop',
    state: () => ({ url: 'app:com.example.fixture', title: 'Secret window title', scope: [FIXTURE], pauseArmed: true, localInput: null, secureInput: false, grants: { screen: true }, frontmostBundleId: FIXTURE }),
    on(kind, fn) { (listeners[kind] ??= []).push(fn); return () => { listeners[kind] = listeners[kind].filter((f) => f !== fn) } },
    async startScreencast(options) { calls.push(['start', options]); env.onFrame = options.onFrame; return async () => { calls.push(['stop']) } },
    async humanInput() { calls.push(['human']) },
  }
  const control = createRunControl({ runId: 'desk-2' })
  const live = await startLiveView({ control, runId: 'desk-2', linkPath: null })
  live.attach(env)
  try {
    const stream = events(live.port, control.viewToken)
    const hello = await stream.next((e) => e.type === 'hello', 'the hello')
    assert.deepEqual(hello.environmentState, desktopFacts(env.state()))
    assert.equal(JSON.stringify(hello).includes('Secret window title'), false, 'a window title reached the stream')
    const watcher = screen(live.port, control.viewToken)
    await until(() => calls.length === 1, 'the screencast')
    assert.deepEqual(Object.keys(calls[0][1]).sort(), ['fps', 'onFrame'])
    assert.equal(calls[0][1].fps, 2)
    env.onFrame({ data: Buffer.from('PNGDATA'), mimeType: 'image/png' })
    await until(() => watcher.text().includes('content-type: image/png\r\ncontent-length: 7\r\n\r\nPNGDATA'), 'the PNG part')
    // The part names the scope it was written under and when, ahead of its content type.
    assert.match(watcher.text(), /--cu-live-frame\r\nx-cu-frame-at: \d{13}\r\nx-cu-scope: com\.example\.fixture\r\ncontent-type: image\/png\r\n/)
    control.send({ command: 'take_over' }, { source: 'control' })
    assert.equal((await post(live.port, '/input', control.controlToken, { type: 'text', text: 'x' })).json.error, 'unsupported_on_desktop')
    assert.equal(calls.some((call) => call[0] === 'human'), false)
    // A driver's local input with extra fields leaves the process as time and kind only.
    for (const fn of listeners.localInput) fn({ at: '2026-11-02T10:00:00.000Z', kind: 'pointer', x: 10, y: 20, key: 'a' })
    const local = await stream.next((e) => e.type === 'localInput', 'the localInput event')
    assert.deepEqual(local, localInputEvent(Date.parse('2026-11-02T10:00:00.000Z'), 'pointer'))
    watcher.close()
    stream.close()
  } finally {
    await live.close()
  }
  assert.deepEqual(Object.values(listeners).flat(), [], 'close unsubscribes from the environment')
})

const OVERLAY = 'now.typeless.desktop'
const OVERLAY_TITLE = 'Typeless dictation bar'
/**
 * CU-38's world (Q-D11): a third-party overlay's window over the approved fixture, as Typeless sat over CU Fixture
 * live. The overlay is listed first, so the fake's hit test names it where both hold the point; its title is in the
 * world only to prove that it never reaches a stream.
 */
const OVERLAY_WORLD = {
  apps: [
    { bundleId: OVERLAY, pid: 777, title: OVERLAY_TITLE, rect: { x: 300, y: 500, width: 200, height: 60 } },
    { bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 800, height: 600 } },
  ],
  frontmost: FIXTURE,
}
const ON_OVERLAY = { x: 400, y: 530 }

test('CU-38 flow B: the driver\'s target guard names the covering app in details.bundleId; the point_covered notice asked of agent core reaches both tokens as kind and bundle id only, a later hello keeps it, a clear or a state change ends it', async () => {
  assert.deepEqual(pointCoveredEvent({ type: 'notice', kind: 'point_covered', app: OVERLAY, title: OVERLAY_TITLE, runId: 'r', t: 'x' }), { type: 'notice', kind: 'point_covered', app: OVERLAY })
  const run = await desktopRun({ approve: true, config: OVERLAY_WORLD })
  const { port } = run.live
  try {
    const control = events(port, run.control.controlToken)
    const watch = events(port, run.control.viewToken)
    await control.next((e) => e.type === 'hello', 'the control hello')
    await watch.next((e) => e.type === 'hello', 'the watch hello')
    const refused = await run.env.perform({ type: 'click', button: 'left', ...ON_OVERLAY }).then(() => null, (error) => error)
    assert.deepEqual([refused?.code, refused?.details?.reason, refused?.details?.bundleId], ['out_of_scope', 'target_out_of_scope', OVERLAY])
    assert.equal(run.requests('input').length, 0, 'nothing was posted')
    // Agent core's side as requested of cu-developer-one (loop.mjs, a failed perform): the bundle id from the error's
    // details. Extra fields a careless sender might add never leave the process.
    run.control.notice('point_covered', { app: refused.details.bundleId, title: OVERLAY_TITLE, point: refused.details.point })
    const text = `A ${OVERLAY} window covered the point of the agent's last action - quit, move or dismiss it.`
    for (const stream of [control, watch]) {
      const notice = await stream.next((e) => e.type === 'notice' && e.kind === 'point_covered', 'the point_covered notice')
      assert.deepEqual(Object.keys(notice).sort(), ['app', 'at', 'kind', 'type'], JSON.stringify(notice))
      assert.equal(notice.app, OVERLAY)
      assert.equal(noticeFor(stream.seen.reduce(reduce, initialView())).text, text)
    }
    const later = events(port, run.control.viewToken)
    const hello = await later.next((e) => e.type === 'hello', 'a later hello')
    assert.deepEqual(hello.covered, { app: OVERLAY })
    assert.equal(noticeFor(reduce(initialView(), hello)).text, text, 'a watch page that connects later shows it')
    // Agent core's clear once an action went through.
    run.control.notice('point_covered', { app: null })
    await control.next((e) => e.type === 'notice' && e.kind === 'point_covered' && e.app === null, 'the clear')
    assert.equal(noticeFor(control.seen.reduce(reduce, initialView())), null)
    // Agent core raises it before asking about the covering app (every mode): the ask's running -> awaiting_consent ->
    // running keeps it, so an unattended run's watcher still sees what to quit.
    run.control.notice('point_covered', { app: OVERLAY })
    await until(() => control.seen.filter((e) => e.kind === 'point_covered').length === 3, 'the notice before the ask')
    const asked = run.control.requestConsent({ id: 'cover-1', class: 'new_app', app: OVERLAY, appNamedBy: 'hit_test' }, { timeoutMs: 5_000 })
    run.control.decline('cover-1', 'unattended')
    await asked
    await control.next((e) => e.type === 'state' && e.prior === 'awaiting_consent' && e.state === 'running', 'the ask ending')
    assert.equal(noticeFor(control.seen.reduce(reduce, initialView())).text, text, 'the page keeps it through the ask')
    const asking = events(port, run.control.viewToken)
    assert.deepEqual((await asking.next((e) => e.type === 'hello', 'the hello after the ask')).covered, { app: OVERLAY })
    asking.close?.()
    run.control.notice('point_covered', { app: null })
    await until(() => control.seen.filter((e) => e.kind === 'point_covered').length === 4, 'the clear after the ask')
    // Set again, then a state change ends it, on the page and in the next hello.
    run.control.notice('point_covered', { app: OVERLAY })
    await until(() => control.seen.filter((e) => e.kind === 'point_covered').length === 5, 'the second notice')
    assert.deepEqual((await post(port, '/control', run.control.viewToken, { command: 'pause' })).json, { ok: true, state: 'paused' })
    await control.next((e) => e.type === 'state' && e.state === 'paused', 'the pause')
    assert.equal(noticeFor(control.seen.reduce(reduce, initialView())), null)
    const after = events(port, run.control.viewToken)
    assert.equal((await after.next((e) => e.type === 'hello', 'the hello after the pause')).covered, null)
    for (const stream of [control, watch, later, after]) {
      assert.equal(JSON.stringify(stream.seen).includes(OVERLAY_TITLE), false, 'the overlay\'s window title reached a stream')
      stream.close()
    }
  } finally {
    await run.cleanup()
  }
})

test('CU-38 flow A end to end (agent core\'s startRun on the fake helper): a click on the overlay asks new_app for it with nothing posted; the page adds the covered-point line exactly when the request says appNamedBy hit_test', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-live-covered-'))
  const locks = scratchLocks()
  const child = spawnFake(OVERLAY_WORLD)
  const priorHome = process.env.CU_HOME
  // The live view writes the control link under $CU_HOME: a private one here, never the owner's.
  process.env.CU_HOME = join(dir, 'home')
  let handle = null
  try {
    const appApprovals = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    appApprovals.grantAlways(FIXTURE, { by: 'tty' })
    const controller = apiController()
    handle = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-two', apps: [FIXTURE], appApprovals, env: cleanEnvironment(), task: 'press the button under the dictation bar',
      runsDirectory: join(dir, 'runs'), live: true, controller, bounds: { maxSteps: 4, maxWallMs: 30_000 },
      model: createScriptedAdapter({ turns: [{ actions: [{ type: 'click', button: 'left', ...ON_OVERLAY }] }, { final: 'done' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'test-token', helloTimeoutMs: 5000 }), runLock: locks.next() },
    })
    assert.equal(handle.started, true)
    assert.ok(await controller.waitForRequest(10_000), 'agent core asked about the overlay')
    const { port } = new URL(handle.viewUrl)
    const watch = events(port, handle.control.viewToken)
    const [request] = (await watch.next((e) => e.type === 'hello', 'the watch hello')).pending
    // What the request carries today (loop.mjs): the app, a rule frontmost and target share, the action record and the
    // target's bundle id and role (no name: the app is not approved); frontmost-or-target only in the free-text `what`.
    assert.deepEqual([request.class, request.app, request.rule, request.action?.type, request.target], ['new_app', OVERLAY, 'app:not_approved', 'click', { origin: OVERLAY, role: null }])
    assert.match(request.what, /\(target\)$/)
    // Once agent core sends appNamedBy, this app was named by the hit test at the click, so it must say so.
    if (request.appNamedBy !== undefined) assert.equal(request.appNamedBy, 'hit_test')
    const line = `A ${OVERLAY} window covers the point the agent wants to click - quit or move it rather than approve it.`
    assert.equal(consentView(request, false).note, request.appNamedBy === 'hit_test' ? line : null, 'the page never guesses')
    for (const canAnswer of [false, true]) assert.equal(consentView({ ...request, appNamedBy: 'hit_test' }, canAnswer).note, line, 'the line once the field arrives')
    assert.equal(JSON.stringify(watch.seen).includes(OVERLAY_TITLE), false, 'the overlay\'s window title reached the stream')
    // A person declines on the control link; the model hears it and finishes; nothing was posted in the whole run.
    assert.deepEqual((await post(port, '/control', handle.control.controlToken, { command: 'consent', id: request.id, approved: false })).json, { ok: true, state: 'running' })
    assert.equal((await handle.done).status, 'completed')
    assert.equal(child.requests.filter((entry) => entry.type === 'input').length, 0, 'an input reached the helper')
    watch.close()
  } finally {
    if (handle !== null) await handle.done.catch(() => {})
    if (priorHome === undefined) delete process.env.CU_HOME
    else process.env.CU_HOME = priorHome
    await stopFake(child)
    locks.remove()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-100 through the real live-view server: no approved window reaches the page as the notice, and a window coming back clears it', async () => {
  // The fake helper's first capture is helper 0.2.32's blank frame (the one addApp takes); later ones show the window.
  const run = await desktopRun({ approve: true, config: { quirks: { noAppWindow: 1 } } })
  try {
    const stream = events(run.live.port, run.control.viewToken)
    const hello = await stream.next((e) => e.type === 'hello', 'the hello')
    assert.equal(hello.environmentState.noAppWindow, true, 'the driver\'s state after the blank capture reaches the stream')
    assert.equal(noAppWindowShown(reduce(initialView(), hello)), true, 'the page shows the no-window notice, not a black frame')
    await run.env.screenshot()
    const back = await stream.next((e) => e.type === 'environment_state' && e.environmentState.noAppWindow === false, 'the facts once a window is back')
    assert.equal(noAppWindowShown([hello, back].reduce(reduce, initialView())), false, 'the notice goes with the window back')
    stream.close()
  } finally {
    await run.cleanup()
  }
})
