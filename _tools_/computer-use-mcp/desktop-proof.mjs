/**
 * The desktop mode of the two session proofs (Linear CU-15, M9): `dsh-proof.mjs` here and `../heddle-plugin/
 * heddle-proof.mjs` both take `--env macos-desktop --task <desktop task id> --announced yes`. Everything the two share
 * lives in this module, so they cannot drift apart: the arguments, the refusal, the warning, the prompt, the private
 * CU_HOME, the helper link, the approvals and the attempt.
 *
 * Nothing here is a new harness. The attempt is the desktop suite's own (`runDesktopAttempt`): it opens the task in the
 * visible CU Fixture app and judges it from the fixture's private channel, with one session as its runner. The task
 * catalogue, the approval store's loader and the helper's bundle path are all the existing modules'. The approvals are
 * the owner's own records, copied, never asked for (D-033, C1).
 * The pure parts are exported for the unit tests, which run without DSH, heddle, the helper, the fixture or a model.
 */
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { appsFor, missingApprovals, runDesktopAttempt } from '../../_evaluators_/desktop-suite/lib.mjs'
import { MAX_SOCKET_PATH_BYTES } from '../../_environments_/macos-desktop/helper-link.mjs'
import { defaultBundlePath } from '../../_environments_/macos-desktop/launch.mjs'
import { createAppApprovals } from '../agent-core/app-approvals.mjs'
import { cuHome } from '../agent-core/trajectory.mjs'
import { APP_NAME, BUNDLE_ID, LEDGER, buildFixtureApp } from '../desktop-fixture/build.mjs'
import { DESKTOP_TASKS } from '../desktop-fixture/tasks.mjs'
import { withoutLoaders } from './server.mjs'

export const BROWSER = 'chrome-browser'
export const DESKTOP = 'macos-desktop'
export const DEFAULT_BROWSER_TASK = 'visitor-badge'
/** badge-form: one field and one button in CU Fixture alone. The desktop suite's scripted plan plays it, and no consent is due. */
export const DEFAULT_DESKTOP_TASK = 'badge-form'
export const DEFAULT_SEED = 'm9-proof'
/** The caps named to the session for a desktop run. They are lower than the suite's, since a proof shows the path and is not a rated attempt. */
export const DESKTOP_CAPS = Object.freeze({ maxSteps: 20, maxMinutes: 6, maxCostUsd: 1 })
/**
 * agent core's always-store schema, which app-approvals.mjs writes but does not export. If the two ever differ, the
 * read-back in copyOwnerApprovals finds the private store unreadable and the proof stops before anything starts.
 */
const STORE_SCHEMA = 'cu-app-approvals/v1'
const APP_NAMES = Object.freeze({ [BUNDLE_ID]: APP_NAME, [LEDGER.bundleId]: LEDGER.name })

/**
 * The proofs' `--name value` pairs, read as they always were: unknown names are ignored, and `--install` is on only
 * when it is `yes`, so a browser command line means what it meant before. Only the new flags are checked: `--env` is one of the two
 * environments, `--announced` is yes or no, and a desktop `--task` must be in the desktop catalogue. A browser task is
 * still checked by the fixture site.
 */
export function parseProofArgs(argv) {
  const args = Object.fromEntries(argv.reduce((pairs, value, i, all) => (i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs), []))
  const env = args.env ?? BROWSER
  if (env !== BROWSER && env !== DESKTOP) throw new Error(`--env is ${BROWSER} (the default) or ${DESKTOP}, not '${env}'`)
  if (args.announced !== undefined && args.announced !== 'yes' && args.announced !== 'no') throw new Error(`--announced is yes or no, not '${args.announced}'`)
  const desktop = env === DESKTOP
  const task = args.task ?? (desktop ? DEFAULT_DESKTOP_TASK : DEFAULT_BROWSER_TASK)
  if (desktop && DESKTOP_TASKS[task] === undefined) throw new Error(`no desktop task '${task}': one of ${Object.keys(DESKTOP_TASKS).join(', ')}`)
  return {
    env,
    desktop,
    task,
    model: args.model ?? 'claude-gateway/claude-sonnet-5-5',
    sessionModel: args['session-model'] ?? 'claude-sonnet-5-5',
    install: args.install === 'yes',
    announced: args.announced === 'yes',
    seed: args.seed ?? DEFAULT_SEED,
    out: args.out ?? null,
  }
}

