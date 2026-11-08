import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { LIVE_VIEW_TITLE_MARKER } from '../../_tools_/agent-core/exclusions.mjs'
import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { hostAllowed, pick, publicEvent, startLiveView } from '../../_tools_/live-view/server.mjs'
import { initialView, pageFor } from '../../_tools_/live-view/ui-logic.mjs'

// This suite opens loopback sockets only; no browser.

function fakeEnvironment() {
  const listeners = {}
  const env = {
    calls: [],
    viewport: { width: 1000, height: 500 },
    onFrame: null,
    state: () => ({ url: 'http://127.0.0.1:1/', title: 't', loading: false, tabs: [], dialog: null }),
    on(kind, fn) { (listeners[kind] ??= []).push(fn) },
    emit(kind, detail) { for (const fn of listeners[kind] ?? []) fn(detail) },
    async startScreencast({ onFrame }) {
      env.calls.push('start')
      env.onFrame = onFrame
      return async () => { env.calls.push('stop'); env.onFrame = null }
    },
    async humanInput(event) { env.calls.push(['human', event]); return { url: 'u', dialog: null } },
    async history({ direction }) { env.calls.push(['history', direction]); return { url: 'u' } },
    async reload() { env.calls.push(['reload']); return { url: 'u' } },
    async handleDialog(answer) { env.calls.push(['dialog', answer]); return { answered: 'accepted' } },
  }
  return env
}

function request(port, { method = 'GET', path = '/', token, body, host, bearer = false } = {}) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?'
    const fullPath = token !== undefined && !bearer ? `${path}${sep}token=${token}` : path
    const headers = { ...(host ? { host } : {}), ...(bearer ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }
    const req = http.request({ host: '127.0.0.1', port, method, path: fullPath, headers }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, headers: res.headers, text, json, raw: Buffer.concat(chunks) })
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/** Open a streaming GET and collect its data until `until(text)` holds. */
function stream(port, path, until) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let text = ''
      const chunks = []
      res.on('data', (chunk) => {
        chunks.push(chunk)
        text += chunk.toString('latin1')
        if (until(text)) resolve({ req, res, text, headers: res.headers, raw: () => Buffer.concat(chunks) })
      })
    })
    req.on('error', reject)
  })
}

