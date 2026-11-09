import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { cleanEnvironment, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { desktopRun, FIXTURE, ready } from '../desktop-consent/harness.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL 2.0 human-control row, before the grant (C4): automation pauses when the person uses the keyboard or
 * mouse, and only a human channel resumes or stops it. The fake helper reports local input part-way through a click
 * (its localInputAfter quirk), as the real helper's guards do; the driver asks run control to pause as sender
 * local_input. Judged from the helper's requests, run control's states and the run's own records.
 */

const guard = (t) => skipUnless(t, ready, 'the desktop loop (C4/C5), driver or fake helper has not landed')
const click = (x, y) => ({ type: 'click', button: 'left', x, y })
// One click is three helper events; the person acts after the first.
const NOTES = { bundleId: FIXTURE, pid: 900, role: 'AXTextField', subrole: null, title: 'Notes', frame: { x: 100, y: 80, width: 300, height: 40 }, secure: false, editable: true }
const world = {
  grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }],
  // CU-363: the click at (200, 100) lands on a text field, so the typed 'x' that follows is text entry - a printable key
  // outside one is an app shortcut and asks, which is consent, not what this human-control check measures.
  elements: [{ rect: { x: 100, y: 80, width: 300, height: 40 }, element: NOTES }],
  focused: NOTES,
  quirks: { localInputAfter: 1 },
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** One record per action (step and index): the last line written for it. */
const actionsOf = (events) => [...new Map(events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]

/** Wait until run control is paused (or a timeout); resolves the pausing event or null. */
function pausedBy(control, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop()
      resolve(null)
    }, timeoutMs)
    const stop = control.subscribe((event) => {
      if (event.type === 'state' && event.state === 'paused') {
        clearTimeout(timer)
        stop()
        resolve(event)
      }
    })
  })
}

test('local input mid-batch pauses the run: nothing more is sent, and only the input\'s kind is recorded', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  let seen = null
  let inputsWhilePaused = null
  const run = await desktopRun({
    world,
    turns: [{ actions: [click(200, 100), click(300, 100)] }, { final: 'done' }],
    bounds: { maxSteps: 4, maxWallMs: 20_000 },
    during: async (control) => {
      seen = await pausedBy(control)
      await pause(600)
      inputsWhilePaused = control.state
      control.send({ command: 'stop', reason: 'the verifier ends the paused run' }, { source: 'api' })
    },
  })
  assert.ok(seen, 'local input did not pause the run')
  assert.equal(seen.source, 'local_input')
  assert.equal(inputsWhilePaused, 'paused', 'the run left the pause without a person')
  assert.equal(run.inputs.length, 1, `${run.inputs.length} input requests: the second click was sent after the local input`)
  const record = run.events.find((e) => e.kind === 'local_input')
  assert.ok(record, 'no local_input record')
  assert.deepEqual(Object.keys(record).filter((k) => !['seq', 't', 'step', 'kind'].includes(k)).sort(), ['inputKind'], `the record holds more than the kind: ${JSON.stringify(record)}`)
})

test('local input can only pause: it cannot resume or stop the run', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const replies = {}
  let stateAfter = null
  await desktopRun({
    world,
    turns: [{ actions: [click(200, 100)] }, { final: 'done' }],
    bounds: { maxSteps: 4, maxWallMs: 20_000 },
    during: async (control) => {
      await pausedBy(control)
      for (const command of ['resume', 'stop', 'take_over']) replies[command] = control.send({ command }, { source: 'local_input' })
      await pause(200)
      stateAfter = control.state
      control.send({ command: 'stop', reason: 'end' }, { source: 'api' })
    },
  })
  for (const [command, reply] of Object.entries(replies)) assert.equal(reply?.ok, false, `local_input could ${command}: ${JSON.stringify(reply)}`)
  assert.equal(stateAfter, 'paused')
})

test('a person resumes the run: the next action reaches the helper and the run completes', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({
    world,
    // After the click the person resumes; the next action is one event, below the quirk's threshold.
    turns: [{ actions: [click(200, 100)] }, { actions: [{ type: 'type', text: 'x' }] }, { final: 'done' }],
    bounds: { maxSteps: 5, maxWallMs: 20_000 },
    during: async (control) => {
      await pausedBy(control)
      await pause(300)
      control.send({ command: 'resume' }, { source: 'api' })
    },
  })
  assert.ok(run.inputs.some((r) => r.events.some((e) => e.kind === 'text')), `the action after the resume never reached the helper (status ${run.result.status})`)
  assert.equal(run.result.status, 'completed')
})

