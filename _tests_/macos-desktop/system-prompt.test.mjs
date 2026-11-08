import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-76, the driver's half: a system-presented privacy or permission prompt (Allow Paste, a TCC prompt) is the person's
 * to answer, even inside an approved app's window. The helper marks a prompt's elements (`systemPrompt: true` on an
 * element) and says on every capture whether one is shown (`systemPrompt` on the reply). The driver passes both to
 * agent core (`target.systemPrompt`, `state().systemPrompt`) and refuses on its own, before anything is posted, a click
 * on a prompt's element and any key while a prompt shows - `system_prompt`, a hand-off. All on the fake helper.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length
/** Wait for the fake's stderr log, which can trail its reply, until `ok()` holds (at most 2 s). */
async function until(ok) {
  for (const deadline = Date.now() + 2000; !ok() && Date.now() < deadline;) await pause(5)
}

const ALLOW = { role: 'AXButton', subrole: null, title: 'Allow Paste', frame: { x: 300, y: 200, width: 100, height: 30 }, secure: false }
const NOTE = { role: 'AXTextArea', subrole: null, title: 'Note', frame: { x: 20, y: 400, width: 200, height: 100 }, secure: false, editable: true }
const world = (extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [
    { rect: ALLOW.frame, element: { bundleId: FIXTURE, pid: 601, ...ALLOW, systemPrompt: true } },
    { rect: NOTE.frame, element: { bundleId: FIXTURE, pid: 601, ...NOTE } },
  ],
  focused: { bundleId: FIXTURE, pid: 601, ...NOTE },
  ...extra,
})

async function launched(config) {
  const started = await launchOnFake(config)
  await logged(started.child, 3)
  return started
}

test('a prompt\'s element carries systemPrompt to agent core, joins the fingerprint, and a click on it is refused system_prompt unposted', async () => {
  const { env, child } = await launched(world())
  try {
    const allow = await env.inspectPoint({ x: 320, y: 210 })
    assert.deepEqual([allow.name, allow.systemPrompt], ['Allow Paste', true])
    const note = await env.inspectPoint({ x: 50, y: 420 })
    assert.equal(note.systemPrompt, false, 'an ordinary element is not a prompt')
    assert.equal((await env.focusedElement()).systemPrompt, false)
    let refusal = null
    await assert.rejects(env.perform({ type: 'click', x: 320, y: 210, button: 'left' }), (e) => { refusal = e; return code('system_prompt')(e) })
    assert.deepEqual(refusal.details.point, { x: 320, y: 210 })
    assert.match(refusal.message, /answering it is the person's/)
    await pause(30) // a request the driver sent would be logged by now
    assert.equal(inputs(child), 0, 'nothing was posted')
    assert.equal(env.state().systemPrompt, true, 'the hit marks the prompt as shown')
  } finally {
    await env.close()
    await stopFake(child)
  }
  // The same button without the mark is another approval target: the mark joins the fingerprint.
  const plain = await launched(world({ elements: [{ rect: ALLOW.frame, element: { bundleId: FIXTURE, pid: 601, ...ALLOW } }] }))
  const marked = await launched(world())
  try {
    const a = await plain.env.inspectPoint({ x: 320, y: 210 })
    const b = await marked.env.inspectPoint({ x: 320, y: 210 })
    assert.equal(a.systemPrompt, false)
    assert.notEqual(a.fingerprint, b.fingerprint)
  } finally {
    for (const started of [plain, marked]) {
      await started.env.close()
      await stopFake(started.child)
    }
  }
})

test('while a capture reports a prompt, every key is refused system_prompt unposted (a click elsewhere still posts); a capture without one clears it', async () => {
  // The fake reports the prompt from the second capture on: the first is addApp's, the second a screenshot.
  const { env, child } = await launched(world({ systemPrompt: true, systemPromptFrom: 2 }))
  try {
    assert.equal(env.state().systemPrompt, false, 'the join\'s capture showed none')
    await env.screenshot()
    assert.equal(env.state().systemPrompt, true, 'read from the capture reply')
    for (const action of [{ type: 'keypress', keys: ['Return'] }, { type: 'keypress', keys: ['space'] }, { type: 'type', text: 'yes' }]) {
      const before = child.requests.length
      await assert.rejects(env.perform(action), code('system_prompt'), JSON.stringify(action))
      await pause(30)
      assert.equal(child.requests.length, before, 'refused before any request: no hit test, no input')
    }
    // A click on an ordinary element is the policy's to judge; the driver posts it.
    await env.perform({ type: 'click', x: 50, y: 420, button: 'left' })
    await until(() => inputs(child) >= 1)
    assert.equal(inputs(child), 1)
  } finally {
    await env.close()
    await stopFake(child)
  }
  // A helper whose capture says the prompt is gone clears the mark; a resume never does.
  const gone = await launched(world({ systemPrompt: false }))
  try {
    gone.env.systemPrompt = true // as if a hit had marked it
    await gone.env.screenshot()
    assert.equal(gone.env.state().systemPrompt, false, 'the capture reply is the helper\'s word')
    await gone.env.perform({ type: 'keypress', keys: ['Return'] })
  } finally {
    await gone.env.close()
    await stopFake(gone.child)
  }
})

test('an older helper that sends neither field changes nothing: no mark, keys pass, state false', async () => {
  const { env, child } = await launched(world({ elements: [{ rect: NOTE.frame, element: { bundleId: FIXTURE, pid: 601, ...NOTE } }] }))
  try {
    await env.screenshot()
    assert.equal(env.state().systemPrompt, false)
    assert.equal((await env.inspectPoint({ x: 50, y: 420 })).systemPrompt, false)
    await env.perform({ type: 'keypress', keys: ['Return'] })
    await until(() => inputs(child) >= 1)
    assert.equal(inputs(child), 1)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('the helper\'s own system_prompt refusal (0.2.28), in either form, is a hand-off with a neutral message that marks the state - never helper_lost', async () => {
  for (const quirks of [{ systemPromptInput: true }, { systemPromptInput: true, systemPromptRefusal: true }]) {
    const { env, child } = await launched(world({ elements: [{ rect: NOTE.frame, element: { bundleId: FIXTURE, pid: 601, ...NOTE } }], quirks }))
    try {
      let refusal = null
      await assert.rejects(env.perform({ type: 'click', x: 50, y: 420, button: 'left' }), (e) => { refusal = e; return code('system_prompt')(e) }, JSON.stringify(quirks))
      assert.equal(refusal.details.reason, 'system_prompt')
      assert.doesNotMatch(refusal.message, /com\.apple|Allow Paste/, 'the helper\'s text, which may name a process, never reaches the model')
      assert.equal(env.state().systemPrompt, true, 'the next key is handed off by the policy')
      assert.equal(env.link.lost, false, 'the run goes on: a known code, not a broken protocol')
      await assert.rejects(env.perform({ type: 'keypress', keys: ['Return'] }), code('system_prompt'), 'and the driver refuses keys itself now')
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
})
