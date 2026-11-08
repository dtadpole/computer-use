import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { DRAG_MAX_POINTS, KEYPRESS_MAX_REPEAT, NAVIGATE_REFUSAL } from '../../_environments_/macos-desktop/input-plan.mjs'
import { fakeLauncher, logged, pause, scratchLocks, stopFake } from './harness.mjs'

/**
 * `env.planBatch(actions)`: the whole batch planned as `perform` plans each action, with nothing sent to the helper,
 * so one refused action refuses the batch before any of it runs (R15, R19) - and with exactly the error `perform`
 * would give for it.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { frame: { maxLongEdge: 2576, maxTiles: 4784, tileSize: 28 } })

/**
 * Every action `perform` refuses while planning, before any helper request: the parity table. Copy, cut and paste
 * chords left it with D-031: they plan like any other chord.
 */
const REFUSED = [
  ['a character with no macOS key code', { type: 'keypress', keys: ['é'] }],
  ['an unknown key name', { type: 'keypress', keys: ['F13'] }],
  ['drag over the point cap', { type: 'drag', path: Array.from({ length: DRAG_MAX_POINTS + 1 }, (_, i) => ({ x: i, y: 1 })) }],
  ['drag of one point', { type: 'drag', path: [{ x: 1, y: 1 }] }],
  ['keypress repeat over its cap', { type: 'keypress', keys: ['ENTER'], repeat: KEYPRESS_MAX_REPEAT + 1 }],
  ['keypress repeat of zero', { type: 'keypress', keys: ['ENTER'], repeat: 0 }],
  ['navigate', { type: 'navigate', url: 'https://example.com/' }],
  ['an unknown action', { type: 'hover', x: 1, y: 1 }],
  ['a point outside the frame', { type: 'click', x: 800, y: 0, button: 'left' }],
  ['an unknown button', { type: 'click', x: 1, y: 1, button: 'thumb' }],
  ['a non-modifier held during a click', { type: 'click', x: 1, y: 1, keys: ['A'] }],
  ['empty text', { type: 'type', text: '' }],
  ['a wait over its cap', { type: 'wait', duration_ms: 60_000 }],
  ['a zoom outside the frame', { type: 'zoom', region: [0, 0, 900, 100] }],
  ['not an object', null],
]

const withoutIndex = ({ index, ...rest } = {}) => rest

