import { deltaToPoints, regionToGlobal, toGlobal } from './coords.mjs'
import { EnvironmentError, invalid } from './errors.mjs'
import { isModifier, keyStroke, MODIFIER_FLAGS, NAMED_KEY_CODES, normalizeKey } from './keys.mjs'

/**
 * Planning input: a canonical action in, the exact low-level events of one helper `input` request out, with no
 * helper involved (design: desktop-extension/input-and-targets.md).
 *
 * Planning is also validation, as in the browser driver: `planAction` refuses a malformed or unsupported action by
 * name before anything is sent, so a whole batch can be planned first and run only if every action planned (R15,
 * R19). A plan is `{ type, input, local, pointer }`:
 *
 * - `input`: the helper events, in global points, or null when the action posts nothing. An event is one of
 *   `{ kind: 'move' | 'down' | 'up' | 'drag', button?, x, y, clickCount?, flags }`,
 *   `{ kind: 'scroll', x, y, deltaX, deltaY, flags }` (a pixel-unit wheel event in CGEvent's own sign convention:
 *   positive `deltaY` moves the content down, that is, scrolls up),
 *   `{ kind: 'keyDown' | 'keyUp', keyCode, flags }` and `{ kind: 'text', text }` (Unicode, layout-free);
 * - `local`: what the driver does itself: `{ kind: 'sleep', ms }`, `{ kind: 'screenshot' }`,
 *   `{ kind: 'zoom', region, regionPt }` or `{ kind: 'cursor_position' }`;
 * - `pointer`: the frame point where the pointer ends, which answers `cursor_position`.
 *
 * Actions are agent core's canonical schema: the nine GA actions plus `triple_click`, `zoom` and `cursor_position`.
 * `navigate` is browser-only and refused by name. Copy, cut and paste chords plan like any other chord (D-031, see
 * `keys.mjs`); system-wide chords are agent core's app policy to refuse (P9), not planning's.
 */

export const ACTION_TYPES = Object.freeze([
  'click', 'double_click', 'triple_click', 'drag', 'move', 'scroll', 'keypress', 'type', 'wait', 'screenshot', 'zoom', 'cursor_position',
  'hold_key',
])

/** Canonical buttons -> the helper's button names (`wheel` is the middle button, as in the browser driver). */
const BUTTONS = Object.freeze({ left: 'left', right: 'right', wheel: 'middle', middle: 'middle', back: 'back', forward: 'forward' })

export const WAIT_DEFAULT_MS = 1000
export const WAIT_MAX_MS = 10_000
/**
 * CU-64: the longest a request may hold keys or the button, in all - a hold_key, or a drag's dwells (holdMs) together.
 * The hold is one `{kind: 'hold', ms}` step inside the single input request, so the helper's release guarantee covers
 * it and nothing stays held past the request; it is never a sleep between two requests.
 */
export const HOLD_MAX_MS = 10_000
export const KEYPRESS_MAX_REPEAT = 100
export const DRAG_MAX_POINTS = 100
/** The longest pointer jump inside a drag segment, in points, so an app's drag threshold sees intermediate moves. */
export const DRAG_STEP_PT = 25
const DRAG_MAX_STEPS_PER_SEGMENT = 20
/**
 * CU-96 (CU-95): the first moves after a drag's down, in points along its first segment, before the usual steps.
 * AppKit list views (NSTableView: Finder's list view, Mail, the fixture's file browser) take the dragged row from where
 * the drag BEGINS - the first mouseDragged past the system threshold of a few points - not from the mouseDown. A first
 * step of up to DRAG_STEP_PT, more than a ~20 pt row, began the drag in the next row whenever the path headed up, and
 * the wrong file moved (cu-researcher reproduced it with no model). These short moves cross the threshold while the
 * pointer is still inside the pressed row; a hand starts a drag slowly too.
 */
export const DRAG_START_PT = Object.freeze([2, 4, 8])
/**
 * UTF-16 units per text event. `CGEventKeyboardSetUnicodeString` is documented to carry a short string per event and
 * apps are known to drop the tail of long ones; 16 stays well inside that, and a surrogate pair is never split.
 */
