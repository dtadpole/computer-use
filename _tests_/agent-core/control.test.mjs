import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/control.mjs'

test('tokens authorize their sender and nothing else', () => {
  const control = createRunControl({ runId: 'r1' })
  assert.match(control.viewToken, /^[0-9a-f]{32}$/)
  assert.notEqual(control.viewToken, control.controlToken)
  assert.equal(control.authorize(control.viewToken), 'view')
  assert.equal(control.authorize(control.controlToken), 'control')
  assert.equal(control.authorize('nope'), null)
  assert.equal(control.authorize(undefined), null)
})

test('pause, resume and the caller-resumes-only-its-own-pause rule', async () => {
  const control = createRunControl()
  assert.equal(control.agentMayAct(), true)
  assert.deepEqual(control.send('pause', { source: 'control' }), { ok: true, state: 'paused' })
  assert.equal(control.agentMayAct(), false)
  assert.deepEqual(control.send('resume', { source: 'caller' }), { ok: false, state: 'paused', error: 'resume_needs_control' })
  assert.deepEqual(control.send('resume', { source: 'view' }), { ok: false, state: 'paused', error: 'not_allowed_for_sender' })
  let resumed = false
  const waiting = control.checkpoint().then((value) => { resumed = value })
  await new Promise((r) => setImmediate(r))
  assert.equal(resumed, false, 'checkpoint waits while paused')
  assert.equal(control.send('resume', { source: 'control' }).ok, true)
  await waiting
  assert.equal(resumed, true)
  control.send('pause', { source: 'caller' })
  assert.equal(control.send('resume', { source: 'caller' }).ok, true)
  assert.deepEqual(control.send('resume', { source: 'control' }), { ok: false, state: 'running', error: 'not_allowed_in_state' })
})

test('take-over gates input both ways; hand-back queues the note', () => {
  const control = createRunControl()
  assert.equal(control.send('take_over', { source: 'view' }).error, 'not_allowed_for_sender')
  assert.equal(control.send('take_over', { source: 'caller' }).error, 'not_allowed_for_sender')
  assert.equal(control.send('take_over', { source: 'control' }).state, 'taken_over')
  assert.equal(control.agentMayAct(), false)
  assert.equal(control.humanMayAct(), true)
  assert.equal(control.send({ command: 'hand_back', note: 'I filled the date' }, { source: 'control' }).state, 'running')
  assert.equal(control.humanMayAct(), false)
  assert.deepEqual(control.drainGuidance().notes, ['The user took control and may have changed the page. I filled the date'])
  assert.deepEqual(control.drainGuidance(), { guidance: [], notes: [] })
})

test('consent: only explicit true approves; the caller and the view token are refused by name', async () => {
  const control = createRunControl()
  const events = []
  control.subscribe((event) => events.push(event))
  const answer = control.requestConsent({ id: 'c1', class: 'purchase' })
  assert.equal(control.state, 'awaiting_consent')
  assert.deepEqual(control.pending().map((r) => r.id), ['c1'])
  assert.equal(control.send({ command: 'consent', id: 'c1', approved: true }, { source: 'caller' }).error, 'consent_not_accepted_from_caller')
  assert.equal(control.send({ command: 'consent', id: 'c1', approved: true }, { source: 'view' }).error, 'consent_not_accepted_from_caller')
  assert.equal(control.send({ command: 'consent', id: 'zz', approved: true }, { source: 'control' }).error, 'no_such_request')
  assert.equal(control.send({ command: 'consent', id: 'c1', approved: 'yes', lifetime: 'run' }, { source: 'control' }).ok, true)
  assert.deepEqual(await answer, { approved: false, lifetime: 'run', answeredBy: 'live' })
  assert.equal(control.state, 'running')
  const second = control.requestConsent({ id: 'c2' })
  control.send({ command: 'consent', id: 'c2', approved: true }, { source: 'api' })
  assert.deepEqual(await second, { approved: true, lifetime: 'once', answeredBy: 'api' })
  assert.ok(events.some((e) => e.type === 'control' && e.error === 'consent_not_accepted_from_caller'), 'refusals are recorded')
  assert.ok(events.every((e) => !JSON.stringify(e).includes(control.controlToken)), 'no event carries a token')
})