test('a person stops the paused run: cancelled, and nothing more is sent', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({
    world,
    turns: [{ actions: [click(200, 100)] }, { actions: [{ type: 'type', text: 'x' }] }, { final: 'done' }],
    bounds: { maxSteps: 5, maxWallMs: 20_000 },
    during: async (control) => {
      await pausedBy(control)
      control.send({ command: 'stop', reason: 'the person stops it' }, { source: 'api' })
    },
  })
  assert.equal(run.result.status, 'cancelled')
  assert.equal(run.inputs.length, 1, 'input was sent after the stop')
})

const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))

/**
 * One live desktop run through startRun on the fake helper (watch frames on), with the view and control links;
 * `during({ view, control })` acts while it runs. Resolves `{ result, inputs, seen }`.
 */
async function liveRun({ turns, during, world: worldIn = null, apps = [FIXTURE], controller = null }) {
  const imp = (path) => import(pathToFileURL(join(sutRoot(), path)))
  const [{ startRun }, { createScriptedAdapter }, { connectStdio }, { createAppApprovals }, consent] = await Promise.all(['_tools_/agent-core/run.mjs', '_tools_/agent-core/adapter-scripted.mjs', '_environments_/macos-desktop/helper-link.mjs', '_tools_/agent-core/app-approvals.mjs', '_tools_/agent-core/consent.mjs'].map(imp))
  const world = worldIn ?? { grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false }, displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }] }
  const child = spawn(process.execPath, [FAKE], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, FAKE_HELPER_CONFIG: JSON.stringify(world), FAKE_HELPER_TOKEN: 'cu-verifier' } })
  const requests = []
  let buffer = ''
  child.stderr.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.startsWith('REQ ')) requests.push(JSON.parse(line.slice(4)))
    }
  })
  const runs = mkdtempSync(`/tmp/cu-verifier-runs-${process.pid}-`)
  const appApprovals = createAppApprovals({ path: join(runs, 'app-approvals.json') })
  for (const app of apps) appApprovals.grantAlways(app, { by: 'api' })
  try {
    const handle = await startRun({ environment: 'macos-desktop', seat: SEAT, apps, appApprovals, env: cleanEnvironment(), ...(controller ? { controller: controller(consent) } : {}), task: 'a live desktop run', runsDirectory: runs, live: true, model: createScriptedAdapter({ turns }), environmentOptions: { connect: () => connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }), runLock: async () => ({ release() {} }) } })
    const control = new URL(handle.controlUrl)
    const seen = await during({ view: new URL(handle.viewUrl), control, inputs: () => requests.filter((r) => r.type === 'input').length })
    // A broken build can leave the run held (taken over, say); the check's verdict is in, so end the run either way.
    const within = (ms) => Promise.race([handle.done, new Promise((resolve) => setTimeout(() => resolve(null), ms))])
    let result = await within(10_000)
    if (result === null) {
      await post(control, '/control', { command: 'stop', reason: 'the verifier ends a held run' }).catch(() => {})
      result = (await within(10_000)) ?? { status: 'held' }
    }
    return { result, inputs: requests.filter((r) => r.type === 'input'), requests, seen }
  } finally {
    child.kill()
    if (/^\/tmp\/cu-verifier-runs-\d+-[A-Za-z0-9]{6}$/.test(runs)) rmSync(runs, { recursive: true, force: true })
  }
}
const post = async (link, path, body) => {
  const res = await fetch(new URL(path + link.search, link), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
/** Bytes of image data the live view's /screen stream sends within `ms`. */
const screenBytes = (link, ms = 2500) => new Promise((resolve) => {
  let bytes = 0
  let type = null
  const req = http.get(new URL('/screen' + link.search, link), (res) => {
    type = res.headers['content-type'] ?? null
    res.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > 1500) {
        req.destroy()
        resolve({ bytes, type })
      }
    })
  })
  req.on('error', () => {})
  setTimeout(() => {
    req.destroy()
    resolve({ bytes, type })
  }, ms)
})

