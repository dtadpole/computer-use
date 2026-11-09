import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createAppApprovals } from './app-approvals.mjs'
import { panelDestination, protectedPath } from './app-policy.mjs'
import { unattendedController } from './consent.mjs'
import { createRunControl } from './control.mjs'
import { runTask, standInTurnsOf } from './loop.mjs'
import { resourceGate } from './resource-gate.mjs'
import { createSitePolicy } from './sites.mjs'
import { createRecorder, newRunId, runsDir } from './trajectory.mjs'

/**
 * The composition root shared by cli.mjs and in-process harnesses (design: live-control.md, D-012): it loads the
 * chosen environment and the live view by path at call time, so lib.mjs statically imports neither. `startRun`
 * resolves once the environment is up and the live view serves, handing the caller the view and control URLs while the
 * run is live; `done` resolves to the run result. The control URL is for a person or a harness acting as one, never
 * for a calling model (consent-authority.md).
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ENVIRONMENTS_DIR = resolve(HERE, '..', '..', '_environments_')
export const ENVIRONMENTS = Object.freeze({
  'chrome-browser': resolve(ENVIRONMENTS_DIR, 'chrome-browser', 'environment.mjs'),
  'macos-desktop': resolve(ENVIRONMENTS_DIR, 'macos-desktop', 'environment.mjs'),
})
// The factory each driver exports (cu-developer-two's modules, loaded only when a run picks them).
const LAUNCHERS = Object.freeze({ 'chrome-browser': 'launchBrowserEnvironment', 'macos-desktop': 'launchDesktopEnvironment' })
export const LIVE_VIEW = resolve(HERE, '..', 'live-view', 'server.mjs')

/**
 * Options: `task` (text or `{ text, meta }`), `startUrl`, `seat`, `model` (an adapter), `allow`, `block`,
 * `preApprovals`, `controller`, `bounds`, `runsDirectory`, `resolveSecret`, `viewport`, `live` (default true),
 * `environment` (name, default `chrome-browser`), `signal`, and test seams `launch` and `startLiveView`.
 * `environment: 'macos-desktop'` attaches to already-running apps, so it takes `apps` (approved start bundle ids,
 * at least one) and `excludeApps` in place of `startUrl` (the seat stays required); `appApprovals` replaces the default always
 * store for tests. `inspector` replaces the page-text inspector for measurement harnesses only (e.g. `() => []` to
 * measure what the model alone escalates); cli.mjs never exposes it, so shipped runs always keep the inspector.
 * `onEvent(line)` hears every trajectory event line as it is written, secret values scrubbed as in the file; a
 * throwing listener never breaks the run. The live view closes when the run ends (D-009) unless `keepLiveView: true`:
 * then it keeps serving the replay, the result carries `replayUrl` (view token, as the MCP run manager builds it), and
 * the caller closes it with the handle's `closeLiveView()`. `standInTurns` (CU-342) goes to runTask as given; only
 * cli.mjs run sets it, after its gates, and a driver without simulateLocalInput fails the run before it starts.
 * The handle: `{ runId, control, viewUrl, controlUrl, started, closeLiveView, done }`; `started` is false when the run
 * was refused or failed before runTask began (`done` then resolves the error result), true otherwise.
 */