export const TEXT_CHUNK_UNITS = 16

export const NAVIGATE_REFUSAL = 'navigate is browser-only: a desktop run has no address bar to drive; use the app\'s own controls with click, keypress or type'

/** The held-key list of a mouse action: modifiers only, canonical, deduplicated. */
function heldKeys(keys) {
  if (keys === undefined || keys === null) return []
  if (!Array.isArray(keys)) throw invalid('keys must be a list of key names')
  const canonical = [...new Set(keys.map(normalizeKey))]
  const other = canonical.find((key) => !isModifier(key))
  if (other !== undefined) throw invalid(`only modifier keys can be held during a mouse action, not '${other}'`)
  return canonical
}

/** Modifier key events around `build(flags)`: pressed in order before, released in reverse after. */
function withHeld(modifiers, build) {
  const down = []
  const up = []
  let flags = 0
  for (const key of modifiers) {
    flags |= MODIFIER_FLAGS[key]
    down.push({ kind: 'keyDown', keyCode: NAMED_KEY_CODES[key], flags })
  }
  const total = flags
  for (const key of [...modifiers].reverse()) {
    flags &= ~MODIFIER_FLAGS[key]
    up.push({ kind: 'keyUp', keyCode: NAMED_KEY_CODES[key], flags })
  }
  return [...down, ...build(total), ...up]
}

function buttonName(name = 'left') {
  const mapped = BUTTONS[name]
  if (mapped === undefined) throw invalid(`unknown mouse button '${String(name)}'`)
  return mapped
}

const plan = (type, input, { local = null, pointer = null } = {}) => ({ type, input, local, pointer })

/** A click of `clickCount` (1 to 3): one move, then down and up with rising click counts, so the app sees a double or triple click. */
function planClick(action, frame, clickCount) {
  const at = toGlobal({ x: action.x, y: action.y }, frame)
  const button = buttonName(action.button ?? 'left')
  const events = withHeld(heldKeys(action.keys), (flags) => {
    const steps = [{ kind: 'move', x: at.x, y: at.y, flags }]
    for (let count = 1; count <= clickCount; count += 1) {
      steps.push({ kind: 'down', button, x: at.x, y: at.y, clickCount: count, flags })
      steps.push({ kind: 'up', button, x: at.x, y: at.y, clickCount: count, flags })
    }
    return steps
  })
  return plan(action.type, events, { pointer: { x: action.x, y: action.y } })
}

function planDrag({ path, keys }, frame) {
  if (!Array.isArray(path) || path.length < 2) throw invalid('drag needs a path of at least two points')
  if (path.length > DRAG_MAX_POINTS) throw invalid(`drag accepts at most ${DRAG_MAX_POINTS} points`)
  const points = path.map((point, index) => toGlobal(point, frame, `path[${index}]`))
  // CU-64 R1: a point's holdMs is a dwell there with the button down (a long press, or a pause over a drop target) -
  // a hold step inside this one request; all of a drag's dwells together are at most HOLD_MAX_MS.
  const dwells = path.map((point, index) => (point?.holdMs === undefined ? 0 : holdMs(point.holdMs, `path[${index}].holdMs`)))
  if (dwells.reduce((sum, ms) => sum + ms, 0) > HOLD_MAX_MS) throw invalid(`a drag's dwells (holdMs) total at most ${HOLD_MAX_MS} ms`, { field: 'path' })
  const events = withHeld(heldKeys(keys), (flags) => {
    const steps = [{ kind: 'move', x: points[0].x, y: points[0].y, flags }]
    steps.push({ kind: 'down', button: 'left', x: points[0].x, y: points[0].y, clickCount: 1, flags })
    if (dwells[0] > 0) steps.push({ kind: 'hold', ms: dwells[0] })
    steps.push(...dragStart(points[0], points[1], flags))
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]
      const to = points[index]
      const segments = dragSegments(from, to)
      for (let step = 1; step <= segments; step += 1) {
        steps.push({
          kind: 'drag', button: 'left', flags,
          x: Math.round(from.x + ((to.x - from.x) * step) / segments),
          y: Math.round(from.y + ((to.y - from.y) * step) / segments),
        })
      }
      if (dwells[index] > 0) steps.push({ kind: 'hold', ms: dwells[index] })
    }
    const last = points.at(-1)
    steps.push({ kind: 'up', button: 'left', x: last.x, y: last.y, clickCount: 1, flags })
    return steps
  })
  return plan('drag', events, { pointer: { x: path.at(-1).x, y: path.at(-1).y } })
}

