import assert from 'node:assert/strict'
import { test } from 'node:test'

import { frameFor } from '../../_environments_/chrome-browser/coords.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import { DRAG_HOLD_MS, DRAG_MAX_POINTS, historyDirection, planAction, planBatch, planKeypress, planType, WAIT_MAX_MS } from '../../_environments_/chrome-browser/input-plan.mjs'

const full = frameFor({ width: 1440, height: 900 }, 1)
const half = frameFor({ width: 1440, height: 900 }, 0.5)
const refusedWith = (code) => (error) => error instanceof EnvironmentError && error.code === code
const types = (steps) => steps.map((step) => step.params?.type ?? step.method ?? step.kind)

test('click: move, press, release at the scaled point with the left button by default', () => {
  const steps = planAction({ type: 'click', x: 60, y: 35 }, half)
  assert.deepEqual(types(steps), ['mouseMoved', 'mousePressed', 'mouseReleased'])
  assert.deepEqual([steps[1].params.x, steps[1].params.y], [120, 70])
  assert.equal(steps[1].params.button, 'left')
  assert.equal(steps[1].params.buttons, 1)
  assert.equal(steps[2].params.buttons, 0)
  assert.equal(steps[1].params.clickCount, 1)
})

test('click buttons map to CDP buttons, wheel meaning middle; unknown buttons are refused', () => {
  const button = (name) => planAction({ type: 'click', x: 1, y: 1, button: name }, full)[1].params
  assert.deepEqual([button('right').button, button('right').buttons], ['right', 2])
  assert.deepEqual([button('wheel').button, button('wheel').buttons], ['middle', 4])
  assert.deepEqual([button('back').button, button('back').buttons], ['back', 8])
  assert.deepEqual([button('forward').button, button('forward').buttons], ['forward', 16])
  assert.throws(() => button('thumb'), refusedWith('invalid_argument'))
})

test('held modifiers wrap the mouse action and are released in reverse order', () => {
  const steps = planAction({ type: 'click', x: 10, y: 10, keys: ['CTRL', 'SHIFT'] }, full)
  assert.deepEqual(types(steps), ['rawKeyDown', 'rawKeyDown', 'mouseMoved', 'mousePressed', 'mouseReleased', 'keyUp', 'keyUp'])
  assert.deepEqual(steps.slice(0, 2).map((s) => s.params.key), ['Control', 'Shift'])
  assert.deepEqual(steps.slice(5).map((s) => s.params.key), ['Shift', 'Control'])
  assert.equal(steps[3].params.modifiers, 2 | 8)
  assert.equal(steps.at(-1).params.modifiers, 0)
})

test('only modifiers can be held during mouse actions', () => {
  assert.throws(() => planAction({ type: 'click', x: 1, y: 1, keys: ['a'] }, full), refusedWith('invalid_argument'))
  assert.throws(() => planAction({ type: 'move', x: 1, y: 1, keys: 'SHIFT' }, full), refusedWith('invalid_argument'))
})

test('double_click sends click counts 1 then 2', () => {
  const steps = planAction({ type: 'double_click', x: 5, y: 5 }, full)
  assert.deepEqual(steps.filter((s) => s.params.type !== 'mouseMoved').map((s) => [s.params.type, s.params.clickCount]),
    [['mousePressed', 1], ['mouseReleased', 1], ['mousePressed', 2], ['mouseReleased', 2]])
})

test('drag: press at the first point, interpolated moves with the button held, release at the last', () => {
  const steps = planAction({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }, half)
  assert.equal(steps[0].params.type, 'mouseMoved')
  assert.equal(steps[1].params.type, 'mousePressed')
  assert.deepEqual(steps[2], { kind: 'sleep', ms: DRAG_HOLD_MS }, 'CU-197: the press is held before the first move, or Chrome never starts a drag of selected text')
  assert.ok(DRAG_HOLD_MS >= 200, 'measured: 100 ms delivered nothing, 200 ms delivered the text')
  const moves = steps.slice(3, -1)
  assert.ok(moves.length >= 4, 'a 100 px segment is split into steps of at most 25 px')
  assert.ok(moves.every((s) => s.params.type === 'mouseMoved' && s.params.buttons === 1))
  assert.deepEqual([moves.at(-1).params.x, moves.at(-1).params.y], [100, 0])
  assert.deepEqual([steps.at(-1).params.type, steps.at(-1).params.x], ['mouseReleased', 100])
})

