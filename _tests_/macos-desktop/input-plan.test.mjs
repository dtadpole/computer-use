import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EXTENSION_ACTIONS, GA_ACTIONS } from '../../_tools_/agent-core/lib.mjs'
import { frameFor } from '../../_environments_/macos-desktop/coords.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { ACTION_TYPES, DRAG_START_PT, DRAG_STEP_PT, NAVIGATE_REFUSAL, TEXT_CHUNK_UNITS, WAIT_DEFAULT_MS, inputPoints, planAction, planBatch } from '../../_environments_/macos-desktop/input-plan.mjs'
import { MODIFIER_FLAGS, NAMED_KEY_CODES } from '../../_environments_/macos-desktop/keys.mjs'

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
/** Scale 1, display at the origin: frame pixels are global points. */
const flat = frameFor({ originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }, 1)
/** Scale 2, a display to the right of the main one, captured at its Retina size. */
const retina = frameFor({ originPt: { x: 800, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }, 2)
const kinds = (plan) => plan.input.map((event) => event.kind)

test('the desktop plans exactly the GA actions and triple_click, zoom, cursor_position; navigate is refused by name', () => {
  const expected = [...GA_ACTIONS, ...EXTENSION_ACTIONS.filter((type) => type !== 'navigate')].sort()
  assert.deepEqual([...ACTION_TYPES].sort(), expected)
  assert.throws(() => planAction({ type: 'navigate', url: 'https://example.com/' }, flat), (error) => code('unsupported_action')(error) && error.message === NAVIGATE_REFUSAL)
  assert.match(NAVIGATE_REFUSAL, /navigate is browser-only/)
  // hold_key is canonical since CU-85 (#206): a planned hold is the chord's downs, one hold step, the ups reversed.
  assert.equal(planAction({ type: 'hold_key', keys: ['SHIFT'], duration_ms: 500 }, flat).input.filter((step) => step.kind === 'hold').length, 1)
  assert.throws(() => planAction(null, flat), code('invalid_argument'))
})

test('click: one move, then down and up at the global point; buttons map, wheel is middle', () => {
  const plan = planAction({ type: 'click', x: 10, y: 20, button: 'left' }, flat)
  assert.deepEqual(plan.input, [
    { kind: 'move', x: 10, y: 20, flags: 0 },
    { kind: 'down', button: 'left', x: 10, y: 20, clickCount: 1, flags: 0 },
    { kind: 'up', button: 'left', x: 10, y: 20, clickCount: 1, flags: 0 },
  ])
  assert.deepEqual(plan.pointer, { x: 10, y: 20 })
  assert.equal(plan.local, null)
  for (const [canonical, helper] of [['right', 'right'], ['wheel', 'middle'], ['back', 'back'], ['forward', 'forward']]) {
    assert.equal(planAction({ type: 'click', x: 1, y: 1, button: canonical }, flat).input[1].button, helper)
  }
  assert.throws(() => planAction({ type: 'click', x: 1, y: 1, button: 'thumb' }, flat), code('invalid_argument'))
})

test('click on Retina: frame pixels become points of the right display, rounded', () => {
  const plan = planAction({ type: 'click', x: 401, y: 100, button: 'left' }, retina)
  assert.deepEqual(inputPoints(plan.input)[0], { x: 1001, y: 50 })
  assert.throws(() => planAction({ type: 'click', x: 800, y: 0, button: 'left' }, retina), code('invalid_argument'), 'out of frame')
})

test('double and triple click rise through click counts on the left button', () => {
  const double = planAction({ type: 'double_click', x: 5, y: 5 }, flat)
  assert.deepEqual(double.input.filter((e) => e.kind === 'down').map((e) => e.clickCount), [1, 2])
  const triple = planAction({ type: 'triple_click', x: 5, y: 5 }, flat)
  assert.deepEqual(kinds(triple), ['move', 'down', 'up', 'down', 'up', 'down', 'up'])
  assert.deepEqual(triple.input.filter((e) => e.kind === 'up').map((e) => e.clickCount), [1, 2, 3])
  assert.equal(triple.input.every((e) => e.button === undefined || e.button === 'left'), true)
})

test('held modifiers wrap a mouse action with cumulative flags; a non-modifier cannot be held', () => {
  const plan = planAction({ type: 'click', x: 1, y: 2, button: 'left', keys: ['cmd', 'SHIFT'] }, flat)
  const both = MODIFIER_FLAGS.META | MODIFIER_FLAGS.SHIFT
  assert.deepEqual(plan.input[0], { kind: 'keyDown', keyCode: NAMED_KEY_CODES.META, flags: MODIFIER_FLAGS.META })
  assert.deepEqual(plan.input[1], { kind: 'keyDown', keyCode: NAMED_KEY_CODES.SHIFT, flags: both })
  assert.equal(plan.input[3].flags, both)
  assert.deepEqual(plan.input.at(-2), { kind: 'keyUp', keyCode: NAMED_KEY_CODES.SHIFT, flags: MODIFIER_FLAGS.META })
  assert.deepEqual(plan.input.at(-1), { kind: 'keyUp', keyCode: NAMED_KEY_CODES.META, flags: 0 })
  assert.throws(() => planAction({ type: 'click', x: 1, y: 1, button: 'left', keys: ['A'] }, flat), code('invalid_argument'))
})

test('move and drag: drag holds the left button and interpolates long segments', () => {
  assert.deepEqual(planAction({ type: 'move', x: 7, y: 8 }, flat).input, [{ kind: 'move', x: 7, y: 8, flags: 0 }])
  const drag = planAction({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, flat)
  assert.deepEqual(kinds(drag).slice(0, 2), ['move', 'down'])
  assert.equal(drag.input.at(-1).kind, 'up')
  const moves = drag.input.filter((e) => e.kind === 'drag')
  // CU-96: the gentle start (2, 4, 8 pt), then the four 25-pt steps; the path still ends at the drop point.
  assert.deepEqual(moves.map((e) => e.x), [2, 4, 8, 25, 50, 75, 100])
  assert.deepEqual(moves.at(-1), { kind: 'drag', button: 'left', flags: 0, x: 100, y: 0 })
  assert.deepEqual(drag.pointer, { x: 100, y: 0 })
  assert.throws(() => planAction({ type: 'drag', path: [{ x: 0, y: 0 }] }, flat), code('invalid_argument'))
  assert.throws(() => planAction({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 900, y: 0 }] }, flat), (e) => code('invalid_argument')(e) && /path\[1\]/.test(e.message))
})

