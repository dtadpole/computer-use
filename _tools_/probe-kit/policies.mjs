/**
 * CU-384 (D-100): the real deciding components for a policy probe - createSitePolicy behind createPolicy on the
 * browser route, createAppPolicy with a real approvals store on the desktop route - never a stub site policy. The
 * desktop store lives in a private temporary directory that dispose() removes.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPolicy } from '../agent-core/policy.mjs'
import { createSitePolicy } from '../agent-core/sites.mjs'
import { createAppPolicy } from '../agent-core/app-policy.mjs'
import { createAppApprovals } from '../agent-core/app-approvals.mjs'

/** The browser route's policy with these origins allowed by the real site filter. */
export function webPolicy(allow = ['https://mail.fixture.example']) {
  return createPolicy({ sitePolicy: createSitePolicy({ allow }) })
}

/** The desktop route's policy with these bundle ids approved ('always', as the owner's grant), and its cleanup. */
export function deskPolicy(apps) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-probe-kit-'))
  const approvals = createAppApprovals({ path: join(dir, 'approvals.json') })
  for (const app of apps) approvals.grantAlways(app, { by: 'api' })
  const policy = createAppPolicy({ scope: apps, approvals })
  return { policy, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

/** A verdict in one word: allow, or decision:class (decision:rule when there is no class). */
export const verdict = (r) => (r.decision === 'allow' ? 'allow' : `${r.decision}:${r.class ?? r.rule}`)

/**
 * Runs rows [label, policy, action, context, want] and returns the ones that disagree. want is 'allow' or 'ask'
 * ('ask' accepts confirm, handoff and block - anything that is not a free action).
 */
export function check(rows) {
  const wrong = []
  for (const [label, policy, action, context, want] of rows) {
    const r = policy.classify(action, context)
    const asked = r.decision !== 'allow'
    if ((want === 'ask') !== asked) wrong.push(`${label}: got ${verdict(r)}, want ${want}`)
  }
  return wrong
}
