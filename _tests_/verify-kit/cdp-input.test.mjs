import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { describeKey, executeAction, inputEvents, MODIFIER_BITS, modifierMask } from '../../_tools_/verify-kit/cdp-input.mjs'

const types = (events) => events.map(([method, params]) => `${method.split('.')[1]}:${params.type}`)

describe('keys', () => {
  test('canonical names and aliases map to DOM keys', () => {
    assert.deepEqual(describeKey('enter'), { canonical: 'ENTER', key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' })
    assert.equal(describeKey('RETURN').canonical, 'ENTER')
    assert.equal(describeKey('cmd').canonical, 'META')
    assert.equal(describeKey('Page_Down').key, 'PageDown')
    assert.equal(describeKey('F12').keyCode, 123)
    assert.deepEqual(describeKey(' '), describeKey('SPACE'))
  })

  test('single characters map to their key and code', () => {
    assert.deepEqual(describeKey('S'), { canonical: 'S', key: 's', code: 'KeyS', keyCode: 83, text: 's' })
    assert.deepEqual(describeKey('7'), { canonical: '7', key: '7', code: 'Digit7', keyCode: 55, text: '7' })
    assert.equal(describeKey('/').key, '/')
  })

  test('an unknown key name is refused by name, never guessed', () => {
    assert.throws(() => describeKey('HYPER'), /unsupported key "HYPER"/)
  })

  test('modifier masks combine the CDP bits', () => {
    assert.equal(modifierMask(['CTRL', 'shift']), MODIFIER_BITS.CTRL | MODIFIER_BITS.SHIFT)
    assert.equal(modifierMask(['A']), 0)
    assert.equal(modifierMask(), 0)
  })
})

describe('mouse actions', () => {
  test('click moves, presses and releases at rounded coordinates with the button', () => {
    const events = inputEvents({ type: 'click', x: 405.4, y: 156.6, button: 'right', keys: ['SHIFT'] })
    assert.deepEqual(types(events), ['dispatchMouseEvent:mouseMoved', 'dispatchMouseEvent:mousePressed', 'dispatchMouseEvent:mouseReleased'])
    assert.deepEqual(events[1][1], { type: 'mousePressed', x: 405, y: 157, modifiers: MODIFIER_BITS.SHIFT, button: 'right', buttons: 2, clickCount: 1 })
  })

  test('wheel is the CDP middle button; unknown buttons are refused', () => {
    assert.equal(inputEvents({ type: 'click', x: 1, y: 1, button: 'wheel' })[1][1].button, 'middle')
    assert.throws(() => inputEvents({ type: 'click', x: 1, y: 1, button: 'thumb' }), /unsupported button/)
  })

  test('double_click sends click counts 1 then 2', () => {
    const events = inputEvents({ type: 'double_click', x: 10, y: 20 })
    assert.deepEqual(events.filter(([, p]) => p.type === 'mousePressed').map(([, p]) => p.clickCount), [1, 2])
  })

  test('drag presses at the first point, moves with the button held and releases at the last', () => {
    const events = inputEvents({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 9 }] })
    assert.deepEqual(types(events), ['dispatchMouseEvent:mouseMoved', 'dispatchMouseEvent:mousePressed', 'dispatchMouseEvent:mouseMoved', 'dispatchMouseEvent:mouseMoved', 'dispatchMouseEvent:mouseReleased'])
    assert.equal(events[2][1].buttons, 1)
    assert.deepEqual([events[4][1].x, events[4][1].y], [9, 9])
    assert.throws(() => inputEvents({ type: 'drag', path: [{ x: 1, y: 1 }] }), /at least two points/)
  })

  test('scroll sends a wheel event with the deltas', () => {
    const events = inputEvents({ type: 'scroll', x: 500, y: 300, scroll_x: -10, scroll_y: 120 })
    assert.deepEqual(events[1][1], { type: 'mouseWheel', x: 500, y: 300, modifiers: 0, deltaX: -10, deltaY: 120 })
    assert.throws(() => inputEvents({ type: 'scroll', x: 1, y: 1 }), /scroll_x and scroll_y/)
  })

  test('non-finite coordinates are refused', () => {
    assert.throws(() => inputEvents({ type: 'move', x: NaN, y: 1 }), /finite/)
    assert.throws(() => inputEvents({ type: 'click', x: '5', y: 1 }), /finite/)
  })
})

describe('keyboard actions', () => {
  test('a chord presses in order, releases in reverse, and a shortcut carries no text', () => {
    const events = inputEvents({ type: 'keypress', keys: ['CTRL', 'S'] })
    assert.deepEqual(events.map(([, p]) => `${p.type}:${p.key}:${p.modifiers}`), ['rawKeyDown:Control:2', 'rawKeyDown:s:2', 'keyUp:s:2', 'keyUp:Control:2'])
    assert.equal(events[1][1].text, undefined)
  })

  test('a plain key carries its text, and repeat repeats the chord', () => {
    const events = inputEvents({ type: 'keypress', keys: ['ENTER'], repeat: 3 })
    assert.equal(events.length, 6)
    assert.equal(events[0][1].text, '\r')
    assert.throws(() => inputEvents({ type: 'keypress', keys: ['A'], repeat: 101 }), /repeat/)
    assert.throws(() => inputEvents({ type: 'keypress', keys: [] }), /non-empty/)
  })

  test('type sends each character with its text, Shift for capitals, Enter for a newline', () => {
    const events = inputEvents({ type: 'type', text: 'Ab\n' })
    const downs = events.filter(([, p]) => p.type === 'keyDown')
    assert.deepEqual(downs.map(([, p]) => [p.key, p.text, p.modifiers]), [['A', 'A', MODIFIER_BITS.SHIFT], ['b', 'b', 0], ['Enter', '\r', 0]])
    assert.throws(() => inputEvents({ type: 'type', text: '' }), /non-empty/)
  })
})

describe('other actions', () => {
  test('wait and screenshot send nothing; an unknown action is refused by name', () => {
    assert.deepEqual(inputEvents({ type: 'wait' }), [])
    assert.deepEqual(inputEvents({ type: 'screenshot' }), [])
    assert.throws(() => inputEvents({ type: 'hold_key' }), /unsupported action "hold_key"/)
  })

  test('executeAction sends every event in order and sleeps for wait', async () => {
    const sent = []
    await executeAction(async (method, params) => sent.push([method, params.type]), { type: 'click', x: 1, y: 2 })
    assert.deepEqual(sent.map(([, type]) => type), ['mouseMoved', 'mousePressed', 'mouseReleased'])
    const started = Date.now()
    await executeAction(async () => sent.push('x'), { type: 'wait', duration_ms: 50 })
    assert.ok(Date.now() - started >= 45)
    assert.equal(sent.length, 3)
  })
})