export async function startRun(options) {
  const { startUrl, seat, model } = options
  const name = options.environment ?? 'chrome-browser'
  const desktop = name === 'macos-desktop'
  // A desktop run needs its seat too: the desktop driver's one-run-at-a-time lock names the holder (cu-verifier's finding).
  if (!model || !seat || (!desktop && !startUrl)) throw new TypeError(desktop ? 'startRun needs seat and model' : 'startRun needs startUrl, seat and model')
  // CU-342: cli.mjs run's gated stand-in turns, checked before anything starts; never read from the environment here.
  const standInTurns = standInTurnsOf(options.standInTurns)
  const task = typeof options.task === 'string' ? { text: options.task, meta: null } : options.task
  const runId = newRunId()
  const recorder = createRecorder({ dir: options.runsDirectory ?? runsDir(), runId })
  const control = createRunControl({ runId })
  let live = null
  let closing = null
  /** Close the live view once; later calls resolve the same close. A close that fails leaves nothing to do. */
  const closeLiveView = () => {
    closing ??= Promise.resolve().then(() => live?.close()).then(() => undefined, () => undefined)
    return closing
  }

  // The same shape as runTask's result, so a caller reading usage or actions never trips on a run that never started.
  const failEarly = async (error) => {
    const now = new Date().toISOString()
    const result = {
      runId, status: 'error', finalMessage: null, steps: 0,
      actions: { done: 0, refused: 0, blocked: 0, declined: 0, handed_off: 0, skipped: 0, failed: 0 },
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
      finalScreenshot: null, trajectoryDir: recorder.dir, replayUrl: null, startedAt: now, endedAt: now,
      error: `${error.code ?? 'launch_failed'}: ${error.message}`,
    }
    recorder.writeHeader({ task, adapter: model.id, model: model.model ?? null, startedAt: new Date().toISOString() })
    recorder.end(result)
    // Nothing ran, so there is nothing to replay: the view closes even with keepLiveView.
    await closeLiveView()
    return { runId, control, viewUrl: null, controlUrl: null, started: false, closeLiveView, done: Promise.resolve(result) }
  }

  const apps = desktop ? [...(options.apps ?? [])] : null
  // A granted helper silently refuses a driver whose environment can load other code (helper-boundary.md, D-029): say so
  // here, naming the variables, instead of ending helper_lost with no reason the person can see.
  if (desktop) {
    const loaders = Object.keys(options.env ?? process.env).filter((name) => /^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name))
    if (loaders.length > 0) {
      return failEarly({ code: 'unclean_environment', message: `start the desktop run from a clean environment: unset ${loaders.join(', ')} (the helper refuses a driver that can load other code)` })
    }
  }
  // Nothing approved means nothing to act in: refuse before any helper starts (app-policy.md).
  if (desktop && apps.length === 0) {
    return failEarly({ code: 'invalid_argument', message: 'a desktop run needs at least one approved app (apps); with none there is nothing to act in' })
  }
  if (options.live !== false) {
    const startLiveView = options.startLiveView ?? (await import(pathToFileURL(LIVE_VIEW).href)).startLiveView
    live = await startLiveView({ control, runId, runDir: recorder.dir })
  }
  // The desktop has no site filter: the app policy in runTask takes its place.
  const sitePolicy = desktop ? null : createSitePolicy({ startUrl, allow: options.allow ?? null, block: options.block ?? [], extraDenyPorts: live ? [live.port] : [] })
  const frame = model.capabilities?.maxImage ?? {}
  let environment
  try {
    const launch = options.launch ?? (await import(pathToFileURL(ENVIRONMENTS[name]).href))[LAUNCHERS[name]]
    // CU-68: agent core opts desktop runs into the frame re-fit at the first app's join - it rewrites the header and
    // locks the frame before model.open - unless the caller's environmentOptions say otherwise (a copy; theirs is untouched).
    if (desktop) options = { ...options, environmentOptions: { refitFrameAtFirstApp: true, ...(options.environmentOptions ?? {}) } }
    // environmentOptions carries driver seams (a fake helper) for checks before the owner's grant; the core fields win.
    environment = await launch(desktop ? { ...(options.environmentOptions ?? {}), apps, frame, control, seat } : { seat, viewport: options.viewport, frame, startUrl, sitePolicy, resourceGate, control })
  } catch (error) {
    return failEarly(error)
  }
  // No synthetic input to a shared Mac without the local-input pause (D-024, human-control.md): refuse before the
  // model is asked anything, whatever the driver did about it.
  if (desktop && environment.pauseArmed !== true) {
    try { await environment.close() } catch { /* already closed */ }
    return failEarly({ code: 'pause_not_armed', message: 'the local-input pause is not armed, so the desktop run does not start (no input to a shared Mac without it)' })
  }
  // CU-342: a stand-in the driver cannot post ends the run here, before the model, never mid-run.
  if (standInTurns.length > 0 && typeof environment.simulateLocalInput !== 'function') {
    try { await environment.close() } catch { /* already closed */ }
    return failEarly({ code: 'stand_in_unsupported', message: 'standInTurns needs a driver with simulateLocalInput (macos-desktop); this one has none, so the run does not start' })
  }
  live?.attach(environment)
  const keep = options.keepLiveView === true && live !== null
  const done = runTask({
    task,
    environment,
    model,
    sitePolicy,
    preApprovals: options.preApprovals ?? [],
    controller: options.controller ?? unattendedController(),
    control,
    recorder,
    bounds: options.bounds ?? {},
    signal: options.signal ?? null,
    resolveSecret: options.resolveSecret ?? null,
    onEvent: typeof options.onEvent === 'function' ? options.onEvent : null,
    ...(desktop ? { apps, excludeApps: options.excludeApps ?? [], appApprovals: options.appApprovals ?? createAppApprovals() } : {}),
    ...(options.inspector ? { inspector: options.inspector } : {}),
    ...(standInTurns.length > 0 ? { standInTurns } : {}),
  })
    // A kept view serves this run's replay until the caller closes it; its URL carries the view token, never control.
    .then((result) => (keep && closing === null ? { ...result, replayUrl: replayUrlOf(live, runId, control) } : result))
    .finally(() => (keep ? undefined : closeLiveView()))
  return { runId, control, viewUrl: live?.viewUrl ?? null, controlUrl: live?.controlUrl ?? null, started: true, closeLiveView, done }
}

/** The replay URL of a run's live view, as the MCP run manager builds it: `<origin>/runs/<run-id>?token=<view token>`. */
function replayUrlOf(live, runId, control) {
  const origin = live.origin ?? new URL(live.viewUrl).origin
  return `${origin}/runs/${runId}?token=${control.viewToken}`
}

/**
 * The target fields a point inspection prints: what the policy reads, never a value. CU-154: a menu item's key
 * equivalent ({ char, modifiers }: the driver's keyEquivalentOf, #356) too, so a read-only inspection can show what a click on Edit > Paste means.
 */
