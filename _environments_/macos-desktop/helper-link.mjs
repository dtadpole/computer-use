import { execFile } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import net from 'node:net'
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path'

import { EnvironmentError, invalid, notGranted } from './errors.mjs'
import { keyName } from './keys.mjs'

/**
 * The link between this driver and the desktop helper (design: desktop-extension/helper-and-protocol.md).
 *
 * **Framing.** One JSON object per line in each direction. A request is `{ id, type, ...fields }`; its reply is
 * `{ id, ok: true, ...result }` or `{ id, ok: false, code, message, grant? }`; a helper event carries `event` and no
 * `id` (`frame`, `localInput`). The same framing runs over a Unix socket (the real helper) and over stdio (the fake
 * helper of the unit tests), so the protocol is tested end to end without the app.
 *
 * **Hello.** The helper speaks first: `{ type: 'hello', token, protocol, helperVersion, grants, displays }`. It is
 * the helper's opening line rather than a request, because the helper connects to us; it carries the fields the
 * design lists as hello's reply. The token is compared in constant time; a wrong token, a wrong protocol version or
 * an unknown field is refused and that connection closed.
 *
 * **No hello.** The helper checks its peer before it reads the token file or says anything (helper-boundary.md,
 * D-029 a), and refuses by closing the socket. So a connection that ends before any hello is the helper refusing this
 * driver, or a helper that died: either way it has exited and the launch fails at once with `helper_lost`,
 * `details.reason: 'no_hello'` - rather than waiting out the connect deadline for a helper that will never come.
 *
 * **Captures by file.** A capture's PNG comes inline or as a file in the run's private directory, named by path and
 * sha256 (`readCaptureFile`): the driver checks where it lies and what it hashes to before it trusts a byte of it.
 *
 * **Peer identity.** The token proves only that the peer could read a mode-600 file, which any process of this user
 * can (red team B5). So on the socket the server first asks who is on the other end - the peer's pid and executable,
 * by `lsof` and `codesign` - and drops a peer that is not the helper bundle's executable signed to the helper's
 * requirement, before a byte of its hello is read (see `createHelperServer`).
 *
 * **Fail closed.** Anything unexpected ends the link with `helper_lost`: the socket closing, a line that is not a JSON
 * object, a reply to an id never sent, a second hello, an over-long line, a request timing out (the helper might
 * still post input later, so it is cut off rather than waited for), or an unexpected internal failure the helper
 * reports as `failed`. No request is ever retried (agent-loop.md); the driver relaunches only at the next run.
 */

export const PROTOCOL_VERSION = 1
export const MAX_LINE_BYTES = 64 * 1024 * 1024
export const HELLO_TIMEOUT_MS = 10_000
export const CONNECT_TIMEOUT_MS = 20_000
export const REQUEST_TIMEOUT_MS = 30_000
/** macOS `sockaddr_un.sun_path` holds 104 bytes including the terminating NUL. */
export const MAX_SOCKET_PATH_BYTES = 103

/** The requests a run uses and the only fields each may carry. */
export const CORE_REQUEST_FIELDS = Object.freeze({
  scope: Object.freeze(['bundleIds']),
  capture: Object.freeze(['display', 'maxSize', 'region']),
  input: Object.freeze(['events', 'mode', 'bundleId', 'settleMs']),
  hitTest: Object.freeze(['xPt', 'yPt']),
  focused: Object.freeze([]),
  // CU-187 (helper 0.2.45): the element holding the selection - role and caption only.
  selection: Object.freeze([]),
  screenText: Object.freeze(['maxChars']),
  // Q-D13 (file-panels.md): the frontmost attributed open or save panel's canonical selection, read by the helper.
  panelSelection: Object.freeze([]),
  // CU-235 (helper 0.2.52): the frontmost approved app's menu items a key down fires - title, path, key equivalent, enabled.
  menuKey: Object.freeze(['keyCode', 'flags']),
  // CU-262 (helper 0.2.54): the focused collection's selected item names and kinds - never a path.
  selectedItems: Object.freeze([]),
  watch: Object.freeze(['fps', 'maxSize', 'region']),
  cursor: Object.freeze([]),
  unwatch: Object.freeze([]),
  pauseOnLocalInput: Object.freeze(['on']),
  bye: Object.freeze([]),
})

/**
 * The test seams the design names, in one place. They are real protocol - the helper honours them - but exist so a
 * check can prove what no person or Retina display is there to show:
 *
 * - `capture {simulateScale}` (capture-and-scaling.md): the helper renders the capture at this backing scale instead
 *   of the display's and reports it as `scale`, so the per-axis frame mapping is proven at scale 2 on this scale-1 Mac.
 *   A number above 1 and at most `MAX_SIMULATE_SCALE`; the design uses 2.
 * - `simulateLocalInput {kind, via}` (human-control.md): the helper reports a person's input through one guard -
 *   `tap` (the event tap: since helper 0.2.2 an active pass-through tap when Accessibility is granted, else a
 *   listen-only one with Input Monitoring; refused `not_granted` naming `accessibility` when neither exists), `idle`
 *   (the HID idle counter) or `untagged` (it posts a real untagged event; needs the accessibility grant and an
 *   approved app in front) - by sending a `localInput {at, kind}` event before its reply `{detectedBy}` (`tap` or
 *   `idle`, the guard that saw it). It needs the pause armed and can only pause a run.
 *
 * Kept apart from `CORE_REQUEST_FIELDS` so the Swift parity check can tell a seam the helper has not adopted yet from a
 * real mismatch.
 */
export const SEAM_FIELDS = Object.freeze({ capture: Object.freeze(['simulateScale']) })
export const SEAM_REQUESTS = Object.freeze({ simulateLocalInput: Object.freeze(['kind', 'via']) })
/**
 * The request the run lock alone sends (physical-confirmation.md, CU-203; helper 0.2.50): `confirmPhysical {seat, task,
 * timeoutMs}` shows the prompt only the owner's deliberate hardware click answers, on a helper with no scope set, and
 * replies `{confirmed, outcome, source, confirmationId}`. No run sends it, and no caller can pass its answer.
 */