test('a person watches live: the view link streams the desktop run\'s frames', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await liveRun({ turns: [{ actions: [{ type: 'wait', duration_ms: 2500 }] }, { final: 'done' }], during: ({ view }) => screenBytes(view) })
  assert.match(String(run.seen.type), /multipart\/x-mixed-replace/, `the screen stream is ${run.seen.type}`)
  assert.ok(run.seen.bytes > 1500, `only ${run.seen.bytes} bytes of frames while watching`)
  assert.ok(run.requests.some((r) => r.type === 'watch'), 'the helper was never asked to watch')
})

test('the control link takes over: the agent sends nothing, remote input is refused, and hand back resumes the agent', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await liveRun({
    turns: [{ actions: [{ type: 'wait', duration_ms: 400 }] }, { actions: [click(200, 100)] }, { final: 'done' }],
    during: async ({ control, inputs }) => {
      const taken = await post(control, '/control', { command: 'take_over' })
      await pause(1500)
      const whileTaken = inputs()
      const remote = await post(control, '/input', { type: 'click', x: 0.5, y: 0.5 })
      const afterRemote = inputs()
      const back = await post(control, '/control', { command: 'hand_back' })
      return { taken, whileTaken, remote, afterRemote, back }
    },
  })
  assert.equal(run.seen.taken.body?.state, 'taken_over', JSON.stringify(run.seen.taken))
  assert.equal(run.seen.whileTaken, 0, 'the agent sent input while a person had taken over')
  assert.notEqual(run.seen.remote.body?.ok, true, 'remote input to the desktop was accepted (out of scope by design)')
  assert.equal(run.seen.afterRemote, 0, 'remote input reached the helper')
  assert.equal(run.seen.back.body?.state, 'running', JSON.stringify(run.seen.back))
  assert.equal(run.result.status, 'completed')
  assert.ok(run.inputs.some((r) => r.events.some((e) => e.kind === 'down')), 'the agent did not resume after hand back')
})

test('the view link only watches: it cannot take over or send input', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await liveRun({
    turns: [{ actions: [{ type: 'wait', duration_ms: 1500 }] }, { final: 'done' }],
    during: async ({ view }) => ({ take: await post(view, '/control', { command: 'take_over' }), input: await post(view, '/input', { type: 'click', x: 0.5, y: 0.5 }) }),
  })
  assert.equal(run.seen.take.body?.ok, false, `the view link took over: ${JSON.stringify(run.seen.take)}`)
  assert.equal(run.seen.input.status, 403, `the view link sent input: ${JSON.stringify(run.seen.input)}`)
  assert.equal(run.result.status, 'completed')
})

/** The id of the first consent question the live view's /events stream shows (its hello's pending list or a request). */
const consentId = (link, ms = 6000) => new Promise((resolve) => {
  let buffer = ''
  const req = http.get(new URL('/events' + link.search, link), (res) => {
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      for (let at = buffer.indexOf('\n\n'); at !== -1; at = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        const line = block.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        const event = JSON.parse(line.slice(6))
        const pending = event.type === 'hello' ? (event.pending ?? [])[0] : event.type === 'consent_request' ? event.request : null
        const id = pending?.id ?? pending?.request?.id
        if (id) {
          req.destroy()
          resolve(id)
        }
      }
    })
  })
  req.on('error', () => {})
  setTimeout(() => {
    req.destroy()
    resolve(null)
  }, ms)
})

test('a new app is approved in the live view by the control link only: the view link cannot answer, the control link approves once and the click goes through', { timeout: 40_000 }, async (t) => {
  if (!guard(t)) return
  const LEDGER = 'ai.reflection.cu.ledger'
  const world = { grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false }, displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 640, height: 800 } }, { bundleId: LEDGER, pid: 901, rect: { x: 640, y: 0, width: 640, height: 800 } }] }
  const run = await liveRun({
    world,
    controller: (consent) => consent.apiController(),
    turns: [{ actions: [click(900, 300)] }, { final: 'done' }],
    during: async ({ view, control }) => {
      const id = await consentId(view)
      if (!id) return { id }
      const fromView = await post(view, '/control', { command: 'consent', id, approved: true, lifetime: 'once' })
      const fromControl = await post(control, '/control', { command: 'consent', id, approved: true, lifetime: 'once' })
      return { id, fromView, fromControl }
    },
  })
  assert.ok(run.seen.id, 'the live view never showed the new_app question')
  assert.notEqual(run.seen.fromView.body?.ok, true, `the view link answered consent: ${JSON.stringify(run.seen.fromView)}`)
  assert.equal(run.seen.fromControl.body?.ok, true, `the control link could not approve: ${JSON.stringify(run.seen.fromControl)}`)
  assert.ok(run.inputs.some((r) => r.events.some((e) => e.kind === 'down')), 'the click did not go through after the control link approved')
})