test('scroll: a move then one pixel-unit wheel event, sign flipped to CGEvent convention, scaled to points', () => {
  const plan = planAction({ type: 'scroll', x: 10, y: 10, scroll_x: 0, scroll_y: 300 }, flat)
  assert.deepEqual(plan.input, [{ kind: 'move', x: 10, y: 10, flags: 0 }, { kind: 'scroll', x: 10, y: 10, deltaX: 0, deltaY: -300, flags: 0 }])
  const up = planAction({ type: 'scroll', x: 10, y: 10, scroll_x: -40, scroll_y: -200 }, retina)
  assert.deepEqual(up.input[1], { kind: 'scroll', x: 805, y: 5, deltaX: 20, deltaY: 100, flags: 0 })
})

test('keypress: modifiers down in order, keys down then up in reverse, modifiers up in reverse; repeat repeats', () => {
  const plan = planAction({ type: 'keypress', keys: ['CTRL', 'ALT', 'T'] }, flat)
  const ctrl = MODIFIER_FLAGS.CTRL
  const both = ctrl | MODIFIER_FLAGS.ALT
  assert.deepEqual(plan.input, [
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.CTRL, flags: ctrl },
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.ALT, flags: both },
    { kind: 'keyDown', keyCode: 0x11, flags: both },
    { kind: 'keyUp', keyCode: 0x11, flags: both },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.ALT, flags: ctrl },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.CTRL, flags: 0 },
  ])
  assert.equal(planAction({ type: 'keypress', keys: ['ENTER'], repeat: 3 }, flat).input.length, 6)
  const bang = planAction({ type: 'keypress', keys: ['!'] }, flat)
  assert.deepEqual(bang.input, [{ kind: 'keyDown', keyCode: 0x12, flags: MODIFIER_FLAGS.SHIFT }, { kind: 'keyUp', keyCode: 0x12, flags: MODIFIER_FLAGS.SHIFT }])
  assert.throws(() => planAction({ type: 'keypress', keys: [] }, flat), code('invalid_argument'))
  assert.throws(() => planAction({ type: 'keypress', keys: ['ENTER'], repeat: 101 }, flat), code('invalid_argument'))
  assert.throws(() => planAction({ type: 'keypress', keys: ['Hyper'] }, flat), code('invalid_argument'))
})