/** How many steps a drag segment takes: at most DRAG_STEP_PT apart, at most DRAG_MAX_STEPS_PER_SEGMENT, at least one. */
function dragSegments(from, to) {
  return Math.min(DRAG_MAX_STEPS_PER_SEGMENT, Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / DRAG_STEP_PT)))
}

/**
 * The gentle start (CU-96): drag moves DRAG_START_PT points from the press toward the first path point, each shorter
 * than that segment's first regular step, so the path never doubles back. The distances are at least 2 pt apart, so
 * every move lands on a new rounded point; a zero-length first segment (first step 0) gets none.
 */
function dragStart(from, to, flags) {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const firstStep = length / dragSegments(from, to)
  return DRAG_START_PT.filter((distance) => distance < firstStep).map((distance) => ({
    kind: 'drag', button: 'left', flags,
    x: Math.round(from.x + ((to.x - from.x) * distance) / length),
    y: Math.round(from.y + ((to.y - from.y) * distance) / length),
  }))
}

/** A hold's milliseconds, 1 to HOLD_MAX_MS, else invalid_argument naming `field`, before anything is sent (CU-64 H2). */
function holdMs(ms, field) {
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 1 || ms > HOLD_MAX_MS) {
    throw invalid(`${field} must be a whole number of milliseconds from 1 to ${HOLD_MAX_MS}`, { field })
  }
  return ms
}

/**
 * A scroll at a point. Canonical `scroll_y` is positive downward (OpenAI's schema); a CGEvent wheel delta is positive
 * upward, so both axes are negated here and the helper posts the deltas unchanged.
 */
function planScroll(action, frame) {
  const at = toGlobal({ x: action.x, y: action.y }, frame)
  const { dx, dy } = deltaToPoints(action.scroll_x ?? 0, action.scroll_y ?? 0, frame)
  const events = withHeld(heldKeys(action.keys), (flags) => [
    { kind: 'move', x: at.x, y: at.y, flags },
    { kind: 'scroll', x: at.x, y: at.y, deltaX: dx === 0 ? 0 : -dx, deltaY: dy === 0 ? 0 : -dy, flags },
  ])
  return plan('scroll', events, { pointer: { x: action.x, y: action.y } })
}

/**
 * A key chord: modifiers pressed in order, the other keys pressed in order and released in reverse, modifiers
 * released in reverse; every event carries the flags held at that moment. A shifted character (`!`) adds Shift to
 * its own key events only. Command or Control with C, X or V is such a chord too (D-031): the app copies, cuts or
 * pastes with the owner's clipboard, and the driver never reads what it holds.
 */
function planChord(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw invalid('keypress needs a non-empty list of keys')
  const canonical = keys.map(normalizeKey)
  const modifiers = [...new Set(canonical.filter(isModifier))]
  const main = canonical.filter((key) => !isModifier(key))
  const strokes = main.map((key) => keyStroke(key))
  return withHeld(modifiers, (flags) => {
    const own = (stroke) => flags | (stroke.shift ? MODIFIER_FLAGS.SHIFT : 0)
    return [
      ...strokes.map((stroke) => ({ kind: 'keyDown', keyCode: stroke.keyCode, flags: own(stroke) })),
      ...[...strokes].reverse().map((stroke) => ({ kind: 'keyUp', keyCode: stroke.keyCode, flags: own(stroke) })),
    ]
  })
}