test('consent times out and stop declines; the DSH plugin may only approve once', async () => {
  const control = createRunControl()
  assert.deepEqual(await control.requestConsent({ id: 't' }, { timeoutMs: 5 }), { approved: false, lifetime: 'once', answeredBy: 'timeout' })
  const plugin = control.requestConsent({ id: 'p' })
  assert.equal(control.send({ command: 'consent', id: 'p', approved: true, lifetime: 'run' }, { source: 'dsh_plugin' }).error, 'lifetime_not_allowed')
  control.send({ command: 'consent', id: 'p', approved: true, lifetime: 'once' }, { source: 'dsh_plugin' })
  assert.deepEqual(await plugin, { approved: true, lifetime: 'once', answeredBy: 'dsh_gate' })
  const stopped = control.requestConsent({ id: 's' })
  assert.equal(control.send({ command: 'stop', reason: 'enough' }, { source: 'view' }).state, 'finished')
  assert.deepEqual(await stopped, { approved: false, lifetime: 'once', answeredBy: 'stop' })
  assert.equal(control.signal.aborted, true)
  assert.equal(control.stopReason, 'enough')
  assert.equal(await control.checkpoint(), false)
  assert.equal(control.send('pause', { source: 'control' }).error, 'not_allowed_in_state')
})

test('take-over during a consent returns to awaiting_consent at hand-back; a handoff resolves at hand-back', async () => {
  const control = createRunControl()
  control.requestConsent({ id: 'c' })
  control.send('take_over', { source: 'control' })
  control.send('hand_back', { source: 'control' })
  assert.equal(control.state, 'awaiting_consent')
  control.decline('c')
  assert.equal(control.state, 'running')
  const done = control.handoff('certificate warning')
  assert.equal(control.state, 'taken_over')
  control.send('hand_back', { source: 'api' })
  assert.deepEqual(await done, { note: null })
  assert.equal(control.state, 'running')
})

test('guidance is queued for the next model input; unknown commands and senders are refused', () => {
  const control = createRunControl()
  assert.equal(control.send({ command: 'guide', text: '  use the second result  ' }, { source: 'caller' }).ok, true)
  assert.equal(control.send({ command: 'guide', text: '' }, { source: 'caller' }).error, 'empty_guidance')
  assert.deepEqual(control.drainGuidance().guidance, ['use the second result'])
  assert.equal(control.send('dance', { source: 'control' }).error, 'unknown_command')
  assert.equal(control.send('pause', { source: 'stranger' }).error, 'unknown_sender')
  control.finish({ status: 'completed' })
  assert.equal(control.state, 'finished')
  assert.deepEqual(control.result, { status: 'completed' })
})

test('a handoff with a time limit returns to running when nobody hands back', async () => {
  const control = createRunControl()
  const back = await control.handoff('password change', { timeoutMs: 5 })
  assert.deepEqual(back, { timedOut: true })
  assert.equal(control.state, 'running')
  assert.equal(control.agentMayAct(), true)
})

test('local_input (desktop) may only pause; only the person resumes it, and the model hears the screen may have changed', () => {
  const control = createRunControl()
  for (const command of ['resume', 'stop', 'take_over', 'hand_back', 'guide']) {
    assert.equal(control.send(command, { source: 'local_input' }).error, 'not_allowed_for_sender', command)
  }
  assert.equal(control.send({ command: 'consent', id: 'c1', approved: true }, { source: 'local_input' }).error, 'consent_not_accepted_from_caller')
  assert.equal(control.send('pause', { source: 'local_input' }).ok, true)
  assert.equal(control.state, 'paused')
  assert.equal(control.send('resume', { source: 'caller' }).error, 'resume_needs_control', 'the calling session cannot resume a local pause')
  assert.equal(control.send('resume', { source: 'control' }).ok, true)
  assert.match(control.drainGuidance().notes.join(' '), /person used the computer/)
})

