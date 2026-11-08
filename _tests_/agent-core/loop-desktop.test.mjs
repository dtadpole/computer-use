import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const click = (x = 100, y = 100) => ({ type: 'click', button: 'left', x, y })
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-loop-desktop-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function setup({ turns, env = {}, ...rest }) {
  const control = rest.control ?? createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, ...env })
  const model = createScriptedAdapter({ frame, turns })
  const opened = []
  const spy = { ...model, async open(options) { opened.push(options); return model.open(options) } }
  const run = () => runTask({ task: 'desktop task', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], ...rest })
  return { environment, control, opened, run }
}

/** A temp always store holding the given apps, granted the way a person does (start apps are not approvals, P11). */
function approved(...ids) {
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  for (const id of ids) store.grantAlways(id, { by: 'api' })
  return store
}
const clicks = (environment) => environment.log.filter((entry) => (entry.type ?? entry.action?.type) === 'click').length

test('a desktop run uses the app policy: navigate is not offered and is refused by name; the header records the scope', async () => {
  const { environment, opened, run } = setup({
    turns: [{ actions: [{ type: 'navigate', url: 'https://example.com' }] }, { actions: [click()] }, { final: 'done' }],
    env: { targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }) },
    excludeApps: ['ai.reflection.cu.ledger'],
    appApprovals: approved(FIXTURE),
  })
  const result = await run()
  assert.equal(result.status, 'completed')
  assert.equal(opened[0].tools.navigate, false)
  assert.deepEqual(environment.log.map((entry) => entry.type ?? entry.action?.type).filter(Boolean).includes('navigate'), false)
  assert.equal(clicks(environment), 1, 'the click in the approved app ran')
  const header = JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8'))
  assert.deepEqual([header.policy.kind, header.policy.scope, header.policy.excludedAdded], ['app', [FIXTURE], ['ai.reflection.cu.ledger']])
})

test('P11: the caller\'s start apps are not approvals: unattended, the start app asks new_app and nothing is clicked', async () => {
  const { environment, run } = setup({
    turns: [{ actions: [click()] }, { final: 'done' }],
    env: { targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }) },
  })
  const result = await run()
  assert.equal(clicks(environment), 0)
  assert.equal(result.status, 'declined')
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const asked = events.find((event) => event.kind === 'consent' && event.phase === 'request')
  assert.deepEqual([asked?.request.class, asked?.request.recipient], ['new_app', FIXTURE])
  assert.ok(events.some((event) => event.kind === 'consent' && event.phase === 'answer' && event.answer.approved === false && event.answer.answeredBy === 'unattended'))
})

test('P11: the loop hands the answer to grantScope: an api answer grows the scope, a DSH gate answer approves one action only', async () => {
  const controller = apiController()
  const { environment, control, run } = setup({
    turns: [{ actions: [click()] }, { actions: [click()] }, { actions: [click()] }, { final: 'done' }],
    env: { targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }) },
    controller,
  })
  const running = run()
  const first = await controller.waitForRequest(5000)
  assert.equal(first.class, 'new_app')
  control.send({ command: 'consent', id: first.id, approved: true, lifetime: 'once' }, { source: 'dsh_plugin' })
  const second = await controller.waitForRequest(5000)
  assert.deepEqual([second?.class, second?.id === first.id], ['new_app', false], 'the gate answer did not grow the scope')
  controller.respond({ id: second.id, approved: true, lifetime: 'once' })
  const result = await running
  assert.equal(result.status, 'completed')
  assert.equal(clicks(environment), 3, 'both approved clicks ran, and the third needed no question')
  assert.equal(controller.pending().length, 0)
})

test('an unapproved app asks new_app; an always answer grows the scope and is stored by bundle id', async () => {
  const store = approved(FIXTURE) // the start app is covered, so the one question is TextEdit's
  const controller = apiController()
  const { environment, control, run } = setup({
    turns: [{ actions: [click()] }, { actions: [click()] }, { final: 'done' }],
    env: { frontmost: 'com.apple.TextEdit', targets: () => ({ origin: 'com.apple.TextEdit', role: 'AXButton', name: 'Bold', fingerprint: 'bold' }) },
    controller,
    appApprovals: store,
  })
  const running = run()
  const request = await controller.waitForRequest(5000)
  assert.deepEqual([request.class, request.origin], ['new_app', 'policy'])
  controller.respond({ id: request.id, approved: true, lifetime: 'always' })
  const result = await running
  assert.equal(result.status, 'completed')
  assert.equal(store.covers('com.apple.TextEdit'), true, 'always lands in the store, by bundle id')
  assert.equal(control.state, 'finished')
  assert.equal(environment.log.filter((entry) => (entry.type ?? entry.action?.type) === 'click').length, 2, 'the second click needs no second question')
})