export const LOCK_REQUESTS = Object.freeze({ confirmPhysical: Object.freeze(['seat', 'task', 'timeoutMs']) })
export const MAX_SIMULATE_SCALE = 4
export const LOCAL_INPUT_VIA = Object.freeze(['tap', 'idle', 'untagged'])
/** The only detail a `localInput` event carries besides its time (trajectory-privacy.md): never which key or where. */
export const LOCAL_INPUT_KINDS = Object.freeze(['key', 'pointer'])

/**
 * Every request the protocol knows and the only fields each may carry, exactly the Swift helper's table (the parity
 * check in `_tests_/macos-helper/` compares them field for field); anything else is refused by name.
 */
export const REQUEST_FIELDS = Object.freeze({
  ...Object.fromEntries(Object.entries(CORE_REQUEST_FIELDS).map(([type, fields]) => [type, Object.freeze([...fields, ...(SEAM_FIELDS[type] ?? [])])])),
  ...SEAM_REQUESTS,
  ...LOCK_REQUESTS,
})

/**
 * The design's settle after a human resume (`input {settleMs}`, helper-protocol-details.md 0.4.1-0.4.2; helper 0.2.8)
 * and the helper's cap on waiting for it, both milliseconds. The owner may work through Screen Sharing, so their
 * Resume, Hand back or Approve click is local input and the pointer movement right after it would pause the run again
 * at once. So the first input after a person returned the run to running asks the helper to wait, at most
 * `SETTLE_CAP_MS`, until the person has been hands-off for `settleMs`, take that moment as its guard's baseline, then
 * post and guard each step as usual; past the cap it answers `{ok: true, done: false, failedAt: 0, code:
 * 'local_input'}`. Its guards stay armed meanwhile, so it still reports `localInput` while it waits. It honours the
 * field only after it has itself seen local input since its last posted step, once per such input, so a driver that
 * sent it on every input could not wear down the idle guard.
 */
export const SETTLE_MS = 1500
export const SETTLE_CAP_MS = 60_000

/**
 * A capture reply carries its image one of two ways (helper-and-protocol.md): inline as base64 `png`, or - because a
 * full-display PNG is megabytes on one line - as a file the helper wrote into the run's mode-700 directory, named by
 * `path` with its lowercase hex `sha256`. The file lies directly in the run directory and its name ends in `.png`;
 * the driver reads it, checks the hash, and deletes it.
 */
export const CAPTURE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.png$/
export const MAX_CAPTURE_BYTES = MAX_LINE_BYTES

export const HELLO_FIELDS = Object.freeze(['type', 'token', 'protocol', 'helperVersion', 'grants', 'displays'])
/**
 * The grants a hello may report, each from a prompt-free preflight (helper-and-protocol.md). `screen` and
 * `accessibility` are required; `postEvents` (design 0.3) and `listenEvents` may be absent from a helper that predates
 * them, and are then unknown (`null`) rather than assumed.
 */
export const HELLO_GRANTS = Object.freeze(['screen', 'accessibility', 'postEvents', 'listenEvents'])
// releasedStale (CU-64 G1, helper 0.2.30): keys or buttons a helper that died mid-hold left down, released by this one
// at its start; sent once, after the driver's first request (its acceptance of the hello). Event names are checked, so
// a driver must know it before a helper sends it.
/**
 * What the helper said with a failed reply, as `: <message>` (one line, at most HELPER_MESSAGE_MAX characters), or ''.
 * A capture fails for several reasons the helper names - no active display, the screenshot API's own error, a capture
 * file that could not be written - and the run's error is the only place an operator sees which; the code alone
 * ('failed') sent three seats guessing during a live outage.
 */
export const HELPER_MESSAGE_MAX = 200
export function helperSaid(text) {
  if (typeof text !== 'string') return ''
  const line = text.replace(/\s+/g, ' ').trim()
  if (line === '') return ''
  return `: ${line.length > HELPER_MESSAGE_MAX ? `${line.slice(0, HELPER_MESSAGE_MAX - 1)}\u2026` : line}`
}

export const EVENTS = Object.freeze(['frame', 'localInput', 'releasedStale'])

/**
 * The text of a `secure_input` refusal. Fixed here rather than the helper's own words: it is what the model reads, and
 * it must say this is the person's to finish, not something to retry or confirm.
 */
/**
 * CU-76: the helper's own refusal for a system privacy or permission prompt (helper 0.2.28 refuses pointer input on a
 * marked element and keys while a marked prompt holds focus). Neutral, for the model reads it: no app or bundle name.
 */
export const SYSTEM_PROMPT_REFUSAL = 'a system privacy or permission prompt is in the way, so nothing more was posted; it is the person\'s to answer'
export const SECURE_INPUT_REFUSAL = 'secure input is on (a password prompt or secure field has the keyboard), so no key was posted; this is the person\'s to finish, so hand it to them'

/** Refuse an outgoing request the helper would refuse anyway, before it is sent. */
export function checkRequest(type, fields) {
  if (!Object.hasOwn(REQUEST_FIELDS, type)) throw invalid(`unknown helper request '${String(type)}'`)
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw invalid(`the ${type} request needs an object of fields`)
  const unknown = Object.keys(fields).find((name) => !REQUEST_FIELDS[type].includes(name))
  if (unknown !== undefined) throw invalid(`the ${type} request has no field '${unknown}'`, { field: unknown })
}

/**
 * The details of a helper's scope refusal. A refusal at a point that names the window's owner - the helper's own
 * per-event check, when a window came over the point after the driver's hit test - becomes `target_out_of_scope`
 * with that bundle id and point, as the driver's own target check reports it, so agent core can tell the person which
 * app covers the point (CU-38). Only a reply carrying `point` claims a point: today's helper (0.2.16) names the owner
 * of a frontmost refusal and of a point refusal alike, so a bundle id alone keeps the helper's reason and adds the id.
 */
