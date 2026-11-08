import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The trajectory recorder (design: trajectory.md, schema `cu-trajectory/v1`). Every run writes
 * `$CU_HOME/runs/<run-id>/` (mode 700, never in git): `run.json`, `events.jsonl`, `screenshots/`, `transcript.json`.
 * Typed text into credential or sensitive targets is redacted, no key or header is ever written, and screenshots
 * stay in the run directory (R43, R44, R47).
 */

export const SCHEMA = 'cu-trajectory/v1'
export const RETENTION = Object.freeze({ keep: 50, maxAgeDays: 14 })

/** `$CU_HOME`, default `~/.computer-use`. */
export function cuHome(env = process.env) {
  return env.CU_HOME && env.CU_HOME.length > 0 ? resolve(env.CU_HOME) : join(homedir(), '.computer-use')
}

export function runsDir(env = process.env) {
  return join(cuHome(env), 'runs')
}

/** `<UTC yyyymmddThhmmssZ>-<6 hex>`. */
export function newRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${stamp}-${randomBytes(3).toString('hex')}`
}

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The build that ran: the code's git commit and whether the project tree is dirty (a dirty build gets no pass rate). */
export function buildInfo({ cwd = PROJECT_DIR, run = execFileSync } = {}) {
  try {
    const commit = run('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    // --no-optional-locks: reading the build must never take index.lock, or a run would break a commit in progress.
    const status = run('git', ['--no-optional-locks', 'status', '--porcelain', '--', '.'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return { commit, dirty: status.trim().length > 0 }
  } catch {
    return { commit: null, dirty: true }
  }
}

const SECRET_PLACEHOLDER = /^\{\{secret:[a-z0-9_-]+\}\}$/i

/** Redact an action for the record: typed text into a credential or sensitive target, keeping placeholders. */
export function redactAction(action, { sensitive = false } = {}) {
  if (!action || action.type !== 'type' || !sensitive) return action
  if (SECRET_PLACEHOLDER.test(action.text)) return action
  return { ...action, text: `[redacted, ${action.text.length} chars]` }
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

const typedMarker = (text) => (SECRET_PLACEHOLDER.test(text) ? text : `[typed ${text.length} chars; see the action record]`)

/**
 * Redact typed text wherever the model's raw output is recorded (model turns, transcripts), before any class is
 * known: canonical `type` actions and Claude `type` member calls keep only their length; secret placeholders stay.
 * Per-action records keep non-sensitive text, so replay still shows it (R44).
 */
export function redactTyped(value) {
  if (Array.isArray(value)) return value.map(redactTyped)
  if (value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, inner] of Object.entries(value)) out[key] = redactTyped(inner)
  if (value.type === 'type' && typeof value.text === 'string') out.text = typedMarker(value.text)
  if (value.type === 'tool_use' && value.name === 'type' && typeof value.input?.text === 'string') out.input = { ...out.input, text: typedMarker(value.input.text) }
  return out
}

/** Create the recorder of one run. */
export function createRecorder({ dir = runsDir(), runId = newRunId(), now = () => new Date() } = {}) {
  const runDir = join(dir, runId)
  mkdirSync(join(runDir, 'screenshots'), { recursive: true, mode: 0o700 })
  chmodSync(runDir, 0o700)
  const eventsPath = join(runDir, 'events.jsonl')
  let seq = 0
  let header = null
  // Secret values resolved during the run are scrubbed from everything written, whatever path they came back by
  // (a GET form's URL, an effect, a model's answer): a planted secret appears nowhere in the run directory (R43).
  const secrets = new Set()
  const scrub = (text) => {
    let out = text
    for (const value of secrets) out = out.split(value).join('[secret]')
    return out
  }

  /** An event line read back from its scrubbed JSON text: what the file holds, with no secret value left in it. */
  const scrubbedLine = (line) => {
    try {
      return JSON.parse(scrub(JSON.stringify(line)))
    } catch {
      return { seq: line.seq, t: line.t, step: line.step, kind: line.kind, unparsable: true }
    }
  }

  const writeJson = (name, value) => writeFileSync(join(runDir, name), scrub(JSON.stringify(value, null, 2)) + '\n', { mode: 0o600 })

  return {
    runId,
    dir: runDir,
    writeHeader(fields) {
      header = { schema: SCHEMA, runId, ...fields }
      writeJson('run.json', header)
    },
    /** Remember a secret value so no file of this run ever holds it; values under 4 characters are not scrubbed. */
    addSecret(value) {
      if (typeof value === 'string' && value.length >= 4) {
        secrets.add(value)
        for (const variant of [encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]) if (variant !== value) secrets.add(variant)
      }
    },
    /** Replace every remembered secret value in `text` with `[secret]`, as every file of this run is written. */
    scrub(text) {
      return scrub(String(text))
    },
    /**
     * Append one event line. Returns the line as written - secret values already scrubbed - so a live listener sees
     * exactly what the file holds. Should scrubbing ever leave text that is not JSON, the line keeps only its seq, t,
     * step and kind, never the unscrubbed fields.
     */
    event(kind, step, fields = {}) {
      seq += 1
      const line = scrubbedLine({ seq, t: now().toISOString(), step, kind, ...fields })
      appendFileSync(eventsPath, scrub(JSON.stringify(line)) + '\n', { mode: 0o600 })
      return line
    },
    /** Save a PNG; returns `{ path, sha256 }` with `path` relative to the run directory. */
    screenshot(step, png, { zoom = null } = {}) {
      const name = zoom === null ? `step-${String(step).padStart(4, '0')}.png` : `zoom-${String(step).padStart(4, '0')}-${zoom}.png`
      const path = join('screenshots', name)
      writeFileSync(join(runDir, path), png, { mode: 0o600 })
      return { path, sha256: sha256(png) }
    },
    transcript(value) {
      writeJson('transcript.json', redactTyped(value))
    },
    end(result) {
      writeJson('run.json', { ...(header ?? { schema: SCHEMA, runId }), result, endedAt: now().toISOString() })
    },
  }
}

/** Read a run directory back: header and events. */
export function readRun(runDir) {
  const header = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'))
  const eventsPath = join(runDir, 'events.jsonl')
  const events = existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : []
  return { header, events }
}

/** The step timeline as text (`cli.mjs replay`). */
export function formatReplay({ header, events }) {
  const lines = [`run ${header.runId}  task: ${header.task?.text ?? ''}`]
  for (const event of events) {
    if (event.kind === 'model_turn') lines.push(`step ${event.step}  model ${event.stop}${event.message ? `: ${event.message}` : ''}`)
    if (event.kind === 'action' && event.completed !== undefined) {
      lines.push(`  ${event.index}. ${event.action?.type} ${event.status}${event.code ? ` (${event.code})` : ''}${event.decision && event.decision !== 'allow' ? ` [${event.decision}${event.class ? ` ${event.class}` : ''}]` : ''}`)
    }
    if (event.kind === 'observation') lines.push(`  screenshot ${event.screenshot?.path ?? '-'}  ${event.url ?? ''}`)
    if (event.kind === 'consent' && event.phase === 'request') {
      lines.push(`  consent asked (${event.request?.origin ?? '-'}): ${event.request?.class ?? event.request?.kind}${event.request?.what ? ` - ${event.request.what}` : ''}`)
    }
    if (event.kind === 'consent' && event.phase !== 'request') {
      lines.push(`  consent ${event.request?.class ?? event.request?.kind}: ${event.answer?.approved ? 'approved' : 'declined'} by ${event.answer?.answeredBy ?? '-'}`)
    }
  }
  if (header.result) lines.push(`result ${header.result.status}${header.result.finalMessage ? `: ${header.result.finalMessage}` : ''}`)
  return lines.join('\n')
}

/**
 * Apply retention: a run is removed only when it is both beyond the newest `keep` and older than `maxAgeDays`
 * ("whichever keeps more"). Returns the removed run ids.
 */
export function pruneRuns(dir = runsDir(), { keep = RETENTION.keep, maxAgeDays = RETENTION.maxAgeDays, now = Date.now } = {}) {
  if (!existsSync(dir)) return []
  const runs = readdirSync(dir)
    .filter((name) => /^\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(name))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.name.localeCompare(a.name))
  const cutoff = now() - maxAgeDays * 86_400_000
  const removed = []
  runs.forEach((run, index) => {
    if (index >= keep && run.mtime < cutoff) {
      rmSync(join(dir, run.name), { recursive: true, force: true })
      removed.push(run.name)
    }
  })
  return removed
}