test('D-031: Cmd or Ctrl with C, X or V plans into ordinary key events in every canonical spelling', () => {
  const { META, CTRL, SHIFT, ALT } = MODIFIER_FLAGS
  assert.deepEqual(planAction({ type: 'keypress', keys: ['META', 'C'] }, flat).input, [
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.META, flags: META },
    { kind: 'keyDown', keyCode: 0x08, flags: META }, // kVK_ANSI_C
    { kind: 'keyUp', keyCode: 0x08, flags: META },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.META, flags: 0 },
  ])
  assert.deepEqual(planAction({ type: 'keypress', keys: ['CTRL', 'V'] }, flat).input, [
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.CTRL, flags: CTRL },
    { kind: 'keyDown', keyCode: 0x09, flags: CTRL }, // kVK_ANSI_V
    { kind: 'keyUp', keyCode: 0x09, flags: CTRL },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.CTRL, flags: 0 },
  ])
  const spellings = [
    [['META', 'C'], 0x08, META], [['cmd', 'c'], 0x08, META], [['Command', 'x'], 0x07, META], [['super', 'V'], 0x09, META],
    [['META', 'SHIFT', 'V'], 0x09, META | SHIFT], [['CTRL', 'C'], 0x08, CTRL], [['ctrl', 'x'], 0x07, CTRL],
    [['Control_L', 'v'], 0x09, CTRL], [['control', 'V'], 0x09, CTRL], [['CTRL', 'ALT', 'c'], 0x08, CTRL | ALT],
  ]
  for (const [keys, keyCode, flags] of spellings) {
    const plan = planAction({ type: 'keypress', keys }, flat)
    const main = plan.input.filter((event) => event.keyCode === keyCode)
    assert.deepEqual(main, [{ kind: 'keyDown', keyCode, flags }, { kind: 'keyUp', keyCode, flags }], keys.join('+'))
    assert.equal(plan.input.length, 2 * keys.length, `${keys.join('+')}: every down has its up`)
    assert.equal(plan.input.at(-1).flags, 0, `${keys.join('+')}: nothing left held`)
  }
  assert.equal(planAction({ type: 'keypress', keys: ['META', 'V'], repeat: 2 }, flat).input.length, 8)
})

test('type: Unicode text events in short chunks, Return and Tab as keys, never a paste', () => {
  const plan = planAction({ type: 'type', text: 'héllo 👋\nnext\tfield' }, flat)
  assert.deepEqual(plan.input, [
    { kind: 'text', text: 'héllo 👋' },
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.ENTER, flags: 0 },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.ENTER, flags: 0 },
    { kind: 'text', text: 'next' },
    { kind: 'keyDown', keyCode: NAMED_KEY_CODES.TAB, flags: 0 },
    { kind: 'keyUp', keyCode: NAMED_KEY_CODES.TAB, flags: 0 },
    { kind: 'text', text: 'field' },
  ])
  const long = planAction({ type: 'type', text: `${'a'.repeat(15)}😀b` }, flat)
  assert.deepEqual(long.input.map((e) => e.text), ['a'.repeat(15), '😀b'], 'a surrogate pair is never split')
  assert.equal(long.input.every((e) => e.text.length <= TEXT_CHUNK_UNITS), true)
  assert.deepEqual(planAction({ type: 'type', text: 'a\r\nb' }, flat).input.map((e) => e.kind), ['text', 'keyDown', 'keyUp', 'text'])
  assert.throws(() => planAction({ type: 'type', text: '' }, flat), code('invalid_argument'))
})

test('wait, screenshot, zoom and cursor_position post nothing', () => {
  assert.deepEqual(planAction({ type: 'wait' }, flat), { type: 'wait', input: null, local: { kind: 'sleep', ms: WAIT_DEFAULT_MS }, pointer: null })
  assert.deepEqual(planAction({ type: 'wait', duration_ms: 5 }, flat).local, { kind: 'sleep', ms: 5 })
  assert.throws(() => planAction({ type: 'wait', duration_ms: 10_001 }, flat), code('invalid_argument'))
  assert.equal(planAction({ type: 'screenshot' }, flat).input, null)
  assert.deepEqual(planAction({ type: 'cursor_position' }, flat).local, { kind: 'cursor_position' })
  const zoom = planAction({ type: 'zoom', region: [0, 0, 200, 100] }, retina)
  assert.equal(zoom.input, null)
  assert.deepEqual(zoom.local, { kind: 'zoom', region: [0, 0, 200, 100], regionPt: { x: 800, y: 0, width: 100, height: 50 } })
  assert.throws(() => planAction({ type: 'zoom', region: [0, 0, 900, 10] }, retina), code('invalid_argument'))
})