function scopeDetails(reply) {
  const bundleId = typeof reply.bundleId === 'string' && reply.bundleId.length > 0 ? reply.bundleId : null
  const point = reply.point !== null && typeof reply.point === 'object' && Number.isFinite(reply.point.x) && Number.isFinite(reply.point.y)
    ? { x: reply.point.x, y: reply.point.y } : null
  // CU-199: which of the helper's scope checks refused - the mid-gesture re-check that stops a held click is otherwise
  // indistinguishable from the frontmost check - kept as a short word so a record can name it; anything else dropped.
  const check = typeof reply.check === 'string' && /^[a-z][a-z_]{0,31}$/.test(reply.check) ? { check: reply.check } : {}
  if (reply.code === 'out_of_scope' && bundleId !== null && point !== null) return { reason: 'target_out_of_scope', bundleId, point, ...check }
  return { reason: reply.code, ...(bundleId !== null ? { bundleId } : {}), ...check }
}

/** What the model reads when the helper's own check found the point covered by an unapproved app's window. */
const COVERED_POINT = 'the point is covered by a window of an app this run is not approved for; the input stopped there'

/** A helper's refusal as this driver's error: the codes the agent core decides by, the grant named. */
export function replyError(type, reply) {
  const message = typeof reply.message === 'string' && reply.message.length > 0 ? reply.message : `the helper refused the ${type} request`
  switch (reply.code) {
    case 'not_granted': return notGranted(reply.grant)
    case 'out_of_scope':
    case 'no_scope': {
      const details = scopeDetails(reply)
      // A point refusal names the covering app in its text; the model reads the message, so the driver says it
      // neutrally and keeps the bundle id in details (CU-38, CU-47).
      return new EnvironmentError('out_of_scope', details.reason === 'target_out_of_scope' ? COVERED_POINT : message, details)
    }
    case 'display_changed': return new EnvironmentError('display_changed', message)
    case 'excluded': return new EnvironmentError('blocked_by_policy', message, { reason: 'excluded', ...(reply.bundleId ? { bundleId: reply.bundleId } : {}) })
    case 'pause_not_armed': return new EnvironmentError('blocked_by_policy', message, { reason: 'pause_not_armed' })
    case 'local_input': return new EnvironmentError('taken_over', 'the person used the Mac, so the action stopped; the run waits for them', { reason: 'local_input', failedAt: reply.failedAt ?? null, ...(Array.isArray(reply.heldKeys) && reply.heldKeys.length > 0 ? { heldKeys: reply.heldKeys.filter(Number.isInteger).map(keyName) } : {}) })
    case 'secure_input': return new EnvironmentError('secure_input', SECURE_INPUT_REFUSAL, { reason: 'secure_input', failedAt: reply.failedAt ?? null })
    // Known since CU-76: without this case an unknown code ends the link, and the run would end helper_lost.
    case 'system_prompt': return new EnvironmentError('system_prompt', SYSTEM_PROMPT_REFUSAL, { reason: 'system_prompt', failedAt: reply.failedAt ?? null })
    case 'unknown_request':
    case 'unknown_field':
    // The helper's own code stays as details.reason, so a caller can tell 'this helper does not know the field'
    // (unknown_field: an older build) from 'it knows it and refuses the value' (invalid_argument) - CU-83.
    case 'invalid_argument': return invalid(message, { ...(reply.field !== undefined ? { field: reply.field } : {}), reason: reply.code })
    case 'unsupported': return new EnvironmentError('unsupported_action', message)
    case 'timeout': return new EnvironmentError('timeout', message)
    // CU-203: the prompt's own refusals - one already on screen, or no display to show it on. Without them the link would
    // end (helper_lost) and the lock would log the wrong outcome; with them the lock reads the helper's code.
    case 'busy':
    case 'no_display': return new EnvironmentError('resource_refused', message, { reason: reply.code })
    default: return null // 'failed' or a code this driver does not know: the link is ended, see `HelperLink`
  }
}

/** Constant-time token comparison; false for anything that is not two strings of equal length. */
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Why a hello is refused, or null when it is accepted. Strict: the token, the protocol version, the grant flags and
 * each display's geometry are checked, and an unknown field is refused by name, as the helper refuses ours.
 */
// D-069: the oldest helper agent core runs with - 0.2.44 is the first to send defaultButtonRead, and a Return judged
// without it would pass where it should ask. Compared numerically, part by part (0.2.100 is newer than 0.2.44).
export const HELPER_VERSION_FLOOR = '0.2.44'
export function versionAtLeast(version, floor) {
  const parts = (text) => String(text).split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))
  const have = parts(version)
  const need = parts(floor)
  if (have.some(Number.isNaN) || have.length !== need.length) return false
  for (let i = 0; i < need.length; i++) if (have[i] !== need[i]) return have[i] > need[i]
  return true
}
export function helloProblem(hello, token) {
  if (!isObject(hello) || hello.type !== 'hello') return 'the first line is not a hello'
  const unknown = Object.keys(hello).find((name) => !HELLO_FIELDS.includes(name))
  if (unknown !== undefined) return `the hello has no field '${unknown}'`
  if (!sameToken(hello.token, token)) return 'the hello carried a wrong token'
  if (hello.protocol !== PROTOCOL_VERSION) return `the helper speaks protocol ${String(hello.protocol)}, not ${PROTOCOL_VERSION}`
  if (typeof hello.helperVersion !== 'string' || hello.helperVersion.length === 0) return 'the hello has no helperVersion'
  if (!versionAtLeast(hello.helperVersion, HELPER_VERSION_FLOOR)) return `helper ${hello.helperVersion} is older than ${HELPER_VERSION_FLOOR}, the first that reports the default button's read state - install a current helper (D-069)`
  const grants = hello.grants
  if (!isObject(grants) || typeof grants.screen !== 'boolean' || typeof grants.accessibility !== 'boolean') return 'the hello grants need boolean screen and accessibility'
  const unknownGrant = Object.keys(grants).find((name) => !HELLO_GRANTS.includes(name))
  if (unknownGrant !== undefined) return `the hello has no grant '${unknownGrant}'`
  for (const name of ['postEvents', 'listenEvents']) {
    if (grants[name] !== undefined && typeof grants[name] !== 'boolean') return `the hello grant ${name} must be boolean`
  }
  if (!Array.isArray(hello.displays)) return 'the hello needs a displays list'
  for (const display of hello.displays) {
    const ok = isObject(display) && (typeof display.id === 'number' || typeof display.id === 'string') && finite(display.originPt?.x) && finite(display.originPt?.y)
      && finite(display.sizePt?.width) && display.sizePt.width > 0 && finite(display.sizePt?.height) && display.sizePt.height > 0 && finite(display.scale) && display.scale > 0
    if (!ok) return 'a hello display needs id, originPt, sizePt and scale'
  }
  return null
}