test('two blocks in a row end a desktop run refused_by_policy; an excluded target never receives input', async () => {
  const { environment, run } = setup({
    turns: [{ actions: [click()] }, { actions: [click()] }, { final: 'never reached' }],
    env: { targets: () => ({ origin: 'com.apple.Terminal', role: 'AXTextArea', name: 'zsh', fingerprint: 'term' }) },
    appApprovals: approved(FIXTURE),
  })
  const result = await run()
  assert.equal(result.status, 'refused_by_policy')
  assert.equal(environment.log.filter((entry) => (entry.type ?? entry.action?.type) === 'click').length, 0)
})

test('typing into a secure field is a hand-off: unattended, it is declined and nothing is typed', async () => {
  const { environment, run } = setup({
    turns: [{ actions: [{ type: 'type', text: 'hunter2' }] }, { final: 'stopped' }],
    env: { focused: { origin: FIXTURE, role: 'AXTextField', name: 'Password', secure: true, fingerprint: 'pw' } },
    preApprovals: [{ class: 'credential' }],
    appApprovals: approved(FIXTURE),
  })
  const result = await run()
  assert.equal(environment.log.filter((entry) => (entry.type ?? entry.action?.type) === 'type').length, 0)
  assert.notEqual(result.status, 'error')
})

test('an answer lifetime counts only if the request offered it: always exists for new_app alone', async () => {
  const control = createRunControl()
  const plain = control.requestConsent({ id: 'p1', class: 'purchase' })
  control.send({ command: 'consent', id: 'p1', approved: true, lifetime: 'always' }, { source: 'control' })
  assert.equal((await plain).lifetime, 'once')
  const app = control.requestConsent({ id: 'a1', class: 'new_app', lifetimes: ['once', 'run', 'always'] })
  control.send({ command: 'consent', id: 'a1', approved: true, lifetime: 'always' }, { source: 'control' })
  assert.equal((await app).lifetime, 'always')
})

