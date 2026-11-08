/**
 * The one error type the desktop environment throws.
 *
 * A local copy of chrome-browser's `errors.mjs` rather than an import: that module's constructor refuses any code
 * outside its own fixed list, and the desktop needs five more. The shared codes keep their meaning, so agent core
 * decides by code the same way for both environments. The `message` is safe to show the model: it names the field,
 * the rule or the grant, never a path, a token or a stack.
 */

export const ERROR_CODES = Object.freeze([
  // shared with chrome-browser/errors.mjs, same meaning
  'invalid_argument', // a field is missing, malformed or out of range (a point outside the frame, an unknown key)
  'unsupported_action', // the action or chord is understood but this environment will not perform it
  'blocked_by_policy', // a scope or exclusion rule refused the request
  'dialog_open', // kept for parity; the desktop never holds a page dialog
  'taken_over', // a person has taken over or is using the Mac; agent input is refused
  'cancelled', // the run's signal was aborted or the run was stopped
  'timeout', // a bounded wait expired
  'browser_crashed', // kept for parity; the desktop's equivalent is helper_lost
  'closed', // the environment was closed
  'resource_refused', // a launch was refused before it started
  'sandbox_unavailable', // kept for parity with the browser driver
  // desktop only
  'helper_lost', // the helper exited, its socket broke or it broke the protocol; the run ends, nothing is retried
  'not_granted', // the helper lacks a TCC grant (`details.grant`); it never prompts, the owner grants once (D-024)
  'out_of_scope', // the frontmost app or the app under the point is not an approved app of this run
  'display_changed', // the target window moved to another display or the display mode changed; never remapped
  // Secure event input is on (a password prompt or secure field holds the keyboard), so the helper posted no key
  // (input-and-targets.md). Its own code, not `blocked_by_policy`: it is a hand-off to the person, never a confirm
  // a credential answer could lift (R83).
  'secure_input',
  // A system privacy or permission prompt (Allow Paste, a TCC prompt) is shown, or the target belongs to one (CU-76):
  // answering it is the person's, so nothing was posted. A hand-off like secure_input, never a confirm to lift.
  'system_prompt',
  // No window of any approved app is on screen, so there is nothing to show the model or act on (CU-98, CU-100): the
  // person opens the app and runs again. Never helper_lost - the helper is fine and the link stays usable.
  'no_app_window',
])

/**
 * The TCC grants the helper reports in its hello, by protocol name, with the name a person sees in System Settings.
 * Posting events has no pane of its own: macOS lists that access under Accessibility.
 */
export const GRANT_NAMES = Object.freeze({
  screen: 'Screen Recording',
  accessibility: 'Accessibility',
  postEvents: 'Accessibility (posting events)',
  listenEvents: 'Input Monitoring',
})

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

/**
 * The refusal for a missing grant, naming it both ways, so the model's text and the run's error say which grant the
 * owner would have to give; the run itself can never ask for it.
 */
export function notGranted(grant) {
  const label = GRANT_NAMES[grant] ?? 'an unknown'
  return new EnvironmentError('not_granted', `the desktop helper lacks the ${label} grant (${String(grant)}); only the owner can grant it, and this run cannot ask`, { grant })
}