export function planKeypress({ keys, repeat = 1 }) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > KEYPRESS_MAX_REPEAT) {
    throw invalid(`keypress repeat must be an integer from 1 to ${KEYPRESS_MAX_REPEAT}`)
  }
  const once = planChord(keys)
  return plan('keypress', Array.from({ length: repeat }, () => once).flat())
}

/**
 * CU-64: hold keys for `duration_ms` - the same chord as keypress (the same key names, the same refusals), with one
 * `{kind: 'hold', ms}` step between the downs and the ups, in one request: every down has its up, reversed, whether
 * the hold ends normally or the helper stops it (pause, stop, a front-app change), because the helper releases what it
 * holds. Whether a printable key may be held is the policy's to judge (it is the same key pressed); the driver plans.
 * Not yet in ACTION_TYPES: `hold_key` joins the canonical vocabulary (agent-core actions.mjs) with agent core's half of
 * CU-64, and the driver lists it in the same change, so the two lists never disagree.
 */
export function planHoldKey({ keys, duration_ms: ms }) {
  if (!Array.isArray(keys) || keys.length === 0) throw invalid('hold_key needs a non-empty list of keys', { field: 'keys' })
  const hold = holdMs(ms, 'duration_ms')
  const chord = planChord(keys)
  const downs = chord.length / 2 // planChord pairs every down with its up: downs first, then the ups in reverse
  return plan('hold_key', [...chord.slice(0, downs), { kind: 'hold', ms: hold }, ...chord.slice(downs)])
}

/**
 * CU-149 (CU-145's audit): \`type\` refuses control characters other than tab and newline. They would reach the app as
 * text that agent core never judges: U+0003 is keypad Enter in AppKit, which a Return-equivalent default button may
 * answer; ESC, BS and DEL act as keys in many fields; U+2028 and U+2029 break lines like a newline. A key is a
 * \`keypress\`, judged by its own rules. Tab, CR and LF stay: they are sent as the Tab and Return keys and judged as such
 * (CU-142). Refused at planning, so a batch holding one is refused before anything runs.
 */
const REFUSED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/u
function refuseControl(text) {
  const match = REFUSED_CONTROL.exec(text)
  if (match === null) return
  const codePoint = `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`
  throw invalid(`type text holds ${codePoint}, a control character that would act as a key without being judged; send keys with keypress (tab and newline may stay in the text)`, { field: 'text', codePoint })
}

/**
 * Typing: Unicode text events in chunks of at most `TEXT_CHUNK_UNITS` UTF-16 units, so the keyboard layout cannot
 * change a character; a newline is the Return key and a tab the Tab key, because apps act on those keys (submit,
 * next field) rather than on the characters. Never through the pasteboard: copy and paste are allowed (D-031), but
 * `type` writing the clipboard would overwrite it as a side effect the model did not ask for, and the helper never
 * reads it, so text always arrives as key events.
 */
export function planType({ text }) {
  if (typeof text !== 'string' || text.length === 0) throw invalid('type needs non-empty text')
  refuseControl(text)
  const events = []
  let pending = ''
  const flush = () => {
    if (pending.length > 0) events.push({ kind: 'text', text: pending })
    pending = ''
  }
  const press = (keyCode) => {
    flush()
    events.push({ kind: 'keyDown', keyCode, flags: 0 }, { kind: 'keyUp', keyCode, flags: 0 })
  }
  for (const char of text.replace(/\r\n?/g, '\n')) {
    if (char === '\n') press(NAMED_KEY_CODES.ENTER)
    else if (char === '\t') press(NAMED_KEY_CODES.TAB)
    else {
      if (pending.length + char.length > TEXT_CHUNK_UNITS) flush()
      pending += char
    }
  }
  flush()
  return plan('type', events)
}

function planWait({ duration_ms: ms }) {
  if (ms === undefined || ms === null) return plan('wait', null, { local: { kind: 'sleep', ms: WAIT_DEFAULT_MS } })
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > WAIT_MAX_MS) {
    throw invalid(`wait duration_ms must be a number from 0 to ${WAIT_MAX_MS}`)
  }
  return plan('wait', null, { local: { kind: 'sleep', ms } })
}