const readEvents = (runDir) => readFileSync(join(runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
/** Whether any file of a run directory, screenshots included, holds `text`. */
const runHolds = (runDir, text) => readdirSync(runDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .some((entry) => readFileSync(join(entry.parentPath, entry.name)).includes(text))

test('an excluded or unapproved app is recorded by bundle id and role only: its title reaches no file of the run', async () => {
  const MARKER = 'QX7-outside-title'
  // An excluded target blocks.
  const blocked = await setup({
    turns: [{ actions: [click()] }, { final: 'done' }],
    env: { targets: () => ({ origin: 'com.apple.Terminal', role: 'AXTextArea', name: `${MARKER} zsh`, fingerprint: 'term' }) },
    appApprovals: approved(FIXTURE),
  }).run()
  const block = readEvents(blocked.trajectoryDir).find((e) => e.kind === 'action' && e.status === 'blocked')
  assert.match(block.rule, /^excluded:/)
  assert.equal(block.app, 'com.apple.Terminal', 'the block names the excluded app by bundle id')
  assert.deepEqual(block.target, { origin: 'com.apple.Terminal', role: 'AXTextArea' })
  // An excluded app in front hands off, even when the focused element is in an approved app.
  const front = await setup({
    turns: [{ actions: [{ type: 'type', text: 'x' }] }, { final: 'done' }],
    env: { frontmost: 'com.1password.1password', focused: { origin: FIXTURE, role: 'AXTextField', name: `${MARKER} vault`, fingerprint: 'vault' } },
    appApprovals: approved(FIXTURE),
  }).run()
  const handoff = readEvents(front.trajectoryDir).find((e) => e.kind === 'action' && e.decision === 'handoff')
  assert.match(handoff.rule, /^excluded_front:/)
  assert.equal(handoff.app, 'com.1password.1password', 'the hand-off names the app in front by bundle id (cu-verifier, first live run)')
  assert.deepEqual(handoff.target, { origin: FIXTURE, role: 'AXTextField' })
  // A not yet approved app is asked about by bundle id; declined, it stays outside the scope.
  const unapproved = await setup({
    turns: [{ actions: [click()] }, { final: 'done' }],
    env: { frontmost: 'com.apple.TextEdit', targets: () => ({ origin: 'com.apple.TextEdit', role: 'AXButton', name: `${MARKER} Bold`, fingerprint: 'bold' }) },
    appApprovals: approved(FIXTURE),
  }).run()
  const asked = readEvents(unapproved.trajectoryDir).find((e) => e.kind === 'consent' && e.phase === 'request')
  assert.deepEqual([asked.request.class, asked.request.target], ['new_app', { origin: 'com.apple.TextEdit', role: 'AXButton' }])
  for (const result of [blocked, front, unapproved]) assert.equal(runHolds(result.trajectoryDir, MARKER), false, result.trajectoryDir)
})

// Until run control accepts the local_input sender (C4), pause on its behalf and report the source C4 will report;
// once C4 is in, the native path runs.
function withLocalInputSender(control) {
  const { send, subscribe } = control
  let relabel = false
  control.subscribe = (fn) => subscribe((event) => fn(relabel && event.type === 'state' ? { ...event, source: 'local_input' } : event))
  control.send = (input, { source } = {}) => {
    const native = send(input, { source })
    if (source !== 'local_input' || native.error !== 'unknown_sender') return native
    relabel = true
    try { return send(input, { source: 'tty' }) } finally { relabel = false }
  }
  return control
}

test('a local-input pause records its kind only, never which key or where; without a driver report the kind is unknown', async () => {
  const control = withLocalInputSender(createRunControl())
  let performed = 0
  const { environment, run } = setup({
    control,
    appApprovals: approved(FIXTURE),
    // CU-274: a pause voids the rest of its batch, so each click is its own turn.
    turns: [{ actions: [click()] }, { actions: [click(200, 200)] }, { final: 'done' }],
    env: {
      targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }),
      effect: () => {
        performed += 1
        // As the macos-desktop driver does on a helper report: ask for the pause, then tell listeners.
        control.send({ command: 'pause', reason: 'local input on the Mac' }, { source: 'local_input' })
        if (performed === 1) environment.emit('localInput', { at: new Date().toISOString(), kind: 'key', key: 'QXKEY', x: 321, y: 654 })
        setTimeout(() => control.send({ command: 'resume' }, { source: 'control' }), 20)
        return {}
      },
    },
  })
  const result = await run()
  assert.equal(result.status, 'completed')
  const pauses = readEvents(result.trajectoryDir).filter((e) => e.kind === 'local_input')
  assert.deepEqual(pauses.map((e) => e.inputKind), ['key', 'unknown'])
  for (const event of pauses) assert.deepEqual(Object.keys(event).sort(), ['inputKind', 'kind', 'seq', 'step', 't'])
  assert.equal(runHolds(result.trajectoryDir, 'QXKEY'), false)
})

test('a desktop action keeps the mapping its effect reports on the done event, and an in-scope target keeps its title', async () => {
  const mapping = { frameScaleX: 2, frameScaleY: 2, originPt: { x: 0, y: 25 } }
  const { run } = setup({
    appApprovals: approved(FIXTURE),
    turns: [{ actions: [click()] }, { final: 'done' }],
    env: { targets: () => ({ origin: FIXTURE, role: 'AXButton', name: 'Show', fingerprint: 'show' }), effect: () => ({ mapping }) },
  })
  const result = await run()
  const done = readEvents(result.trajectoryDir).find((e) => e.kind === 'action' && e.status === 'done' && e.action?.type === 'click')
  assert.deepEqual(done.mapping, mapping)
  assert.deepEqual(done.target, { origin: FIXTURE, role: 'AXButton', name: 'Show' })
})

test('a desktop run tells the model about apps on a Mac, not a browser; a browser run keeps the browser instructions', async () => {
  const { DESKTOP_INSTRUCTIONS, DEFAULT_INSTRUCTIONS } = await import('../../_tools_/agent-core/loop.mjs')
  assert.match(DESKTOP_INSTRUCTIONS, /apps on the person's Mac/)
  assert.match(DESKTOP_INSTRUCTIONS, /suspected_injection/)
  assert.match(DESKTOP_INSTRUCTIONS, /check the screen for its result before doing it again/, 'no blind repeat of a state-changing action (CU-24)')
  assert.doesNotMatch(DESKTOP_INSTRUCTIONS, /web browser/)
  const run = setup({ turns: [{ final: 'done' }], appApprovals: approved(FIXTURE) })
  await run.run()
  assert.equal(run.opened[0].instructions, DESKTOP_INSTRUCTIONS)
  assert.match(DEFAULT_INSTRUCTIONS, /web browser/)
})

test('a frame the driver refuses as a capture leak reaches neither the model nor the trajectory; the run ends error', async () => {
  const { readdirSync } = await import('node:fs')
  const run = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  const real = run.environment.screenshot.bind(run.environment)
  let shots = 0
  run.environment.screenshot = async (options) => {
    shots += 1
    if (shots >= 2) throw Object.assign(new Error('a window of an app outside the scope was in the frame'), { code: 'out_of_scope', reason: 'capture_leak' })
    return real(options)
  }
  const result = await run.run()
  assert.equal(result.status, 'error')
  assert.match(String(result.error ?? result.finalMessage ?? ''), /out_of_scope/)
  const pngs = readdirSync(result.trajectoryDir, { recursive: true }).filter((name) => String(name).endsWith('.png'))
  assert.equal(pngs.length, 1, `only the frame before the refusal is kept: ${pngs.join(', ')}`)
  assert.equal(run.opened.length, 1, 'the model was opened once, with the first frame only')
})

test('a failed action records the environment\'s reason as detail, so the trajectory says which point was refused', async () => {
  const { readFileSync } = await import('node:fs')
  const run = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  run.environment.perform = async () => { throw Object.assign(new Error('the point (488, 732) is not over an approved app'), { code: 'out_of_scope' }) }
  const result = await run.run()
  const failed = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    .filter((e) => e.kind === 'action' && e.status === 'failed')
  assert.equal(failed.length, 1)
  assert.equal(failed[0].code, 'out_of_scope')
  assert.equal(failed[0].detail, 'the point (488, 732) is not over an approved app')
})

test('a new_app request says how its app was named: hit_test for a clicked app, start_app for a start app (CU-38)', async () => {
  const LEDGER = 'ai.reflection.cu.ledger'
  const requests = []
  const run = setup({ turns: [{ actions: [click()] }, { final: 'done' }] })
  run.control.subscribe((event) => { if (event.type === 'consent_request') requests.push(event.request) })
  const real = run.environment.inspectPoint.bind(run.environment)
  run.environment.inspectPoint = async (point) => ({ ...(await real(point)), origin: LEDGER, role: 'AXButton', name: 'Go' })
  await run.run()
  const startReq = requests.find((r) => r.rule === 'app:start')
  assert.equal(startReq?.appNamedBy, 'start_app')
})

test('a hit-tested app in a new_app request is named by hit_test', async () => {
  const LEDGER = 'ai.reflection.cu.ledger'
  const requests = []
  const run = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  run.control.subscribe((event) => { if (event.type === 'consent_request') requests.push(event.request) })
  const real = run.environment.inspectPoint.bind(run.environment)
  run.environment.inspectPoint = async (point) => ({ ...(await real(point)), origin: LEDGER, role: 'AXButton', name: 'Go' })
  await run.run()
  const req = requests.find((r) => r.class === 'new_app' && r.app === LEDGER)
  assert.ok(req, 'a new_app request for the clicked app')
  assert.equal(req.appNamedBy, 'hit_test')
})

test('a point another app covers raises a point_covered notice on run control only, cleared by the next completed action (CU-38)', async () => {
  const { readFileSync } = await import('node:fs')
  const notices = []
  const run = setup({ turns: [{ actions: [click()] }, { actions: [click(120, 120)] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  run.control.subscribe((event) => { if (event.type === 'notice' && event.kind === 'point_covered') notices.push(event.app) })
  const realPerform = run.environment.perform.bind(run.environment)
  let calls = 0
  run.environment.perform = async (action) => {
    calls += 1
    if (calls === 1) throw Object.assign(new Error('a window of now.typeless.desktop covers the point'), { code: 'out_of_scope', details: { reason: 'target_out_of_scope', bundleId: 'now.typeless.desktop' } })
    return realPerform(action)
  }
  const result = await run.run()
  assert.deepEqual(notices, ['now.typeless.desktop', null])
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
  assert.ok(!events.includes('point_covered'), 'the notice is not in the trajectory')
})

test('CU-123: the ANSWER line (D-057) and the OUTCOME line share the end - both orders keep the outcome, nothing else does', async () => {
  const { DEFAULT_INSTRUCTIONS, DESKTOP_INSTRUCTIONS, outcomeOf } = await import('../../_tools_/agent-core/loop.mjs')
  for (const text of [DEFAULT_INSTRUCTIONS, DESKTOP_INSTRUCTIONS]) {
    assert.match(text, /If the task asks for an ANSWER line, write exactly one - the value only - on its own line just before the OUTCOME line; OUTCOME stays last\./)
  }
  assert.equal(outcomeOf('Both are free then.\nANSWER: 15:30\nOUTCOME: done'), 'done', 'the told order')
  assert.equal(outcomeOf('Both are free then.\nOUTCOME: done\nANSWER: 15:30'), 'done', 'the task\'s line last')
  assert.equal(outcomeOf('OUTCOME: partial\n**ANSWER:** $4,731.'), 'partial', 'emphasis on the ANSWER line, as the judge allows')
  assert.equal(outcomeOf('OUTCOME: done\n`ANSWER`: 15:30'), 'done', 'backticks around the label, as the judge allows')
  assert.equal(outcomeOf('OUTCOME: done\nanswer: 15:30'), 'done', 'any case, as the judge allows')
  // One pattern for agent core and the judge (cu-verifier): its source is the judge's answerLine pattern, character for character.
  const { answerLinePattern } = await import('../../_tools_/agent-core/answer-line.mjs')
  assert.equal(answerLinePattern().source, '^\\s*[*_`]*ANSWER[*_`]*\\s*:\\s*(.*?)\\s*$')
  assert.equal(answerLinePattern().flags, 'i')
  // cu-researcher's shared table: the lines both the judge and agent core recognise, and those neither does.
  for (const line of ['ANSWER: 15:30', '**ANSWER:** 15:30', 'answer: 15:30', '_ANSWER_: 15:30', '`ANSWER`: 15:30']) assert.ok(answerLinePattern().test(line), line)
  for (const line of ['ANSWERS: x', 'MY ANSWER: x', 'ANSWER 15:30']) assert.ok(!answerLinePattern().test(line), line)
  assert.equal(outcomeOf('OUTCOME: done\nANSWER: 15:30\nANSWER: 12:00'), null, 'two ANSWER lines after OUTCOME')
  assert.equal(outcomeOf('OUTCOME: done\nthanks'), null, 'any other line after OUTCOME')
  assert.equal(outcomeOf('ANSWER: 15:30'), null, 'an ANSWER line alone has no outcome')
})

test('both instructions ask for an OUTCOME line, and the result carries it when present (CU-21)', async () => {
  const { DEFAULT_INSTRUCTIONS, DESKTOP_INSTRUCTIONS, outcomeOf } = await import('../../_tools_/agent-core/loop.mjs')
  for (const text of [DEFAULT_INSTRUCTIONS, DESKTOP_INSTRUCTIONS]) assert.match(text, /OUTCOME: done, OUTCOME: partial or OUTCOME: not_done/)
  assert.equal(outcomeOf('Exported the report.\nOUTCOME: done'), 'done')
  assert.equal(outcomeOf("I couldn't export it.\n\noutcome: NOT_DONE  "), 'not_done')
  assert.equal(outcomeOf('OUTCOME: done\nbut then something else'), null, 'only the last line counts')
  assert.equal(outcomeOf('OUTCOME: maybe'), null)
  assert.equal(outcomeOf(null), null)
  const run = setup({ turns: [{ final: 'Badge created.\nOUTCOME: done' }], appApprovals: approved(FIXTURE) })
  assert.equal((await run.run()).outcome, 'done')
  const plain = setup({ turns: [{ final: 'Badge created.' }], appApprovals: approved(FIXTURE) })
  assert.equal('outcome' in (await plain.run()), false)
})

test('after input the observation re-captures until two frames match, capped, and records it (CU-43)', async () => {
  const { readFileSync } = await import('node:fs')
  const events = (result) => readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const frames = (seq) => {
    let i = 0
    return async () => ({ data: Buffer.from(seq[Math.min(i++, seq.length - 1)]), url: 'app:fixture', width: 100, height: 100 })
  }
  // settles: the menu fades for two frames, then holds
  const a = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE), sleep: async () => {} })
  a.environment.screenshot = frames(['first', 'menu', 'menu-fading', 'after', 'after'])
  const obsA = events(await a.run()).filter((e) => e.kind === 'observation' && e.step === 1)
  assert.equal(obsA[0].settle.capped, false)
  // a selection blink holds two equal frames before the fade: it must not settle there (cu-verifier's risk)
  const blink = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE), sleep: async () => {} })
  blink.environment.screenshot = frames(['first', 'menu', 'blink', 'blink', 'after', 'after', 'after'])
  const blinkResult = await blink.run()
  const obsBlink = events(blinkResult).find((e) => e.kind === 'observation' && e.step === 1)
  assert.equal(obsBlink.settle.capped, false)
  assert.equal(readFileSync(join(blinkResult.trajectoryDir, obsBlink.screenshot.path), 'utf8'), 'after', 'the model gets the frame after the fade, not the blink')
  // never settles: the cap ends it
  const b = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE), sleep: async () => {}, settle: { intervalMs: 100, capMs: 300 } })
  let n = 0
  b.environment.screenshot = async () => ({ data: Buffer.from(`frame-${n++}`), url: 'app:fixture', width: 100, height: 100 })
  const obsB = events(await b.run()).filter((e) => e.kind === 'observation' && e.step === 1)
  assert.equal(obsB[0].settle.capped, true)
  // a wait batch is not settled; settle: false turns it off
  const c = setup({ turns: [{ actions: [{ type: 'wait' }] }, { final: 'done' }], appApprovals: approved(FIXTURE), sleep: async () => {} })
  assert.equal(events(await c.run()).find((e) => e.kind === 'observation' && e.step === 1).settle, undefined)
  const d = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE), settle: false })
  assert.equal(events(await d.run()).find((e) => e.kind === 'observation' && e.step === 1).settle, undefined)
})

