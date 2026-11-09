#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createScriptedAdapter, isScriptedAdapter, loadPlan } from './adapter-scripted.mjs'
import { createAppApprovals } from './app-approvals.mjs'
import { ttyController, unattendedController } from './consent.mjs'
import { ENVIRONMENTS, inspectPoints, startRun } from './run.mjs'
import { buildInfo, cuHome, formatReplay, pruneRuns, readRun, runsDir } from './trajectory.mjs'

/**
 * The command line (design: run-outcomes.md, trajectory.md). It is the composition root: it loads the chosen
 * environment by path at run time, so nothing in lib.mjs imports a driver. A session never runs `run` in a blocking
 * call: a run may last its wall-time bound, so start it as a background job.
 *
 *   cli.mjs run --task TEXT --start-url URL --seat cu-<seat> [--model scripted --plan FILE | --model claude-gateway/<model>]
 *               [--allow PATTERN]... [--block PATTERN]... [--pre-approve CLASS[@ORIGIN]]... [--secret NAME=env:VAR|file:PATH]...
 *               [--max-steps N] [--max-minutes N] [--max-cost USD] [--viewport WxH] [--consent tty|unattended]
 *               [--task-meta JSON] [--runs-dir DIR] [--no-live] [--no-control-line]
 *               [--prune-with-thinking allow|skip]   (claude-gateway: allow only for an account proven not to enforce the
 *               preserved-thinking check, CU-84; default skip)
 *   cli.mjs run --env macos-desktop --task TEXT --app BUNDLE_ID [--app BUNDLE_ID]... [--exclude-app BUNDLE_ID]... [--input-mode global|pid] [--ask-owner]
 *               [--simulate-scale 2]   (the capture seam: every capture renders at backing scale 2 on a scale-1 display; live checks only)
 *               [--simulate-display WxH]   (the display seam: that many points of the main display, from its top-left, are the run's whole display; live checks only)
 *               [--held-marker PATH]   (the held-keys marker seam: a check's private marker; live checks only)
 *               [the model, pre-approve, secret, bound, consent and run-dir flags above]
 *   cli.mjs replay <run-id | run-dir> [--runs-dir DIR]
 *   cli.mjs prune [--runs-dir DIR]
 *   cli.mjs control-link <run-id>      (only in a person's own terminal: stdin and stdout must be terminals)
 *   cli.mjs apps list | revoke <bundle-id>      (the desktop's always app approvals in $CU_HOME/app-approvals.json)
 *   cli.mjs inspect --env macos-desktop --seat cu-<seat> --app BUNDLE_ID [--app ...] [--at X,Y]... [--panel] [--focused]
 *               (read-only: describes the element at each global screen point, with --panel the open or save
 *               panel's selection and the destination agent core would resolve, and with --focused the focused element;
 *               each target carries inWebArea when the helper read it (CU-328); no input, no model, D-045)
 *
 * `run` prints the result as JSON and exits 0 for `completed`, 2 for `needs_input`, `escalated` or `declined`, 1
 * otherwise. Unless `--no-live`, it serves the live view (M3) and prints its view URL once on stderr, never in the
 * result; the control URL is printed only when stderr is a terminal and `--no-control-line` is absent - otherwise the
 * line names `cli.mjs control-link <run-id>`, which reads the mode-600 link file (a pipe never carries the capability); the live view's port joins the site filter's fixed deny list (R32). A desktop run attaches to
 * apps that are already running (the driver launches none) and never starts without the local-input pause armed.
 * `apps revoke` exits 1 when the bundle id was not stored; `apps list` exits 1 when the store is unreadable.
 *
 * CU-342 (human-control.md, the owner-input stand-in): `run` alone reads CU_STAND_IN_OWNER_INPUT (turn numbers such as
 * `3` or `3,9`) and CU_DESKTOP_HOLD_TOKEN. Set, the run refuses to start unless every gate of standInGate holds; then
 * runTask gets `standInTurns` and, after each named turn, posts one labelled untagged key event the helper's guards
 * detect like the owner's own - a rehearsal of the owner's pause with no owner at the Mac.
 */

