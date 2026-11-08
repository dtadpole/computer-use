import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { launchDesktopEnvironment, SETTLE_AFTER } from '../../_environments_/macos-desktop/environment.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { SETTLE_CAP_MS } from '../../_environments_/macos-desktop/helper-link.mjs'
import { fakeLauncher, launchApproved, pause, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * The settle after a human resume (helper-protocol-details.md 0.4.1-0.4.2, helper 0.2.8). The owner may work through
 * Screen Sharing, so the Resume, Hand back or Approve click is local input, and the pointer movement after it would
 * pause the run again at once. The driver adds `settleMs` to the first input after run control returns to running from
 * paused, taken over or awaiting consent, and to no other; the fake helper - the protocol reference - waits for that
 * much hands-off on its idle counter before it posts, only when it has seen unspent local input since its last posted
 * step, and gives up at its cap with `local_input` at step 0. Its guards stay armed meanwhile, so it reports
 * `localInput` during the wait; the driver takes those as the person the settle waits out - no stop, no pause, no
 * listener event - until the request is answered. Every wait here is real time with short values (`settleMs` 40 to
 * 300).
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const SEAT = 'cu-developer-two'
const CLICK = { type: 'click', x: 5, y: 5, button: 'left' }
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks)

const inputs = (child) => child.requests.filter((r) => r.type === 'input')

/** Wait until the fake has logged `count` input requests (stderr may trail the reply), and return the last. */
async function inputNumber(child, count, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (inputs(child).length < count && Date.now() < deadline) await pause(5)
  assert.equal(inputs(child).length, count, `input request ${count} reached the fake`)
  return inputs(child)[count - 1]
}

/** The fake's stderr lines matching `pattern`, once `count` of them have arrived (or the time is up). */
async function logLines(child, pattern, count = 1, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  const matching = () => child.log.filter((line) => pattern.test(line))
  while (matching().length < count && Date.now() < deadline) await pause(5)
  return matching()
}

const waitedOf = (line) => Number(/waited=(\d+)/.exec(line)?.[1] ?? Number.NaN)
/** When the last local input came, on the fake's settle clock (negative: before the settle began). */
const lastInputOf = (line) => Number(/lastInput=(-?\d+)/.exec(line)?.[1] ?? Number.NaN)

/** Local input while running pauses the run (C4); a person resumes it: the next input is the first after a resume. */
async function pauseByLocalInputAndResume(env, control) {
  await env.simulateLocalInput({ via: 'idle', kind: 'pointer' })
  assert.equal(control.state, 'paused')
  assert.equal(control.send({ command: 'resume' }, { source: 'control' }).ok, true)
}

/** Every run-control state change from now on, so a check can prove no pause happened in between. */
function stateLog(control) {
  const states = []
  control.subscribe((event) => { if (event.type === 'state') states.push(event) })
  return states
}

