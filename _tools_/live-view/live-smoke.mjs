#!/usr/bin/env node
/**
 * Live check of the live view with a real browser: one headless Chrome under agent-core's resource gate (D-005,
 * D-014), a local page, the live view on 127.0.0.1, then watch, take over, drive, hand back and stop through HTTP as
 * a person's page would. A developer check, not a verifier (D-012). Prints one JSON report; exit 0 only if every
 * check passes. Hard cap 90 s.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchBrowserEnvironment } from '../../_environments_/chrome-browser/environment.mjs'
import { createRunControl, createSitePolicy, resourceGate } from '../agent-core/lib.mjs'
import { startLiveView } from './server.mjs'

const hardCap = setTimeout(() => {
  console.log(JSON.stringify({ ok: false, error: 'hard cap of 90 s reached' }))
  process.exit(3)
}, 90_000)

const PAGE = `<!doctype html><title>live</title><style>body{margin:0}</style>
<button id="target" style="position:absolute;left:0;top:0;width:400px;height:200px">Press me</button>
<input id="field" style="position:absolute;left:20px;top:300px;width:300px;height:30px">
<script>window.presses = 0; document.getElementById('target').addEventListener('click', () => { window.presses += 1 })</script>`

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) })

function call(port, { method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(text) } catch { return null } })() }))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/** Read the MJPEG stream until `count` JPEG frames arrived (or the timeout); resolves the frames' sizes. */
function frames(port, token, count, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const sizes = []
    const req = http.get({ host: '127.0.0.1', port, path: `/screen?token=${token}` }, (res) => {
      let buffer = Buffer.alloc(0)
      res.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk])
        for (;;) {
          const header = buffer.indexOf('content-length: ')
          if (header < 0) break
          const end = buffer.indexOf('\r\n\r\n', header)
          if (end < 0) break
          const length = Number(buffer.toString('latin1', header + 16, buffer.indexOf('\r\n', header)))
          if (buffer.length < end + 4 + length) break
          const jpeg = buffer.subarray(end + 4, end + 4 + length)
          sizes.push(jpeg[0] === 0xff && jpeg[1] === 0xd8 ? length : -1)
          buffer = buffer.subarray(end + 4 + length)
        }
        if (sizes.length >= count) { req.destroy(); resolve(sizes) }
      })
    })
    req.on('error', () => resolve(sizes))
    setTimeout(() => { req.destroy(); resolve(sizes) }, timeoutMs)
  })
}

const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(PAGE) })
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const dir = mkdtempSync(join(tmpdir(), 'cu-live-smoke-'))
const control = createRunControl({ runId: 'live-smoke' })
let live
let env
const report = {}
try {
  live = await startLiveView({ control, runId: 'live-smoke', linkPath: join(dir, 'control', 'live-smoke') })
  const sitePolicy = createSitePolicy({ startUrl: `${origin}/`, extraDenyPorts: [live.port] })
  env = await launchBrowserEnvironment({ seat: 'cu-developer-two', viewport: { width: 1280, height: 800 }, startUrl: `${origin}/`, sitePolicy, resourceGate, control })
  live.attach(env)
  const view = control.viewToken
  const ctl = control.controlToken
  const evaluate = async (expression) => (await env.session.send(env.session.foreground(), 'Runtime.evaluate', { expression, returnByValue: true })).result.result.value
  const errorCode = (promise) => promise.then(() => 'no error', (error) => error.code ?? error.message)

  const sizes = await frames(live.port, view, 1)
  check('the screen streams JPEG frames of the agent\'s browser to a watcher', sizes.length >= 1 && sizes.every((size) => size > 1000), sizes)
  const toLive = await env.perform({ type: 'navigate', url: `${live.origin}/?token=${ctl}` })
  check("the agent's browser cannot reach the live view (fixed deny of its port)", toLive.blocked.some((entry) => entry.rule === 'fixed_deny') && toLive.url === `${origin}/`, toLive.blocked)

  check('a watcher cannot take over', (await call(live.port, { method: 'POST', path: '/control', token: view, body: { command: 'take_over' } })).json?.error === 'not_allowed_for_sender')
  check('the control token takes over', (await call(live.port, { method: 'POST', path: '/control', token: ctl, body: { command: 'take_over' } })).json?.state === 'taken_over')
  check('the agent may not act while the person drives', (await errorCode(env.perform({ type: 'click', x: 10, y: 10, button: 'left' }))) === 'taken_over')
  for (const action of ['down', 'up']) {
    await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'mouse', action, fx: 0.1, fy: 0.1, button: 'left' } })
  }
  check("the person's click reaches the page", (await evaluate('window.presses')) === 1, await evaluate('window.presses'))
  for (const action of ['down', 'up']) {
    await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'mouse', action, fx: 100 / 1280, fy: 315 / 800, button: 'left' } })
  }
  for (const key of ['h', 'i']) {
    await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'key', action: 'down', key } })
    await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'key', action: 'up', key } })
  }
  await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'text', text: ' there' } })
  check("the person's keys and pasted text reach the focused field", (await evaluate("document.getElementById('field').value")) === 'hi there', await evaluate("document.getElementById('field').value"))
  check('hand back returns control to the agent', (await call(live.port, { method: 'POST', path: '/control', token: ctl, body: { command: 'hand_back', note: 'typed a greeting' } })).json?.state === 'running')
  check('human input is refused after hand-back', (await call(live.port, { method: 'POST', path: '/input', token: ctl, body: { type: 'text', text: 'x' } })).json?.error === 'not_taken_over')
  await env.perform({ type: 'click', x: 50, y: 50, button: 'left' })
  check('the agent acts again after hand-back', (await evaluate('window.presses')) === 2)
  check('a watcher can stop the run', (await call(live.port, { method: 'POST', path: '/control', token: view, body: { command: 'stop', reason: 'smoke' } })).json?.state === 'finished')
  check('the agent is cancelled after stop', (await errorCode(env.perform({ type: 'wait', duration_ms: 10 }))) === 'cancelled')
  const profile = env.running.profile
  await env.close()
  await live.close()
  check('closing removes the profile and the control link', !existsSync(profile) && !existsSync(join(dir, 'control', 'live-smoke')))
} catch (error) {
  report.error = String(error.stack ?? error)
} finally {
  if (env !== undefined && !env.closed) await env.close().catch(() => {})
  await live?.close().catch(() => {})
  server.close()
  rmSync(dir, { recursive: true, force: true })
  clearTimeout(hardCap)
}
report.ok = report.error === undefined && checks.length > 0 && checks.every((entry) => entry.ok)
report.passed = checks.filter((entry) => entry.ok).length
report.failed = checks.filter((entry) => !entry.ok)
report.checks = checks.map((entry) => `${entry.ok ? 'pass' : 'FAIL'} ${entry.name}`)
console.log(JSON.stringify(report, null, 1))
process.exit(report.ok ? 0 : 1)