/**
 * Splits a byte stream into lines; refuses a line longer than `maxBytes` so a broken helper cannot grow the buffer
 * without bound.
 */
export class LineFramer {
  constructor({ maxBytes = MAX_LINE_BYTES } = {}) {
    this.maxBytes = maxBytes
    this.parts = []
    this.size = 0
  }

  /** Feed a chunk; returns the complete lines it finished, or throws when a line passes the limit. */
  push(chunk) {
    const lines = []
    let buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    for (let at = buffer.indexOf(0x0a); at !== -1; at = buffer.indexOf(0x0a)) {
      const head = buffer.subarray(0, at)
      if (this.size + head.length > this.maxBytes) throw new Error('line too long')
      this.parts.push(head)
      lines.push(Buffer.concat(this.parts).toString('utf8'))
      this.parts = []
      this.size = 0
      buffer = buffer.subarray(at + 1)
    }
    if (buffer.length > 0) {
      if (this.size + buffer.length > this.maxBytes) throw new Error('line too long')
      this.parts.push(buffer)
      this.size += buffer.length
    }
    return lines
  }
}

/**
 * One helper connection over any pair of streams. Emits `hello` (the opening line, before it is checked), `frame`
 * and `localInput` (helper events), and once at the end either `lost` (`{ reason }`, the helper went) or `closed`
 * (this side closed it).
 */
export class HelperLink extends EventEmitter {
  constructor({ readable, writable, destroy, requestTimeoutMs = REQUEST_TIMEOUT_MS, maxLineBytes = MAX_LINE_BYTES }) {
    super()
    this.readable = readable
    this.writable = writable
    this.destroyTransport = destroy ?? (() => { readable.destroy?.(); writable.destroy?.() })
    this.requestTimeoutMs = requestTimeoutMs
    this.framer = new LineFramer({ maxBytes: maxLineBytes })
    this.pending = new Map()
    this.nextId = 1
    this.hello = null
    // The releasedStale event's payload, kept: it comes while a launch is still sending its first requests, before an
    // environment exists to hear it (CU-64 G1).
    this.releasedStale = null
    this.opening = null
    this.lostReason = null
    this.closedByUs = false
    readable.on('data', (chunk) => this.#onData(chunk))
    readable.on('end', () => this.lose('the helper closed the connection'))
    readable.on('close', () => this.lose('the helper connection closed'))
    readable.on('error', () => this.lose('the helper connection failed'))
    if (writable !== readable) writable.on('error', () => this.lose('the helper connection failed'))
  }

  get lost() {
    return this.lostReason !== null
  }

  #onData(chunk) {
    if (this.lost) return
    let lines
    try {
      lines = this.framer.push(chunk)
    } catch {
      return this.lose('protocol: a line from the helper is too long')
    }
    for (const line of lines) {
      if (this.lost) return
      if (line.trim().length === 0) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return this.lose('protocol: a line from the helper is not JSON')
      }
      this.#onMessage(message)
    }
  }

  #onMessage(message) {
    if (!isObject(message)) return this.lose('protocol: a line from the helper is not an object')
    if (message.type === 'hello' && message.id === undefined) {
      if (this.opening !== null) return this.lose('protocol: a second hello')
      this.opening = message
      this.emit('hello', message)
      return
    }
    if (this.hello === null) return this.lose('protocol: the helper spoke before its hello was accepted')
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id)
      if (entry === undefined) return this.lose(`protocol: a reply to id ${JSON.stringify(message.id)}, which was never sent`)
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.ok === true) {
        const { id, ok, ...result } = message
        return entry.resolve(result)
      }
      if (message.ok !== false) return this.lose('protocol: a reply without ok')
      const error = replyError(entry.type, message)
      if (error !== null) return entry.reject(error)
      this.pending.set(message.id, entry) // so `lose` rejects it with the reason below
      return this.lose(`the helper failed the ${entry.type} request (${String(message.code ?? 'no code')}${helperSaid(message.message)})`)
    }
    if (typeof message.event === 'string' && EVENTS.includes(message.event)) {
      const { event, ...payload } = message
      if (event === 'releasedStale') this.releasedStale = payload
      this.emit(event, payload)
      return
    }
    this.lose('protocol: a line from the helper is neither a reply nor a known event')
  }

  /** Mark the hello accepted; requests may flow from now on. */
  accept(hello) {
    const { token, ...rest } = hello
    this.hello = Object.freeze(rest)
  }

  /**
   * Send one request; resolves with the reply's fields or rejects with an EnvironmentError. A timeout ends the link,
   * because a helper that has not answered may still be posting input.
   */
  request(type, fields = {}, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (this.closedByUs) return Promise.reject(new EnvironmentError('closed', 'the helper link is closed'))
    if (this.lost) return Promise.reject(new EnvironmentError('helper_lost', `the desktop helper is gone: ${this.lostReason}`))
    if (this.hello === null) return Promise.reject(new EnvironmentError('helper_lost', 'the helper has not said hello'))
    try {
      checkRequest(type, fields)
    } catch (error) {
      return Promise.reject(error)
    }
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new EnvironmentError('timeout', `the helper did not answer ${type} within ${timeoutMs} ms`))
        this.lose(`the helper did not answer ${type} in time`)
      }, timeoutMs)
      this.pending.set(id, { type, resolve, reject, timer })
      try {
        this.writable.write(`${JSON.stringify({ id, type, ...fields })}\n`)
      } catch {
        this.lose('the helper connection failed')
      }
    })
  }

  /** End the link for `reason`; every waiting request rejects. Idempotent; the first reason wins. */
  lose(reason) {
    if (this.lostReason !== null) return
    this.lostReason = reason
    const code = this.closedByUs ? 'closed' : 'helper_lost'
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new EnvironmentError(code, code === 'closed' ? 'the helper link is closed' : `the desktop helper is gone: ${reason}`))
      this.pending.delete(id)
    }
    try { this.destroyTransport() } catch { /* already gone */ }
    // `lost` is a crash; `closed` (our own close) only tells a waiter such as `awaitHello` to stop waiting.
    this.emit(this.closedByUs ? 'closed' : 'lost', { reason })
  }

  /** Close the link from this side. */
  close() {
    if (this.lost) return
    this.closedByUs = true
    this.lose('closed by the driver')
  }
}

