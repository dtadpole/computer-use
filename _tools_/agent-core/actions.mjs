import { KeyError, normalizeKey } from './keys.mjs'

/**
 * The canonical action schema (design: action-schema.md): OpenAI's GA `computer_call` actions field for field, four
 * marked extensions, and whole-batch validation. One malformed or unsupported action refuses the whole batch before
 * anything runs, each action refused by name with a code (R14, R15, R19).
 */

export const GA_ACTIONS = Object.freeze(['click', 'double_click', 'drag', 'move', 'scroll', 'keypress', 'type', 'wait', 'screenshot'])
export const EXTENSION_ACTIONS = Object.freeze(['triple_click', 'zoom', 'cursor_position', 'navigate', 'hold_key'])
export const BUTTONS = Object.freeze(['left', 'right', 'wheel', 'back', 'forward'])
export const MAX_ACTIONS_PER_CALL = 20
export const WAIT_DEFAULT_MS = 1000
export const WAIT_MAX_MS = 10_000
export const KEYPRESS_MAX_REPEAT = 100
export const DRAG_MAX_POINTS = 100

/** Statuses an action result may carry (action-schema.md, "Result per action"). */
export const RESULT_STATUSES = Object.freeze(['done', 'refused', 'blocked', 'declined', 'handed_off', 'skipped', 'failed'])

const FIELDS = Object.freeze({
  click: ['x', 'y', 'button', 'keys'],
  double_click: ['x', 'y', 'keys'],
  triple_click: ['x', 'y', 'keys'],
  move: ['x', 'y', 'keys'],
  drag: ['path', 'keys'],
  scroll: ['x', 'y', 'scroll_x', 'scroll_y', 'keys'],
  keypress: ['keys', 'repeat'],
  type: ['text'],
  wait: ['duration_ms'],
  screenshot: [],
  zoom: ['region'],
  cursor_position: [],
  navigate: ['url'],
  hold_key: ['keys', 'duration_ms'],
})

/** A refusal of one action; `code` is `unsupported_action`, `malformed`, `out_of_bounds` or `unsupported_key`. */
class Refusal extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function point(value, frame, field) {
  if (value === null || typeof value !== 'object' || !isNumber(value.x) || !isNumber(value.y)) {
    throw new Refusal('malformed', `${field} needs numeric x and y`)
  }
  const x = Math.round(value.x)
  const y = Math.round(value.y)
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    throw new Refusal('out_of_bounds', `${field} (${x}, ${y}) is outside the ${frame.width}x${frame.height} screenshot`)
  }
  return { x, y }
}

function keyList(value, { required }) {
  if (value === undefined && !required) return undefined
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Refusal('malformed', required ? 'keys must be a non-empty array of key names' : 'keys must be an array of key names')
  }
  return value.map((name) => {
    try {
      return normalizeKey(name)
    } catch (error) {
      if (error instanceof KeyError) throw new Refusal('unsupported_key', error.message)
      throw error
    }
  })
}

function withKeys(out, keys) {
  if (keys !== undefined && keys.length > 0) out.keys = keys
  return out
}

