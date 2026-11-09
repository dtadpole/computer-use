import { readFileSync } from 'node:fs'

import { EXTENSION_ACTIONS } from './actions.mjs'

/**
 * The scripted model (design: model-adapters.md, "Scripted model"). It plays a plan offline: every core suite and
 * offline verifier uses it, and it needs no key. A plan is data, `{ frame, turns }`, or a function
 * `(input, context) => turn` that a verifier's harness supplies through lib.mjs.
 */

export class ScriptError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ScriptError'
    this.code = code
  }
}

const ZERO_USAGE = Object.freeze({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 })

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('aborted'))
    }, { once: true })
  })
}

/** Turn one plan entry into a canonical turn. */
export function toTurn(entry, index) {
  if (entry === null || typeof entry !== 'object') throw new ScriptError('bad_turn', `turn ${index} is not an object`)
  const usage = { ...ZERO_USAGE, ...(entry.usage ?? {}) }
  const base = { call: null, escalation: null, message: entry.message ?? null, usage }
  if (Array.isArray(entry.actions)) {
    return {
      ...base,
      stop: 'call',
      call: { callId: entry.callId ?? `script-${index}`, actions: entry.actions, pendingSafetyChecks: entry.safetyChecks ?? [] },
    }
  }
  if (typeof entry.final === 'string') return { ...base, stop: 'final', message: entry.final }
  if (typeof entry.ask === 'string') return { ...base, stop: 'ask', message: entry.ask }
  if (entry.escalate && typeof entry.escalate === 'object') {
    return {
      ...base,
      stop: 'escalate',
      escalation: { callId: entry.callId ?? `script-${index}`, reason: entry.escalate.reason ?? 'needs_user', evidence: entry.escalate.evidence ?? '' },
    }
  }
  if (typeof entry.refuse === 'string') return { ...base, stop: 'refusal', message: entry.refuse }
  throw new ScriptError('bad_turn', `turn ${index} has none of actions, final, ask, escalate, refuse`)
}

function checkExpect(expect, input, index) {
  if (!expect) return
  const url = input.screenshot?.url ?? input.url ?? ''
  if (expect.urlIncludes !== undefined && !url.includes(expect.urlIncludes)) {
    throw new ScriptError('expect_failed', `turn ${index} expected the url to include '${expect.urlIncludes}', it is '${url}'`)
  }
}

/**
 * CU-81: a static plan names the frame it was written for. A desktop frame (one that carries `sizePt`, its region in
 * points) whose points are the plan's at another backing scale - the plan written at an integer scale k of the same
 * region, the frame rendered at another, as `--simulate-scale` does - maps the plan's pixels by the frames' ratio.
 * Anything else stays frame_mismatch (null here): another display size or region is another layout, and a browser
 * viewport of another size reflows the page, so stretched coordinates would click elsewhere. No frame: unscaled.
 */
export function planScale(planFrame, frame) {
  if (!planFrame) return { x: 1, y: 1 }
  if (!(frame?.width > 0 && frame?.height > 0 && planFrame.width > 0 && planFrame.height > 0)) return null
  if (frame.width === planFrame.width && frame.height === planFrame.height) return { x: 1, y: 1 }
  const pt = frame.sizePt
  if (!(pt?.width > 0 && pt?.height > 0)) return null
  const k = Math.round(planFrame.width / pt.width)
  const near = (a, b) => Math.abs(a - b) <= 1
  if (k < 1 || !near(planFrame.width, pt.width * k) || !near(planFrame.height, pt.height * k)) return null
  return { x: frame.width / planFrame.width, y: frame.height / planFrame.height }
}

/** One canonical action with its frame pixels mapped by `scale` - points, scroll deltas, a drag's path, a zoom region. */
export function scaleAction(action, scale) {
  if (scale.x === 1 && scale.y === 1) return action
  const sx = (v) => (typeof v === 'number' ? Math.round(v * scale.x) : v)
  const sy = (v) => (typeof v === 'number' ? Math.round(v * scale.y) : v)
  const out = { ...action }
  for (const [key, map] of [['x', sx], ['y', sy], ['scroll_x', sx], ['scroll_y', sy]]) if (key in out) out[key] = map(out[key])
  if (Array.isArray(out.path)) out.path = out.path.map((p) => (p && typeof p === 'object' ? { ...p, x: sx(p.x), y: sy(p.y) } : p))
  if (Array.isArray(out.region)) out.region = out.region.map((v, i) => (i % 2 === 0 ? sx(v) : sy(v)))
  return out
}

/** Load a plan file (JSON). */
export function loadPlan(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** CU-342: every adapter createScriptedAdapter built - an identity no field, copy or spread of one can claim. */
const SCRIPTED = new WeakSet()

/**
 * CU-342: whether `adapter` is the very object createScriptedAdapter returned (not a copy, a wrapper or anything else
 * whose `id` says 'scripted'): only such a run may carry the labelled owner-input stand-in, as no model plays it.
 */
export function isScriptedAdapter(adapter) {
  return adapter !== null && typeof adapter === 'object' && SCRIPTED.has(adapter)
}

/**
 * Create the scripted adapter. `plan` is `{ frame, turns }` or a function. The adapter declares every extension and
 * reports provider safety checks, so a plan can exercise the consent gate.
 */
export function createScriptedAdapter(plan) {
  const isFunction = typeof plan === 'function'
  if (!isFunction && (plan === null || typeof plan !== 'object' || !Array.isArray(plan.turns))) {
    throw new ScriptError('bad_plan', 'a plan is { frame, turns } or a function')
  }
  const adapter = {
    id: 'scripted',
    model: 'scripted',
    capabilities: Object.freeze({ maxImage: {}, extensions: EXTENSION_ACTIONS, safetyChecks: true }),
    async open({ frame, task, signal } = {}) {
      const scale = isFunction ? { x: 1, y: 1 } : planScale(plan.frame, frame)
      if (scale === null) {
        throw new ScriptError('frame_mismatch', `the plan was written for ${plan.frame.width}x${plan.frame.height}, the frame is ${frame?.width}x${frame?.height}`)
      }
      const transcript = []
      let index = 0
      return {
        async next(input = {}, options = {}) {
          const abort = options.signal ?? signal
          transcript.push({ role: 'input', step: index, results: input.results ?? null, notes: input.notes ?? [], url: input.screenshot?.url ?? null })
          let entry
          if (isFunction) {
            entry = await plan(input, { index, task, frame })
          } else {
            if (index >= plan.turns.length) throw new ScriptError('script_exhausted', `the plan has no turn ${index}`)
            entry = plan.turns[index]
            checkExpect(entry.expect, input, index)
          }
          if (entry?.delayMs > 0) await sleep(entry.delayMs, abort)
          const turn = toTurn(entry, index)
          if (turn.call) turn.call.actions = turn.call.actions.map((action) => scaleAction(action, scale))
          transcript.push({ role: 'model', step: index, stop: turn.stop, actions: turn.call?.actions ?? null, message: turn.message })
          index += 1
          return turn
        },
        transcript: () => transcript.slice(),
      }
    },
  }
  SCRIPTED.add(adapter)
  return adapter
}