/**
 * A desktop run shares the owner's one display, keyboard and pointer (D-024). The operator announces the batch, and
 * the driver takes the team's desktop-run lock itself. So the proof refuses to start until the operator says it was
 * announced. It returns null when the proof may go on.
 */
export function desktopRefusal(options) {
  if (!options.desktop || options.announced) return null
  return "a desktop run shares the owner's display: announce it in the inbox first, then pass --announced yes (D-024); nothing was started"
}

/** The one line printed before the session starts: what will receive input, and for how long at most. */
export function desktopWarning({ taskId, apps, caps = DESKTOP_CAPS }) {
  const named = apps.map((id) => `${APP_NAMES[id] ?? id} (${id})`).join(' and ')
  return `desktop proof: for up to ${caps.maxMinutes} minutes an agent sends real clicks and keys to ${named} only, on this Mac's display (task ${taskId}); hands off - your own input pauses the run`
}

/**
 * The `computer_use_start` arguments of a desktop run, exactly as the session is told to send them. They hold the
 * environment, the task's bundle ids as candidates, the task, the model and the caps. There is no start_url (a
 * browser field) and no approval of any kind: an app joins only through the always store a person filled or the live view.
 */
export function desktopStartArgs({ task, apps, model, caps = DESKTOP_CAPS }) {
  return { environment: DESKTOP, apps: [...apps], task, model, max_steps: caps.maxSteps, max_minutes: caps.maxMinutes, max_cost_usd: caps.maxCostUsd }
}

/**
 * The session's prompt in desktop mode. `toolPrefix` is `mcp__cu__` in DSH (its MCP tool names) and empty in heddle
 * (the plugin's own names). The start arguments go in as JSON, so the model copies them rather than paraphrasing them.
 * The status poll is the browser proof's poll. A finished desktop run has a replay command, not a replay URL: its live view closes with it.
 */
export function desktopPrompt({ toolPrefix = '', task, apps, model, caps = DESKTOP_CAPS }) {
  return [
    'Use the computer-use tools to do one task in an app on this Mac, then report.',
    `1. Call ${toolPrefix}computer_use_start with exactly these arguments: ${JSON.stringify(desktopStartArgs({ task, apps, model, caps }))}`,
    `2. Call ${toolPrefix}computer_use_status with that run_id and wait_seconds 45, again and again, until state is "finished".`,
    "3. Reply with: the result's status and finalMessage, the trajectory run_dir and replay_command, and one sentence on what the final screenshot shows.",
  ].join('\n')
}

/**
 * The session child's environment: the fields the proof names, plus `CU_HOME` in desktop mode, and never a variable
 * that loads code into node. The browser mode already builds its environment from nothing. This keeps it that way if
 * a field is ever added carelessly. The MCP server would re-exec itself clean anyway; the helper refuses a driver
 * started with one of those variables (D-029 a).
 */
export function sessionEnv(fields, { cuHome: home = null } = {}) {
  return withoutLoaders({ ...fields, ...(home ? { CU_HOME: home } : {}) })
}

/**
 * The private CU_HOME, `<out>/user/.computer-use`. That is agent core's default under the isolated HOME, so an install
 * row that sets no CU_HOME (`--install yes`) lands in the same place. Its run directory holds the helper's socket,
 * whose path must fit the kernel's limit, so a long `--out` is refused here, before anything is made.
 */
export function privateCuHome(out) {
  const home = join(resolve(out), 'user', '.computer-use')
  if (!home.startsWith('/tmp/')) throw new Error('--out must be under /tmp')
  const socket = join(home, 'run', 'helper-XXXXXX', 'helper.sock') // createHelperServer's mkdtemp shape
  if (Buffer.byteLength(socket) > MAX_SOCKET_PATH_BYTES) throw new Error(`--out is too long: the helper socket under it would pass ${MAX_SOCKET_PATH_BYTES} bytes`)
  return home
}

