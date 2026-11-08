import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  createClaudeGatewayAdapter, createRecorder, createRunControl, createScriptedAdapter, createSitePolicy, loadPlan, newRunId,
  resourceGate, runsDir, runTask, startRun,
} from '../agent-core/lib.mjs'
import { DESKTOP, MAX_WAIT_SECONDS, ToolInputError } from './tools.mjs'

/**
 * Runs inside the MCP server process (design: integration-surface.md): one at a time (0.6), each with its own run
 * control, recorder, live view and environment. Nothing heavy is imported before a start: the browser driver, the
 * desktop driver and the live view load on the first `computer_use_start` that needs them.
 *
 * A browser run is set up here as `cli.mjs run` does. A desktop run goes through agent core's `startRun`, the root
 * `cli.mjs run --env macos-desktop` uses, so the desktop's gates stay in one place and are not copied here: no run
 * without apps, the seat's desktop-run lock, the local-input pause armed before any input, and each start app asked of
 * a person (or covered by their always approval) before the first capture. Both report the same status shape.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const DRIVER = resolve(HERE, '..', '..', '_environments_', 'chrome-browser', 'environment.mjs')
const LIVE_VIEW = resolve(HERE, '..', 'live-view', 'server.mjs')
const CLI = resolve(HERE, '..', 'agent-core', 'cli.mjs')
export const DEFAULT_BOUNDS = Object.freeze({ maxSteps: 30, maxMinutes: 15, maxCostUsd: 2 })
export const ASK_TIMEOUT_MS = 15 * 60_000
/** How often a desktop run's events.jsonl is read for new steps while it runs (startRun keeps its recorder). */
export const EVENT_POLL_MS = 200

/**
 * The controller of a run started over MCP. Questions wait for `computer_use_respond`; consent is never answered
 * here - it waits for the live view (a person with the control token) or, without one, declines at once.
 */
export function mcpController({ humanChannel, onChange = () => {}, askTimeoutMs = ASK_TIMEOUT_MS }) {
  let question = null
  return {
    kind: 'mcp',
    attach(control) {
      if (humanChannel) return null
      return control.subscribe((event) => {
        if (event.type === 'consent_request') queueMicrotask(() => control.decline(event.request.id, 'unattended'))
      })
    },
    answerAsk(text) {
      return new Promise((resolveAnswer) => {
        const id = `q-${randomBytes(4).toString('hex')}`
        const timer = setTimeout(() => {
          question = null
          resolveAnswer(null)
          onChange()
        }, askTimeoutMs)
        timer.unref?.()
        question = { id, text, settle: (answer) => { clearTimeout(timer); question = null; resolveAnswer(answer); onChange() } }
        onChange()
      })
    },
    question: () => (question === null ? null : { question_id: question.id, text: question.text }),
    respond(id, answer) {
      if (question === null || question.id !== id) return false
      question.settle(answer)
      return true
    },
  }
}

/** A short line for the last recorded step. */
export function summarise(type, step, data = {}) {
  if (type === 'action') {
    const action = data.action ?? {}
    const where = action.x !== undefined ? ` at (${action.x}, ${action.y})` : action.url ? ` ${action.url}` : ''
    return `step ${step}: ${action.type ?? 'action'}${where} - ${data.status ?? ''}${data.code ? ` (${data.code})` : ''}`.trim()
  }
  if (type === 'observation') return `step ${step}: looked at ${data.url ?? 'the page'}`
  if (type === 'consent') return `step ${step}: consent ${data.phase}${data.request?.class ? ` (${data.request.class})` : ''}`
  return null
}

/**
 * Follow an events.jsonl as it grows: each call returns the events appended since the last one. The recorder appends
 * whole lines synchronously in this same process, so a read never sees half a line; a partial tail is kept anyway.
 */
export function tailEvents(path) {
  let offset = 0
  let partial = ''
  return () => {
    let size
    try {
      size = statSync(path).size
    } catch {
      return [] // not written yet
    }
    if (size <= offset) return []
    const buffer = Buffer.alloc(size - offset)
    const fd = openSync(path, 'r')
    try {
      readSync(fd, buffer, 0, buffer.length, offset)
    } finally {
      closeSync(fd)
    }
    offset = size
    const lines = (partial + buffer.toString('utf8')).split('\n')
    partial = lines.pop()
    return lines.filter((line) => line.trim() !== '').flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
  }
}