test('a batch with one bad action is refused whole, naming its index', () => {
  assert.throws(() => planBatch([{ type: 'wait' }, { type: 'navigate', url: 'https://example.com/' }], flat), (error) => code('unsupported_action')(error) && error.details.index === 1)
  assert.equal(planBatch([{ type: 'wait' }, { type: 'move', x: 1, y: 1 }], flat).length, 2)
  assert.equal(planBatch([{ type: 'wait' }, { type: 'keypress', keys: ['cmd', 'v'] }], flat).length, 2, 'a paste chord is not a bad action (D-031)')
  assert.throws(() => planBatch([], flat), code('invalid_argument'))
})

test('CU-96 (CU-95): a drag starts gently - the moves until the drag threshold stay inside the pressed row, then the path', () => {
  // cu-researcher's replay: doc-015's row spans y 367-387, the press is at y 374 (7 pt below its top), the path heads
  // up-right to (698, 137). The old first step (25 pt along it) landed at y ~363.5, in doc-014's row, and moved it.
  const drag = planAction({ type: 'drag', path: [{ x: 183, y: 374 }, { x: 698, y: 137 }] }, flat)
  const moves = drag.input.filter((e) => e.kind === 'drag')
  const press = drag.input.find((e) => e.kind === 'down')
  assert.deepEqual(DRAG_START_PT, [2, 4, 8])
  const distance = (e) => Math.hypot(e.x - press.x, e.y - press.y)
  // Every move until the pointer is past AppKit's threshold (a few points) is inside the row, and so is the next.
  const firstPast = moves.findIndex((e) => distance(e) >= 3)
  for (const move of moves.slice(0, firstPast + 1)) assert.ok(move.y >= 367 && move.y <= 387, `move at y ${move.y} left the pressed row`)
  assert.ok(distance(moves[0]) <= 3, `the first move is ${distance(moves[0]).toFixed(1)} pt from the press`)
  assert.ok(Math.round(press.y - (237 / Math.hypot(515, 237)) * DRAG_STEP_PT * 1) < 367, 'the old first step would have left the row (the bug this pins)')
  assert.deepEqual([moves.at(-1).x, moves.at(-1).y], [698, 137])
})

test('CU-96: the gentle start never overshoots a short first segment, skips moves that do not move, and follows a dwell', () => {
  const short = planAction({ type: 'drag', path: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 60, y: 0 }] }, flat).input.filter((e) => e.kind === 'drag')
  assert.deepEqual(short.map((e) => e.x).slice(0, 3), [2, 4, 6], 'only the gentle moves shorter than the 6 pt segment, then its end')
  const still = planAction({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 50, y: 5 }] }, flat).input.filter((e) => e.kind === 'drag')
  assert.equal(still.length, new Set(still.map((e) => `${e.x},${e.y}`)).size, 'no two moves at the same point after a zero-length first segment')
  const dwell = planAction({ type: 'drag', path: [{ x: 0, y: 0, holdMs: 500 }, { x: 100, y: 0 }] }, flat).input
  const hold = dwell.findIndex((e) => e.kind === 'hold')
  assert.deepEqual([dwell[hold - 1].kind, dwell[hold + 1].kind, dwell[hold + 1].x], ['down', 'drag', 2], 'the long press first, then the gentle start')
})

test('CU-149: type refuses control characters other than tab and newline - before any input, naming the code point', () => {
  for (const [char, codePoint] of [['\u0003', 'U+0003'], ['\u001b', 'U+001B'], ['\b', 'U+0008'], ['\u007f', 'U+007F'], ['\u0085', 'U+0085'], ['\u2028', 'U+2028'], ['\u2029', 'U+2029'], ['\u0000', 'U+0000'], ['\f', 'U+000C'], ['\v', 'U+000B']]) {
    assert.throws(() => planAction({ type: 'type', text: `ok${char}` }, flat), (e) => e.code === 'invalid_argument' && e.details?.codePoint === codePoint && e.details?.field === 'text', codePoint)
  }
  // Tab, LF and CR stay, sent as keys; ordinary Unicode passes.
  assert.deepEqual(planAction({ type: 'type', text: 'a\tb\nc\rd' }, flat).input.map((e) => e.kind), ['text', 'keyDown', 'keyUp', 'text', 'keyDown', 'keyUp', 'text', 'keyDown', 'keyUp', 'text'])
  assert.equal(planAction({ type: 'type', text: 'héllo 👋 — “ok”' }, flat).input[0].kind, 'text')
})