/**
 * Link the installed helper into the private CU_HOME: `<home>/helper/CUHelper.app -> <source>`, a symlink and never a
 * copy. A copy would be a different bundle with no grant. The driver compares the helper by real path, and
 * LaunchServices starts the signed bundle the link names. It is idempotent. A stale link is replaced. Anything else
 * at that path is refused and left alone: this never deletes a directory.
 */
export function linkInstalledHelper({ cuHome: home, source }) {
  if (typeof source !== 'string' || !isAbsolute(source)) throw new Error('the installed helper path must be absolute')
  if (!existsSync(source)) throw new Error(`no installed helper at ${source}: the owner installs it with bash _environments_/macos-desktop/helper/install.sh`)
  const link = defaultBundlePath(home)
  if (resolve(link) === resolve(source)) throw new Error('the private CU_HOME is the installed one; pass an --out of its own')
  mkdirSync(dirname(link), { recursive: true, mode: 0o700 })
  chmodSync(home, 0o700)
  chmodSync(dirname(link), 0o700)
  let current = null
  try {
    current = lstatSync(link)
  } catch {
    current = null
  }
  if (current !== null) {
    if (!current.isSymbolicLink()) throw new Error(`${link} exists and is not a symlink (a copy holds no grant); remove it and run again`)
    if (readlinkSync(link) === source) return { link, source }
    unlinkSync(link)
  }
  symlinkSync(source, link)
  return { link, source }
}

/** The private always store, the file agent core reads in the server: `<home>/app-approvals.json`. */
export function approvalStore(home) {
  return createAppApprovals({ path: join(home, 'app-approvals.json') })
}

/**
 * The owner's record for `bundleId` that a proof may copy, as `{ record }`, or `{ why }` when there is none.
 * agent core's store (app-approvals.mjs) holds only 'always' approvals, one `{ bundleId, grantedAt, by }` per app, and
 * `by` names the human channel that answered: `live`, `tty` or `api`. The owner gave the consent that covers the
 * proofs at a terminal (D-033), so only a `tty` record counts. The store writes no lifetime field. A record that names
 * a lifetime other than 'always' is not an always approval, so it is not copied either. Bundle ids compare as agent
 * core compares them, ignoring case.
 */
export function ownerRecord(owned, bundleId) {
  const found = owned.filter((entry) => entry.bundleId.toLowerCase() === bundleId.toLowerCase())
  const record = found.find((entry) => entry.by === 'tty' && (entry.lifetime === undefined || entry.lifetime === 'always'))
  if (record !== undefined) return { record }
  if (found.length === 0) return { why: null }
  return { why: found.map((entry) => (entry.by === 'tty' ? `its record's lifetime is ${entry.lifetime}` : `its record is by ${entry.by}, not tty`)).join('; ') }
}

/**
 * Write `records` as agent core's store: the same schema line, the same two-space JSON, mode 600 in a 700 directory,
 * through a temporary file and a rename, so a reader never sees half a file. Nothing but copies ever reaches it.
 */
function writeStore(path, records) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ schema: STORE_SCHEMA, apps: records }, null, 2) + '\n', { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, path)
}

/**
 * Seed the private always store with copies of the owner's own records (cu-coordinator, 2026-11-05, on D-033). The
 * owner approved CU Fixture and CU Ledger 'always' at a terminal for agent desktop runs, and that consent covers the
 * proofs. So for each app the task uses, and no other, the owner's `tty` record in `<sourceHome>/app-approvals.json`
 * is copied verbatim into the private store, which then holds those copies and nothing else.
 *
 * Nothing here grants, asks or fakes a terminal: a new approval comes only from a person (C1). When a task app has no
 * such record, nothing is written. An earlier private store is removed, so an old copy cannot outlive the owner's
 * revoke, and `missing` names the app(s): the proof refuses. The source is read with agent core's own loader. The
 * written store is read back with it too, and must approve exactly the task's apps, or this throws.
 * Returns `{ apps, copiedFrom, records, missing, store }`; `store` is 'read', 'absent' or 'unreadable'.
 */