test('drag paths need 2 to 100 in-frame points', () => {
  assert.throws(() => planAction({ type: 'drag', path: [{ x: 1, y: 1 }] }, full), refusedWith('invalid_argument'))
  const long = Array.from({ length: DRAG_MAX_POINTS + 1 }, (_, i) => ({ x: i, y: i }))
  assert.throws(() => planAction({ type: 'drag', path: long }, full), refusedWith('invalid_argument'))
  assert.throws(() => planAction({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 2000, y: 1 }] }, full), (e) => e.code === 'invalid_argument' && /path\[1\]/.test(e.message))
})

test('scroll moves to the point then wheels by the scaled deltas', () => {
  const steps = planAction({ type: 'scroll', x: 100, y: 100, scroll_x: 0, scroll_y: 150 }, half)
  assert.deepEqual(types(steps), ['mouseMoved', 'mouseWheel'])
  assert.deepEqual([steps[1].params.x, steps[1].params.y, steps[1].params.deltaX, steps[1].params.deltaY], [200, 200, 0, 300])
})

test('keypress of a chord: modifiers down, key down without text, key up, modifiers up', () => {
  const steps = planKeypress({ keys: ['CTRL', 'SHIFT', 'K'] })
  assert.deepEqual(steps.map((s) => [s.params.type, s.params.key]), [
    ['rawKeyDown', 'Control'], ['rawKeyDown', 'Shift'], ['rawKeyDown', 'K'], ['keyUp', 'K'], ['keyUp', 'Shift'], ['keyUp', 'Control'],
  ])
  assert.equal(steps[2].params.text, undefined, 'a chord with Control types nothing')
  assert.equal(steps[2].params.modifiers, 2 | 8)
})

test('keypress of a plain or shifted key produces text', () => {
  const enter = planKeypress({ keys: ['ENTER'] })
  assert.deepEqual(enter.map((s) => s.params.type), ['keyDown', 'keyUp'])
  assert.equal(enter[0].params.text, '\r')
  const bang = planKeypress({ keys: ['SHIFT', '1'] })
  assert.equal(bang[1].params.key, '!')
  assert.equal(bang[1].params.text, '!')
  assert.equal(planKeypress({ keys: ['A'] })[0].params.text, 'a', 'letters are upper case only with Shift')
})

test('select-all carries the macOS editing command for both CTRL and CMD', () => {
  for (const modifier of ['CTRL', 'CMD']) {
    const down = planKeypress({ keys: [modifier, 'A'] }).find((s) => s.params.key === 'a' && s.params.type === 'rawKeyDown')
    assert.deepEqual(down.params.commands, ['selectAll'], modifier)
  }
})

test('browser shortcuts become navigation steps, clipboard chords clipboard steps; window shortcuts are refused', () => {
  assert.deepEqual(planKeypress({ keys: ['ALT', 'LEFT'] }), [{ kind: 'navigate', direction: 'back' }])
  assert.deepEqual(planKeypress({ keys: ['F5'] }), [{ kind: 'navigate', direction: 'reload' }])
  assert.deepEqual(planKeypress({ keys: ['CTRL', 'C'] }), [{ kind: 'clipboard', op: 'copy' }])
  assert.deepEqual(planKeypress({ keys: ['CMD', 'X'] }), [{ kind: 'clipboard', op: 'cut' }])
  assert.deepEqual(planKeypress({ keys: ['META', 'V'], repeat: 2 }), [{ kind: 'clipboard', op: 'paste' }, { kind: 'clipboard', op: 'paste' }])
  assert.throws(() => planKeypress({ keys: ['CTRL', 'C', 'V'] }), refusedWith('unsupported_action'))
  assert.throws(() => planKeypress({ keys: ['CMD', 'T'] }), refusedWith('unsupported_action'))
  assert.throws(() => planKeypress({ keys: [] }), refusedWith('invalid_argument'))
  assert.throws(() => planKeypress({ keys: ['HYPER'] }), refusedWith('invalid_argument'))
})