/** Pointer actions, which pid delivery cannot carry (Q-D3, design 0.4.5). */
export const POINTER_ACTION_TYPES = Object.freeze(['click', 'double_click', 'triple_click', 'move', 'drag', 'scroll'])

/** Why a pointer action is refused in pid mode; also used by the tests to check the wording the model sees. */
export const PID_POINTER_REFUSAL = 'pid input delivers no pointer events (no window or point reaches the app); pointer actions need the default global mode'

/**
 * Plan one action, or throw an EnvironmentError naming what is wrong. In `mode: 'pid'` pointer actions are refused
 * by name with nothing planned: Q-D3 measured that pid delivery drops the pointer's window and location, so a pid
 * click would complete 'done' yet land on nothing - a silent no-op is the worst outcome (design 0.4.5). Keys and
 * text still go by pid.
 */
export function planAction(action, frame, { mode = 'global' } = {}) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) throw invalid('an action must be an object')
  if (mode === 'pid' && POINTER_ACTION_TYPES.includes(action.type)) {
    throw new EnvironmentError('unsupported_action', PID_POINTER_REFUSAL, { mode: 'pid', action: action.type })
  }
  switch (action.type) {
    case 'click': return planClick(action, frame, 1)
    case 'double_click': return planClick({ ...action, button: 'left' }, frame, 2)
    case 'triple_click': return planClick({ ...action, button: 'left' }, frame, 3)
    case 'move': {
      const at = toGlobal({ x: action.x, y: action.y }, frame)
      const events = withHeld(heldKeys(action.keys), (flags) => [{ kind: 'move', x: at.x, y: at.y, flags }])
      return plan('move', events, { pointer: { x: action.x, y: action.y } })
    }
    case 'drag': return planDrag(action, frame)
    case 'scroll': return planScroll(action, frame)
    case 'keypress': return planKeypress(action)
    case 'hold_key': return planHoldKey(action)
    case 'type': return planType(action)
    case 'wait': return planWait(action)
    case 'screenshot': return plan('screenshot', null, { local: { kind: 'screenshot' } })
    case 'zoom': return plan('zoom', null, { local: { kind: 'zoom', region: action.region, regionPt: regionToGlobal(action.region, frame) } })
    case 'cursor_position': return plan('cursor_position', null, { local: { kind: 'cursor_position' } })
    case 'navigate': throw new EnvironmentError('unsupported_action', NAVIGATE_REFUSAL)
    default:
      throw new EnvironmentError('unsupported_action', `unsupported action type '${String(action.type)}'; supported: ${ACTION_TYPES.join(', ')}`)
  }
}

/** Plan every action of a batch, so a batch with one bad action is refused before any of it runs. */
export function planBatch(actions, frame, options = {}) {
  if (!Array.isArray(actions) || actions.length === 0) throw invalid('a batch needs at least one action')
  return actions.map((action, index) => {
    try {
      return planAction(action, frame, options)
    } catch (error) {
      if (error instanceof EnvironmentError) error.details = { ...(error.details ?? {}), index }
      throw error
    }
  })
}

/** Every global point an input plan touches, for tests and for the helper's own scope check. */
export function inputPoints(events) {
  return (events ?? []).filter((event) => typeof event.x === 'number').map(({ x, y }) => ({ x, y }))
}

/**
 * The global points the driver hit-tests before it posts a plan (D-036): the first and the last point it touches,
 * once each - the click, move or scroll point, or a drag's start (where the button goes down) and its end (where it is
 * released and the drop lands). Those are the points whose app the action acts on. A drag's intermediate moves are
 * left to the helper's per-event check: testing each would cost a round trip per step for points the pointer only
 * passes over. Empty for a plan with no pointer event (keys, text), which is not hit-tested at all.
 */
export function hitTestPoints(events) {
  const points = inputPoints(events)
  if (points.length === 0) return []
  const [first, last] = [points[0], points.at(-1)]
  return first.x === last.x && first.y === last.y ? [first] : [first, last]
}
