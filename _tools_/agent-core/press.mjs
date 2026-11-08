/**
 * CU-64 (design: input-vocabulary.md): the toolset's left_mouse_down and left_mouse_up act at the current cursor and
 * could leave a button held across turns. Agent core never sends them as such: a press, its moves and its waits and its
 * release, all in one batch, become one canonical `drag` - so every safety rule of a drag applies (scope and target at
 * its start, held moves only over approved windows or bare desktop, Escape first on a stop, the release reported), and
 * nothing stays held past one input request. A wait inside the press becomes that point's `holdMs` (a long press is a
 * path of one place held), only where the environment can hold. Anything else refuses the whole batch before input.
 */

export const PRESS_HOLD_MAX_MS = 10_000
const PRESS_TYPES = new Set(['mouse_down', 'mouse_up'])
const POINTED = new Set(['click', 'double_click', 'triple_click', 'move', 'scroll'])

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function refuse(actions, at, code, message) {
  return {
    ok: false,
    results: actions.map((action, index) => {
      const type = typeof action?.type === 'string' ? action.type : null
      return index === at
        ? { index, type, status: 'refused', code, message }
        : { index, type, status: 'refused', code: 'batch_refused', message: `nothing ran: action ${at} was refused (${code})` }
    }),
  }
}

/**
 * Compose presses. `lastPointer` is the last point agent core sent before this batch; `holds` is whether the
 * environment can hold a point (a long press). Returns `{ ok: true, actions, members }` - `members[i]` lists the
 * original indices compiled action i stands for - or `{ ok: false, results }` refusing every action, as validateBatch
 * does. A batch without a press comes back unchanged.
 */
export function composePresses(actions, { lastPointer = null, holds = false } = {}) {
  if (!Array.isArray(actions) || !actions.some((action) => PRESS_TYPES.has(action?.type))) {
    return { ok: true, actions, members: (actions ?? []).map((_, index) => [index]) }
  }
  const out = []
  const members = []
  let pointer = lastPointer && isNumber(lastPointer.x) && isNumber(lastPointer.y) ? { x: lastPointer.x, y: lastPointer.y } : null
  let press = null
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    const type = action?.type
    if (press === null) {
      if (type === 'mouse_up') return refuse(actions, index, 'unpaired_press', 'a mouse_up needs its mouse_down earlier in the same batch; send the press, its moves and its release together')
      if (type === 'mouse_down') {
        if (pointer === null) return refuse(actions, index, 'no_pointer', 'a mouse_down presses at the current pointer, and none is known; move the pointer first, in the same batch')
        press = { path: [{ ...pointer }], members: [index], heldMs: 0 }
        continue
      }
      out.push(action)
      members.push([index])
      if (POINTED.has(type) && isNumber(action.x) && isNumber(action.y)) pointer = { x: action.x, y: action.y }
      if (type === 'drag' && Array.isArray(action.path) && action.path.length > 0) {
        const last = action.path[action.path.length - 1]
        if (isNumber(last?.x) && isNumber(last?.y)) pointer = { x: last.x, y: last.y }
      }
      continue
    }
    press.members.push(index)
    if (type === 'move') {
      if (!isNumber(action.x) || !isNumber(action.y)) return refuse(actions, index, 'malformed', 'a move inside a press needs numeric x and y')
      press.path.push({ x: action.x, y: action.y })
      continue
    }
    if (type === 'wait') {
      const ms = action.duration_ms
      if (!Number.isInteger(ms) || ms < 1) return refuse(actions, index, 'malformed', 'a wait inside a press needs a positive whole duration_ms')
      if (!holds) return refuse(actions, index, 'unsupported_action', 'a long press (a wait between mouse_down and mouse_up) is not supported by this environment yet')
      press.heldMs += ms
      if (press.heldMs > PRESS_HOLD_MAX_MS) return refuse(actions, index, 'malformed', `a press may be held at most ${PRESS_HOLD_MAX_MS} ms in all`)
      const at = press.path[press.path.length - 1]
      at.holdMs = (at.holdMs ?? 0) + ms
      continue
    }
    if (type === 'mouse_up') {
      const path = press.path.length === 1 ? [press.path[0], { x: press.path[0].x, y: press.path[0].y }] : press.path
      out.push({ type: 'drag', path, composedFrom: press.members.map((i) => ({ index: i, type: actions[i].type })) })
      members.push(press.members)
      pointer = { x: path[path.length - 1].x, y: path[path.length - 1].y }
      press = null
      continue
    }
    return refuse(actions, index, 'interleaved_press', `only mouse_move and wait may come between mouse_down and mouse_up, not ${String(type)}; send the press, its moves and its release together`)
  }
  if (press !== null) return refuse(actions, press.members[0], 'unpaired_press', 'a mouse_down needs its mouse_up in the same batch; a button is never left held across turns')
  return { ok: true, actions: out, members }
}

/**
 * Results per original block (every tool_use needs one): an uncomposed action keeps its result; a composed press gives
 * its result to its first member and, when it was done, done to the rest - otherwise the rest did not run, which is
 * the batch's halt. `original` is the call's actions, `members` what composePresses returned.
 */
export function expandResults(results, members, original) {
  const out = []
  results.forEach((result, i) => {
    const group = members?.[i] ?? [i]
    group.forEach((index, k) => {
      const type = typeof original?.[index]?.type === 'string' ? original[index].type : result.type
      if (k === 0) out.push({ ...result, index, type })
      else if (result.status === 'done') out.push({ index, type, status: 'done' })
      else if (result.status === 'refused') out.push({ index, type, status: 'refused', code: 'batch_refused', message: result.message })
      else out.push({ index, type, status: 'skipped', message: 'Not executed: an earlier computer action in this turn did not complete.' })
    })
  })
  return out
}