/** The error for a helper that went away before a valid hello; the reason text names no path and no token. */
export function noHelloError() {
  return new EnvironmentError('helper_lost', 'the desktop helper closed the connection before a valid hello: it refused this driver or exited', { reason: 'no_hello' })
}

/**
 * Wait for a link's hello and check it. Resolves with the hello (token removed) or rejects with `helper_lost` naming
 * the refusal; a refused link is closed. A link that ends before any hello rejects `noHelloError()` (see "No hello"
 * above); one that broke the protocol first names that instead, in `details.refused`.
 */
export function awaitHello(link, { token, timeoutMs = HELLO_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const done = (error, hello) => {
      clearTimeout(timer)
      link.removeListener('hello', onHello)
      link.removeListener('lost', onLost)
      link.removeListener('closed', onClosed)
      if (error !== null) {
        link.close()
        reject(error)
      } else resolve(hello)
    }
    const onHello = (hello) => {
      const problem = helloProblem(hello, token)
      if (problem !== null) return done(new EnvironmentError('helper_lost', `the helper's hello was refused: ${problem}`, { refused: problem }))
      link.accept(hello)
      done(null, link.hello)
    }
    // Protocol losses carry a `protocol:` reason (HelperLink); anything else is the transport ending.
    const onLost = ({ reason }) => done(String(reason).startsWith('protocol:')
      ? new EnvironmentError('helper_lost', `the desktop helper is gone before its hello: ${reason}`, { refused: reason })
      : noHelloError())
    // This side closed the link (a server that took another helper, or shut down): not the helper's refusal.
    const onClosed = () => done(new EnvironmentError('closed', 'the helper link was closed by this driver before its hello'))
    const timer = setTimeout(() => done(new EnvironmentError('timeout', `the helper sent no hello within ${timeoutMs} ms`)), timeoutMs)
    link.on('hello', onHello)
    link.on('lost', onLost)
    link.on('closed', onClosed)
    if (link.opening !== null) onHello(link.opening)
    else if (link.closedByUs) onClosed()
    else if (link.lost) onLost({ reason: link.lostReason })
  })
}

/**
 * The stdio transport: a link over a child process's stdout (helper to driver) and stdin (driver to helper), for the
 * fake helper of the unit tests. Resolves once the hello is accepted.
 */
export async function connectStdio(child, { token, helloTimeoutMs = HELLO_TIMEOUT_MS, requestTimeoutMs } = {}) {
  const link = new HelperLink({
    readable: child.stdout,
    writable: child.stdin,
    destroy: () => {
      try { child.stdin.end() } catch { /* already closed */ }
      child.stdout.destroy()
    },
    ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
  })
  child.once('exit', () => link.lose('the helper exited'))
  await awaitHello(link, { token, timeoutMs: helloTimeoutMs })
  return link
}

/** Whether `dir` is a directory owned by this user that no one else may enter (mode 700 or stricter). */
export function isPrivateDir(dir) {
  const stat = lstatSync(dir)
  return stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && (typeof process.getuid !== 'function' || stat.uid === process.getuid())
}

const captureRefused = (reason) => new EnvironmentError('helper_lost', `the helper's capture was refused: ${reason}`, { refused: reason })

/**
 * Read a capture file the helper named, as the protocol allows (see `CAPTURE_FILE_NAME`), and return its bytes.
 *
 * The path comes from another process, so it is trusted for nothing: it must be absolute and normalised, lie directly
 * in `runDir` (compared by real path, since `/tmp` and `/var` are symlinks on macOS) and carry a `.png` name. Only
 * then is it touched - opened without following a symlink, read if it is a regular file within `maxBytes`, and
 * deleted whether or not the hash matches, so a refused capture leaves nothing behind. A path outside the run
 * directory is never read and never deleted. The refusal names the rule, never the path (the message may reach the
 * model).
 */
export function readCaptureFile({ path, sha256, runDir, maxBytes = MAX_CAPTURE_BYTES }) {
  if (typeof runDir !== 'string' || !isAbsolute(runDir)) throw captureRefused('a capture file arrived, but this link has no run directory to accept it from')
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0') || normalize(path) !== path) throw captureRefused('the capture path is not an absolute, normalised path')
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw captureRefused('the capture file has no lowercase hex sha256')
  let inside = false
  try {
    inside = realpathSync(dirname(path)) === realpathSync(runDir)
  } catch {
    inside = false
  }
  if (!inside) throw captureRefused('the capture file is outside the run directory')
  if (!CAPTURE_FILE_NAME.test(basename(path))) throw captureRefused('the capture file name is not a .png name')
  let data
  try {
    let fd
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    } catch (error) {
      throw captureRefused(error?.code === 'ELOOP' ? 'the capture file is a symlink' : 'the capture file cannot be opened')
    }
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile()) throw captureRefused('the capture file is not a regular file')
      if (stat.size > maxBytes) throw captureRefused(`the capture file is larger than ${maxBytes} bytes`)
      data = Buffer.alloc(stat.size)
      let read = 0
      while (read < data.length) {
        const n = readSync(fd, data, read, data.length - read, read)
        if (n === 0) break
        read += n
      }
      if (read !== data.length) throw captureRefused('the capture file was cut short while it was read')
    } finally {
      closeSync(fd)
    }
  } finally {
    try { unlinkSync(path) } catch { /* already gone, or not a file */ }
  }
  if (createHash('sha256').update(data).digest('hex') !== sha256) throw captureRefused('the capture file does not match its sha256')
  return data
}

