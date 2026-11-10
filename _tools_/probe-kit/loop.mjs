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
 * Runs `actions` in one model turn. `targets({x, y})` answers what each point holds (a desk.* or web.* shape);
 * `apps` are approved 'always'. Returns [{ type, status, class, rule }] for every action event - 'declined' is an ask the
 * unattended run refused, 'done' a free action.
 */
export async function throughLoop({ kind = 'desktop', frontmost, apps = [], targets, actions }) {
  const tmp = mkdtempSync(join(tmpdir(), 'cu-probe-kit-loop-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind, control, frontmost, targets })
    const appApprovals = createAppApprovals({ path: join(tmp, 'approvals.json') })
    for (const app of apps) appApprovals.grantAlways(app, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'probe', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'probe', dirty: false }, apps, appApprovals })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action')
      .map((e) => ({ type: e.action?.type ?? null, status: e.status, class: e.class ?? null, rule: e.rule ?? null }))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** The last recorded status of the run's only action: 'declined' (asked, refused unattended) or 'done' (free). */
export const lastStatus = (events) => events.at(-1)?.status ?? null
