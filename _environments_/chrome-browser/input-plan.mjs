import { checkPoint, deltaToViewport, screenshotClip, toViewport } from './coords.mjs'
import { EnvironmentError, invalid } from './errors.mjs'
import { charDescriptor, chordMeaning, isModifier, keyDescriptor, modifierMask, MODIFIER_BITS, normalizeKey, refuseChord } from './keys.mjs'

/**
 * Planning input: a computer-tool action in, the exact list of CDP steps out, with no browser involved.
 *
 * Planning is also validation. `planAction` refuses a malformed or unsupported action by name before anything
 * is sent, so the agent core can plan a whole batch first and execute only if every action planned (R15, R19).
 * The executor then sends the steps in order. A step is one of:
 *
 * - `{ method, params }` - one protocol call (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`,
 *   `Input.insertText`);
 * - `{ kind: 'navigate', direction }` - `back`, `forward` or `reload`, for a browser shortcut a headless page
 *   never receives;
 * - `{ kind: 'navigate', url }` - the `navigate` extension (the network-layer site filter still applies);
 * - `{ kind: 'clipboard', op }` - `copy`, `cut` or `paste` on the per-run clipboard (D-011);
 * - `{ kind: 'sleep', ms }` - for `wait`;
 * - `{ kind: 'screenshot' }`, `{ kind: 'zoom', region }`.
 *
 * Actions are the canonical schema of `_designs_/system-architecture/action-schema.md` 0.1: the GA computer
 * tool's fields (`scroll_x`, `scroll_y`, `path`, `keys`) plus the extensions `triple_click`, `zoom`, `navigate`,
 * `keypress.repeat` and `wait.duration_ms`. Coordinates are frame pixels; the plan holds viewport CSS pixels.
 * With a frame of scale 1, frame and viewport coincide.
 */

export const ACTION_TYPES = Object.freeze([
  'click', 'double_click', 'triple_click', 'drag', 'move', 'scroll', 'keypress', 'type', 'wait', 'screenshot', 'zoom', 'navigate',
])

const BUTTONS = Object.freeze({
  left: { button: 'left', bit: 1 },
  right: { button: 'right', bit: 2 },
  wheel: { button: 'middle', bit: 4 },
  middle: { button: 'middle', bit: 4 },
  back: { button: 'back', bit: 8 },
  forward: { button: 'forward', bit: 16 },
})

export const WAIT_DEFAULT_MS = 1000
export const WAIT_MAX_MS = 10_000
export const KEYPRESS_MAX_REPEAT = 100
export const DRAG_MAX_POINTS = 100
/** The longest pointer jump inside a drag segment, in CSS pixels, so drag thresholds see intermediate moves. */
export const DRAG_STEP_PX = 25
/**
 * CU-197: how long a drag holds the button after the press, before its first move. Chrome starts a drag of SELECTED TEXT
 * only after a press-and-hold - measured in headless Chrome, 100 ms delivered nothing and 200 ms delivered the text - so
 * a drag that moved at once silently did nothing on a selection. HTML5 draggables and mousedown/mousemove/mouseup drags
 * work either way (both re-measured with the hold); 300 ms leaves a margin over the threshold.
 */
export const DRAG_HOLD_MS = 300
const DRAG_MAX_STEPS_PER_SEGMENT = 20

const mouse = (type, point, extra = {}) => ({
  method: 'Input.dispatchMouseEvent',
  params: { type, x: point.x, y: point.y, button: 'none', buttons: 0, clickCount: 0, modifiers: 0, ...extra },
})

const keyEvent = (type, descriptor, modifiers, extra = {}) => {
  const { text, ...fields } = descriptor
  const params = { type, ...fields, modifiers, ...extra }
  if (type === 'keyDown' && text !== undefined) Object.assign(params, { text, unmodifiedText: text })
  return { method: 'Input.dispatchKeyEvent', params }
}

/** The held-key list of a mouse action: modifiers only, canonical, deduplicated. */
function heldKeys(keys) {
  if (keys === undefined || keys === null) return []
  if (!Array.isArray(keys)) throw invalid('keys must be a list of key names')
  const canonical = [...new Set(keys.map(normalizeKey))]
  const other = canonical.find((key) => !isModifier(key))
  if (other !== undefined) throw invalid(`only modifier keys can be held during a mouse action, not '${other}'`)
  return canonical
}

/** Wrap mouse steps with held modifiers: pressed in order before, released in reverse after. */
function withHeld(canonical, build) {
  const down = []
  const up = []
  let mask = 0
  for (const key of canonical) {
    mask |= MODIFIER_BITS[key]
    down.push(keyEvent('rawKeyDown', keyDescriptor(key), mask))
  }
  const total = mask
  for (const key of [...canonical].reverse()) {
    mask &= ~MODIFIER_BITS[key]
    up.push(keyEvent('keyUp', keyDescriptor(key), mask))
  }
  return [...down, ...build(total), ...up]
}

