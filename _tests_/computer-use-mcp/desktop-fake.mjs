import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { stdioLink, stopFake } from '../macos-desktop/harness.mjs'

/**
 * Desktop runs on the fake helper, for this suite and the heddle-plugin suite. The fake helper is a Node child speaking
 * the helper protocol (never CUHelper.app, no grant, no screen); startRun reaches it through the desktop driver's
 * `connect` seam, and the desktop-run lock is taken in a private `runLockDir`, so no test ever holds the team's
 * `/tmp/cu-desktop-run` (D-024).
 */

export const FIXTURE = 'ai.reflection.cu.fixture'

/** The fake's world: every grant a run needs, one 1280x800 display, the fixture app filling it. */
export const WORLD = Object.freeze({
  grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }],
})

/** A scripted plan that clicks once in the fixture and finishes; returns its absolute path under `dir`. */
export function clickPlan(dir, turns = [{ actions: [{ type: 'click', button: 'left', x: 200, y: 100 }] }, { final: 'Done: clicked.' }]) {
  const path = join(dir, 'desktop-plan.json')
  writeFileSync(path, JSON.stringify({ turns }))
  return path
}

/**
 * Agent core's always store at `path`, holding `apps`: it stands in for an approval a person gave earlier through a
 * human channel (`by: 'api'`), the only way a start app is admitted without asking.
 */
export function alwaysApproved(path, apps = [FIXTURE]) {
  const store = createAppApprovals({ path })
  for (const app of apps) store.grantAlways(app, { by: 'api' })
  return store
}

// Agent core refuses a desktop run whose own environment can load other code (DYLD_*, LD_*, NODE_OPTIONS, NODE_PATH,
// NODE_REPL_EXTERNAL_MODULE, NODE_ICU_DATA), as the real helper would refuse that driver. Tests run desktop jobs in
// this process (and desktop-server.mjs, which imports this file), so they start clean whatever the shell exported.
for (const name of Object.keys(process.env)) {
  if (/^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)) delete process.env[name]
}

/**
 * startRun's driver seams, one fresh fake helper per run: `environmentOptions()` is what the run manager's seam of the
 * same name returns. `requests()` lists what every fake received (its stderr log); `stop()` ends them all.
 */
export function fakeDesktop({ lockDir, world = WORLD, token = 'cu-mcp-test' }) {
  const helpers = []
  return {
    helpers,
    environmentOptions: () => ({
      runLockDir: lockDir,
      connect: async () => {
        const { child, link } = await stdioLink(world, { token })
        helpers.push(child)
        return link
      },
    }),
    requests: () => helpers.flatMap((child) => child.requests),
    stop: () => Promise.all(helpers.map((child) => stopFake(child))),
  }
}
