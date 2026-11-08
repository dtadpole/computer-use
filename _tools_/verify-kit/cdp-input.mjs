/**
 * A verifier-side reference executor: canonical computer actions (OpenAI's GA shapes) turned into Chrome
 * DevTools `Input` events. The fixture-site verifier uses it to prove each task is completable by mouse and
 * keyboard alone. It is deliberately independent of the chrome-browser driver it will later help judge
 * (D-012 rule 2): it imports nothing from agent-core or the environments.
 *
 * `inputEvents(action)` is pure and returns `[method, params]` pairs; `executeAction(send, action)` sends
 * them. Coordinates are environment CSS pixels; scaling is the caller's business.
 */

/** Canonical key name to DOM `key`, `code` and Windows virtual key code. */
const NAMED_KEYS = Object.freeze({
  ENTER: ['Enter', 'Enter', 13, '\r'],
  ESCAPE: ['Escape', 'Escape', 27],
  TAB: ['Tab', 'Tab', 9],
  SPACE: [' ', 'Space', 32, ' '],
  BACKSPACE: ['Backspace', 'Backspace', 8],
  DELETE: ['Delete', 'Delete', 46],
  INSERT: ['Insert', 'Insert', 45],
  HOME: ['Home', 'Home', 36],
  END: ['End', 'End', 35],
  PAGEUP: ['PageUp', 'PageUp', 33],
  PAGEDOWN: ['PageDown', 'PageDown', 34],
  ARROWUP: ['ArrowUp', 'ArrowUp', 38],
  ARROWDOWN: ['ArrowDown', 'ArrowDown', 40],
  ARROWLEFT: ['ArrowLeft', 'ArrowLeft', 37],
  ARROWRIGHT: ['ArrowRight', 'ArrowRight', 39],
  CTRL: ['Control', 'ControlLeft', 17],
  SHIFT: ['Shift', 'ShiftLeft', 16],
  ALT: ['Alt', 'AltLeft', 18],
  META: ['Meta', 'MetaLeft', 91],
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, [`F${i + 1}`, `F${i + 1}`, 112 + i]])),
})

const ALIASES = Object.freeze({ RETURN: 'ENTER', ESC: 'ESCAPE', DEL: 'DELETE', PAGE_UP: 'PAGEUP', PAGE_DOWN: 'PAGEDOWN', UP: 'ARROWUP', DOWN: 'ARROWDOWN', LEFT: 'ARROWLEFT', RIGHT: 'ARROWRIGHT', CONTROL: 'CTRL', OPTION: 'ALT', CMD: 'META', COMMAND: 'META', SUPER: 'META', WIN: 'META' })

/** CDP modifier bits. */
export const MODIFIER_BITS = Object.freeze({ ALT: 1, CTRL: 2, META: 4, SHIFT: 8 })

const BUTTONS = Object.freeze({ left: ['left', 1], right: ['right', 2], wheel: ['middle', 4], middle: ['middle', 4], back: ['back', 8], forward: ['forward', 16] })

/** A key's DOM description, or a thrown error naming it (never a guess). */
export function describeKey(name) {
  if (name === ' ') return describeKey('SPACE')
  const upper = String(name).toUpperCase()
  const canonical = ALIASES[upper] ?? upper
  const named = NAMED_KEYS[canonical]
  if (named) return { canonical, key: named[0], code: named[1], keyCode: named[2], text: named[3] }
  if ([...String(name)].length === 1) {
    const char = String(name)
    const lower = char.toLowerCase()
    if (/^[a-z]$/.test(lower)) return { canonical: lower.toUpperCase(), key: lower, code: `Key${lower.toUpperCase()}`, keyCode: lower.toUpperCase().charCodeAt(0), text: lower }
    if (/^[0-9]$/.test(char)) return { canonical: char, key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0), text: char }
    return { canonical: char, key: char, code: '', keyCode: 0, text: char }
  }
  throw new Error(`unsupported key ${JSON.stringify(name)}`)
}