/**
 * The PNG bytes of a capture reply: the inline `png`, or the file named by `path` and `sha256` in `runDir`. A reply
 * with neither, or with both, is refused.
 */
export function captureImage(reply, { runDir = null } = {}) {
  const inline = reply?.png !== undefined
  const byPath = reply?.path !== undefined
  if (inline && byPath) throw captureRefused('a capture carries both png and path')
  if (inline) {
    if (typeof reply.png !== 'string' || reply.png.length === 0) throw captureRefused('the inline png is not base64 text')
    return Buffer.from(reply.png, 'base64')
  }
  if (byPath) return readCaptureFile({ path: reply.path, sha256: reply.sha256, runDir })
  throw captureRefused('the capture has no image')
}

const RUN_DIR_NAME = /^helper-[A-Za-z0-9]{6}$/

/**
 * Who may be on the other end of the helper socket (red team B5, helper-boundary.md). `require` drops a peer whose
 * identity cannot be read as well as one that fails; `warn` accepts an unreadable peer with a logged warning but still
 * drops one that is known to be wrong; `off` checks nothing (the token alone, as before B5).
 */
export const PEER_CHECKS = Object.freeze(['require', 'warn', 'off'])
/**
 * The code requirement the helper's running code must satisfy. While the helper is signed ad hoc (Q-D2) this is only
 * its identifier, which any local signer can claim, so the executable path is the stronger half of the check; with a
 * stable identity it should name the certificate too.
 */
export const HELPER_REQUIREMENT = 'identifier "com.reflection.cu-helper"'
export const LSOF_BINARY = '/usr/sbin/lsof'
export const CODESIGN_BINARY = '/usr/bin/codesign'
export const PEER_CHECK_TIMEOUT_MS = 10_000
/** Why a connection was dropped, as `refusals` and the log name it: a reason code and the peer's pid, nothing else. */
export const REFUSALS = Object.freeze({
  peer_unknown: 'its peer process could not be identified',
  peer_executable: 'its peer is not the helper executable',
  peer_signature: 'its peer does not satisfy the helper code requirement',
  hello: 'its hello was refused',
  one_helper: 'a helper was already accepted for this run',
  launch_over: 'this launch already failed or was closed',
  no_hello: 'it closed before any hello: the helper refused this driver or died',
})

const TOOL_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C' })

/**
 * Run a system tool by absolute path with a minimal environment. Resolves `{ code, stdout, stderr }` and never
 * rejects: `code` is the exit status, or null when the tool could not run or did not finish within `timeoutMs`.
 */
export function runTool(file, args, { timeoutMs = PEER_CHECK_TIMEOUT_MS, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((done) => {
    try {
      execFile(file, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer, env: TOOL_ENV }, (error, stdout, stderr) => {
        const code = error ? (Number.isInteger(error.code) ? error.code : null) : 0
        done({ code, stdout: typeof stdout === 'string' ? stdout : '', stderr: typeof stderr === 'string' ? stderr : '' })
      })
    } catch {
      done({ code: null, stdout: '', stderr: '' })
    }
  })
}

/** `lsof -F` output as one record per open file: `{ pid, fd, device, name }` (fields absent from the output are null). */
export function parseLsofFields(text) {
  const files = []
  let pid = null
  let file = null
  for (const line of String(text).split('\n')) {
    if (line.length === 0) continue
    const value = line.slice(1)
    switch (line[0]) {
      case 'p':
        pid = Number(value)
        file = null
        break
      case 'f':
        file = { pid, fd: value, device: null, name: null }
        files.push(file)
        break
      case 'd':
        if (file !== null) file.device = value
        break
      case 'n':
        if (file !== null) file.name = value
        break
      default:
        break
    }
  }
  return files
}

/**
 * The default `identifyPeer`: the process at the other end of an accepted Unix-socket connection, as `{ pid, path }`,
 * or null when it cannot be told.
 *
 * Measured on macOS 27 (cu-developer-two, B5): `lsof -U` lists our accepted socket with its kernel address as
 * DEVICE, and the connecting process's socket with NAME `->` that address. So one system-wide `lsof -nP -U -F pfdn`
 * finds our fd's address and the one pid whose socket points at it. A peer held by several processes (it forked
 * after connecting), or gone already, is null. The path is the executable `codesign -d` names for that pid - the
 * kernel's record of the running code, which, unlike `ps` and argv, the process cannot rewrite - else the first `txt`
 * file lsof lists for it. Node exposes an accepted socket's descriptor only as `socket._handle.fd`.
 */
export async function identifyPeerByLsof(socket, { run = runTool, selfPid = process.pid } = {}) {
  const fd = socket?._handle?.fd
  if (!Number.isInteger(fd) || fd < 0) return null
  const files = parseLsofFields((await run(LSOF_BINARY, ['-nP', '-U', '-F', 'pfdn'])).stdout)
  const ours = files.find((file) => file.pid === selfPid && file.fd === String(fd))
  if (typeof ours?.device !== 'string' || !/^0x[0-9a-f]+$/i.test(ours.device)) return null
  const pids = [...new Set(files.filter((file) => file.name === `->${ours.device}`).map((file) => file.pid))]
  if (pids.length !== 1 || !Number.isInteger(pids[0]) || pids[0] <= 0) return null
  const [pid] = pids
  const display = await run(CODESIGN_BINARY, ['-d', String(pid)])
  let path = /^Executable=(\/.*)$/m.exec(`${display.stderr}\n${display.stdout}`)?.[1] ?? null
  if (path === null) {
    const text = parseLsofFields((await run(LSOF_BINARY, ['-nP', '-a', '-p', String(pid), '-d', 'txt', '-F', 'n'])).stdout)
    path = text.find((file) => typeof file.name === 'string' && isAbsolute(file.name))?.name ?? null
  }
  return path === null ? null : { pid, path }
}

