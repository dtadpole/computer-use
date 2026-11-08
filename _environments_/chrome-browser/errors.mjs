/**
 * The one error type the browser environment throws.
 *
 * Every refusal carries a `code` from a fixed list, so the agent core can decide by code (report to the model,
 * ask a person, stop the run) rather than by parsing text, and a `message` that is safe to show the model: it
 * names the field and the rule, never a path, a profile or a stack.
 */

export const ERROR_CODES = Object.freeze([
  'invalid_argument', // a field is missing, malformed or out of range (a point outside the frame, an unknown key)
  'unsupported_action', // the action or chord is understood but this environment will not perform it
  'blocked_by_policy', // the site policy or a floor rule refused a request
  'dialog_open', // a held JavaScript dialog must be answered first
  'taken_over', // a person has taken over; agent input is refused until hand-back
  'cancelled', // the run's signal was aborted
  'timeout', // a bounded wait expired
  'browser_crashed', // the page or the browser went away
  'closed', // the environment was closed
  'resource_refused', // the memory gate or the browser slot limit refused a launch (D-005)
  'sandbox_unavailable', // Chrome cannot keep its own sandbox; the driver refuses rather than run without it (D-012)
])

export class EnvironmentError extends Error {
  constructor(code, message, details = undefined) {
    if (!ERROR_CODES.includes(code)) throw new TypeError(`unknown environment error code '${code}'`)
    super(message)
    this.name = 'EnvironmentError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/** Shorthand for the most common refusal. */
export function invalid(message, details) {
  return new EnvironmentError('invalid_argument', message, details)
}