const REPEATABLE = new Set(['allow', 'block', 'pre-approve', 'secret', 'app', 'exclude-app', 'at'])
const BOOLEAN = new Set(['no-live', 'no-control-line', 'panel', 'focused', 'ask-owner'])

export class UsageError extends Error {}

/**
 * The live view's stderr lines. The control URL is a capability: it is printed only to a terminal and only without
 * `--no-control-line`; otherwise the line says how to read it from the mode-600 link file (CU-27).
 */
export function liveViewLines({ viewUrl, controlUrl, runId, stderrIsTTY = false, noControlLine = false }) {
  const control = stderrIsTTY && !noControlLine ? controlUrl : `run \`cli.mjs control-link ${runId}\` in your own terminal`
  return `live view (watch): ${viewUrl}\nlive view (control): ${control}\n`
}

/**
 * The checkout a desktop run comes from, for the person at the terminal (CU-106, D-053): every desktop run must come
 * from code that honours the enforced hold, so the commit is printed as the run starts (the trajectory's header keeps it
 * as `build`). Uncommitted changes are said, as a dirty build gets no pass rate.
 */
export function checkoutLine(build) {
  return `checkout: ${typeof build?.commit === 'string' ? build.commit : 'unknown'}${build?.dirty ? ' (uncommitted changes)' : ''}\n`
}

/** A trajectory line's notice for the person at the terminal (CU-64 G1/G2: held keys and buttons), or null. */
export function noticeLine(line) {
  return typeof line?.notice === 'string' && line.notice !== '' ? `notice: ${line.notice}\n` : null
}

/** Parse `argv` (without node and the script) into `{ command, positional, options }`. */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  const positional = []
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    if (BOOLEAN.has(name) && eq === -1) {
      options[name] = true
      continue
    }
    let value = eq === -1 ? rest[i + 1] : arg.slice(eq + 1)
    if (eq === -1) {
      if (value === undefined || value.startsWith('--')) throw new UsageError(`--${name} needs a value`)
      i += 1
    }
    if (REPEATABLE.has(name)) (options[name] ??= []).push(value)
    else options[name] = value
  }
  return { command, positional, options }
}

/** `class` or `class@origin` to a pre-approval. */
export function parsePreApproval(text) {
  const at = text.indexOf('@')
  return at === -1 ? { class: text } : { class: text.slice(0, at), origin: text.slice(at + 1) }
}

