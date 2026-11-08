import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { launchApproved, logged, pause, quiet, scratchLocks, stdioLink, stopFake } from './harness.mjs'

/**
 * `env.addApp(bundleId)` (cu-verifier's defect: approving a new app had no effect, because the helper's scope never
 * grew). After a person approves an app, the driver sends `scope` with the union of the run's apps and the new one;
 * captures, hit tests and input may then target it. Excluded ids are refused by name without changing anything.
 * Everything runs on the fake helper, which replaces its scope on every `scope` request, as the Swift helper does.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'
const NOTES = 'ai.reflection.cu.notes'
const SEAT = 'cu-developer-two'
const locks = scratchLocks()
after(() => locks.remove())

/** Fixture on the left, ledger on the right with one button; the ledger is in front and cannot be switched away from. */
const WORLD = {
  apps: [
    { bundleId: LEDGER, pid: 602, title: 'Ledger', rect: { x: 400, y: 0, width: 400, height: 600 } },
    { bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 400, height: 600 } },
  ],
  frontmost: LEDGER,
  activationWorks: false,
  elements: [{
    rect: { x: 500, y: 100, width: 100, height: 30 },
    element: { bundleId: LEDGER, pid: 602, role: 'AXButton', subrole: null, title: 'Post entry', frame: { x: 500, y: 100, width: 100, height: 30 }, secure: false },
  }],
}

async function launchOnFake(config = {}, options = {}) {
  const started = { child: null }
  const connect = async () => {
    const { child, link } = await stdioLink(config)
    started.child = child
    return link
  }
  try {
    const env = await launchApproved(connect, { apps: [FIXTURE], seat: SEAT, runLock: locks.next(), ...options })
    return { env, child: started.child }
  } catch (error) {
    if (started.child !== null) await stopFake(started.child)
    throw error
  }
}

const scopes = (child) => child.requests.filter((r) => r.type === 'scope').map((r) => r.bundleIds)
const inputs = (child) => child.requests.filter((r) => r.type === 'input')
const click = (x, y) => ({ type: 'click', x, y, button: 'left' })

test('addApp: the scope request names both apps, and input, hit tests and captures may then target the new one', async () => {
  const { env, child } = await launchOnFake(WORLD)
  try {
    assert.deepEqual(env.state().scope, [FIXTURE])
    // Before the approval the ledger is out of reach: the driver's target check refuses input, sending none (D-036),
    // and a hit test names its bundle id only.
    await assert.rejects(env.perform(click(550, 110)), (e) => code('out_of_scope')(e) && e.details.reason === 'target_out_of_scope' && e.details.bundleId === LEDGER)
    const before = await env.inspectPoint({ x: 550, y: 110 })
    assert.deepEqual([before.origin, before.name, before.role], [LEDGER, null, null])

    assert.deepEqual(await env.addApp(LEDGER), [FIXTURE, LEDGER])
    await logged(child, 6)
    assert.equal(inputs(child).length, 0, 'the refused click sent no input')
    assert.deepEqual(scopes(child), [[FIXTURE], [FIXTURE, LEDGER]], 'the scope request names the current apps and the new one')
    assert.deepEqual(env.state().scope, [FIXTURE, LEDGER])
    assert.deepEqual(env.apps, [FIXTURE, LEDGER])

    await env.perform(click(550, 110))
    await logged(child, 8) // its target check's hitTest, then the input
    const sent = inputs(child).at(-1)
    assert.equal(sent.bundleId, LEDGER, 'the input targets the ledger')
    const down = sent.events.find((e) => e.kind === 'down')
    assert.deepEqual([down.x, down.y], [550, 110])
    const after = await env.inspectPoint({ x: 550, y: 110 })
    assert.deepEqual([after.origin, after.name, after.role], [LEDGER, 'Post entry', 'AXButton'])
    const shot = await env.screenshot()
    assert.equal(shot.title, 'Ledger', 'the next capture shows the ledger window')

    // Idempotent: an app already in scope sends nothing. Let the request log settle first (it can lag replies).
    await quiet(child)
    const count = child.requests.length
    assert.deepEqual(await env.addApp(LEDGER), [FIXTURE, LEDGER])
    assert.deepEqual(await env.addApp(FIXTURE), [FIXTURE, LEDGER])
    await pause(20)
    assert.equal(child.requests.length, count)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('addApp: an excluded id is refused by name, nothing is sent and the scope is unchanged', async () => {
  const standIn = 'ai.reflection.cu.standin.excluded'
  const helperOnly = 'ai.reflection.cu.helper-only-excluded'
  const config = { ...WORLD, frontmost: FIXTURE, excluded: ['com.apple.Terminal', 'com.1password.', helperOnly] }
  const { env, child } = await launchOnFake(config, { exclusions: createExclusions({ extra: ['ai.reflection.cu.standin.*'] }) })
  try {
    await logged(child, 3)
    const count = child.requests.length
    for (const [id, kind] of [['com.apple.Terminal', 'terminal'], ['com.1password.1password', 'password_manager'], ['com.reflection.cu-helper', 'agent'], [standIn, 'config']]) {
      await assert.rejects(env.addApp(id), (e) => code('blocked_by_policy')(e) && e.details.reason === 'excluded' && e.details.bundleId === id && e.details.kind === kind && e.message.includes(id), id)
    }
    await assert.rejects(env.addApp('not a bundle id'), code('invalid_argument'))
    await pause(20)
    assert.equal(child.requests.length, count, 'nothing reached the helper')
    assert.deepEqual(env.state().scope, [FIXTURE])

    // An id only the helper's table holds is refused there, by name, and neither side's scope changes.
    await assert.rejects(env.addApp(helperOnly), (e) => code('blocked_by_policy')(e) && e.details.bundleId === helperOnly)
    assert.deepEqual(env.state().scope, [FIXTURE])
    assert.deepEqual(env.apps, [FIXTURE])
    await env.perform(click(100, 100))
    await logged(child, count + 3) // the refused scope, the click's hitTest and its input
    assert.deepEqual(inputs(child).at(-1).bundleId, FIXTURE, 'the helper kept its scope and still accepts the fixture')
  } finally {
    await env.close()
    await stopFake(child)
  }
  await assert.rejects(env.addApp(LEDGER), code('closed'))
})

test('addApp: two approvals at once each reach the helper, and the last scope names every app', async () => {
  // Notes is listed first, so it is the app on top where it overlaps the fixture's lower edge.
  const world = { ...WORLD, apps: [{ bundleId: NOTES, pid: 603, rect: { x: 0, y: 500, width: 400, height: 100 } }, ...WORLD.apps], frontmost: FIXTURE }
  const { env, child } = await launchOnFake(world)
  try {
    const [first, second] = await Promise.all([env.addApp(LEDGER), env.addApp(NOTES)])
    assert.deepEqual([first, second], [[FIXTURE, LEDGER], [FIXTURE, LEDGER, NOTES]])
    await logged(child, 5)
    assert.deepEqual(scopes(child).at(-1), [FIXTURE, LEDGER, NOTES])
    await env.perform(click(550, 300))
    await env.perform(click(100, 550))
    await logged(child, 9) // a hitTest and an input per click
    assert.equal(inputs(child).length, 2, 'both new apps accept input')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