test('D-031: [click, META+C] plans fully with zero refusals, and planning sends nothing', async () => {
  const { env, child } = await launchOnFake()
  try {
    await logged(child, 3)
    const before = child.requests.length
    const batch = [{ type: 'click', x: 10, y: 10, button: 'left' }, { type: 'keypress', keys: ['META', 'C'] }]
    assert.deepEqual(env.planBatch(batch), { ok: true, steps: [3, 4] }, 'Command down, C down, C up, Command up')
    for (const keys of [['ctrl', 'x'], ['cmd', 'shift', 'v'], ['CTRL', 'V']]) {
      assert.equal(env.planBatch([{ type: 'keypress', keys }]).ok, true, keys.join('+'))
    }
    await pause(30)
    assert.equal(child.requests.length, before, 'planning sends nothing')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('[click, F13] is refused naming the key, and nothing at all reaches the helper', async () => {
  const { env, child } = await launchOnFake()
  try {
    await logged(child, 3)
    const before = child.requests.length
    let error = null
    try {
      env.planBatch([{ type: 'click', x: 10, y: 10, button: 'left' }, { type: 'keypress', keys: ['F13'] }])
    } catch (caught) {
      error = caught
    }
    assert.equal(code('invalid_argument')(error), true, String(error))
    assert.match(error.message, /F13/)
    assert.deepEqual(error.details, { index: 1 })
    await pause(30)
    assert.equal(child.requests.length, before, 'zero requests: not even the valid click was sent')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('a valid batch returns ok with the helper events per action; local actions count 0', async () => {
  const { env, child } = await launchOnFake()
  try {
    await logged(child, 3)
    const before = child.requests.length
    const batch = [
      { type: 'click', x: 10, y: 10, button: 'left' },
      { type: 'double_click', x: 10, y: 10 },
      { type: 'keypress', keys: ['cmd', 'a'] },
      { type: 'type', text: 'hi\n' },
      { type: 'wait', duration_ms: 1 },
      { type: 'screenshot' },
      { type: 'zoom', region: [0, 0, 100, 100] },
      { type: 'cursor_position' },
    ]
    const answer = env.planBatch(batch)
    assert.deepEqual(answer, { ok: true, steps: [3, 5, 4, 3, 0, 0, 0, 0] })
    assert.deepEqual(await env.planBatch(batch), answer, 'safe to await')
    await pause(30)
    assert.equal(child.requests.length, before, 'planning sends nothing')
    assert.throws(() => env.planBatch([]), code('invalid_argument'))
    assert.throws(() => env.planBatch('click'), code('invalid_argument'))
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('parity: every refusal perform gives at plan time, planBatch gives too - same code, message and details', async () => {
  const { env, child } = await launchOnFake()
  try {
    for (const [label, action] of REFUSED) {
      let byPerform = null
      try {
        await env.perform(action)
      } catch (error) {
        byPerform = error
      }
      assert.ok(byPerform instanceof EnvironmentError, `${label}: perform refuses`)
      let byPlan = null
      try {
        env.planBatch([{ type: 'move', x: 1, y: 1 }, action])
      } catch (error) {
        byPlan = error
      }
      assert.ok(byPlan instanceof EnvironmentError, `${label}: planBatch refuses`)
      assert.deepEqual([byPlan.code, byPlan.message, withoutIndex(byPlan.details)], [byPerform.code, byPerform.message, withoutIndex(byPerform.details)], label)
      assert.equal(byPlan.details.index, 1, `${label}: the refused action is named by index`)
    }
    let navigate = null
    try { env.planBatch([{ type: 'navigate', url: 'https://example.com/' }]) } catch (error) { navigate = error }
    assert.deepEqual([navigate.code, navigate.message], ['unsupported_action', NAVIGATE_REFUSAL])
    await pause(30)
    assert.equal(child.requests.filter((r) => r.type === 'input').length, 0, 'no refusal, by either path, sent input')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('planBatch needs only the frame: it answers with the helper gone, and refuses only once the environment is closed', async () => {
  const { env, child } = await launchOnFake({ quirks: { exitOn: 'input' } })
  await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('helper_lost'))
  assert.deepEqual(env.planBatch([{ type: 'move', x: 1, y: 1 }]), { ok: true, steps: [1] })
  assert.deepEqual(env.planBatch([{ type: 'keypress', keys: ['META', 'V'] }]), { ok: true, steps: [4] }, 'a paste chord plans (D-031)')
  assert.throws(() => env.planBatch([{ type: 'navigate', url: 'https://example.com/' }]), code('unsupported_action'))
  await env.close()
  assert.throws(() => env.planBatch([{ type: 'move', x: 1, y: 1 }]), code('closed'))
  await stopFake(child)
})

test('planBatch maps at the frame\'s own scale: a point valid on a Retina frame is refused past its pixel size', async () => {
  const config = {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }],
    apps: [{ bundleId: 'com.example.fixture', pid: 501, rect: { x: 0, y: 0, width: 400, height: 300 } }],
  }
  const { env, child } = await launchOnFake(config)
  try {
    assert.deepEqual(env.planBatch([{ type: 'click', x: 799, y: 599, button: 'left' }]), { ok: true, steps: [3] })
    assert.throws(() => env.planBatch([{ type: 'click', x: 800, y: 10, button: 'left' }]), (e) => code('invalid_argument')(e) && e.details.index === 0)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('pid mode is keyboard-only (Q-D3, design 0.4.5): pointer actions are refused by name in perform and planBatch, nothing sent', async () => {
  const { POINTER_ACTION_TYPES, PID_POINTER_REFUSAL } = await import('../../_environments_/macos-desktop/input-plan.mjs')
  assert.deepEqual(POINTER_ACTION_TYPES, ['click', 'double_click', 'triple_click', 'move', 'drag', 'scroll'])
  const { env, child } = await launchOnFake({}, { mode: 'pid' })
  try {
    const before = child.requests.filter((r) => r.type === 'input').length
    const pointer = [
      { type: 'click', x: 5, y: 5, button: 'left' }, { type: 'double_click', x: 5, y: 5 }, { type: 'triple_click', x: 5, y: 5 },
      { type: 'move', x: 5, y: 5 }, { type: 'drag', path: [{ x: 5, y: 5 }, { x: 9, y: 9 }] }, { type: 'scroll', x: 5, y: 5, scroll_x: 0, scroll_y: 3 },
    ]
    for (const action of pointer) {
      assert.throws(() => env.planBatch([{ type: 'keypress', keys: ['a'] }, action]), (e) => e.code === 'unsupported_action' && e.message === PID_POINTER_REFUSAL && e.details.index === 1 && e.details.action === action.type)
      await assert.rejects(env.perform(action), (e) => e.code === 'unsupported_action' && e.message === PID_POINTER_REFUSAL)
    }
    assert.equal(child.requests.filter((r) => r.type === 'input').length, before, 'no pointer input reached the helper')
    // Keys and text still go by pid.
    assert.deepEqual(env.planBatch([{ type: 'keypress', keys: ['a'] }, { type: 'type', text: 'hi' }]).ok, true)
    await env.perform({ type: 'keypress', keys: ['a'] })
    // Wait for this keypress's own input line (the log can lag the reply), not for any one request.
    for (const deadline = Date.now() + 2_000; child.requests.filter((r) => r.type === 'input').length <= before && Date.now() < deadline;) await pause(10)
    const sent = child.requests.filter((r) => r.type === 'input').at(-1)
    assert.equal(sent.mode, 'pid')
    // Defense in depth: the helper (and so the fake) refuses pointer events by pid even if a driver sent them.
    const raw = await env.link.request('input', { events: [{ kind: 'move', x: 5, y: 5, flags: 0 }], mode: 'pid', bundleId: env.state().scope[0] })
      .then((reply) => ({ reply }), (error) => ({ error }))
    assert.equal(raw.error?.code ?? raw.reply?.code, 'invalid_argument', 'a pointer event by pid is refused, never posted')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-149: [click, type with U+0003] is refused naming the code point, and nothing at all reaches the helper', async () => {
  const { env, child } = await launchOnFake()
  try {
    await logged(child, 3)
    const before = child.requests.length
    let error = null
    try {
      env.planBatch([{ type: 'click', x: 10, y: 10, button: 'left' }, { type: 'type', text: 'send\u0003' }])
    } catch (caught) {
      error = caught
    }
    assert.equal(code('invalid_argument')(error), true, String(error))
    assert.match(error.message, /U\+0003/)
    assert.equal(error.details?.index, 1)
    await pause(30)
    assert.equal(child.requests.length, before, 'zero requests: not even the valid click was sent')
  } finally {
    await env.close()
    await stopFake(child)
  }
})