/** `WxH` to a viewport. */
export function parseViewport(text = '1440x900') {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(text)
  if (!match) throw new UsageError(`--viewport must be WIDTHxHEIGHT, got '${text}'`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** `name=env:VAR` or `name=file:PATH` to a reference; values are read only when a placeholder is typed. */
export function parseSecrets(list = [], { env = process.env, read = (path) => readFileSync(path, 'utf8') } = {}) {
  const refs = new Map()
  for (const item of list) {
    const match = /^([a-z0-9_-]+)=(env|file):(.+)$/i.exec(item)
    if (!match) throw new UsageError(`--secret must be NAME=env:VAR or NAME=file:PATH`)
    refs.set(match[1], { kind: match[2], ref: match[3] })
  }
  return (name) => {
    const entry = refs.get(name)
    if (!entry) throw Object.assign(new Error(`no secret named '${name}'`), { code: 'invalid_argument' })
    const value = entry.kind === 'env' ? env[entry.ref] : read(entry.ref).replace(/\r?\n$/, '')
    if (typeof value !== 'string' || value === '') throw Object.assign(new Error(`secret '${name}' is empty`), { code: 'invalid_argument' })
    return value
  }
}

/** Build the bounds from the flags. */
export function parseBounds(options) {
  const bounds = {}
  const num = (name) => {
    const value = Number(options[name])
    if (!Number.isFinite(value) || value <= 0) throw new UsageError(`--${name} must be a positive number`)
    return value
  }
  if (options['max-steps'] !== undefined) bounds.maxSteps = Math.floor(num('max-steps'))
  if (options['max-minutes'] !== undefined) bounds.maxWallMs = Math.round(num('max-minutes') * 60_000)
  if (options['max-cost'] !== undefined) bounds.maxCostUsd = num('max-cost')
  return bounds
}

/** The exit code of a run status. */
export function exitCode(status) {
  if (status === 'completed') return 0
  if (status === 'needs_input' || status === 'escalated' || status === 'declined') return 2
  return 1
}

/** CU-342: the variables only `run` reads - the stand-in's turns and the seat's own hold token. */
export const STAND_IN_VARIABLE = 'CU_STAND_IN_OWNER_INPUT'
export const HOLD_TOKEN_VARIABLE = 'CU_DESKTOP_HOLD_TOKEN'

/** CU-342: a refused stand-in names the variable and the gate (`gate`) that failed; never a silent ignore. */
export class StandInRefusal extends UsageError {
  constructor(gate, detail) {
    super(`${STAND_IN_VARIABLE} is set, so this run would post a labelled stand-in for the owner's input (CU-342); refused by the ${gate} gate: ${detail}`)
    this.name = 'StandInRefusal'
    this.gate = gate
  }
}

/** CU-342: `3` or `3,9` to sorted distinct turn numbers; unset or empty is null; anything else is refused. */
export function parseStandInTurns(text) {
  if (text === undefined || text === null || text === '') return null
  const parts = String(text).split(',').map((part) => part.trim())
  if (parts.some((part) => !/^[1-9][0-9]{0,5}$/.test(part))) {
    throw new StandInRefusal('turns', `it must be comma-separated positive turn numbers such as 3 or 3,9, not '${String(text).slice(0, 40)}'`)
  }
  return [...new Set(parts.map(Number))].sort((a, b) => a - b)
}

/**
 * A path with every existing part resolved through symlinks, the parts not yet created appended as written; null when
 * a part cannot be followed (a dangling link, a loop, no permission), which a gate takes as a refusal.
 */
function canonicalPath(path) {
  const absolute = resolve(path)
  try {
    return realpathSync(absolute)
  } catch (error) {
    if (error?.code !== 'ENOENT') return null
  }
  try {
    lstatSync(absolute)
    return null // it exists, yet realpath could not follow it: a dangling link
  } catch { /* absent: resolve its parent */ }
  const parent = dirname(absolute)
  if (parent === absolute) return null
  const above = canonicalPath(parent)
  return above === null ? null : join(above, basename(absolute))
}

/**
 * CU-342: the stand-in's gates, every one of which must hold when CU_STAND_IN_OWNER_INPUT is set; resolves the turns
 * (null when it is unset) or throws StandInRefusal naming the gate. A model run cannot set cli.mjs's environment, and
 * these keep a person's rehearsal from reaching the owner's own state:
 * - `macos-desktop`: the run is `--env macos-desktop`, the only driver that can post it;
 * - `scripted-adapter`: `model` is the very adapter createScriptedAdapter built (isScriptedAdapter), never a flag's text;
 * - `unattended`: the run's consent mode is unattended - nobody answers at a terminal while the stand-in pauses it;
 * - `private-home`: CU_HOME is set and is not the default ~/.computer-use, compared after resolving symlinks;
 * - `hold-token`: CU_DESKTOP_HOLD_TOKEN is `seat`'s live hold's own token in the desktop-run lock (run-lock.mjs
 *   holdTokenMatch: missing, malformed, expired, nested or another seat's refuses). A match, not a secret: hold.json is
 *   readable by every seat and anyone can set CU_DESKTOP_SEAT; it stops a model run, and is no isolation between seats.
 * `runLockDir`, `defaultHome` and `now` are test seams.
 */
export async function standInGate({ env = process.env, model, consent, environment, seat, runLockDir, defaultHome = join(homedir(), '.computer-use'), now = Date.now } = {}) {
  const turns = parseStandInTurns(env[STAND_IN_VARIABLE])
  if (turns === null) return null
  if (environment !== 'macos-desktop') throw new StandInRefusal('macos-desktop', `it is for --env macos-desktop runs only, not ${environment ?? 'a browser run'}`)
  if (!isScriptedAdapter(model)) throw new StandInRefusal('scripted-adapter', 'only a scripted run (--model scripted --plan FILE) may carry it; a model-driven run never does')
  if (consent !== 'unattended') throw new StandInRefusal('unattended', `the run's consent mode must be unattended (--consent unattended), not ${consent ?? 'unset'}`)
  if (typeof env.CU_HOME !== 'string' || env.CU_HOME === '') throw new StandInRefusal('private-home', 'CU_HOME is unset, so the run would use the default ~/.computer-use; set CU_HOME to a private home')
  const home = cuHome(env)
  const fallback = resolve(defaultHome)
  if (home === fallback) throw new StandInRefusal('private-home', 'CU_HOME is the default ~/.computer-use; set it to a private home')
  const realHome = canonicalPath(home)
  const realDefault = canonicalPath(fallback)
  if (realHome === null || realDefault === null) throw new StandInRefusal('private-home', 'CU_HOME or the default home cannot be resolved through its links; set CU_HOME to a plain private directory')
  if (realHome === realDefault) throw new StandInRefusal('private-home', 'CU_HOME resolves to the default ~/.computer-use through a link; set it to a private home')
  const lock = await import(pathToFileURL(join(dirname(ENVIRONMENTS['macos-desktop']), 'run-lock.mjs')).href)
  const match = lock.holdTokenMatch({ seat, token: env[HOLD_TOKEN_VARIABLE], dir: runLockDir ?? lock.RUN_LOCK_DIR, now })
  if (match.ok !== true) {
    throw new StandInRefusal('hold-token', `${HOLD_TOKEN_VARIABLE} must be the token seat ${seat}'s own live hold printed (run-lock.mjs hold --seat ${seat}): ${match.message} (${match.reason})`)
  }
  return turns
}

async function loadModel(options) {
  const name = options.model ?? 'scripted'
  if (name === 'scripted') {
    if (!options.plan) throw new UsageError('--model scripted needs --plan FILE')
    return createScriptedAdapter(loadPlan(options.plan))
  }
  if (name.startsWith('claude-gateway/')) {
    const { createClaudeGatewayAdapter } = await import('./adapter-claude.mjs')
    // CU-84: --prune-with-thinking allow only for an account proven not to enforce the preserved-thinking check.
    const prune = options['prune-with-thinking']
    if (prune !== undefined && prune !== 'allow' && prune !== 'skip') throw new UsageError('--prune-with-thinking is allow or skip')
    return createClaudeGatewayAdapter({ model: name.slice('claude-gateway/'.length), ...(prune ? { pruneWithThinking: prune } : {}) })
  }
  throw new UsageError(`unknown model '${name}'`)
}

async function commandRun(options, start = startRun, env = process.env, seams = {}) {
  if (options.consent === 'tty' && !(process.stdin.isTTY === true && process.stdout.isTTY === true)) {
    throw new UsageError('--consent tty needs an interactive terminal (stdin and stdout); a pipe cannot answer consent')
  }
  // A desktop run attaches to running apps: it names them instead of a start URL.
  const desktop = options.env === 'macos-desktop'
  // The seat is required for desktop runs too: the one-desktop-run lock names its holder.
  for (const required of desktop ? ['task', 'seat'] : ['task', 'start-url', 'seat']) {
    if (!options[required]) throw new UsageError(`run needs --${required}`)
  }
  if (desktop && !options.app) throw new UsageError('run --env macos-desktop needs --app BUNDLE_ID (an already-running app to act in)')
  if (!desktop && (options.app || options['exclude-app'])) throw new UsageError('--app and --exclude-app are for --env macos-desktop')
  // How the helper posts input: system-wide (default) or to the in-scope app's pid (design Q-D3, measured after the grant).
  if (options['input-mode'] !== undefined && !desktop) throw new UsageError('--input-mode is for --env macos-desktop')
  if (options['input-mode'] !== undefined && !['global', 'pid'].includes(options['input-mode'])) throw new UsageError('--input-mode is global or pid')
  // The capture seam (capture-and-scaling.md): Retina-like frames on a scale-1 display, for live checks of the mapping (CU-61).
  if (options['simulate-scale'] !== undefined && !desktop) throw new UsageError('--simulate-scale is for --env macos-desktop')
  if (options['simulate-scale'] !== undefined && options['simulate-scale'] !== '2') throw new UsageError('--simulate-scale is 2')
  // The display seam (CU-70): a laptop-sized region of the main display as the run's whole display, such as 1512x982
  // with --simulate-scale 2 for a 14-inch Retina laptop; the driver refuses a region larger than the display.
  const region = options['simulate-display'] === undefined ? null : /^(\d{3,4})x(\d{3,4})$/.exec(options['simulate-display'])
  if (options['simulate-display'] !== undefined && !desktop) throw new UsageError('--simulate-display is for --env macos-desktop')
  if (options['simulate-display'] !== undefined && region === null) throw new UsageError('--simulate-display is WIDTHxHEIGHT in points, such as 1512x982')
  if (options['held-marker'] !== undefined && !desktop) throw new UsageError('--held-marker is for --env macos-desktop')
  // CU-203: while the owner uses the Mac, the refused run shows his confirmation prompt (physical-confirmation.md); only
  // his hardware click admits it - the flag asks, it grants nothing.
  if (options['ask-owner'] !== undefined && !desktop) throw new UsageError('--ask-owner is for --env macos-desktop')
  if (options['held-marker'] !== undefined && !isAbsolute(options['held-marker'])) throw new UsageError('--held-marker must be an absolute path')
  const environmentOptions = {
    ...(desktop && options['input-mode'] ? { mode: options['input-mode'] } : {}),
    ...(desktop && options['simulate-scale'] ? { simulateScale: Number(options['simulate-scale']) } : {}),
    ...(desktop && region !== null ? { simulateDisplay: { width: Number(region[1]), height: Number(region[2]) } } : {}),
    ...(desktop && options['held-marker'] !== undefined ? { heldMarkerPath: options['held-marker'] } : {}),
    ...(desktop && options['ask-owner'] === true ? { askOwner: true, task: String(options.task ?? '') } : {}),
  }
  const model = await loadModel(options)
  if (options.env && !ENVIRONMENTS[options.env]) throw new UsageError(`unknown environment '${options.env}'`)
  // Consent at the terminal needs a person at a real terminal: from a pipe or a tool shell, refuse (red team C1, R61).
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true
  const consent = options.consent ?? (interactive ? 'tty' : 'unattended')
  // CU-342: CU_STAND_IN_OWNER_INPUT set means every stand-in gate holds, or the run does not start.
  const standInTurns = await standInGate({ env, model, consent, environment: options.env, seat: options.seat, runLockDir: seams.runLockDir, ...(seams.defaultCuHome ? { defaultHome: seams.defaultCuHome } : {}) })
  const controller = consent === 'tty' ? ttyController() : unattendedController()
  const abort = new AbortController()
  const onSignal = () => abort.abort()
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    if (desktop) process.stderr.write(checkoutLine(buildInfo()))
    if (standInTurns !== null) process.stderr.write(`stand-in owner input (CU-342) after turn ${standInTurns.join(', ')}: not the owner's\n`)
    const run = await start({
      task: { text: options.task, meta: options['task-meta'] ? JSON.parse(options['task-meta']) : null },
      startUrl: options['start-url'],
      seat: options.seat,
      env,
      model,
      allow: options.allow ?? null,
      block: options.block ?? [],
      preApprovals: (options['pre-approve'] ?? []).map(parsePreApproval),
      controller,
      bounds: parseBounds(options),
      runsDirectory: options['runs-dir'] ? resolve(options['runs-dir']) : undefined,
      resolveSecret: parseSecrets(options.secret),
      viewport: parseViewport(options.viewport),
      live: !options['no-live'],
      environment: options.env,
      ...(desktop ? { apps: options.app, excludeApps: options['exclude-app'] ?? [] } : {}),
      ...(Object.keys(environmentOptions).length > 0 ? { environmentOptions } : {}),
      ...(standInTurns !== null ? { standInTurns } : {}),
      signal: abort.signal,
      // Notices reach a run without a live view too (CU-64 G1/G2), as each event line is written.
      onEvent: (line) => { const text = noticeLine(line); if (text) process.stderr.write(text) },
    })
    // The URLs go to the person at this terminal, never into the result (consent-authority.md).
    if (run.viewUrl) {
      process.stderr.write(liveViewLines({ ...run, stderrIsTTY: process.stderr.isTTY === true, noControlLine: Boolean(options['no-control-line']) }))
    }
    return await run.done
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

function resolveRunDir(target, options) {
  if (target === undefined) throw new UsageError('give a run id or a run directory')
  if (isAbsolute(target) || existsSync(target)) return resolve(target)
  return join(options['runs-dir'] ? resolve(options['runs-dir']) : runsDir(), target)
}

/**
 * `inspect`: the element at each global screen point, read-only, for a verifier checking the helper's hit test (D-045:
 * no input into an open or save panel). It needs the seat (the desktop-run lock), the apps (only always-approved ones
 * join) and at least one --at X,Y.
 */
async function commandInspect(options, inspect, env) {
  if (options.env !== 'macos-desktop') throw new UsageError('inspect needs --env macos-desktop')
  for (const required of ['seat', 'app']) if (!options[required]) throw new UsageError(`inspect needs --${required}`)
  if (!options.at && !options.panel && !options.focused) throw new UsageError('inspect needs --at X,Y, --panel or --focused')
  const points = (options.at ?? []).map((text) => {
    const match = /^(-?\d+),(-?\d+)$/.exec(String(text).trim())
    if (!match) throw new UsageError(`--at takes X,Y in global screen points, not '${text}'`)
    return { x: Number(match[1]), y: Number(match[2]) }
  })
  return inspect({ seat: options.seat, apps: options.app, points, panel: Boolean(options.panel), focused: Boolean(options.focused), env })
}

/** Run one command; returns `{ code, stdout }` so the command line is testable without a process. */
/** Whether a person's terminal is attached on both ends; a model's shell tool has neither. */
export const attachedToTerminal = () => Boolean(process.stdin.isTTY && process.stdout.isTTY)

/** `apps list | revoke <bundle-id>` on the always store in `$CU_HOME`; running runs see a revoke at their next action. */
function commandApps([sub, bundleId], { write, env }) {
  const store = createAppApprovals({ path: join(cuHome(env), 'app-approvals.json') })
  if (sub === 'list') {
    const { apps, corrupt } = store.list()
    if (corrupt) {
      // The store fails closed: unreadable, it approves nothing, and it is never silently rewritten.
      write(`${store.path} is unreadable, so it approves no app; fix or remove it\n`)
      return 1
    }
    if (apps.length === 0) write('no always-approved apps\n')
    for (const entry of apps) write(`${entry.bundleId}  granted ${entry.grantedAt ?? '-'}  by ${entry.by ?? '-'}\n`)
    return 0
  }
  if (sub === 'revoke') {
    if (!bundleId) throw new UsageError('apps revoke needs a bundle id')
    const removed = store.revoke(bundleId)
    write(removed ? `revoked ${bundleId}\n` : `${bundleId} was not always-approved; nothing removed\n`)
    return removed ? 0 : 1
  }
  throw new UsageError('apps commands: list, revoke <bundle-id>')
}

/**
 * `startRun` is a seam for tests only, so the argument mapping is checked without launching any environment; so are
 * `runLockDir` and `defaultCuHome`, the desktop-run lock and the default home the stand-in's gates read (CU-342).
 */
export async function main(argv, { write = (text) => process.stdout.write(text), isTerminal = attachedToTerminal, env = process.env, startRun: start = startRun, inspectPoints: inspect = inspectPoints, runLockDir, defaultCuHome } = {}) {
  const { command, positional, options } = parseArgs(argv)
  switch (command) {
    case 'run': {
      const result = await commandRun(options, start, env, { runLockDir, defaultCuHome })
      write(JSON.stringify(result, null, 2) + '\n')
      return exitCode(result.status)
    }
    case 'replay': {
      write(formatReplay(readRun(resolveRunDir(positional[0], options))) + '\n')
      return 0
    }
    case 'prune': {
      const removed = pruneRuns(options['runs-dir'] ? resolve(options['runs-dir']) : runsDir())
      write(JSON.stringify({ removed }) + '\n')
      return 0
    }
    case 'control-link': {
      // The control URL can approve consent, so it goes to a person's own terminal only: a calling model's shell
      // tool has no terminal on stdin and stdout (consent-authority.md; the token file stays mode 600, and a
      // same-user read of it remains the named residual risk).
      if (!isTerminal()) {
        throw new UsageError('control-link prints only to a terminal: run it yourself in your own terminal, not through a tool or a pipe')
      }
      const path = join(cuHome(env), 'control', String(positional[0] ?? ''))
      if (!positional[0] || !existsSync(path)) throw new UsageError('no live control link for that run (the live view writes it while a run is live)')
      write(readFileSync(path, 'utf8').trim() + '\n')
      return 0
    }
    case 'apps':
      return commandApps(positional, { write, env })
    case 'inspect': {
      const result = await commandInspect(options, inspect, env)
      write(JSON.stringify(result, null, 2) + '\n')
      return 0
    }
    default:
      throw new UsageError('commands: run, replay, prune, control-link, apps, inspect')
  }
}

/**
 * True when this module is the program node started, through any symlink: resolve() keeps symlinks while
 * import.meta.url is the real path, so a symlinked start (macOS /tmp is one) used to exit 0 having done nothing.
 */
export function isEntryPoint(argv1, moduleUrl) {
  if (!argv1) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

const isLoader = (name) => /^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)

/** The environment without the variables that can load code into node - deleted, not emptied (helper-boundary.md). */
export function withoutLoaders(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !isLoader(name)))
}

/**
 * A desktop run the helper would refuse - a loader variable in the environment (every DSH shell sets NODE_PATH) or
 * node flags before the entry - re-executes once as plain `node cli.mjs ...` with a clean environment; the child then
 * launches the helper itself, so the helper's peer check sees a clean listed entry. The child needs no second exec.
 */
export function needsCleanExec(argv, env, execArgv = []) {
  const desktop = ['run', 'inspect'].includes(argv[0]) && argv.some((arg, index) => arg === '--env=macos-desktop' || (arg === '--env' && argv[index + 1] === 'macos-desktop'))
  return desktop && (Object.keys(env).some(isLoader) || execArgv.length > 0)
}

if (isEntryPoint(process.argv[1], import.meta.url) && needsCleanExec(process.argv.slice(2), process.env, process.execArgv)) {
  const child = spawnSync(process.execPath, [process.argv[1], ...process.argv.slice(2)], { stdio: 'inherit', env: withoutLoaders(process.env) })
  process.exitCode = child.status ?? 1
} else if (isEntryPoint(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code },
    (error) => {
      process.stderr.write(`${error instanceof UsageError ? 'usage' : 'error'}: ${error.message}\n`)
      process.exitCode = error instanceof UsageError ? 64 : 1
    },
  )
}