const inspected = (target) => (target === null || target === undefined ? null : {
  origin: target.origin ?? null, role: target.role ?? null, subrole: target.subrole ?? null, name: target.name ?? null,
  panel: target.panel ?? null, elementOwner: target.elementOwner ?? null, hostedBy: target.hostedBy ?? null,
  opaque: target.opaque === true, secure: target.secure === true, keyEquivalent: target.keyEquivalent ?? null,
  // CU-328: the helper's inWebArea (CU-322) exactly as the driver passes it - true or false, or no key when the driver
  // has no read (an older helper, or a walk that could not finish). Unread is never printed as false.
  ...(Object.hasOwn(target, 'inWebArea') ? { inWebArea: target.inWebArea } : {}),
})

/**
 * Read-only point inspection for verification (CU-39, D-045): it launches the desktop environment under the desktop-run
 * lock like a run, admits only apps the always store already covers - it asks nothing and grants nothing - and
 * describes the element at each global screen point through the same `inspectPoint` a run uses. It never calls
 * `perform`, never loads a model and keeps no capture, so it can look at an open or save panel without touching it.
 * Options: `seat`, `apps` (bundle ids), `points` ([{x, y}] in global points), `panel` (also read the open or save panel's
 * selection once, and say what agent core would make of it: the resolved destination, whether it is known and protected),
 * `focused` (also read the focused element once: role, name and the helper's inWebArea, CU-328),
 * `env`, and test seams `launch`, `appApprovals` and `environmentOptions`. Returns `{ seat, frame, scope, points, panel?, focused? }`.
 */
export async function inspectPoints(options) {
  const { seat, apps = [], points = [] } = options
  if (!seat) throw new TypeError('inspectPoints needs seat')
  if (apps.length === 0) throw new TypeError('inspectPoints needs at least one app')
  const loaders = Object.keys(options.env ?? process.env).filter((name) => /^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name))
  if (loaders.length > 0) throw Object.assign(new Error(`start from a clean environment: unset ${loaders.join(', ')}`), { code: 'unclean_environment' })
  const approvals = options.appApprovals ?? createAppApprovals()
  const control = createRunControl({ runId: newRunId() })
  const launch = options.launch ?? (await import(pathToFileURL(ENVIRONMENTS['macos-desktop']).href))[LAUNCHERS['macos-desktop']]
  // CU-217 (D-066): inspect posts nothing - addApp sends only a scope, inspectPoint is a hit test, the panel a read - so
  // it acquires the desktop-run lock with noInput: admitted while the owner is at the Mac, and the environment refuses
  // any input on such a run (perform's no_input_run). Set after the options, so no caller can turn it off.
  const environment = await launch({ ...(options.environmentOptions ?? {}), apps, frame: {}, control, seat, noInput: true })
  try {
    const scope = []
    for (const app of apps) {
      if (!approvals.covers(app)) {
        scope.push({ app, added: false, reason: 'not always-approved (inspect grants nothing)' })
        continue
      }
      try {
        await environment.addApp(app)
        scope.push({ app, added: true })
      } catch (error) {
        scope.push({ app, added: false, reason: error?.code ?? 'failed' })
      }
    }
    const frame = environment.frame
    const results = []
    for (const at of points) {
      try {
        // Global points to this run's frame pixels; the driver maps them back with toGlobal.
        const x = Math.round((at.x - frame.originPt.x) * frame.scaleX)
        const y = Math.round((at.y - frame.originPt.y) * frame.scaleY)
        results.push({ atPt: { x: at.x, y: at.y }, target: inspected(await environment.inspectPoint({ x, y })) })
      } catch (error) {
        results.push({ atPt: { x: at.x, y: at.y }, error: `${error?.code ?? 'failed'}: ${error?.message ?? ''}` })
      }
    }
    let panel
    if (options.panel) {
      if (typeof environment.panelSelection !== 'function') {
        panel = { error: 'unsupported: this driver has no panelSelection' }
      } else {
        try {
          const selection = (await environment.panelSelection()) ?? null
          const destination = panelDestination(selection)
          panel = { selection, destination: { ...destination, protected: destination.known ? protectedPath(destination.path) : null } }
        } catch (error) {
          panel = { error: `${error?.code ?? 'failed'}: ${error?.message ?? ''}` }
        }
      }
    }
    // CU-328: with `focused`, the element that has keyboard focus once (role, name, inWebArea - what a key would be
    // judged by), through the same read a run uses; null when nothing approved has focus.
    let focused
    if (options.focused) {
      if (typeof environment.focusedElement !== 'function') {
        focused = { error: 'unsupported: this driver has no focusedElement' }
      } else {
        try {
          focused = inspected(await environment.focusedElement())
        } catch (error) {
          focused = { error: `${error?.code ?? 'failed'}: ${error?.message ?? ''}` }
        }
      }
    }
    return { seat, frame: { width: frame.width, height: frame.height, originPt: frame.originPt, display: frame.display ?? null }, scope, points: results, ...(options.panel ? { panel } : {}), ...(options.focused ? { focused } : {}) }
  } finally {
    try { await environment.close() } catch { /* already closed */ }
  }
}