test('local input while a consent question waits leaves no stop behind: approved and resumed, the run acts again and completes', { timeout: 40_000 }, async (t) => {
  if (!guard(t)) return
  const LEDGER = 'ai.reflection.cu.ledger'
  const world = { grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false }, displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 640, height: 800 } }, { bundleId: LEDGER, pid: 901, rect: { x: 640, y: 0, width: 640, height: 800 } }] }
  const waitFor = async (predicate, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await pause(25)) if (predicate()) return true
    return false
  }
  const seen = {}
  const run = await desktopRun({
    world,
    controller: (mods) => mods.consent.apiController(),
    turns: [{ actions: [click(900, 300)] }, { actions: [click(200, 200)] }, { final: 'done' }],
    bounds: { maxSteps: 5 },
    during: async (control, environment) => {
      seen.asked = await waitFor(() => control.state === 'awaiting_consent')
      if (!seen.asked) return
      // The person uses this Mac while the question waits - in the live view, say, which is local input too.
      seen.local = await environment.simulateLocalInput({ kind: 'key', via: 'idle' }).then(() => true, (error) => error.message)
      await pause(200)
      const [request] = control.pending()
      seen.approved = control.send({ command: 'consent', id: request?.id ?? request?.request?.id, approved: true, lifetime: 'once' }, { source: 'api' }).ok
      await pause(200)
      if (control.state === 'paused') seen.resumed = control.send({ command: 'resume' }, { source: 'api' }).ok
    },
  })
  assert.ok(seen.asked, 'the run never waited for the new_app answer')
  assert.equal(seen.local, true, `local input could not be simulated: ${seen.local}`)
  assert.ok(seen.approved, 'the person could not approve the waiting question')
  const records = actionsOf(run.events)
  const stopped = records.filter((r) => /local_input/.test(`${r.error ?? ''} ${r.rule ?? ''} ${r.reason ?? ''}`))
  assert.deepEqual(stopped.map((r) => r.status), [], 'an action after the wait was refused for local input that came while waiting')
  assert.equal(run.result.status, 'completed', `the run ended ${run.result.status}: ${run.result.error ?? ''}`)
  assert.equal(run.inputs.filter((r) => r.events.some((e) => e.kind === 'down')).length, 2, 'not both clicks reached the helper after the wait')
})

/** Whether the driver under test settles after a human resume (design 0.4.1/0.4.2, PR #518). */
const driverSettles = () => readFileSync(join(sutRoot(), '_environments_/macos-desktop/environment.mjs'), 'utf8').includes('settleMs')

test('after a person resumes, only the first input asks the helper to settle (settleMs); none at the start, none after', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, driverSettles(), 'the driver under test does not settle after a human resume yet (PR #518)')) return
  const run = await desktopRun({
    world,
    driverOptions: { settleMs: 60 },
    // The click is stopped by local input (the quirk); after the resume two one-event actions follow.
    turns: [{ actions: [click(200, 100)] }, { actions: [{ type: 'type', text: 'x' }] }, { actions: [{ type: 'type', text: 'y' }] }, { final: 'done' }],
    bounds: { maxSteps: 6, maxWallMs: 20_000 },
    during: async (control) => {
      await pausedBy(control)
      await pause(300)
      control.send({ command: 'resume' }, { source: 'api' })
    },
  })
  const typed = (text) => run.inputs.find((r) => r.events.some((e) => e.kind === 'text' && e.text === text))
  assert.equal(run.result.status, 'completed', `the run ended ${run.result.status}`)
  assert.equal(run.inputs[0]?.settleMs, undefined, 'the first input of the run asked to settle')
  assert.equal(typed('x')?.settleMs, 60, `the first input after the resume did not ask to settle: ${JSON.stringify(typed('x') ?? null).slice(0, 160)}`)
  assert.equal(typed('y')?.settleMs, undefined, 'a later input asked to settle again')
})