test('type: keyboard characters as key events, newline as Enter, the rest as insertText runs', () => {
  const steps = planType({ text: 'Hi é!\r\nok' })
  const summary = steps.map((s) => (s.method === 'Input.insertText' ? `insert:${s.params.text}` : `${s.params.type}:${s.params.key}`))
  assert.deepEqual(summary, [
    'keyDown:H', 'keyUp:H', 'keyDown:i', 'keyUp:i', 'keyDown: ', 'keyUp: ', 'insert:é', 'keyDown:!', 'keyUp:!',
    'keyDown:Enter', 'keyUp:Enter', 'keyDown:o', 'keyUp:o', 'keyDown:k', 'keyUp:k',
  ])
  assert.equal(steps[0].params.text, 'H')
  assert.equal(steps.at(-1).params.text, undefined, 'keyUp carries no text')
  assert.deepEqual(planType({ text: '' }), [])
  assert.throws(() => planType({ text: 5 }), refusedWith('invalid_argument'))
})

test('wait uses duration_ms, default 1 s, range 0 to 10 s (action-schema); screenshot is a single step', () => {
  assert.deepEqual(planAction({ type: 'wait' }, full), [{ kind: 'sleep', ms: 1000 }])
  assert.equal(WAIT_MAX_MS, 10_000)
  assert.deepEqual(planAction({ type: 'wait', duration_ms: 0 }, full), [{ kind: 'sleep', ms: 0 }])
  assert.deepEqual(planAction({ type: 'wait', duration_ms: WAIT_MAX_MS }, full), [{ kind: 'sleep', ms: WAIT_MAX_MS }])
  assert.throws(() => planAction({ type: 'wait', duration_ms: WAIT_MAX_MS + 1 }, full), refusedWith('invalid_argument'))
  assert.throws(() => planAction({ type: 'wait', duration_ms: -5 }, full), refusedWith('invalid_argument'))
  assert.deepEqual(planAction({ type: 'screenshot' }, full), [{ kind: 'screenshot' }])
})

test('triple_click sends click counts 1, 2 and 3 with the left button', () => {
  const presses = planAction({ type: 'triple_click', x: 5, y: 5 }, full).filter((s) => s.params.type === 'mousePressed')
  assert.deepEqual(presses.map((s) => [s.params.button, s.params.clickCount]), [['left', 1], ['left', 2], ['left', 3]])
})

test('keypress repeat replays the whole chord, 1 to 100 times', () => {
  const once = planKeypress({ keys: ['TAB'] })
  assert.deepEqual(planKeypress({ keys: ['TAB'], repeat: 3 }), [...once, ...once, ...once])
  for (const bad of [0, 101, 1.5, '2']) {
    assert.throws(() => planKeypress({ keys: ['TAB'], repeat: bad }), refusedWith('invalid_argument'), String(bad))
  }
})

test('zoom plans a viewport-resolution clip; navigate needs an absolute http(s) url', () => {
  assert.deepEqual(planAction({ type: 'zoom', region: [50, 25, 70, 45] }, half),
    [{ kind: 'zoom', region: [50, 25, 70, 45], clip: { x: 100, y: 50, width: 40, height: 40, scale: 1 } }])
  assert.throws(() => planAction({ type: 'zoom', region: [0, 0, 9999, 10] }, half), refusedWith('invalid_argument'))
  assert.deepEqual(planAction({ type: 'navigate', url: 'https://example.com/a?b=1' }, full), [{ kind: 'navigate', url: 'https://example.com/a?b=1' }])
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', '/relative', 'chrome://settings', undefined]) {
    assert.throws(() => planAction({ type: 'navigate', url }, full), refusedWith('invalid_argument'), String(url))
  }
})

test('unsupported action types are refused by name', () => {
  assert.throws(() => planAction({ type: 'cursor_position' }, full), (e) => e.code === 'unsupported_action' && /cursor_position/.test(e.message))
  assert.throws(() => planAction(null, full), refusedWith('invalid_argument'))
})