test('a file choice is asked once each time with its path, and a protected path is blocked without asking (Q-D13)', async () => {
  const { PANEL_SERVICE } = await import('../../_tools_/agent-core/app-policy.mjs')
  const requests = []
  const save = { origin: FIXTURE, role: 'AXButton', name: 'Save', fingerprint: 'save', hostedBy: PANEL_SERVICE }
  const run = setup({ turns: [{ actions: [click()] }, { actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  run.control.subscribe((event) => {
    if (event.type !== 'consent_request') return
    requests.push(event.request)
    run.control.answer?.(event.request.id, { approved: true, lifetime: 'once' })
  })
  run.environment.inspectPoint = async () => save
  run.environment.panelSelection = async () => ({ path: '/Users/someone/Documents/report.pdf' })
  await run.run()
  const choices = requests.filter((r) => r.class === 'file_choice')
  assert.equal(choices.length, 2, 'two clicks on Save, two questions: no answer covers the next choice')
  assert.deepEqual(choices[0].lifetimes, ['once'])
  assert.equal(choices[0].path, '/Users/someone/Documents/report.pdf')

  const blocked = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
  const asked = []
  blocked.control.subscribe((event) => { if (event.type === 'consent_request' && event.request.class === 'file_choice') asked.push(event.request) })
  blocked.environment.inspectPoint = async () => save
  blocked.environment.panelSelection = async () => ({ path: `${(await import('node:os')).homedir()}/.ssh/id_ed25519` })
  const result = await blocked.run()
  assert.equal(asked.length, 0, 'a protected path is never offered')
  assert.equal(result.actions.blocked, 1)
})


test('a file_choice request carries the target\'s panel kind, and the live view\'s card reads it from that very request (CU-50)', async () => {
  const { consentView } = await import('../../_tools_/live-view/ui-logic.mjs')
  const { PANEL_SERVICE } = await import('../../_tools_/agent-core/app-policy.mjs')
  // An in-process panel is marked save or open; a remote one is attributed by hostedBy and carries no marker (null).
  // ('unknown' is asked as an undescribed target, not as a file_choice.)
  for (const [panel, line] of [['save', /^Save panel: /], ['open', /^Open panel: /], [null, /^File panel of unknown kind/]]) {
    const requests = []
    const button = { origin: FIXTURE, role: 'AXButton', name: panel === 'open' ? 'Open' : 'Save', fingerprint: `b-${panel}`, ...(panel ? { panel } : { hostedBy: PANEL_SERVICE }) }
    const run = setup({ turns: [{ actions: [click()] }, { final: 'done' }], appApprovals: approved(FIXTURE) })
    run.control.subscribe((event) => {
      if (event.type !== 'consent_request') return
      requests.push(event.request)
      run.control.answer?.(event.request.id, { approved: false, lifetime: 'once' })
    })
    run.environment.inspectPoint = async () => button
    run.environment.panelSelection = async () => null
    await run.run()
    const choice = requests.find((r) => r.class === 'file_choice')
    assert.ok(choice, `a file_choice was asked for panel ${panel}`)
    assert.equal(choice.panel, panel)
    assert.match(consentView(choice, true).note, line)
    assert.equal(JSON.stringify(choice).includes('"title"'), false, 'a kind marker, never a title')
  }
})