async function defaultLoadModel(spec, { keyFile }) {
  if (spec.model === 'scripted') return createScriptedAdapter(loadPlan(spec.plan))
  return createClaudeGatewayAdapter({ model: spec.model.slice('claude-gateway/'.length), ...(keyFile ? { keyFile } : {}) })
}

/** cli.mjs's parsers for pre-approvals and secret references, loaded only when a run uses them. */
async function cliParsers() {
  const cli = await import(pathToFileURL(CLI).href)
  return { parsePreApproval: cli.parsePreApproval, parseSecrets: cli.parseSecrets }
}

/**
 * Create the run manager. Options: `seat` (the [cu] seat whose browser slot, or desktop-run lock, runs use),
 * `runsDirectory`, `keyFile`, `viewport`, and test seams `launchEnvironment`, `startLiveView`, `loadModel`, `runTask`,
 * `resourceGate` (browser runs), and `startRun`, `appApprovals` (agent core's always store) and `environmentOptions`
 * (desktop runs). `environmentOptions` is a function returning startRun's driver seams for one desktop run - a fake
 * helper's `connect` and a private `runLockDir` - so a check never launches CUHelper.app or takes the team's lock; the
 * server's command line sets none of these.
 */
export function createRunManager(options = {}) {
  const seat = options.seat ?? 'cu-mcp'
  const runsDirectory = options.runsDirectory ?? runsDir()
  const runs = new Map()
  let active = null

  const wakeAll = (run) => {
    for (const wake of [...run.waiters]) wake()
  }

  /** Count one recorded event toward the status: the highest step and a line for the last one. */
  const count = (run, type, step, data) => {
    if (typeof step === 'number' && step > run.steps) run.steps = step
    run.summary = summarise(type, step, data) ?? run.summary
  }

  /** The fields every run carries, whatever its environment; `status` and `describe` read only these. */
  const newRun = (environment) => ({
    runId: null, environment, control: null, dir: null, live: null, viewUrl: null, result: null, steps: 0, summary: null,
    waiters: new Set(), controller: null, done: undefined, refresh: null, startedAt: new Date().toISOString(),
  })

  async function start(spec) {
    if (active !== null && active.result === null) throw new ToolInputError(`run ${active.runId} is still ${active.control.state}; one run at a time - stop it or wait for it to finish`)
    if (active !== null) await active.live?.close().catch(() => {}) // the previous run's replay closes with the next start
    const model = await (options.loadModel ?? defaultLoadModel)(spec, { keyFile: options.keyFile })
    const bounds = {
      maxSteps: spec.maxSteps ?? DEFAULT_BOUNDS.maxSteps,
      maxWallMs: Math.round((spec.maxMinutes ?? DEFAULT_BOUNDS.maxMinutes) * 60_000),
      maxCostUsd: spec.maxCostUsd ?? DEFAULT_BOUNDS.maxCostUsd,
    }
    return spec.environment === DESKTOP ? startDesktop(spec, model, bounds) : startBrowser(spec, model, bounds)
  }

  /** The caller's pre-approvals and secret references, parsed as cli.mjs parses them. */
  async function parseCallerLists(spec) {
    const parsers = spec.preApprove.length > 0 || spec.secrets.length > 0 ? await cliParsers() : null
    return {
      preApprovals: spec.preApprove.map((text) => parsers.parsePreApproval(text)),
      resolveSecret: spec.secrets.length > 0 ? parsers.parseSecrets(spec.secrets) : null,
    }
  }

  async function startBrowser(spec, model, bounds) {
    const runId = newRunId()
    const recorder = createRecorder({ dir: runsDirectory, runId })
    const control = createRunControl({ runId })
    const run = Object.assign(newRun('chrome-browser'), { runId, control, dir: recorder.dir })
    const event = recorder.event.bind(recorder)
    recorder.event = (type, step, data) => {
      event(type, step, data)
      count(run, type, step, data)
      wakeAll(run)
    }
    control.subscribe(() => wakeAll(run))
    run.controller = mcpController({ humanChannel: spec.liveView, onChange: () => wakeAll(run) })

    if (spec.liveView) {
      const startLiveView = options.startLiveView ?? (await import(pathToFileURL(LIVE_VIEW).href)).startLiveView
      run.live = await startLiveView({ control, runId, runDir: recorder.dir })
      run.viewUrl = run.live.viewUrl ?? null
    }
    const sitePolicy = createSitePolicy({ startUrl: spec.startUrl, allow: spec.allowSites.length > 0 ? spec.allowSites : null, block: [], extraDenyPorts: run.live ? [run.live.port] : [] })
    const { preApprovals, resolveSecret } = await parseCallerLists(spec)
    const launch = options.launchEnvironment ?? (await import(pathToFileURL(DRIVER).href)).launchBrowserEnvironment

    let environment
    try {
      environment = await launch({
        seat, viewport: options.viewport ?? { width: 1440, height: 900 }, frame: model.capabilities?.maxImage ?? {}, startUrl: spec.startUrl,
        sitePolicy, resourceGate: options.resourceGate ?? resourceGate, control,
      })
    } catch (error) {
      run.result = { runId, status: 'error', error: `${error.code ?? 'launch_failed'}: ${error.message}`, finalScreenshot: null, trajectoryDir: recorder.dir }
      recorder.writeHeader({ task: { text: spec.task, meta: null }, adapter: model.id, model: model.model ?? null, startedAt: run.startedAt })
      recorder.end(run.result)
      await run.live?.close().catch(() => {})
      run.live = null
      run.viewUrl = null
      runs.set(runId, run)
      active = run
      throw new ToolInputError(`the browser could not start: ${run.result.error}`)
    }
    run.live?.attach(environment)
    runs.set(runId, run)
    active = run
    run.done = (options.runTask ?? runTask)({
      task: { text: spec.task, meta: null }, environment, model, sitePolicy, preApprovals, controller: run.controller, control, recorder, bounds, resolveSecret,
    }).then((result) => result, (error) => ({ runId, status: 'error', error: String(error?.message ?? error), finalScreenshot: null, trajectoryDir: recorder.dir }))
      .then((result) => {
        run.result = { ...result, replayUrl: run.live ? `${run.live.origin}/runs/${runId}?token=${control.viewToken}` : null }
        wakeAll(run)
        return run.result
      })
    return { run_id: runId, environment: 'chrome-browser', view_url: run.viewUrl, state: control.state, trajectory_dir: recorder.dir }
  }

  /**
   * A desktop run through startRun with the caller's apps as candidates. startRun keeps its recorder, so the status
   * follows the run through its events.jsonl. Its live view closes with the run, so a finished desktop run has no view
   * or replay URL; the replay command remains. A run startRun answers at once with an error (no apps, the lock held, a
   * missing grant, the pause not armed) is the tool's refusal, as a browser that could not start is.
   */
  async function startDesktop(spec, model, bounds) {
    const parsed = await parseCallerLists(spec)
    const resolveSecret = parsed.resolveSecret
    // `unknown_target@<bundle id>` covers that app only: the app policy reads the app from `app`, not `origin`.
    const preApprovals = parsed.preApprovals.map((p) => (p.class === 'unknown_target' && p.origin ? { class: p.class, app: p.origin } : p))
    const run = newRun(DESKTOP)
    run.controller = mcpController({ humanChannel: spec.liveView, onChange: () => wakeAll(run) })
    const environmentOptions = typeof options.environmentOptions === 'function' ? options.environmentOptions() : options.environmentOptions
    const handle = await (options.startRun ?? startRun)({
      environment: DESKTOP, task: { text: spec.task, meta: null }, seat, model, apps: spec.apps, excludeApps: spec.excludeApps,
      preApprovals, controller: run.controller, bounds, runsDirectory, resolveSecret, live: spec.liveView,
      ...(options.startLiveView ? { startLiveView: options.startLiveView } : {}),
      ...(options.appApprovals ? { appApprovals: options.appApprovals } : {}),
      ...(environmentOptions ? { environmentOptions } : {}),
    })
    Object.assign(run, { runId: handle.runId, control: handle.control, dir: join(runsDirectory, handle.runId), viewUrl: handle.viewUrl ?? null })
    const fresh = tailEvents(join(run.dir, 'events.jsonl'))
    run.refresh = () => {
      const events = fresh()
      for (const event of events) count(run, event.kind, event.step, event)
      return events.length > 0
    }
    run.control.subscribe(() => wakeAll(run))
    const poll = setInterval(() => { if (run.refresh()) wakeAll(run) }, EVENT_POLL_MS)
    poll.unref?.()
    runs.set(run.runId, run)
    active = run
    run.done = Promise.resolve(handle.done)
      .then((result) => result, (error) => ({ runId: run.runId, status: 'error', error: String(error?.message ?? error), finalScreenshot: null, trajectoryDir: run.dir }))
      .then((result) => {
        clearInterval(poll)
        run.refresh()
        run.viewUrl = null
        run.result = { ...result, replayUrl: null }
        wakeAll(run)
        return run.result
      })
    // A result already settled before the next turn of the event loop is startRun's early failure, not a run.
    const early = await Promise.race([run.done, new Promise((resolveTick) => setImmediate(() => resolveTick(null)))])
    if (early !== null && early.status === 'error') throw new ToolInputError(`the desktop run could not start: ${early.error}`)
    return { run_id: run.runId, environment: DESKTOP, view_url: run.viewUrl, state: run.control.state, trajectory_dir: run.dir }
  }

  function find(runId) {
    const run = runs.get(runId)
    if (run === undefined) throw new ToolInputError(`no run '${runId}' in this server`)
    return run
  }

  /** The status payload; `waitSeconds` waits for any change, returning early; `signal` cancels the wait. */
  async function status({ runId, waitSeconds = 0 }, { signal } = {}) {
    const run = find(runId)
    run.refresh?.()
    const wait = Math.min(Math.max(waitSeconds, 0), MAX_WAIT_SECONDS) * 1000
    if (run.result === null && wait > 0 && !signal?.aborted) {
      await new Promise((resolveWait) => {
        const done = () => {
          clearTimeout(timer)
          run.waiters.delete(done)
          signal?.removeEventListener?.('abort', done)
          resolveWait()
        }
        const timer = setTimeout(done, wait)
        run.waiters.add(done)
        signal?.addEventListener?.('abort', done, { once: true })
      })
    }
    // The run control reaches `finished` a moment before the result is recorded; never report one without the other.
    if (run.result === null && run.control.state === 'finished' && run.done !== undefined) await run.done
    return describe(run)
  }

  function describe(run) {
    run.refresh?.()
    const pending = run.control.pending()
    const body = {
      run_id: run.runId,
      state: run.result !== null ? 'finished' : run.control.state,
      steps: run.steps,
      last_step: run.summary,
      question: run.result === null ? run.controller.question() : null,
      waiting_for_person: pending.length > 0 && run.result === null
        ? { step: run.steps, class: pending[0].class ?? null, what: pending[0].what ?? pending[0].summary ?? null, how: 'ask the user to answer it in the live view themselves; this session cannot answer it' }
        : null,
      view_url: run.viewUrl,
    }
    if (run.result !== null) {
      body.result = run.result
      body.trajectory = { run_dir: run.result.trajectoryDir ?? run.dir, replay_url: run.result.replayUrl ?? null, replay_command: run.result.replayCommand ?? null }
    }
    const content = [{ type: 'text', text: JSON.stringify(body, null, 2) }]
    const shot = run.result?.finalScreenshot
    if (typeof shot === 'string' && existsSync(shot)) content.push({ type: 'image', data: readFileSync(shot).toString('base64'), mimeType: 'image/png' })
    return { body, content }
  }

  function respond({ runId, questionId, answer }) {
    const run = find(runId)
    if (!run.controller.respond(questionId, answer)) throw new ToolInputError(`question '${questionId}' is not pending in run ${runId}`)
    return { run_id: runId, state: run.control.state }
  }

  function control({ runId, command, text }) {
    const run = find(runId)
    const fields = command === 'guide' ? { text } : command === 'stop' ? { reason: text ?? 'stopped by the calling session' } : {}
    const answer = run.control.send({ command, ...fields }, { source: 'caller' })
    if (!answer.ok) throw new ToolInputError(`${command} refused: ${answer.error} (state ${answer.state})`)
    return { run_id: runId, state: answer.state }
  }

  /** Stop the active run and close its live view; used when stdin closes. Bounded by `timeoutMs`. */
  async function shutdown({ timeoutMs = 15_000 } = {}) {
    const run = active
    if (run === null) return
    if (run.result === null) run.control.send({ command: 'stop', reason: 'the calling session ended' }, { source: 'caller' })
    await Promise.race([run.done ?? Promise.resolve(), new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs).unref?.())])
    await run.live?.close().catch(() => {})
  }

  return { start, status, respond, control, shutdown, runs }
}