/**
 * The default `verifyPeer`: `codesign --verify -R=<requirement> <pid>` on the running process, so it is the code the
 * kernel runs that must satisfy the requirement, not whatever file sits at the path. True only on exit 0.
 */
export async function verifyPeerSignature({ pid, requirement }, { run = runTool } = {}) {
  if (!Number.isInteger(pid) || pid <= 0 || typeof requirement !== 'string' || requirement.length === 0) return false
  return (await run(CODESIGN_BINARY, ['--verify', `-R=${requirement}`, String(pid)])).code === 0
}

/** A path compared as the filesystem resolves it (`/tmp` and `/var` are symlinks on macOS); itself when it does not exist. */
function canonicalPath(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

/** `fn()` within `ms`, else `fallback`; a seam that throws also gives `fallback`. */
async function bounded(fn, ms, fallback) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((done) => { timer = setTimeout(() => done(fallback), ms) }),
    ])
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

function checkPeerOptions({ peerCheck, helperExecutable, helperRequirement, identifyPeer, verifyPeer, peerLog }) {
  if (!PEER_CHECKS.includes(peerCheck)) throw invalid(`peerCheck is one of ${PEER_CHECKS.join(', ')}`)
  if (peerCheck !== 'off' && (typeof helperExecutable !== 'string' || !isAbsolute(helperExecutable))) {
    throw invalid('the helper server needs the absolute path of the helper executable to check its peer, or peerCheck off')
  }
  if (typeof helperRequirement !== 'string' || helperRequirement.length === 0 || /[\n\r\0]/.test(helperRequirement)) throw invalid('helperRequirement must be one line of code requirement text')
  for (const [name, value] of Object.entries({ identifyPeer, verifyPeer, peerLog })) {
    if (typeof value !== 'function') throw invalid(`${name} must be a function`)
  }
}

/**
 * The Unix-socket transport. Makes a fresh mode-700 directory under `parentDir` (the design's `$CU_HOME/run/`),
 * writes a random per-run token to a mode-600 file in it, and listens on `helper.sock` there.
 *
 * Each connection is checked in this order, and dropped (socket destroyed, counted in `refused`, named in `refusals`
 * and logged by reason and pid only) at the first failure, while the server keeps waiting for the real helper until
 * the `accept()` deadline:
 *
 * 1. the peer (unless `peerCheck` is `off`): `identifyPeer(socket)` (default `identifyPeerByLsof`) names its pid and
 *    executable; the executable must be `helperExecutable` and `verifyPeer({ pid, path, requirement })` (default
 *    `verifyPeerSignature`) must pass for `helperRequirement`. An unidentifiable peer is dropped under `require`, and
 *    accepted with a warning under `warn`. Nothing the peer sent is read before this - its bytes wait in the socket -
 *    so an impostor that read the token file is gone before its hello is looked at;
 * 2. the hello, as `awaitHello` checks it: a wrong token is an impostor, not our helper, so the server keeps waiting.
 *
 * No hello (D-029 a): a connection that ends before any hello is our helper refusing this driver or dying, so
 * `accept()` rejects at once with `noHelloError()` instead of waiting out the deadline. That holds for a peer that
 * passed step 1, and for one that closed without a byte before step 1 could see it - the real helper's refusal is
 * that quick - which trusts nothing; a peer known to be wrong is only dropped.
 *
 * The first connection to pass both is the run's one helper: the token file is deleted at once (the real helper
 * unlinks it after reading too; a later reader would learn a live secret), every other connection is closed, and the
 * server stops listening; a connection that still arrives is destroyed. `peer` is the accepted peer's
 * `{ pid, path, verified }`. `close()` removes the directory it made, and only that directory.
 */