async function setUp(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-live-view-test-'))
  const control = createRunControl({ runId: 'run-1' })
  const live = await startLiveView({ control, runId: 'run-1', linkPath: join(dir, 'control', 'run-1'), ...extra })
  const env = fakeEnvironment()
  return { dir, control, live, env, cleanup: async () => { await live.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('helpers: host check, token-free events, renamed notice fields', () => {
  assert.equal(hostAllowed('127.0.0.1:4000', 4000), true)
  assert.equal(hostAllowed('localhost:4000', 4000), true)
  assert.equal(hostAllowed('evil.example:4000', 4000), false)
  assert.equal(hostAllowed('127.0.0.1:4001', 4000), false)
  assert.deepEqual(publicEvent({ type: 'x', controlToken: 'secret', viewToken: 'v', token: 't', ok: true }), { type: 'x', ok: true })
  assert.deepEqual(pick({ kind: 'held', type: 'confirm', message: 'Delete?', secret: 'no' }), { noticeKind: 'held', dialogType: 'confirm', message: 'Delete?' })
})

test('every route but the page code needs a token, from the query or a bearer header; a foreign Host is refused', async () => {
  const { control, live, cleanup } = await setUp()
  try {
    assert.equal((await request(live.port, { path: '/' })).status, 401)
    assert.equal((await request(live.port, { path: '/', token: 'not-a-token' })).status, 401)
    const page = await request(live.port, { path: '/', token: control.viewToken })
    assert.equal(page.status, 200)
    assert.match(page.headers['content-security-policy'], /default-src 'none'/)
    assert.equal(page.headers['cache-control'], 'no-store')
    assert.equal(page.headers['referrer-policy'], 'no-referrer')
    assert.ok(!page.text.includes(control.viewToken) && !page.text.includes(control.controlToken), 'the page carries no token')
    for (const id of ['pause', 'resume', 'take-over', 'hand-back', 'stop', 'back', 'forward', 'reload', 'dialog-accept', 'dialog-dismiss', 'guide', 'note', 'screen', 'screen-wait', 'notice', 'notice-resume', 'desktop-hint']) {
      assert.match(page.text, new RegExp(`id="${id}"`), `stable id ${id}`)
    }
    assert.match(page.text, /<body data-state="connecting">/)
    // Every element the page's render shows, hides or disables exists in the served page, for either environment.
    for (const kind of ['browser', 'desktop']) {
      const rendered = pageFor({ ...initialView(), kind, state: 'taken_over', source: 'control' })
      for (const id of [...Object.keys(rendered.hidden), ...Object.keys(rendered.disabled), 'notice-text', 'dialog-text', 'consents', 'log', 'run', 'who']) {
        assert.match(page.text, new RegExp(`id="${id}"`), `the page has no #${id}`)
      }
    }
    // The window is excluded by its title (app-policy.md): the served title leads with agent core's marker.
    assert.ok(page.text.includes(`<title>${LIVE_VIEW_TITLE_MARKER} `), 'the served title carries the live-view marker')
    assert.equal(LIVE_VIEW_TITLE_MARKER, '[cu live view]')
    assert.equal((await request(live.port, { path: '/app.js' })).status, 200, 'page code is public and holds no secret')
    assert.equal((await request(live.port, { path: '/ui-logic.mjs' })).status, 200)
    assert.equal((await request(live.port, { method: 'POST', path: '/control', token: control.controlToken, bearer: true, body: { command: 'pause' } })).json.ok, true)
    assert.equal((await request(live.port, { path: '/', token: control.viewToken, host: 'evil.example' })).status, 421)
    assert.match(live.viewUrl, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/)
  } finally {
    await cleanup()
  }
})

test('a watcher may pause and stop but not take over; the refusal is answered with the state and reason, 403 for the sender and 409 for the state', async () => {
  const { control, live, cleanup } = await setUp()
  try {
    const refused = await request(live.port, { method: 'POST', path: '/control', token: control.viewToken, body: { command: 'take_over' } })
    assert.equal(refused.status, 403)
    assert.deepEqual(refused.json, { ok: false, state: 'running', error: 'not_allowed_for_sender' })
    const consent = await request(live.port, { method: 'POST', path: '/control', token: control.viewToken, body: { command: 'consent', id: 'none', approved: true } })
    assert.deepEqual([consent.status, consent.json.error], [403, 'consent_not_accepted_from_caller'])
    const early = await request(live.port, { method: 'POST', path: '/control', token: control.controlToken, body: { command: 'resume' } })
    assert.deepEqual([early.status, early.json.error], [409, 'not_allowed_in_state'], 'a state refusal stays 409')
    const paused = await request(live.port, { method: 'POST', path: '/control', token: control.viewToken, body: { command: 'pause' } })
    assert.deepEqual(paused.json, { ok: true, state: 'paused' })
    const resume = await request(live.port, { method: 'POST', path: '/control', token: control.viewToken, body: { command: 'resume' } })
    assert.deepEqual([resume.status, resume.json.error], [403, 'not_allowed_for_sender'])
    assert.equal((await request(live.port, { method: 'POST', path: '/control', token: control.viewToken, body: { command: 'stop', reason: 'x' } })).json.state, 'finished')
  } finally {
    await cleanup()
  }
})

test('human input: control token and take-over only; pointer fractions become viewport pixels; navigation and dialogs too', async () => {
  const { control, live, env, cleanup } = await setUp()
  live.attach(env)
  const input = (token, body) => request(live.port, { method: 'POST', path: '/input', token, body })
  try {
    assert.equal((await input(control.viewToken, { type: 'text', text: 'x' })).status, 403)
    assert.equal((await input(control.controlToken, { type: 'text', text: 'x' })).json.error, 'not_taken_over')
    control.send({ command: 'take_over' }, { source: 'control' })
    assert.equal((await input(control.controlToken, { type: 'mouse', action: 'down', fx: 0.25, fy: 0.5, button: 'left' })).json.ok, true)
    assert.deepEqual(env.calls.find((call) => call[0] === 'human')[1], { type: 'mouse', action: 'down', button: 'left', x: 250, y: 250 })
    assert.equal((await input(control.controlToken, { type: 'mouse', action: 'down', fx: 1.2, fy: 0.5 })).status, 400)
    await input(control.controlToken, { type: 'navigate', direction: 'back' })
    await input(control.controlToken, { type: 'navigate', direction: 'reload' })
    await input(control.controlToken, { type: 'dialog', accept: true })
    assert.deepEqual(env.calls.filter((call) => Array.isArray(call) && call[0] !== 'human'), [['history', 'back'], ['reload'], ['dialog', { accept: true, promptText: undefined }]])
  } finally {
    await cleanup()
  }
})

test('the event stream opens with the state and pending requests, then carries control events and browser notices', async () => {
  const { control, live, env, cleanup } = await setUp()
  live.attach(env)
  void control.requestConsent({ class: 'submit', summary: 'Submit the order', origin: 'http://127.0.0.1:1' }, { timeoutMs: 0 })
  try {
    const sse = await stream(live.port, `/events?token=${control.viewToken}`, (text) => text.includes('"hello"'))
    const hello = JSON.parse(sse.text.split('\n').find((line) => line.startsWith('data: ')).slice(6))
    assert.deepEqual([hello.source, hello.state, hello.pending.length, hello.pending[0].summary], ['view', 'awaiting_consent', 1, 'Submit the order'])
    assert.deepEqual(hello.viewport, { width: 1000, height: 500 })
    assert.equal(typeof hello.at, 'number')
    assert.deepEqual([hello.environmentKind, hello.environmentState.url, hello.pausedBy, hello.handoff], ['browser', 'http://127.0.0.1:1/', null, null], 'a browser run\'s state as it is')
    const more = new Promise((resolve) => {
      let text = ''
      sse.res.on('data', (chunk) => {
        text += chunk.toString()
        if (text.includes('consent_resolved') && text.includes('"environment"')) resolve(text)
      })
    })
    control.send({ command: 'consent', id: hello.pending[0].id, approved: true, lifetime: 'once' }, { source: 'control' })
    env.emit('blocked', { url: 'https://evil.example/', rule: 'not_allowed' })
    const text = await more
    const events = text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)))
    assert.ok(events.length >= 2 && events.every((event) => Number.isInteger(event.at) && Math.abs(event.at - Date.now()) < 60_000), 'every event carries at, epoch ms')
    assert.match(text, /"answeredBy":"live"/)
    assert.match(text, /"kind":"blocked","url":"https:\/\/evil.example\/","rule":"not_allowed"/)
    assert.ok(!text.includes(control.controlToken) && !text.includes(control.viewToken))
    sse.req.destroy()
  } finally {
    await cleanup()
  }
})