test('settleMs rides only the first input after paused, taken_over or awaiting_consent returns to running - never later inputs, never the run\'s first', async () => {
  assert.deepEqual(SETTLE_AFTER, ['paused', 'taken_over', 'awaiting_consent'])
  const control = createRunControl({ runId: 'settle' })
  const { env, child } = await launchOnFake({}, { control, settleMs: 40 })
  let count = 0
  const next = async () => {
    const effect = await env.perform(CLICK)
    count += 1
    const sent = (await inputNumber(child, count)).settleMs
    // The effect names the settle its input asked for (the trajectory records the effect), and only then.
    assert.equal(effect.settleMs, sent)
    assert.equal(Object.hasOwn(effect, 'settleMs'), sent !== undefined)
    return sent
  }
  try {
    assert.equal(await next(), undefined, 'the first input of a run that never left running')
    assert.equal(await next(), undefined)
    control.send({ command: 'pause' }, { source: 'control' })
    control.send({ command: 'resume' }, { source: 'control' })
    // An action that sends no input, or one refused while it is planned, forms no request and leaves the flag set.
    await env.perform({ type: 'wait', duration_ms: 1 })
    await assert.rejects(env.perform({ type: 'click', x: 5000, y: 5, button: 'left' }), code('invalid_argument'))
    assert.equal(await next(), 40, 'after paused')
    assert.equal(await next(), undefined, 'later inputs never')
    // Two resumes with no input between still give one settle.
    for (let i = 0; i < 2; i += 1) {
      control.send({ command: 'pause' }, { source: 'control' })
      control.send({ command: 'resume' }, { source: 'control' })
    }
    assert.equal(await next(), 40)
    assert.equal(await next(), undefined)
    control.send({ command: 'take_over' }, { source: 'control' })
    control.send({ command: 'hand_back' }, { source: 'control' })
    assert.equal(await next(), 40, 'after taken_over')
    assert.equal(await next(), undefined)
    const waiting = control.requestConsent({ id: 'c1', class: 'new_app', app: 'com.example.other', reason: 'test' }, { timeoutMs: 5_000 })
    control.decline('c1', 'test')
    await waiting
    assert.equal(control.state, 'running')
    assert.equal(await next(), 40, 'after awaiting_consent')
    assert.equal(await next(), undefined)
    // No local input reached this fake, so each settleMs was ignored and the input posted at once.
    assert.equal((await logLines(child, /^settle ignored/, 4)).length, 4)
    assert.equal(child.log.some((line) => /^settle (honoured|cap)/.test(line)), false)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the flag is spent by the request it rides even when the link refuses it before sending; that request waits the cap longer', async () => {
  const control = createRunControl({ runId: 'settle' })
  const { env, child } = await launchOnFake({}, { control, settleMs: 40 })
  const original = env.link.request.bind(env.link)
  const seen = []
  env.link.request = (type, fields, options) => {
    if (type !== 'input') return original(type, fields, options)
    seen.push({ fields, options })
    if (seen.length === 1) return Promise.reject(new EnvironmentError('invalid_argument', 'refused before it was sent'))
    return original(type, fields, options)
  }
  try {
    control.send({ command: 'pause' }, { source: 'control' })
    control.send({ command: 'resume' }, { source: 'control' })
    await assert.rejects(env.perform(CLICK), code('invalid_argument'))
    await env.perform(CLICK)
    assert.equal(seen[0].fields.settleMs, 40)
    assert.deepEqual(seen[0].options, { timeoutMs: env.link.requestTimeoutMs + SETTLE_CAP_MS })
    assert.equal(seen[1].fields.settleMs, undefined, 'spent: the refused request was the first after the resume')
    assert.equal(seen[1].options, undefined, 'an ordinary input keeps the link\'s own deadline')
    assert.equal(inputs(child).length, 1, 'only the second reached the fake')
  } finally {
    env.link.request = original
    await env.close()
    await stopFake(child)
  }
})

test('after local input the fake waits for hands-off - its person reported while active, then settleMs idle - and only then posts; the run stays running', async () => {
  const control = createRunControl({ runId: 'settle' })
  const { env, child } = await launchOnFake({ personActiveMs: 800 }, { control, settleMs: 100 })
  const heard = []
  env.on('localInput', (event) => heard.push(event))
  const events = []
  env.link.on('localInput', (event) => events.push(event))
  try {
    await pauseByLocalInputAndResume(env, control)
    assert.equal(events.length, 1, 'the input that paused the run')
    const states = stateLog(control)
    const started = Date.now()
    const effect = await env.perform(CLICK)
    const took = Date.now() - started
    assert.equal(effect.navigated, false)
    const [line] = await logLines(child, /^settle honoured settleMs=100 /)
    assert.ok(waitedOf(line) >= 900, `the person for 800 ms, then 100 ms idle: ${line}`)
    assert.ok(took >= 900 && took < 3000, `a short settleMs works for checks (${took} ms)`)
    assert.equal((await inputNumber(child, 1)).settleMs, 100)
    // The guards stayed armed: the person was reported during the wait, twice a second at most (the first at 500 ms).
    const reported = await logLines(child, /^person during the settle: localInput sent/)
    assert.ok(reported.length >= 1, 'the person was reported during the settle')
    assert.equal(events.length, 1 + reported.length, 'each report reached the driver')
    assert.deepEqual(events.slice(1).map((event) => event.kind), reported.map(() => 'pointer'))
    // And the driver took each for the person the settle waits out: counted, no stop, no pause, no listener event.
    assert.equal(env.settleLocalInputs, reported.length)
    assert.equal(heard.length, 1, 'only the input that paused the run was heard')
    assert.deepEqual(states, [], 'run control never left running')
    assert.deepEqual([control.state, env.state().localInput], ['running', null])
    // The settle is spent and the driver sends none again: the next input posts at once.
    const again = Date.now()
    await env.perform(CLICK)
    assert.ok(Date.now() - again < 300)
    assert.equal((await inputNumber(child, 2)).settleMs, undefined)
    // Once the settle is answered, local input pauses as before.
    await env.simulateLocalInput({ via: 'idle', kind: 'key' })
    assert.deepEqual([control.state, heard.length, env.settleLocalInputs], ['paused', 2, reported.length])
    assert.equal(typeof env.state().localInput, 'string')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('local input during the settle restarts the wait: the helper reports it, and the driver neither stops, pauses nor tells listeners', async () => {
  const control = createRunControl({ runId: 'settle' })
  const { env, child } = await launchOnFake({ personActiveMs: 150 }, { control, settleMs: 200 })
  const heard = []
  env.on('localInput', (event) => heard.push(event))
  const events = []
  env.link.on('localInput', (event) => events.push(event))
  try {
    await pauseByLocalInputAndResume(env, control)
    const states = stateLog(control)
    const started = Date.now()
    const acting = env.perform(CLICK)
    // The person stopped at 150 ms; at 250 the counter has read 100 of the 200 when they touch the Mac again, twice.
    await pause(250)
    const byIdle = await env.simulateLocalInput({ via: 'idle', kind: 'pointer' })
    await pause(50)
    const byTap = await env.simulateLocalInput({ via: 'tap', kind: 'key' })
    await acting
    const took = Date.now() - started
    // No stop is set: the seam resolves with the driver's stop time, still none.
    assert.deepEqual([byIdle, byTap], [{ at: null, detectedBy: 'idle' }, { at: null, detectedBy: 'tap' }])
    assert.equal((await logLines(child, /^local input during the settle: localInput sent/, 2)).length, 2)
    const [line] = await logLines(child, /^settle honoured settleMs=200 /)
    // On the fake's own clock - its settle may begin a little after this test's clock starts, so its wait alone is not
    // compared with 500: the idle wait restarted at the last touch, which came during the settle. End to end, on this
    // test's clock, the run waited past both touches (sent at 300 ms or later) plus settleMs.
    assert.ok(lastInputOf(line) > 0 && waitedOf(line) >= lastInputOf(line) + 200, `the wait restarted at the last touch: ${line}`)
    assert.ok(took >= 500, `the run waited past the last touch (${took} ms)`)
    // Both touches came as events (a slow start may add a report of the person); none paused anything.
    const person = child.log.filter((entry) => /^person during the settle/.test(entry)).length
    assert.equal(events.length, 1 + 2 + person)
    assert.deepEqual(events.slice(-2).map((event) => event.kind), ['pointer', 'key'])
    assert.equal(env.settleLocalInputs, 2 + person)
    assert.equal(heard.length, 1, 'no listener event during the settle')
    assert.deepEqual(states, [], 'run control never left running')
    assert.deepEqual([control.state, env.state().localInput], ['running', null])
    assert.equal((await inputNumber(child, 1)).settleMs, 200)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('past the cap the fake answers local_input at step 0 and posts nothing; the driver stops and pauses as for any local input', async () => {
  const control = createRunControl({ runId: 'settle' })
  const { env, child } = await launchOnFake({ personActiveMs: 5000, settleCapMs: 250 }, { control, settleMs: 100 })
  const heard = []
  env.on('localInput', (event) => heard.push(event))
  const states = stateLog(control)
  try {
    await pauseByLocalInputAndResume(env, control)
    await assert.rejects(env.perform(CLICK), (e) => code('taken_over')(e) && e.details.reason === 'local_input' && e.details.failedAt === 0 && e.details.partial === false)
    assert.equal((await logLines(child, /^settle cap reached/)).length, 1)
    // Agent core pauses through C4, from local_input, as it does for the event; the driver's own stop holds too.
    assert.deepEqual([control.state, states.at(-1).source], ['paused', 'local_input'])
    assert.equal(typeof env.state().localInput, 'string')
    assert.equal(heard.length, 2)
    assert.deepEqual(Object.keys(heard[1]).sort(), ['at', 'kind'])
    assert.equal(heard[1].kind, null, 'the idle counter does not tell a key from the pointer')
    await assert.rejects(env.perform(CLICK), code('taken_over'))
    assert.equal(inputs(child).length, 1, 'nothing is sent while stopped')
    // Resumed again, the next input settles again, and the fake honours it: a capped settle spends nothing. Over half a
    // second after the last report the person is reported again during this wait; the cap still pauses.
    assert.equal(control.send({ command: 'resume' }, { source: 'control' }).ok, true)
    assert.equal(env.state().localInput, null)
    await pause(500)
    await assert.rejects(env.perform(CLICK), (e) => code('taken_over')(e) && e.details.failedAt === 0)
    assert.equal((await inputNumber(child, 2)).settleMs, 100)
    assert.equal((await logLines(child, /^settle cap reached/, 2)).length, 2)
    assert.ok((await logLines(child, /^person during the settle: localInput sent/)).length >= 1)
    assert.equal(env.settleLocalInputs, child.log.filter((entry) => /^person during the settle/.test(entry)).length)
    assert.deepEqual([control.state, states.at(-1).source, heard.length, heard[2].kind], ['paused', 'local_input', 3, null])
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the fake honours settleMs only after unspent local input it saw since its last posted step; one settle per such input', async () => {
  const events = [{ kind: 'mouseMove', x: 5, y: 5 }]
  const input = (extra) => ({ events, mode: 'global', bundleId: FIXTURE, ...extra })
  const { child, link } = await stdioLink({})
  const reports = []
  link.on('localInput', (event) => reports.push(event))
  try {
    await link.request('scope', { bundleIds: [FIXTURE] })
    await link.request('pauseOnLocalInput', { on: true })
    let started = Date.now()
    assert.equal((await link.request('input', input({ settleMs: 60_000 }))).done, true)
    assert.ok(Date.now() - started < 1000, 'ignored: no local input yet')
    await link.request('simulateLocalInput', { kind: 'pointer', via: 'idle' })
    started = Date.now()
    assert.equal((await link.request('input', input({ settleMs: 150 }))).done, true)
    const [line] = await logLines(child, /^settle honoured settleMs=150 /)
    // The touch came before this settle began, so the wait is settleMs counted from it, on the fake's own clock.
    assert.ok(lastInputOf(line) <= 0 && waitedOf(line) >= lastInputOf(line) + 150, line)
    // Spent: the next settleMs is ignored until new local input.
    started = Date.now()
    assert.equal((await link.request('input', input({ settleMs: 60_000 }))).done, true)
    assert.ok(Date.now() - started < 1000)
    assert.equal((await logLines(child, /^settle ignored/, 2)).length, 2)
    // The guards stay armed through a settle: local input then is reported at once, while the input waits, and
    // restarts the wait; nothing posts before the person has been hands-off for settleMs.
    await link.request('simulateLocalInput', { kind: 'pointer', via: 'idle' })
    started = Date.now()
    const waiting = link.request('input', input({ settleMs: 300 }))
    let answered = false
    waiting.then(() => { answered = true }, () => {})
    await pause(150)
    const before = reports.length
    const touchedAt = Date.now()
    await link.request('simulateLocalInput', { kind: 'key', via: 'tap' })
    assert.deepEqual([reports.length, reports.at(-1).kind, answered], [before + 1, 'key', false], 'reported during the settle')
    assert.equal((await waiting).done, true)
    assert.ok(Date.now() - touchedAt >= 280, 'the wait restarted at the touch')
    assert.equal((await logLines(child, /^local input during the settle: localInput sent/)).length, 1)
    // The settle is spent where it is honoured, before the checks: a post the checks then refuse spends it too.
    await link.request('simulateLocalInput', { kind: 'pointer', via: 'idle' })
    await assert.rejects(link.request('input', { ...input({ settleMs: 50 }), events: [{ kind: 'mouseMove', x: 5000, y: 5 }] }), code('out_of_scope'))
    assert.equal((await logLines(child, /^settle honoured settleMs=50 /)).length, 1)
    started = Date.now()
    assert.equal((await link.request('input', input({ settleMs: 60_000 }))).done, true)
    assert.ok(Date.now() - started < 1000, 'ignored: no local input since that settle')
    assert.equal((await logLines(child, /^settle ignored/, 3)).length, 3)
    // Arming the pause starts the guard afresh: local input before it earns no settle.
    await link.request('simulateLocalInput', { kind: 'pointer', via: 'idle' })
    await link.request('pauseOnLocalInput', { on: true })
    started = Date.now()
    assert.equal((await link.request('input', input({ settleMs: 60_000 }))).done, true)
    assert.ok(Date.now() - started < 1000, 'ignored after the re-arm')
    assert.equal((await logLines(child, /^settle ignored/, 4)).length, 4)
    // The value is checked whether or not it is honoured: an integer from 1 to 60000.
    for (const settleMs of [0, -1, 1.5, '100', null, true, 60_001]) {
      await assert.rejects(link.request('input', input({ settleMs })), (e) => code('invalid_argument')(e) && e.details.field === 'settleMs', JSON.stringify(settleMs))
    }
    assert.equal((await link.request('input', input({ settleMs: 1 }))).done, true)
    assert.equal((await link.request('input', input({ settleMs: 60_000 }))).done, true)
  } finally {
    await stopFake(child)
  }
  // A local_input stop it answered mid-batch counts too: the person's input came after the steps it posted.
  const quirky = await stdioLink({ quirks: { localInputAfter: 1 } })
  try {
    await quirky.link.request('scope', { bundleIds: [FIXTURE] })
    await quirky.link.request('pauseOnLocalInput', { on: true })
    const stopped = await quirky.link.request('input', { events: [...events, ...events], mode: 'global', bundleId: FIXTURE })
    assert.deepEqual([stopped.done, stopped.failedAt, stopped.code], [false, 1, 'local_input'])
    assert.equal((await quirky.link.request('input', input({ settleMs: 50 }))).done, true)
    assert.equal((await logLines(quirky.child, /^settle honoured settleMs=50 /)).length, 1)
  } finally {
    await stopFake(quirky.child)
  }
})

test('settleMs is a whole number of milliseconds from 1 to the helper\'s cap, checked before the lock or any helper', async () => {
  let connected = 0
  let locked = 0
  const connect = async () => { connected += 1 }
  const runLock = async () => { locked += 1; return { release() {} } }
  for (const settleMs of [0, -5, 1.5, '1500', null, SETTLE_CAP_MS + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(launchDesktopEnvironment({ apps: [FIXTURE], seat: SEAT, connect, runLock, settleMs }), (e) => code('invalid_argument')(e) && e.details.field === 'settleMs', String(settleMs))
  }
  assert.deepEqual([connected, locked], [0, 0])
  for (const [given, expected] of [[undefined, 1500], [1, 1], [SETTLE_CAP_MS, SETTLE_CAP_MS]]) {
    const { env, child } = await launchOnFake({}, given === undefined ? {} : { settleMs: given })
    assert.equal(env.settleMs, expected)
    await env.close()
    await stopFake(child)
  }
})

test('a settle longer than the link\'s request timeout does not end the link: that one request waits the cap longer', async () => {
  const control = createRunControl({ runId: 'settle' })
  let child = null
  const connect = async () => {
    const started = await stdioLink({ personActiveMs: 700 }, { requestTimeoutMs: 400 })
    child = started.child
    return started.link
  }
  const env = await launchApproved(connect, { apps: [FIXTURE], seat: SEAT, runLock: locks.next(), control, settleMs: 100 })
  try {
    assert.equal(env.link.requestTimeoutMs, 400)
    await pauseByLocalInputAndResume(env, control)
    const started = Date.now()
    await env.perform(CLICK)
    const took = Date.now() - started
    assert.ok(took >= 800, `the settle outlasted the 400 ms request timeout (${took} ms)`)
    assert.equal(env.link.lost, false)
    assert.equal(env.lostReason, null)
    assert.equal((await env.screenshot()).mimeType, 'image/png', 'the link still serves')
    await env.perform(CLICK)
  } finally {
    await env.close()
    if (child !== null) await stopFake(child)
  }
})