function button(name = 'left') {
  const entry = BUTTONS[name]
  if (entry === undefined) throw invalid(`unknown mouse button '${name}'`)
  return entry
}

function planClick({ x, y, button: name, keys }, frame, clickCount = 1) {
  const point = toViewport({ x, y }, frame)
  const { button: cdpButton, bit } = button(name ?? 'left')
  return withHeld(heldKeys(keys), (modifiers) => {
    const steps = [mouse('mouseMoved', point, { modifiers })]
    for (let count = 1; count <= clickCount; count += 1) {
      steps.push(mouse('mousePressed', point, { button: cdpButton, buttons: bit, clickCount: count, modifiers }))
      steps.push(mouse('mouseReleased', point, { button: cdpButton, buttons: 0, clickCount: count, modifiers }))
    }
    return steps
  })
}

function planDrag({ path, keys }, frame) {
  if (!Array.isArray(path) || path.length < 2) throw invalid('drag needs a path of at least two points')
  if (path.length > DRAG_MAX_POINTS) throw invalid(`drag accepts at most ${DRAG_MAX_POINTS} points`)
  const points = path.map((point, index) => {
    checkPoint(point, frame, `path[${index}]`)
    return toViewport(point, frame)
  })
  return withHeld(heldKeys(keys), (modifiers) => {
    const steps = [mouse('mouseMoved', points[0], { modifiers })]
    steps.push(mouse('mousePressed', points[0], { button: 'left', buttons: 1, clickCount: 1, modifiers }))
    steps.push({ kind: 'sleep', ms: DRAG_HOLD_MS })
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]
      const to = points[index]
      const distance = Math.hypot(to.x - from.x, to.y - from.y)
      const segments = Math.min(DRAG_MAX_STEPS_PER_SEGMENT, Math.max(1, Math.ceil(distance / DRAG_STEP_PX)))
      for (let step = 1; step <= segments; step += 1) {
        const at = { x: from.x + ((to.x - from.x) * step) / segments, y: from.y + ((to.y - from.y) * step) / segments }
        steps.push(mouse('mouseMoved', at, { button: 'left', buttons: 1, modifiers }))
      }
    }
    steps.push(mouse('mouseReleased', points.at(-1), { button: 'left', buttons: 0, clickCount: 1, modifiers }))
    return steps
  })
}

function planScroll({ x, y, scroll_x: sx = 0, scroll_y: sy = 0, keys }, frame) {
  const point = toViewport({ x, y }, frame)
  const { dx, dy } = deltaToViewport(sx, sy, frame)
  return withHeld(heldKeys(keys), (modifiers) => [
    mouse('mouseMoved', point, { modifiers }),
    mouse('mouseWheel', point, { deltaX: dx, deltaY: dy, modifiers }),
  ])
}

/**
 * A key combination: modifiers pressed in order, the other keys pressed and released, modifiers released in
 * reverse. A chord with Control, Meta or Alt produces no text. Editing chords carry their macOS command;
 * browser shortcuts become navigations; clipboard chords become per-run clipboard steps; window shortcuts are
 * refused.
 */
export function planKeypress({ keys, repeat = 1 }) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > KEYPRESS_MAX_REPEAT) {
    throw invalid(`keypress repeat must be an integer from 1 to ${KEYPRESS_MAX_REPEAT}`)
  }
  const once = planChord(keys)
  return Array.from({ length: repeat }, () => once).flat()
}

/**
 * CU-153: the history move a keypress makes - 'reload', 'back' or 'forward' - or null, by the same chordMeaning that
 * planChord performs, so agent core judges exactly the chords the driver turns into navigations (one table).
 */
export function historyDirection(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null
  let canonical
  try {
    canonical = keys.map(normalizeKey)
  } catch {
    return null
  }
  const modifiers = [...new Set(canonical.filter(isModifier))]
  const main = canonical.filter((key) => !isModifier(key))
  if (main.length !== 1) return null
  return chordMeaning(modifierMask(modifiers), main[0])?.browser ?? null
}

/**
 * CU-153/CU-158: the history move an action makes - 'reload', 'back' or 'forward' - or null. A keypress names one
 * through historyDirection; a click with the mouse's back or forward button is the same move (#381: measured, such a
 * click moves history in our Chrome). Nothing else does: a horizontal or Shift wheel and a middle click were probed and
 * never moved history. Pure, so the D-059 matrix asserts the move each of its actions makes (CU-161).
 */
export function historyMove(action) {
  if (action?.type === 'keypress') return historyDirection(action.keys)
  if (action?.type === 'click' && (action.button === 'back' || action.button === 'forward')) return action.button
  return null
}

