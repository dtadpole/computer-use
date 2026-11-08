import { openSync } from 'node:fs'
import { createInterface } from 'node:readline'
import tty from 'node:tty'

/**
 * Consent controllers (design: consent-gate.md, consent-authority.md). A controller attaches to the run control and
 * answers consent requests through a human channel, or declines them (`unattended`). The calling session's model is
 * never a controller.
 */

/** No human: every consent request declines at once, no question is answered. */
export function unattendedController() {
  return {
    kind: 'unattended',
    attached: true,
    /** Nobody can take a handed-off step, so the loop declines it instead of waiting (R28). */
    canHandOff: false,
    attach(control) {
      const decline = (event) => {
        if (event.type === 'consent_request') queueMicrotask(() => control.decline(event.request.id, 'unattended'))
      }
      return control.subscribe(decline)
    },
    async answerAsk() {
      return null
    },
  }
}

/**
 * The in-process `api` controller for tests, verifiers and a harness acting as the person (D-012): `pending()`,
 * `respond({ id, approved, lifetime })`, `answerAsk`, `waitForRequest(timeoutMs)`. Never exposed over MCP or HTTP.
 */
export function apiController({ onAsk = null } = {}) {
  let control = null
  const waiting = new Set()
  return {
    kind: 'api',
    attach(runControl) {
      control = runControl
      return runControl.subscribe((event) => {
        if (event.type !== 'consent_request') return
        for (const wake of [...waiting]) wake(event.request)
      })
    },
    pending: () => (control ? control.pending() : []),
    respond({ id, approved, lifetime = 'once' }) {
      if (!control) throw new Error('the api controller is not attached to a run')
      return control.send({ command: 'consent', id, approved, lifetime }, { source: 'api' })
    },
    /** Resolve with the next pending request, or null after `timeoutMs`. */
    waitForRequest(timeoutMs = 10_000) {
      const already = control?.pending()[0]
      if (already) return Promise.resolve(already)
      return new Promise((resolve) => {
        const wake = (request) => {
          waiting.delete(wake)
          clearTimeout(timer)
          resolve(request)
        }
        const timer = setTimeout(() => {
          waiting.delete(wake)
          resolve(null)
        }, timeoutMs)
        waiting.add(wake)
      })
    },
    async answerAsk(question) {
      return onAsk ? onAsk(question) : null
    },
    control: () => control,
  }
}

/**
 * The controlling terminal (/dev/tty), never stdin: a caller's pipe into stdin must not answer consent (red team C1,
 * R61). Null when the process has no controlling terminal.
 */
export function openControllingTerminal() {
  try {
    return { input: new tty.ReadStream(openSync('/dev/tty', 'r')), output: new tty.WriteStream(openSync('/dev/tty', 'w')) }
  } catch {
    return null
  }
}

// The key a person types at the terminal for each consent lifetime.
const TTY_KEYS = Object.freeze({ once: 'y', batch: 'b', run: 'r', always: 'a' })

/**
 * The CLI's terminal: prints each request, reads y or n; anything but `y` declines. It reads only a real terminal -
 * the controlling terminal by default, or given streams that are TTYs; without one every request declines.
 * Residual: a same-user process that owns a pseudo-terminal can still type into it.
 */
export function ttyController({ input = null, output = null, terminal = undefined } = {}) {
  const streams = input && output ? { input, output } : (terminal === undefined ? openControllingTerminal() : terminal)
  if (!streams || streams.input?.isTTY !== true) return { ...unattendedController(), kind: 'tty_unavailable' }
  ;({ input, output } = streams)
  const owned = !(arguments[0]?.input)
  return {
    kind: 'tty',
    attach(control) {
      const rl = createInterface({ input, output, terminal: false })
      const queue = []
      let busy = false
      const askNext = () => {
        if (busy || queue.length === 0) return
        busy = true
        const request = queue.shift()
        const offered = Array.isArray(request.lifetimes) && request.lifetimes.length > 0 ? request.lifetimes : ['once']
        const keys = offered.map((lifetime) => `${TTY_KEYS[lifetime] ?? '?'}=${lifetime}`).join(', ')
        output.write(`\n[consent] ${request.what ?? request.reason ?? request.kind}\n  class ${request.class ?? '-'}; approve? [${keys}; anything else declines] `)
        rl.once('line', (line) => {
          // One key per offered lifetime; a key for a lifetime the question does not offer declines (cu-verifier finding).
          const lifetime = offered.find((name) => TTY_KEYS[name] === line.trim().toLowerCase()) ?? null
          control.send({ command: 'consent', id: request.id, approved: lifetime !== null, lifetime: lifetime ?? 'once' }, { source: 'tty' })
          busy = false
          askNext()
        })
      }
      const unsubscribe = control.subscribe((event) => {
        if (event.type === 'consent_request') {
          queue.push(event.request)
          askNext()
        }
      })
      return () => {
        unsubscribe()
        rl.close()
        if (owned) { input.destroy?.(); output.destroy?.() }
      }
    },
    answerAsk(question) {
      return new Promise((resolve) => {
        const rl = createInterface({ input, output, terminal: false })
        output.write(`\n[question] ${question}\n> `)
        rl.once('line', (line) => {
          rl.close()
          resolve(line.trim() === '' ? null : line.trim())
        })
      })
    },
  }
}