export function copyOwnerApprovals({ task, sourceHome, home }) {
  const apps = appsFor(task)
  const copiedFrom = join(resolve(sourceHome), 'app-approvals.json')
  const target = approvalStore(home)
  if (resolve(target.path) === copiedFrom) throw new Error('the private CU_HOME is the installed one; pass an --out of its own')
  const { apps: owned, corrupt } = createAppApprovals({ path: copiedFrom }).list()
  const store = !existsSync(copiedFrom) ? 'absent' : corrupt ? 'unreadable' : 'read'
  const found = apps.map((bundleId) => ({ bundleId, ...ownerRecord(owned, bundleId) }))
  const missing = found.filter((entry) => entry.record === undefined).map(({ bundleId, why }) => ({ bundleId, why }))
  if (missing.length > 0) {
    rmSync(target.path, { force: true })
    return { apps, copiedFrom, records: [], missing, store }
  }
  const records = found.map((entry) => entry.record)
  writeStore(target.path, records)
  const back = target.list()
  if (back.corrupt || !isDeepStrictEqual(back.apps, records) || missingApprovals([task], target).length > 0) {
    rmSync(target.path, { force: true })
    throw new Error(`agent core does not read the private store ${target.path} back as the copied records; nothing was started`)
  }
  return { apps, copiedFrom, records, missing: [], store }
}

/**
 * The exit-3 refusal when a task app has no copyable owner record. It names the app(s) and where the proof looked.
 * It names no command: the proof never asks for an approval, and the coordinator takes the request to the owner.
 */
export function approvalRefusal({ copiedFrom, missing, store = 'read' }) {
  const apps = missing.map(({ bundleId, why }) => `${APP_NAMES[bundleId] ?? bundleId} (${bundleId}${why ? `: ${why}` : ''})`).join(' and ')
  const source = store === 'absent' ? `there is no owner always store at ${copiedFrom}` : store === 'unreadable' ? `the owner's always store ${copiedFrom} is unreadable` : `the owner's always store ${copiedFrom} holds no such record`
  return `the task needs ${apps} approved 'always' by the owner at a terminal (by tty), and ${source}. The proof only copies the owner's own records (D-033); a new approval comes only from the owner (C1), asked through cu-coordinator. Nothing was started`
}

/** The one stderr line at the start of a desktop proof: which owner records were copied, from where, into where. */
export function approvalsNote({ copiedFrom, records }, home) {
  const named = records.map((record) => `${record.bundleId} (by ${record.by}, granted ${record.grantedAt})`).join(', ')
  return `desktop proof: copied ${records.length} owner approval record(s) verbatim from ${copiedFrom} into ${join(home, 'app-approvals.json')}: ${named}; no other app`
}

/** The newest run directory under `runsRoot` that was not there `before`, or null. The private runs survive between proofs that reuse an `--out`. */
export function newRunDir(runsRoot, before = []) {
  const ids = existsSync(runsRoot) ? readdirSync(runsRoot).filter((id) => !before.includes(id)).sort() : []
  return ids.length > 0 ? join(runsRoot, ids.at(-1)) : null
}

/** A run directory's recorded result (`run.json`), or null. */
export function readRunResult(runDir) {
  if (runDir === null || !existsSync(join(runDir, 'run.json'))) return null
  try {
    return JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).result ?? null
  } catch {
    return null
  }
}

/**
 * Everything before the session. `sourceHome` is the operator's own CU_HOME (`$CU_HOME`, default `~/.computer-use`),
 * the one place both the installed helper the owner granted (`<sourceHome>/helper/CUHelper.app`, as the desktop suite
 * reads it) and the owner's always store come from. First the private CU_HOME, then the helper link, then the copied
 * approvals. None of them asks anyone. Returns `{ task, apps, cuHome, helper, approvals, refusal, note }`. A non-null
 * `refusal` means exit 3 with nothing started; otherwise `note` is the line saying what was copied.
 */
export function prepareDesktop({ out, taskId, sourceHome = cuHome() }) {
  const task = DESKTOP_TASKS[taskId]
  if (task === undefined) throw new Error(`no desktop task '${taskId}'`)
  const home = privateCuHome(out)
  const helper = linkInstalledHelper({ cuHome: home, source: defaultBundlePath(resolve(sourceHome)) })
  const approvals = copyOwnerApprovals({ task, sourceHome, home })
  const refusal = approvals.missing.length > 0 ? approvalRefusal(approvals) : null
  return { task, apps: approvals.apps, cuHome: home, helper, approvals, refusal, note: refusal === null ? approvalsNote(approvals, home) : null }
}