export async function createHelperServer({
  parentDir: given,
  helloTimeoutMs = HELLO_TIMEOUT_MS,
  requestTimeoutMs,
  peerCheck = 'require',
  helperExecutable,
  helperRequirement = HELPER_REQUIREMENT,
  identifyPeer = identifyPeerByLsof,
  verifyPeer = verifyPeerSignature,
  peerLog = (line) => process.stderr.write(`${line}\n`),
  peerCheckTimeoutMs = PEER_CHECK_TIMEOUT_MS,
} = {}) {
  if (typeof given !== 'string' || !isAbsolute(given)) throw invalid('the helper server needs an absolute parentDir')
  checkPeerOptions({ peerCheck, helperExecutable, helperRequirement, identifyPeer, verifyPeer, peerLog })
  if (!(Number.isFinite(peerCheckTimeoutMs) && peerCheckTimeoutMs > 0)) throw invalid('peerCheckTimeoutMs must be a positive number of milliseconds')
  const parentDir = resolve(given)
  mkdirSync(parentDir, { recursive: true, mode: 0o700 })
  const dir = mkdtempSync(join(parentDir, 'helper-'))
  chmodSync(dir, 0o700)
  const removeDir = () => {
    // Only the directory this call made: the exact mkdtemp shape under the given parent.
    if (dirname(dir) === parentDir && RUN_DIR_NAME.test(basename(dir))) rmSync(dir, { recursive: true, force: true })
  }
  const socketPath = join(dir, 'helper.sock')
  const tokenPath = join(dir, 'token')
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
    removeDir()
    throw invalid(`the helper socket path is longer than ${MAX_SOCKET_PATH_BYTES} bytes; use a shorter run directory`)
  }
  if (!isPrivateDir(dir)) {
    removeDir()
    throw invalid('the helper run directory is not private (mode 700, owned by this user)')
  }
  const token = randomBytes(32).toString('hex')
  writeFileSync(tokenPath, `${token}\n`, { mode: 0o600, flag: 'wx' })
  const server = net.createServer()
  let accepted = null
  let acceptedPeer = null
  let closed = false
  let waiter = null
  let failure = null
  const refusals = []
  const checking = new Set()
  const candidates = new Map() // link -> peer pid, while its hello is awaited

  const say = (line) => {
    try { peerLog(line) } catch { /* a logger that throws never decides a connection */ }
  }

  /** Step 1: `{ refusal, peer, warn }`; `refusal` is a REFUSALS key or null. */
  const checkPeer = async (socket) => {
    if (peerCheck === 'off') return { refusal: null, peer: null, warn: false }
    const found = await bounded(() => identifyPeer(socket), peerCheckTimeoutMs, null)
    const peer = found !== null && typeof found === 'object' && Number.isInteger(found.pid) && found.pid > 0 && typeof found.path === 'string' && isAbsolute(found.path)
      ? { pid: found.pid, path: found.path } : null
    if (peer === null) return peerCheck === 'warn' ? { refusal: null, peer: null, warn: true } : { refusal: 'peer_unknown', peer: null }
    if (canonicalPath(peer.path) !== canonicalPath(helperExecutable)) return { refusal: 'peer_executable', peer }
    const signed = await bounded(() => verifyPeer({ pid: peer.pid, path: peer.path, requirement: helperRequirement }), peerCheckTimeoutMs, false)
    if (signed !== true) return { refusal: 'peer_signature', peer }
    return { refusal: null, peer, warn: false }
  }

  const record = (reason, pid) => {
    refusals.push(Object.freeze({ reason, pid }))
    say(`macos-desktop: refused a helper connection: ${REFUSALS[reason] ?? reason}${pid !== null ? ` (peer pid ${pid})` : ''}`)
  }
  const drop = (socket, reason, pid = null) => {
    record(reason, pid)
    socket.destroy()
  }
  /** #185's fast failure: our helper refused this driver or died before hello, so `accept()` rejects at once. */
  const fail = (error, pid) => {
    record('no_hello', pid)
    failure = error
    waiter?.reject(error)
  }
  const over = () => accepted !== null || failure !== null || closed

  /** The run's one helper: the token file goes at once, every other connection is closed, nothing more is accepted. */
  const take = (link, peer) => {
    accepted = link
    acceptedPeer = Object.freeze({ pid: peer?.pid ?? null, path: peer?.path ?? null, verified: peer !== null })
    try { unlinkSync(tokenPath) } catch { /* already gone */ }
    for (const [other, pid] of candidates) {
      other.close()
      record('one_helper', pid)
    }
    candidates.clear()
    for (const socket of checking) drop(socket, 'one_helper')
    checking.clear()
    server.close()
    waiter?.resolve(link)
  }

  server.on('connection', (socket) => {
    // A peer that resets before its link exists must not crash the driver with an unhandled 'error'.
    socket.on('error', () => {})
    if (over()) return drop(socket, accepted !== null ? 'one_helper' : 'launch_over')
    // Node emits 'end' on an unread socket only when the peer closed having sent nothing (measured): the D-029 refusal.
    let hungUp = false
    socket.once('end', () => { hungUp = true })
    checking.add(socket)
    checkPeer(socket).then(({ refusal, peer, warn }) => {
      if (!checking.delete(socket)) return // closed meanwhile, by `close()` or because another helper was taken
      if (over()) return drop(socket, accepted !== null ? 'one_helper' : 'launch_over', peer?.pid ?? null)
      // A peer gone before lsof could see it, without a byte, is the helper refusing us (D-029 a) as far as anyone can
      // tell; failing at once trusts nothing, and waiting would only run out the connect deadline.
      if (refusal === 'peer_unknown' && hungUp) return fail(noHelloError(), null)
      if (refusal !== null) return drop(socket, refusal, peer?.pid ?? null)
      if (warn) say('macos-desktop: warning: accepting a helper connection whose peer could not be identified (peerCheck warn)')
      const link = new HelperLink({ readable: socket, writable: socket, destroy: () => socket.destroy(), ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}) })
      if (socket.destroyed) link.lose('the helper connection closed')
      candidates.set(link, peer?.pid ?? null)
      awaitHello(link, { token, timeoutMs: helloTimeoutMs }).then(() => {
        if (!candidates.delete(link)) return link.close() // closed meanwhile, and already counted
        if (over()) return drop(socket, accepted !== null ? 'one_helper' : 'launch_over', peer?.pid ?? null)
        return take(link, peer)
      }, (error) => {
        if (!candidates.delete(link) || over()) return
        // A verified helper that ends before any hello refused us or died: #185's no_hello, at once.
        if (error?.details?.reason === 'no_hello') return fail(error, peer?.pid ?? null)
        drop(socket, 'hello', peer?.pid ?? null)
      })
    })
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.removeListener('error', reject)
      done()
    })
  })
  chmodSync(socketPath, 0o600)
  return {
    dir,
    socketPath,
    tokenPath,
    peerCheck,
    get refused() { return refusals.length },
    get refusals() { return [...refusals] },
    get peer() { return acceptedPeer },
    /** Resolve with the accepted link; reject with `timeout` after `timeoutMs`, or `helper_lost` `no_hello` at once. */
    accept({ timeoutMs = CONNECT_TIMEOUT_MS } = {}) {
      if (accepted !== null) return Promise.resolve(accepted)
      if (failure !== null) return Promise.reject(failure)
      return new Promise((done, reject) => {
        const timer = setTimeout(() => {
          waiter = null
          reject(new EnvironmentError('timeout', `the desktop helper did not connect within ${timeoutMs} ms`))
        }, timeoutMs)
        waiter = {
          resolve: (link) => { clearTimeout(timer); waiter = null; done(link) },
          reject: (error) => { clearTimeout(timer); waiter = null; reject(error) },
        }
      })
    },
    async close() {
      closed = true
      for (const socket of checking) socket.destroy()
      checking.clear()
      for (const link of candidates.keys()) link.close()
      candidates.clear()
      accepted?.close()
      await new Promise((done) => server.close(() => done()))
      removeDir()
    },
  }
}
