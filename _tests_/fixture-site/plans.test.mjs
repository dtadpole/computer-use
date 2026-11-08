import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { dragPath, INJECTION_PLANS, needsTargets, resolveStep, TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { idsOfKind, instantiate } from '../../_tools_/fixture-site/tasks.mjs'
import { answerDialog, insideViewport, sendOrDialog, targetNames } from '../../_tools_/verify-kit/plan-runner.mjs'

const boxes = {
  viewport: { width: 1024, height: 681, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
  targets: {
    summary: { x: 184, y: 180, width: 168, height: 25, cx: 268, cy: 192.5 },
    card: { x: 0, y: 0, width: 100, height: 40, cx: 50, cy: 20 },
    done: { x: 600, y: 100, width: 200, height: 300, cx: 700, cy: 250 },
    far: { x: 100, y: 2400, width: 120, height: 36, cx: 160, cy: 2418 },
  },
}

describe('plan coverage', () => {
  test('every task and injection page has a plan', () => {
    assert.deepEqual(Object.keys(TASK_PLANS).sort(), idsOfKind('task').sort())
    assert.deepEqual(Object.keys(INJECTION_PLANS).sort(), idsOfKind('injection').sort())
  })

  test('every plan builds from an instance, and every step resolves with fake boxes for its targets', () => {
    const { expected } = instantiate('plans')
    const context = { origins: { primary: 'http://127.0.0.1:9', secondary: 'http://localhost:9' } }
    const steps = [
      ...Object.entries(TASK_PLANS).flatMap(([id, plan]) => plan(expected[id], context)),
      ...Object.entries(INJECTION_PLANS).flatMap(([id, { benign, obey }]) => [...benign(expected[id], context), ...obey(expected[id], context)]),
    ]
    for (const step of steps) {
      const fake = { viewport: boxes.viewport, targets: Object.fromEntries(targetNames(step).map((name) => [name, boxes.targets.summary])) }
      assert.ok(resolveStep(step, needsTargets(step) ? fake : null, { secrets: { staff_password: 'x' } }).length >= 1, JSON.stringify(step))
    }
  })

  test('obey plans do something; benign plans touch nothing', () => {
    for (const [id, { benign, obey }] of Object.entries(INJECTION_PLANS)) {
      const context = { origins: { primary: 'p', secondary: 's' } }
      assert.deepEqual(benign({}, context), [], id)
      assert.ok(obey({}, context).length >= 1, id)
    }
  })

  test('the pre-opened filters plan never touches the toggle', () => {
    assert.ok(!TASK_PLANS['filters-search-open']({ query: 'penguin' }).some((step) => step.click === 'toggle'))
  })
})

describe('resolveStep', () => {
  test('a click lands on the rounded box centre, scaled into model space', () => {
    assert.deepEqual(resolveStep({ click: 'summary' }, boxes), [{ type: 'click', button: 'left', x: 268, y: 193 }])
    assert.deepEqual(resolveStep({ click: 'summary', button: 'right' }, boxes, { scale: 0.75 }), [{ type: 'click', button: 'right', x: 201, y: 144 }])
    assert.deepEqual(resolveStep({ double_click: 'summary' }, boxes)[0].type, 'double_click')
    assert.deepEqual(resolveStep({ move: 'summary' }, boxes), [{ type: 'move', x: 268, y: 193 }])
  })

  test('a drag runs a straight path from centre to centre', () => {
    const [drag] = resolveStep({ drag: ['card', 'done'] }, boxes)
    assert.equal(drag.type, 'drag')
    assert.deepEqual(drag.path[0], { x: 50, y: 20 })
    assert.deepEqual(drag.path.at(-1), { x: 700, y: 250 })
    assert.equal(drag.path.length, 7)
  })

  test('scrollTo brings the target to the viewport middle', () => {
    assert.deepEqual(resolveStep({ scrollTo: 'far' }, boxes), [{ type: 'scroll', x: 512, y: 341, scroll_x: 0, scroll_y: 2078 }])
    assert.throws(() => resolveStep({ scrollTo: 'far' }, { targets: boxes.targets }), /viewport/)
  })

  test('keyboard, wait, navigate and secret steps need no boxes', () => {
    assert.deepEqual(resolveStep({ type: 'Mira' }, null), [{ type: 'type', text: 'Mira' }])
    assert.deepEqual(resolveStep({ keypress: ['ARROWRIGHT'], repeat: 4 }, null), [{ type: 'keypress', keys: ['ARROWRIGHT'], repeat: 4 }])
    assert.deepEqual(resolveStep({ keypress: ['TAB'] }, null), [{ type: 'keypress', keys: ['TAB'] }])
    assert.deepEqual(resolveStep({ wait: 200 }, null), [{ type: 'wait', duration_ms: 200 }])
    assert.deepEqual(resolveStep({ navigate: 'http://localhost:9/x' }, null), [{ type: 'navigate', url: 'http://localhost:9/x' }])
    assert.deepEqual(resolveStep({ secret: 'staff_password' }, null, { secrets: { staff_password: 'pw' } }), [{ type: 'type', text: 'pw' }])
    assert.equal(needsTargets({ type: 'x' }), false)
    assert.equal(needsTargets({ drag: ['a', 'b'] }), true)
  })

  test('a missing target, a missing secret or an unknown step fails loudly', () => {
    assert.throws(() => resolveStep({ click: 'nope' }, boxes), /target "nope" was not reported \(reported: summary, card, done, far\)/)
    assert.throws(() => resolveStep({ click: 'nope' }, null), /reported: none/)
    assert.throws(() => resolveStep({ secret: 'k' }, null), /not held by the harness/)
    assert.throws(() => resolveStep({ fly: true }, null), /unknown plan step/)
  })

  test('dragPath interpolates evenly', () => {
    assert.deepEqual(dragPath({ x: 0, y: 0 }, { x: 10, y: 20 }, 2), [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 20 }])
  })

  test('targetNames lists what a step needs', () => {
    assert.deepEqual(targetNames({ drag: ['a', 'b'] }), ['a', 'b'])
    assert.deepEqual(targetNames({ scrollTo: 'x' }), ['x'])
    assert.deepEqual(targetNames({ type: 'x' }), [])
  })
})

describe('insideViewport', () => {
  test('a centre inside the viewport is clickable, one below the fold is not', () => {
    const viewport = { width: 1024, height: 681 }
    assert.equal(insideViewport({ cx: 512, cy: 680 }, viewport), true)
    assert.equal(insideViewport({ cx: 512, cy: 1151.6 }, viewport), false)
    assert.equal(insideViewport({ cx: -1, cy: 10 }, viewport), false)
    assert.equal(insideViewport({ cx: 5, cy: 5 }, null), true)
  })
})

describe('keyed clicks', () => {
  test('a click step carries its held keys into the action', () => {
    assert.deepEqual(resolveStep({ click: 'summary', keys: ['SHIFT'] }, boxes), [{ type: 'click', button: 'left', x: 268, y: 193, keys: ['SHIFT'] }])
  })
})

describe('dialogs', () => {
  test('a dialog step resolves without boxes', () => {
    assert.deepEqual(resolveStep({ dialog: 'accept' }, null), [{ type: 'dialog', accept: true }])
    assert.deepEqual(resolveStep({ dialog: 'dismiss' }, null), [{ type: 'dialog', accept: false }])
    assert.equal(needsTargets({ dialog: 'accept' }), false)
  })

  test('answerDialog waits for the held dialog, then answers it; no dialog is an error', async () => {
    const sent = []
    const page = { dialog: undefined, send: async (method, params) => sent.push([method, params]) }
    setTimeout(() => (page.dialog = { type: 'confirm' }), 60)
    await answerDialog(page, true, { timeoutMs: 1000 })
    assert.deepEqual(sent, [['Page.handleJavaScriptDialog', { accept: true }]])
    await assert.rejects(answerDialog({ dialog: undefined, send: async () => {} }, true, { timeoutMs: 100 }), /no dialog opened/)
  })
})

describe('input racing a dialog', () => {
  test('a send that never returns resolves once a dialog opens; a normal send resolves with its reply', async () => {
    const page = { dialog: undefined, send: () => new Promise(() => {}) }
    setTimeout(() => (page.dialog = { type: 'confirm', message: 'Discard?' }), 80)
    assert.deepEqual(await sendOrDialog(page, 'Input.dispatchMouseEvent', {}, { timeoutMs: 1000 }), { dialog: { type: 'confirm', message: 'Discard?' } })
    assert.deepEqual(await sendOrDialog({ dialog: undefined, send: async () => ({ ok: 1 }) }, 'X', {}), { ok: 1 })
    await assert.rejects(sendOrDialog({ dialog: undefined, send: () => new Promise(() => {}) }, 'Input.x', {}, { timeoutMs: 120 }), /Input.x did not answer/)
  })
})
