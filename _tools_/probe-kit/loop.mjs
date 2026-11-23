/**
 * D-103: a consent fix that depends on a field the loop derives (dragSource, paste.source, selection, typeOptions,
 * boundMenuItem, menuOpen and the like) is probed through the real loop, not with the field filled in by hand. This
 * drives agent-core's runTask with its fake environment and a scripted model, and returns each action event's status
 * and decision fields as the run recorded them.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScriptedAdapter } from '../agent-core/adapter-scripted.mjs'
import { createRunControl } from '../agent-core/control.mjs'
import { createFakeEnvironment } from '../agent-core/fake-env.mjs'
import { runTask } from '../agent-core/loop.mjs'
import { createAppApprovals } from '../agent-core/app-approvals.mjs'
import { readRun } from '../agent-core/trajectory.mjs'

/**
 * Runs `actions` in one model turn. `targets({x, y})` answers what each point holds (a desk.* or web.* shape); `focused`
 * is the focused element - a keypress's target is the loop's own pick (keyTarget, else the focus, loop.mjs), so a key
 * probe sets `focused` and never hands the policy a target by hand;
 * `apps` are approved 'always'. Returns [{ type, status, class, rule, code? }] for every action event - 'declined' is an
 * ask the unattended run refused, 'done' a free action, 'refused' an action the loop rejected before judging (its code,
 * e.g. 'malformed' or 'batch_refused', says why - a probe whose rows read 'refused' tested nothing).
 */
export async function throughLoop({ kind = 'desktop', frontmost, apps = [], targets, focused, actions }) {
  const tmp = mkdtempSync(join(tmpdir(), 'cu-probe-kit-loop-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind, control, frontmost, targets, ...(focused !== undefined ? { focused } : {}) })
    const appApprovals = createAppApprovals({ path: join(tmp, 'approvals.json') })
    for (const app of apps) appApprovals.grantAlways(app, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'probe', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'probe', dirty: false }, apps, appApprovals })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action')
      .map((e) => ({ type: e.action?.type ?? e.type ?? null, status: e.status, class: e.class ?? null, rule: e.rule ?? null, ...(e.code ? { code: e.code } : {}) }))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** The last recorded status of the run's only action: 'declined' (asked, refused unattended) or 'done' (free). */
export const lastStatus = (events) => events.at(-1)?.status ?? null