/** The modifier bitmask of held key names. */
export function modifierMask(keys = []) {
  return keys.reduce((mask, name) => mask | (MODIFIER_BITS[describeKey(name).canonical] ?? 0), 0)
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const point = (x, y) => {
  if (!isNumber(x) || !isNumber(y)) throw new Error('coordinates must be finite numbers')
  return { x: Math.round(x), y: Math.round(y) }
}

/** The keyDown and keyUp events of one chord, pressed in order and released in reverse. */
function chord(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('keypress needs a non-empty keys array')
  const described = keys.map(describeKey)
  const events = []
  let mask = 0
  for (const key of described) {
    mask |= MODIFIER_BITS[key.canonical] ?? 0
    const isModifier = MODIFIER_BITS[key.canonical] !== undefined
    // A character typed with Ctrl, Alt or Meta held is a shortcut, not text.
    const text = !isModifier && (mask & (MODIFIER_BITS.CTRL | MODIFIER_BITS.ALT | MODIFIER_BITS.META)) === 0 ? key.text : undefined
    events.push(['Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers: mask, ...(text ? { text } : {}) }])
  }
  for (const key of [...described].reverse()) {
    events.push(['Input.dispatchKeyEvent', { type: 'keyUp', key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers: mask }])
    mask &= ~(MODIFIER_BITS[key.canonical] ?? 0)
  }
  return events
}

/** The CDP events of one canonical action, in order. Throws, naming the problem, on anything it cannot do. */
export function inputEvents(action) {
  const type = action?.type
  const modifiers = modifierMask(action?.keys ?? [])
  const mouse = (event, at, extra = {}) => ['Input.dispatchMouseEvent', { type: event, ...at, modifiers, ...extra }]
  switch (type) {
    case 'click': {
      const at = point(action.x, action.y)
      const [button, buttons] = BUTTONS[action.button ?? 'left'] ?? []
      if (!button) throw new Error(`unsupported button ${JSON.stringify(action.button)}`)
      return [mouse('mouseMoved', at), mouse('mousePressed', at, { button, buttons, clickCount: 1 }), mouse('mouseReleased', at, { button, buttons: 0, clickCount: 1 })]
    }
    case 'double_click': {
      const at = point(action.x, action.y)
      const press = (count) => [mouse('mousePressed', at, { button: 'left', buttons: 1, clickCount: count }), mouse('mouseReleased', at, { button: 'left', buttons: 0, clickCount: count })]
      return [mouse('mouseMoved', at), ...press(1), ...press(2)]
    }
    case 'move':
      return [mouse('mouseMoved', point(action.x, action.y))]
    case 'drag': {
      if (!Array.isArray(action.path) || action.path.length < 2) throw new Error('drag needs a path of at least two points')
      const path = action.path.map((p) => point(p.x, p.y))
      return [
        mouse('mouseMoved', path[0]),
        mouse('mousePressed', path[0], { button: 'left', buttons: 1, clickCount: 1 }),
        ...path.slice(1).map((p) => mouse('mouseMoved', p, { button: 'left', buttons: 1 })),
        mouse('mouseReleased', path.at(-1), { button: 'left', buttons: 0, clickCount: 1 }),
      ]
    }
    case 'scroll': {
      const at = point(action.x, action.y)
      if (!isNumber(action.scroll_x) || !isNumber(action.scroll_y)) throw new Error('scroll needs scroll_x and scroll_y')
      return [mouse('mouseMoved', at), mouse('mouseWheel', at, { deltaX: action.scroll_x, deltaY: action.scroll_y })]
    }
    case 'keypress': {
      const repeat = action.repeat ?? 1
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) throw new Error('repeat must be 1 to 100')
      return Array.from({ length: repeat }, () => chord(action.keys)).flat()
    }
    case 'type': {
      if (typeof action.text !== 'string' || action.text === '') throw new Error('type needs non-empty text')
      return [...action.text].flatMap((char) => {
        if (char === '\n') return chord(['ENTER'])
        const key = describeKey(char)
        const shifted = char !== char.toLowerCase()
        return [
          ['Input.dispatchKeyEvent', { type: 'keyDown', key: char, code: key.code, windowsVirtualKeyCode: key.keyCode, text: char, modifiers: shifted ? MODIFIER_BITS.SHIFT : 0 }],
          ['Input.dispatchKeyEvent', { type: 'keyUp', key: char, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers: shifted ? MODIFIER_BITS.SHIFT : 0 }],
        ]
      })
    }
    case 'wait':
    case 'screenshot':
      return []
    default:
      throw new Error(`unsupported action ${JSON.stringify(type)}`)
  }
}

/** Send one action's events through `send(method, params)`; `wait` sleeps (default 2 s, at most 30 s). */
export async function executeAction(send, action) {
  if (action?.type === 'wait') {
    const ms = Math.min(Math.max(action.duration_ms ?? 2000, 0), 30_000)
    await new Promise((resolve) => setTimeout(resolve, ms))
    return
  }
  for (const [method, params] of inputEvents(action)) await send(method, params)
}