/** Validate and normalise one action against the frame; throws `Refusal`. */
function validateOne(action, frame, extensions) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) throw new Refusal('malformed', 'an action must be an object')
  const { type } = action
  if (typeof type !== 'string') throw new Refusal('malformed', 'an action needs a string type')
  const known = GA_ACTIONS.includes(type) || (EXTENSION_ACTIONS.includes(type) && extensions.includes(type))
  if (!known) throw new Refusal('unsupported_action', `unsupported action '${type}'`)
  switch (type) {
    case 'click': {
      if (!BUTTONS.includes(action.button)) throw new Refusal('malformed', `click needs button ${BUTTONS.join(', ')}`)
      return withKeys({ type, button: action.button, ...point(action, frame, 'click') }, keyList(action.keys, { required: false }))
    }
    case 'double_click':
    case 'triple_click':
    case 'move':
      return withKeys({ type, ...point(action, frame, type) }, keyList(action.keys, { required: false }))
    case 'drag': {
      const { path } = action
      if (!Array.isArray(path) || path.length < 2 || path.length > DRAG_MAX_POINTS) {
        throw new Refusal('malformed', `drag needs a path of 2 to ${DRAG_MAX_POINTS} points`)
      }
      // CU-64: a point may carry holdMs - a long press composed by agent core (press.mjs), held there before moving on.
      const held = (p, i) => {
        if (p?.holdMs === undefined) return {}
        if (!Number.isInteger(p.holdMs) || p.holdMs < 1 || p.holdMs > WAIT_MAX_MS) throw new Refusal('malformed', `drag path point ${i} holdMs must be a whole number of ms from 1 to ${WAIT_MAX_MS}`)
        return { holdMs: p.holdMs }
      }
      return withKeys({ type, path: path.map((p, i) => ({ ...point(p, frame, `drag path point ${i}`), ...held(p, i) })) }, keyList(action.keys, { required: false }))
    }
    case 'scroll': {
      if (!isNumber(action.scroll_x) || !isNumber(action.scroll_y)) throw new Refusal('malformed', 'scroll needs numeric scroll_x and scroll_y')
      const out = { type, ...point(action, frame, 'scroll'), scroll_x: Math.round(action.scroll_x), scroll_y: Math.round(action.scroll_y) }
      return withKeys(out, keyList(action.keys, { required: false }))
    }
    case 'keypress': {
      const out = { type, keys: keyList(action.keys, { required: true }) }
      if (action.repeat !== undefined) {
        if (!Number.isInteger(action.repeat) || action.repeat < 1 || action.repeat > KEYPRESS_MAX_REPEAT) {
          throw new Refusal('malformed', `keypress repeat must be an integer from 1 to ${KEYPRESS_MAX_REPEAT}`)
        }
        if (action.repeat > 1) out.repeat = action.repeat
      }
      return out
    }
    case 'hold_key': {
      // CU-64: keys held down for duration_ms, then released in reverse - one input request, at most as long as a wait.
      // The duration first, named in the model's units (R7): a bare hold_key lacks both, and the duration is the fix.
      if (!Number.isInteger(action.duration_ms) || action.duration_ms < 1 || action.duration_ms > WAIT_MAX_MS) {
        throw new Refusal('malformed', `hold_key needs a duration from 0.001 to ${WAIT_MAX_MS / 1000} seconds (duration_ms 1 to ${WAIT_MAX_MS})`)
      }
      const keys = keyList(action.keys, { required: true })
      return { type, keys, duration_ms: action.duration_ms }
    }
    case 'type':
      if (typeof action.text !== 'string' || action.text.length === 0) throw new Refusal('malformed', 'type needs non-empty text')
      return { type, text: action.text }
    case 'wait': {
      const ms = action.duration_ms ?? WAIT_DEFAULT_MS
      if (!Number.isInteger(ms) || ms < 0 || ms > WAIT_MAX_MS) {
        throw new Refusal('malformed', `wait duration_ms must be an integer from 0 to ${WAIT_MAX_MS}`)
      }
      return { type, duration_ms: ms }
    }
    case 'screenshot':
    case 'cursor_position':
      return { type }
    case 'zoom': {
      const { region } = action
      if (!Array.isArray(region) || region.length !== 4 || !region.every(isNumber)) {
        throw new Refusal('malformed', 'zoom needs region [x0, y0, x1, y1]')
      }
      const [x0, y0, x1, y1] = region.map(Math.round)
      if (x0 < 0 || y0 < 0 || x1 > frame.width || y1 > frame.height || x1 <= x0 || y1 <= y0) {
        throw new Refusal('out_of_bounds', `zoom region [${[x0, y0, x1, y1].join(', ')}] is empty or outside the screenshot`)
      }
      return { type, region: [x0, y0, x1, y1] }
    }
    case 'navigate': {
      let url
      try {
        url = new URL(action.url)
      } catch {
        throw new Refusal('malformed', 'navigate needs an absolute http or https url')
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Refusal('malformed', 'navigate needs an absolute http or https url')
      return { type, url: url.href }
    }
    default:
      throw new Refusal('unsupported_action', `unsupported action '${type}'`)
  }
}

/**
 * Validate a whole batch against the environment's frame. `extensions` lists the extension actions the active
 * adapter declared. Returns `{ ok: true, actions, warnings }` with normalised actions, or `{ ok: false, results }`
 * with every action `refused`: the offending ones with their code, the rest with `batch_refused`.
 */
export function validateBatch(actions, { frame, extensions = [] } = {}) {
  if (!frame || !isNumber(frame.width) || !isNumber(frame.height)) throw new TypeError('validateBatch needs the environment frame')
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: false, results: [{ index: 0, type: null, status: 'refused', code: 'malformed', message: 'a call needs at least one action' }] }
  }
  if (actions.length > MAX_ACTIONS_PER_CALL) {
    return {
      ok: false,
      results: actions.map((action, index) => ({
        index, type: action?.type ?? null, status: 'refused', code: 'batch_too_large',
        message: `a call may carry at most ${MAX_ACTIONS_PER_CALL} actions; it carried ${actions.length}`,
      })),
    }
  }
  const normalised = []
  const problems = []
  const warnings = []
  actions.forEach((action, index) => {
    try {
      normalised.push(validateOne(action, frame, extensions))
      const extra = Object.keys(action).filter((key) => key !== 'type' && !FIELDS[action.type].includes(key))
      if (extra.length > 0) warnings.push({ index, ignoredFields: extra })
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      problems.push({ index, code: error.code, message: error.message })
    }
  })
  if (problems.length === 0) return { ok: true, actions: normalised, warnings }
  const first = problems[0]
  return {
    ok: false,
    results: actions.map((action, index) => {
      const problem = problems.find((p) => p.index === index)
      const type = typeof action?.type === 'string' ? action.type : null
      return problem
        ? { index, type, status: 'refused', code: problem.code, message: problem.message }
        : { index, type, status: 'refused', code: 'batch_refused', message: `nothing ran: action ${first.index} was refused (${first.code})` }
    }),
  }
}
