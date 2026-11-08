/**
 * The retry policy for transient helper and driver errors (CU-56). Narrow on purpose: only errors that are both
 * transient and guarantee nothing reached the screen are retried, and every retry is recorded by the loop.
 *
 * - An input action refused before anything was posted because no app could be verified at its point
 *   (`out_of_scope`, `details.reason: 'target_unverified'` - a short-lived window of a process without a bundle id,
 *   or an Accessibility timeout in the hit test) is retried once, after `inputDelayMs`, if run control still allows
 *   input. The driver's pre-post check refuses every point of an action before posting any of them.
 * - A capture the driver dropped because it included a window outside the scope (`reason: 'capture_leak'`) is
 *   retried up to `captureDelaysMs.length` times; a capture posts nothing.
 * - Nothing else is retried: a covered point (`target_out_of_scope`) waits on a person, and a lost or closed helper,
 *   a changed display, a take-over or a stop end the step or the run as before.
 */
export const RETRY = Object.freeze({ inputDelayMs: 150, captureDelaysMs: Object.freeze([150, 400]) })

/** True for an input refusal that is transient and guarantees nothing was posted. */
export function transientInput(error) {
  return error?.code === 'out_of_scope' && error?.details?.reason === 'target_unverified'
}

/** True for a capture the driver dropped for a transient out-of-scope window. */
export function transientCapture(error) {
  return error?.code === 'out_of_scope' && error?.details?.reason === 'capture_leak'
}

/**
 * CU-82: the helper's front-app check refused before anything was posted - `out_of_scope` with the helper's own reason,
 * no point, nothing partial. It may be macOS still activating the approved app the helper just asked for (the helper
 * re-reads the front app at once), so one retry after `inputDelayMs` usually passes; an app that really is in front is
 * refused again, and nothing was sent either time. A refusal after part of the action was posted is never retried.
 */
export function transientFront(error) {
  const details = error?.details
  return error?.code === 'out_of_scope' && details?.reason === 'out_of_scope' && !details.point && details.partial !== true && !(details.failedAt > 0)
}