/**
 * The attempt: the desktop suite's `runDesktopAttempt`, whose runner is one session told to start the run.
 * `runSession(prompt)` resolves the session's own facts. The run's result is read from its new run directory under
 * `runsRoot`, as the browser proofs read it. The verdict comes from the fixture's private channel, never from the
 * session's words. The final screenshot, if the result carries one, is copied to `<out>/final.png`.
 */
export async function attemptDesktop({ prepared, seed, model, runsRoot, out, toolPrefix, runSession }) {
  // A final.png left by an earlier proof in the same --out must not stand in for this run's.
  if (resolve(out).startsWith('/tmp/')) rmSync(join(resolve(out), 'final.png'), { force: true })
  const built = buildFixtureApp()
  let session = null
  let result = null
  const runner = async ({ prompt, apps, model: runModel, bounds }) => {
    const before = existsSync(runsRoot) ? readdirSync(runsRoot) : []
    try {
      session = await runSession(desktopPrompt({ toolPrefix, task: prompt, apps, model: runModel, caps: bounds }))
    } catch (error) {
      session = { error: String(error?.message ?? error) }
    }
    result = readRunResult(newRunDir(runsRoot, before))
    return result ?? { status: 'error', error: 'the session started no desktop run' }
  }
  const row = await runDesktopAttempt({ id: prepared.task.id, seed, built, runner, model, bounds: DESKTOP_CAPS, visible: true })
  let finalPng = null
  if (typeof result?.finalScreenshot === 'string' && existsSync(result.finalScreenshot)) {
    finalPng = join(out, 'final.png')
    copyFileSync(result.finalScreenshot, finalPng)
  }
  return { row, result, session, finalPng }
}

/** The proof.json fields both proofs write for a desktop attempt; each adds its own session block beside them. */
export function desktopProofFields({ prepared, attempt, seed }) {
  const { row, result } = attempt
  return {
    env: DESKTOP,
    task: { id: prepared.task.id, apps: prepared.apps, seed },
    desktop: { cuHome: prepared.cuHome, helperLink: prepared.helper, approvals: { copiedFrom: prepared.approvals.copiedFrom, records: prepared.approvals.records, apps: prepared.approvals.apps } },
    run: result && { runId: result.runId, status: result.status, finalMessage: result.finalMessage, steps: result.steps, costUsd: result.usage?.costUsd ?? null, finalScreenshot: result.finalScreenshot, trajectoryDir: result.trajectoryDir, replayCommand: result.replayCommand ?? null, error: result.error ?? null },
    verdict: { verdict: row.verdict, reason: row.reason, compromised: row.compromised },
    row,
  }
}

/**
 * Format and pixel size of a PNG, JPEG or WebP image from its header, or null. DSH stores an image block it attaches
 * re-encoded (a 1920x1080 PNG screenshot arrived as a 17 KB WebP in CU-15's live proof), so whether the final
 * screenshot reached a session cannot be judged by byte equality alone.
 */
export function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return null
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length }
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, bytes: buf.length }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, bytes: buf.length }
    }
    if (chunk === 'VP8X') return { format: 'webp', width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1, bytes: buf.length }
    return null
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const length = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), bytes: buf.length }
      }
      i += 2 + length
    }
  }
  return null
}

/**
 * Whether the final screenshot reached the session: an attachment byte-identical to it, or else one that is a
 * re-encoding of the same pixel size (DSH converts attached PNGs to WebP). The evidence names which, so a reader can
 * tell an identical image from a re-encoded one; an attachment of another size never counts.
 */
export function screenshotReached(finalBytes, attachments) {
  const final = imageInfo(finalBytes)
  if (final === null) return { reached: false, identical: false, attachment: null }
  const identical = attachments.find((buf) => buf.equals(finalBytes))
  if (identical !== undefined) return { reached: true, identical: true, attachment: imageInfo(identical) }
  const same = attachments.map(imageInfo).find((info) => info !== null && info.width === final.width && info.height === final.height)
  return same === undefined ? { reached: false, identical: false, attachment: null } : { reached: true, identical: false, attachment: same }
}