test('a batch with one bad action is refused whole, naming its index', () => {
  const batch = [{ type: 'click', x: 10, y: 10 }, { type: 'type', text: 'ok' }, { type: 'click', x: 99999, y: 1 }]
  assert.throws(() => planBatch(batch, full), (e) => e.code === 'invalid_argument' && e.details.index === 2)
  assert.equal(planBatch(batch.slice(0, 2), full).length, 2)
  assert.throws(() => planBatch([], full), refusedWith('invalid_argument'))
})

test('no key combination ever plans a native copy, cut or paste command (D-011)', () => {
  const modifierSets = [[], ['CTRL'], ['CMD'], ['SHIFT'], ['ALT'], ['CTRL', 'SHIFT'], ['CMD', 'SHIFT'], ['CTRL', 'ALT'], ['CMD', 'ALT', 'SHIFT']]
  const keys = [...'abcdefghijklmnopqrstuvwxyz0123456789[]', 'ENTER', 'TAB', 'BACKSPACE', 'DELETE', 'INSERT', 'F5', 'LEFT', 'RIGHT']
  const allowedCommands = new Set(['selectAll', 'undo', 'redo'])
  let planned = 0
  for (const modifiers of modifierSets) {
    for (const key of keys) {
      let steps
      try {
        steps = planKeypress({ keys: [...modifiers, key] })
      } catch (error) {
        assert.equal(error.code, 'unsupported_action', `${[...modifiers, key]}`)
        continue
      }
      planned += 1
      for (const step of steps) {
        for (const command of step.params?.commands ?? []) assert.ok(allowedCommands.has(command), `${[...modifiers, key]} -> ${command}`)
        // Control or Meta without Alt on C, X or V is the copy, cut and paste chord on every platform.
        const mods = step.params?.modifiers ?? 0
        const clipboardChord = (mods & (2 | 4)) !== 0 && (mods & 1) === 0 && ['c', 'x', 'v', 'C', 'X', 'V'].includes(step.params?.key)
        if (clipboardChord) assert.fail(`${[...modifiers, key]} dispatches a native clipboard chord`)
      }
      const onlyAccel = modifiers.some((m) => m === 'CTRL' || m === 'CMD') && !modifiers.includes('ALT')
      if (onlyAccel && 'cxv'.includes(key)) assert.equal(steps[0].kind, 'clipboard', `${[...modifiers, key]}`)
    }
  }
  assert.ok(planned > 300, `only ${planned} combinations planned`)
})

test('CU-149: the browser type refuses control characters other than tab and newline, naming the code point', () => {
  for (const [char, codePoint] of [['\u0003', 'U+0003'], ['\u001b', 'U+001B'], ['\b', 'U+0008'], ['\u007f', 'U+007F'], ['\u2028', 'U+2028']]) {
    assert.throws(() => planType({ text: `ok${char}` }), (e) => e.code === 'invalid_argument' && e.details?.codePoint === codePoint, codePoint)
  }
  assert.ok(planType({ text: 'a\tb\nc\rd' }).length > 0, 'tab, LF and CR stay (sent as keys)')
})

test('CU-153: historyDirection names the history move of exactly the chords planKeypress performs as navigations', () => {
  const cases = [[['F5'], 'reload'], [['META', 'R'], 'reload'], [['CTRL', 'R'], 'reload'], [['ALT', 'ARROWLEFT'], 'back'], [['META', '['], 'back'], [['META', ']'], 'forward'], [['ALT', 'ARROWRIGHT'], 'forward'],
    [['R'], null], [['META', 'C'], null], [['META', 'ALT', 'ARROWLEFT'], null], [['ARROWLEFT'], null], [[], null], [['NOT_A_KEY'], null]]
  for (const [keys, expected] of cases) assert.equal(historyDirection(keys), expected, keys.join('+'))
  for (const [keys, expected] of cases.filter(([, move]) => move !== null)) {
    assert.deepEqual(planKeypress({ keys }), [{ kind: 'navigate', direction: expected }], `${keys.join('+')} is performed as that navigation`)
  }
})