function planChord(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw invalid('keypress needs a non-empty list of keys')
  const canonical = keys.map(normalizeKey)
  const modifiers = [...new Set(canonical.filter(isModifier))]
  const main = canonical.filter((key) => !isModifier(key))
  const mask = modifierMask(modifiers)
  const meanings = main.map((key) => chordMeaning(mask, key))
  for (const meaning of meanings) refuseChord(meaning)
  const special = meanings.find((meaning) => meaning?.browser !== undefined || meaning?.clipboard !== undefined)
  if (special !== undefined) {
    if (main.length !== 1) throw new EnvironmentError('unsupported_action', 'a browser or clipboard shortcut must be pressed on its own')
    return [special.browser !== undefined ? { kind: 'navigate', direction: special.browser } : { kind: 'clipboard', op: special.clipboard }]
  }
  const shift = (mask & MODIFIER_BITS.Shift) !== 0
  const producesText = (mask & (MODIFIER_BITS.Control | MODIFIER_BITS.Meta | MODIFIER_BITS.Alt)) === 0
  const steps = []
  let held = 0
  for (const key of modifiers) {
    held |= MODIFIER_BITS[key]
    steps.push(keyEvent('rawKeyDown', keyDescriptor(key), held))
  }
  const descriptors = main.map((key) => keyDescriptor(key, { shift }))
  descriptors.forEach((descriptor, index) => {
    const withText = producesText && descriptor.text !== undefined
    const command = meanings[index]?.command
    steps.push(keyEvent(withText ? 'keyDown' : 'rawKeyDown', descriptor, mask, command !== undefined ? { commands: [command] } : {}))
  })
  for (const descriptor of [...descriptors].reverse()) steps.push(keyEvent('keyUp', descriptor, mask))
  for (const key of [...modifiers].reverse()) {
    held &= ~MODIFIER_BITS[key]
    steps.push(keyEvent('keyUp', keyDescriptor(key), held))
  }
  return steps
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

/** Typing: US-keyboard characters as key events, newline as Enter, tab as Tab, everything else as insertText. */
export function planType({ text }) {
  if (typeof text !== 'string') throw invalid('type needs a text string')
  refuseControl(text)
  const steps = []
  let pending = ''
  const flush = () => {
    if (pending.length > 0) steps.push({ method: 'Input.insertText', params: { text: pending } })
    pending = ''
  }
  const chars = [...text.replace(/\r\n/g, '\n')]
  for (const char of chars) {
    const descriptor = charDescriptor(char)
    if (descriptor === null) {
      pending += char
      continue
    }
    flush()
    steps.push(keyEvent(descriptor.text !== undefined ? 'keyDown' : 'rawKeyDown', descriptor, 0))
    steps.push(keyEvent('keyUp', descriptor, 0))
  }
  flush()
  return steps
}

function planWait({ duration_ms: ms }) {
  if (ms === undefined || ms === null) return [{ kind: 'sleep', ms: WAIT_DEFAULT_MS }]
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > WAIT_MAX_MS) {
    throw invalid(`wait duration_ms must be a number from 0 to ${WAIT_MAX_MS}`)
  }
  return [{ kind: 'sleep', ms }]
}

function planNavigate({ url }) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw invalid('navigate needs an absolute http or https url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw invalid('navigate needs an absolute http or https url')
  return [{ kind: 'navigate', url: parsed.href }]
}

/** Plan one action, or throw an EnvironmentError naming what is wrong. */
export function planAction(action, frame) {
  if (action === null || typeof action !== 'object') throw invalid('an action must be an object')
  switch (action.type) {
    case 'click': return planClick(action, frame, 1)
    case 'double_click': return planClick({ ...action, button: 'left' }, frame, 2)
    case 'triple_click': return planClick({ ...action, button: 'left' }, frame, 3)
    case 'move': {
      const point = toViewport({ x: action.x, y: action.y }, frame)
      return withHeld(heldKeys(action.keys), (modifiers) => [mouse('mouseMoved', point, { modifiers })])
    }
    case 'drag': return planDrag(action, frame)
    case 'scroll': return planScroll(action, frame)
    case 'keypress': return planKeypress(action)
    case 'type': return planType(action)
    case 'wait': return planWait(action)
    case 'screenshot': return [{ kind: 'screenshot' }]
    case 'zoom': return [{ kind: 'zoom', region: action.region, clip: screenshotClip(frame, action.region) }]
    case 'navigate': return planNavigate(action)
    default:
      throw new EnvironmentError('unsupported_action', `unsupported action type '${String(action.type)}'; supported: ${ACTION_TYPES.join(', ')}`)
  }
}

/** Plan every action of a batch, so a batch with one bad action is refused before any of it runs. */
export function planBatch(actions, frame) {
  if (!Array.isArray(actions) || actions.length === 0) throw invalid('a batch needs at least one action')
  return actions.map((action, index) => {
    try {
      return planAction(action, frame)
    } catch (error) {
      if (error instanceof EnvironmentError) error.details = { ...(error.details ?? {}), index }
      throw error
    }
  })
}
