/**
 * The network layer of the site filter (R2, R32).
 *
 * One browser-level `Fetch.enable` pauses every request of every tab - documents, frames, XHR and fetch, beacons,
 * popups and each redirect hop (measured); each paused request is decided here and continued or failed. WebSocket
 * handshakes and WebRTC are not paused by `Fetch` (measured); the proxy layer covers them.
 *
 * Order, failing closed at every step:
 * 1. the driver's own floor: page frames never load `file:`, `chrome:`, `devtools:`, `javascript:` and similar
 *    schemes; Chrome's own `chrome-extension:` requests pass only outside page frames;
 * 2. `isFixedDenied(url)` from agent-core (DSH, heddle, the gateway, the live view, link-local), which no
 *    configuration lifts;
 * 3. `sitePolicy(url)`, answering `'allow'` or `{ block: reason }`.
 * A decision function that throws or answers anything else blocks the request.
 */

/** Schemes a page frame never loads, whatever the policies say. */
export const FLOOR_SCHEMES = Object.freeze(['file:', 'chrome:', 'chrome-untrusted:', 'devtools:', 'javascript:', 'view-source:', 'filesystem:'])

function schemeOf(url) {
  try {
    return new URL(url).protocol
  } catch {
    return null
  }
}

/**
 * Decide one request: `{ allow: true }` or `{ allow: false, rule }`.
 *
 * `request` is `{ url, isPageFrame }`; `isPageFrame` is false only for frames that belong to no page target (Chrome's
 * component extensions).
 */
export function decideRequest(request, { sitePolicy, isFixedDenied }) {
  const { url, isPageFrame = true } = request ?? {}
  const scheme = schemeOf(url)
  if (scheme === null) return { allow: false, rule: 'malformed_url' }
  if (scheme === 'chrome-extension:') return isPageFrame ? { allow: false, rule: 'fixed_deny' } : { allow: true }
  if (FLOOR_SCHEMES.includes(scheme)) return { allow: false, rule: 'fixed_deny' }
  try {
    if (isFixedDenied(url) !== false) return { allow: false, rule: 'fixed_deny' }
  } catch {
    return { allow: false, rule: 'policy_error' }
  }
  let verdict
  try {
    verdict = sitePolicy(url)
  } catch {
    return { allow: false, rule: 'policy_error' }
  }
  if (verdict === 'allow') return { allow: true }
  if (verdict !== null && typeof verdict === 'object' && typeof verdict.block === 'string' && verdict.block.length > 0) {
    return { allow: false, rule: verdict.block }
  }
  return { allow: false, rule: 'policy_error' }
}

/**
 * The `Fetch.requestPaused` handler.
 *
 * `send(method, params)` speaks to the browser session; `isPageFrame(frameId)` says whether a frame belongs to a
 * page; `onBlocked({ url, rule, resourceType, frameId })` records a refusal. Every paused request is answered exactly
 * once, so a page never hangs on a request nobody continued.
 */
export function createRequestHandler({ send, sitePolicy, isFixedDenied, isPageFrame = () => true, onBlocked = () => {} }) {
  if (typeof sitePolicy !== 'function' || typeof isFixedDenied !== 'function') {
    throw new TypeError('the request handler needs sitePolicy and isFixedDenied functions')
  }
  return async function onRequestPaused(params) {
    const url = params?.request?.url
    const decision = decideRequest({ url, isPageFrame: isPageFrame(params?.frameId) }, { sitePolicy, isFixedDenied })
    if (decision.allow) {
      await send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {})
      return decision
    }
    // A blocked document is aborted rather than failed: measured, `BlockedByClient` commits Chrome's error page under
    // the blocked URL (a misleading `url`, an extra history entry); `Aborted` leaves the page where it was.
    const errorReason = params?.resourceType === 'Document' ? 'Aborted' : 'BlockedByClient'
    await send('Fetch.failRequest', { requestId: params.requestId, errorReason }).catch(() => {})
    try {
      onBlocked({ url, rule: decision.rule, resourceType: params?.resourceType, frameId: params?.frameId })
    } catch {
      // A recorder that throws must not leave the decision half-applied; the request is already failed.
    }
    return decision
  }
}
