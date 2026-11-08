/**
 * CU-156: the seat a verifier's browsers, runs and MCP sessions run as. D-005 allows one browser per seat, so a gate
 * run or a developer proving a verifier must not run as cu-verifier while cu-verifier runs live checks:
 * CU_VERIFY_SEAT names another seat (the gate sets cu-integrator, a developer their own). Unset or empty, it is
 * cu-verifier, as before. A value that is not a seat name is refused, never used: it lands in profile paths and
 * command lines.
 */

/** The seat when CU_VERIFY_SEAT is unset: this verifier suite's own. */
export const DEFAULT_VERIFY_SEAT = 'cu-verifier'

// The seat-name shape the browser registry accepts (browser-registry.mjs).
const SEAT_NAME = /^cu-[a-z0-9]+(-[a-z0-9]+){0,3}$/

/** The seat to run as: CU_VERIFY_SEAT when it names a seat, else cu-verifier; throws on anything else. */
export function verifySeat(env = process.env) {
  const seat = env.CU_VERIFY_SEAT
  if (seat === undefined || seat === '') return DEFAULT_VERIFY_SEAT
  if (!SEAT_NAME.test(seat)) throw new Error(`CU_VERIFY_SEAT is not a seat name: ${JSON.stringify(seat).slice(0, 60)}`)
  return seat
}