test('the screen streams MJPEG while someone watches, starting the screencast once and stopping it when the last viewer leaves', async () => {
  const { control, live, env, cleanup } = await setUp()
  live.attach(env)
  try {
    const opened = stream(live.port, `/screen?token=${control.viewToken}`, (text) => text.includes('JPEGDATA-2'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(env.calls, ['start'])
    env.onFrame({ data: Buffer.from('JPEGDATA-1') })
    env.onFrame({ data: Buffer.from('JPEGDATA-2') })
    const screen = await opened
    assert.match(screen.headers['content-type'], /^multipart\/x-mixed-replace; boundary=cu-live-frame/)
    assert.match(screen.text, /--cu-live-frame\r\ncontent-type: image\/jpeg\r\ncontent-length: 10\r\n\r\nJPEGDATA-1/)
    screen.req.destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(env.calls, ['start', 'stop'])
    const again = await stream(live.port, `/screen?token=${control.viewToken}`, (text) => text.includes('JPEGDATA-2'))
    assert.ok(again.text.includes('JPEGDATA-2'), 'a new viewer gets the last frame at once')
    again.req.destroy()
  } finally {
    await cleanup()
  }
})

test('the control link is written with mode 600 for cli control-link and removed at close; close is idempotent', async () => {
  const { dir, control, live, cleanup } = await setUp()
  const link = join(dir, 'control', 'run-1')
  assert.equal(readFileSync(link, 'utf8').trim(), live.controlUrl)
  assert.equal(statSync(link).mode & 0o777, 0o600)
  assert.ok(live.controlUrl.endsWith(control.controlToken))
  await live.close()
  await live.close()
  assert.equal(existsSync(link), false)
  await cleanup()
})

test('the replay serves this run only, strips tokens and refuses other paths', async () => {
  const runDir = mkdtempSync(join(tmpdir(), 'cu-live-view-run-'))
  mkdirSync(join(runDir, 'screenshots'))
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ schema: 'cu-trajectory/v1', runId: 'run-1' }))
  writeFileSync(join(runDir, 'events.jsonl'), `${JSON.stringify({ type: 'action', step: 1, token: 'leak' })}\n`)
  writeFileSync(join(runDir, 'screenshots', 'step-0001.png'), Buffer.from('PNGDATA'))
  const { control, live, cleanup } = await setUp({ runDir })
  try {
    const replay = await request(live.port, { path: '/runs/run-1', token: control.viewToken })
    assert.deepEqual(replay.json.events, [{ type: 'action', step: 1 }])
    assert.deepEqual(replay.json.screenshots, ['step-0001.png'])
    const png = await request(live.port, { path: '/runs/run-1/screenshots/step-0001.png', token: control.viewToken })
    assert.deepEqual([png.status, png.headers['content-type'], png.raw.toString()], [200, 'image/png', 'PNGDATA'])
    for (const path of ['/runs/run-2', '/runs/run-1/screenshots/..%2Frun.json', '/runs/run-1/screenshots/x.png', '/runs/run-1/run.json']) {
      assert.equal((await request(live.port, { path, token: control.viewToken })).status, 404, path)
    }
  } finally {
    await cleanup()
    rmSync(runDir, { recursive: true, force: true })
  }
})
