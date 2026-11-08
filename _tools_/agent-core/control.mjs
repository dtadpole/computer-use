import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Run control (design: live-control.md, run-tokens.md, consent-authority.md).
 *
 * One state machine per run: `running`, `paused`, `taken_over`, `awaiting_consent`, `finished`. Every sender speaks
 * through `send(command, { source })`; the transport resolves a token to a source with `authorize(token)`. Only human
 * channels answer consent: a `caller` (the M4 tool's model) never can, and the refusal is recorded by name.
 */

export const STATES = Object.freeze(['running', 'paused', 'taken_over', 'awaiting_consent', 'finished'])
export const SOURCES = Object.freeze(['view', 'control', 'caller', 'api', 'dsh_plugin', 'tty', 'loop', 'local_input'])
// 'always' exists only for desktop app approvals (new_app); an answer's lifetime counts only if its request offered it.
export const LIFETIMES = Object.freeze(['once', 'batch', 'run', 'always'])

/** Which sender may issue which command (run-tokens.md). */
const PERMISSIONS = Object.freeze({
  // local_input (desktop): the person touched the keyboard or pointer; it may only pause (desktop-extension human-control).
  pause: ['view', 'caller', 'control', 'api', 'tty', 'local_input'],
  resume: ['caller', 'control', 'api', 'tty'],
  take_over: ['control', 'api'],
  hand_back: ['control', 'api'],
  stop: ['view', 'caller', 'control', 'api', 'tty', 'loop'],
  consent: ['control', 'api', 'tty', 'dsh_plugin'],
  guide: ['caller', 'control', 'api', 'tty'],
})

/** States a command may be issued from. */
const FROM = Object.freeze({
  pause: ['running'],
  resume: ['paused'],
  take_over: ['running', 'paused', 'awaiting_consent'],
  hand_back: ['taken_over'],
  stop: ['running', 'paused', 'taken_over', 'awaiting_consent'],
  consent: ['running', 'paused', 'taken_over', 'awaiting_consent'],
  guide: ['running', 'paused', 'taken_over', 'awaiting_consent'],
})

/** How a consent answer records who answered (`answeredBy`). */
const ANSWERED_BY = Object.freeze({ control: 'live', api: 'api', tty: 'tty', dsh_plugin: 'dsh_gate' })

function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Create the control object of one run. */
export function createRunControl({ runId = null, tokens = null } = {}) {
  const viewToken = tokens?.view ?? randomBytes(16).toString('hex')
  const controlToken = tokens?.control ?? randomBytes(16).toString('hex')
  const abort = new AbortController()
  const listeners = new Set()
  const waiters = new Set()
  const pending = new Map() // consent id -> { request, resolve, timer }
  const guidance = []
  const notes = []
  let state = 'running'
  let pausedBy = null
  let handoff = null // { resolve } while a handoff decision waits for hand_back
  let stopReason = null
  let result = null

  const emit = (event) => {
    const stamped = { runId, t: new Date().toISOString(), ...event }
    for (const listener of listeners) {
      try { listener(stamped) } catch { /* a listener never breaks the run */ }
    }
  }
  const setState = (next, source) => {
    if (next === state) return
    const prior = state
    state = next
    emit({ type: 'state', state, prior, source })
    for (const wake of [...waiters]) wake()
  }
  const settleConsent = (id, answer) => {
    const entry = pending.get(id)
    if (entry === undefined) return false
    pending.delete(id)
    if (entry.timer) clearTimeout(entry.timer)
    emit({ type: 'consent_resolved', id, approved: answer.approved, lifetime: answer.lifetime, answeredBy: answer.answeredBy })
    entry.resolve(answer)
    if (pending.size === 0 && state === 'awaiting_consent') setState('running', 'loop')
    return true
  }

  function refuse(command, source, error) {
    emit({ type: 'control', command, source, ok: false, error })
    return { ok: false, state, error }
  }

  function send(input, { source } = {}) {
    const { command, ...fields } = typeof input === 'string' ? { command: input } : (input ?? {})
    if (!SOURCES.includes(source)) return refuse(command, source, 'unknown_sender')
    if (PERMISSIONS[command] === undefined) return refuse(command, source, 'unknown_command')
    if (!PERMISSIONS[command].includes(source)) {
      return refuse(command, source, command === 'consent' ? 'consent_not_accepted_from_caller' : 'not_allowed_for_sender')
    }
    if (!FROM[command].includes(state)) return refuse(command, source, 'not_allowed_in_state')
    switch (command) {
      case 'pause':
        pausedBy = source
        setState('paused', source)
        break
      case 'resume':
        // The caller may resume only its own pause; control, api and tty may resume any pause.
        if (source === 'caller' && pausedBy !== 'caller') return refuse(command, source, 'resume_needs_control')
        if (pausedBy === 'local_input') notes.push('The person used the computer while the run was paused; the screen may have changed.')
        pausedBy = null
        setState('running', source)
        break
      case 'take_over':
        setState('taken_over', source)
        break
      case 'hand_back': {
        notes.push(['The user took control and may have changed the page.', fields.note].filter(Boolean).join(' '))
        setState(pending.size > 0 ? 'awaiting_consent' : 'running', source)
        if (handoff !== null) {
          const { resolve } = handoff
          handoff = null
          resolve({ note: fields.note ?? null })
        }
        break
      }
      case 'stop':
        stopReason = fields.reason ?? `stopped by ${source}`
        for (const id of [...pending.keys()]) settleConsent(id, { approved: false, lifetime: 'once', answeredBy: 'stop' })
        setState('finished', source)
        abort.abort(new Error(stopReason))
        if (handoff !== null) {
          handoff.resolve({ stopped: true })
          handoff = null
        }
        break
      case 'consent': {
        if (!pending.has(fields.id)) return refuse(command, source, 'no_such_request')
        if (source === 'dsh_plugin' && fields.lifetime !== undefined && fields.lifetime !== 'once') {
          return refuse(command, source, 'lifetime_not_allowed')
        }
        const offered = pending.get(fields.id)?.request?.lifetimes ?? ['once', 'batch', 'run']
        const lifetime = LIFETIMES.includes(fields.lifetime) && offered.includes(fields.lifetime) ? fields.lifetime : 'once'
        settleConsent(fields.id, { approved: fields.approved === true, lifetime, answeredBy: ANSWERED_BY[source] })
        break
      }
      case 'guide': {
        const text = String(fields.text ?? '').trim()
        if (text === '') return refuse(command, source, 'empty_guidance')
        guidance.push(text)
        emit({ type: 'guidance', source, length: text.length })
        break
      }
      default:
        return refuse(command, source, 'unknown_command')
    }
    emit({ type: 'control', command, source, ok: true })
    return { ok: true, state }
  }

  return {
    runId,
    viewToken,
    controlToken,
    signal: abort.signal,
    get state() { return state },
    get stopReason() { return stopReason },
    get result() { return result },
    /** `control`, `view` or null for a presented token, compared in constant time. */
    authorize(token) {
      if (sameToken(token, controlToken)) return 'control'
      if (sameToken(token, viewToken)) return 'view'
      return null
    },
    agentMayAct: () => state === 'running',
    humanMayAct: () => state === 'taken_over',
    send,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Resolve true once the run may act, false once it is finished. Pause and take-over wait here. */
    checkpoint() {
      if (state === 'running') return Promise.resolve(true)
      if (state === 'finished') return Promise.resolve(false)
      return new Promise((resolve) => {
        const wake = () => {
          if (state === 'running' || state === 'finished') {
            waiters.delete(wake)
            resolve(state === 'running')
          }
        }
        waiters.add(wake)
      })
    },
    /**
     * Ask the human channels; resolves `{ approved, lifetime, answeredBy }`. Only `approved === true` approves;
     * a timeout or a stop is a decline.
     */
    requestConsent(request, { timeoutMs = 300_000 } = {}) {
      if (state === 'finished') return Promise.resolve({ approved: false, lifetime: 'once', answeredBy: 'stop' })
      const id = request.id ?? randomBytes(6).toString('hex')
      return new Promise((resolve) => {
        const timer = timeoutMs > 0 ? setTimeout(() => settleConsent(id, { approved: false, lifetime: 'once', answeredBy: 'timeout' }), timeoutMs) : null
        timer?.unref?.()
        pending.set(id, { request: { ...request, id }, resolve, timer })
        if (state === 'running') setState('awaiting_consent', 'loop')
        emit({ type: 'consent_request', request: { ...request, id } })
      })
    },
    /** Decline a request without a human (the unattended controller). */
    decline(id, answeredBy = 'unattended') {
      return settleConsent(id, { approved: false, lifetime: 'once', answeredBy })
    },
    /** Pending consent requests, rebuilt from state (R62). */
    pending: () => [...pending.values()].map((entry) => entry.request),
    /**
     * A `handoff` decision: enter `taken_over` and resolve at hand-back (`{ note }`), stop (`{ stopped: true }`) or,
     * with `timeoutMs`, when nobody hands back in time (`{ timedOut: true }`, back to `running`).
     */
    handoff(reason, { timeoutMs = null } = {}) {
      if (state === 'finished') return Promise.resolve({ stopped: true })
      return new Promise((resolve) => {
        let timer = null
        const entry = {
          resolve: (value) => {
            if (timer !== null) clearTimeout(timer)
            resolve(value)
          },
        }
        handoff = entry
        if (timeoutMs !== null) {
          timer = setTimeout(() => {
            if (handoff !== entry) return
            handoff = null
            setState('running', 'loop')
            resolve({ timedOut: true })
          }, timeoutMs)
        }
        emit({ type: 'notice', kind: 'handoff', reason })
        setState('taken_over', 'loop')
      })
    },
    /** Take queued guidance and hand-back notes for the next model input. */
    drainGuidance() {
      const out = { guidance: guidance.splice(0), notes: notes.splice(0) }
      return out
    },
    /** Mark the run finished with its result (idempotent). */
    finish(runResult) {
      if (result !== null) return
      result = runResult
      for (const id of [...pending.keys()]) settleConsent(id, { approved: false, lifetime: 'once', answeredBy: 'stop' })
      setState('finished', 'loop')
      emit({ type: 'finished', result: runResult })
    },
    notice(kind, detail = {}) {
      emit({ type: 'notice', kind, ...detail })
    },
  }
}
