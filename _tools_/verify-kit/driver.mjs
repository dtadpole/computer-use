/**
 * Driving the system under test the way its command line does, for the M2 verifiers: the chrome-browser
 * driver launched with agent-core's own site policy, resource gate (D-014) and run control, and the fixture's
 * input recorder read as the outside observer (D-012).
 */

import { verifySeat } from './seat.mjs'

/** The viewport every M2 verifier declares. */
export const VERIFY_VIEWPORT = Object.freeze({ width: 1024, height: 768 })

/**
 * Launch the driver. Resolves to `{ env }`, or `{ refused }` when the resource gate refuses (memory floor, team
 * cap), which a check reports as unjudged. Any other launch failure is thrown: it is a failure of the row.
 */
export async function launchDriver(sut, { startUrl, viewport = VERIFY_VIEWPORT, frame = {}, runId = 'verify', control } = {}) {
  try {
    const env = await sut.launchBrowserEnvironment({
      seat: verifySeat(),
      viewport,
      frame,
      startUrl,
      sitePolicy: sut.lib.createSitePolicy({ startUrl }),
      resourceGate: sut.lib.resourceGate,
      control: control ?? sut.lib.createRunControl({ runId }),
    })
    return { env }
  } catch (error) {
    if (error?.code === 'resource_refused') return { refused: `the resource gate refused the launch: ${error.message}` }
    throw error
  }
}

/**
 * The reason a run never started because the resource gate refused its browser, or null. startRun reports a refused
 * launch through `done` as `{ status: 'error', error: 'resource_refused: ...' }`; a check reports that as unjudged.
 */
export function launchRefusal(result) {
  return result?.status === 'error' && /^resource_refused\b/.test(String(result.error ?? '')) ? String(result.error) : null
}

/** The recorder's events after record id `since`, once its posts have settled. */
export async function recorderEvents(client, { since = 0, quietMs = 250 } = {}) {
  await client.settle('input-recorder', { quietMs })
  await new Promise((resolve) => setTimeout(resolve, 150))
  return (await client.taskState('input-recorder')).facts.records.filter((record) => record.kind === 'event' && record.id > since)
}

/** The id of the newest recorder event, so a check can read only what one action produced. */
export async function lastEventId(client) {
  const records = (await client.taskState('input-recorder')).facts.records
  return records.length ? records.at(-1).id : 0
}
