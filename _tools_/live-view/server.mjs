import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { clearsCovered, coveredOf, fromFraction, POINT_COVERED, TITLE_MARKER } from './ui-logic.mjs'

/**
 * The live view (design: live-control.md "Transport", run-tokens.md; R37-R39, R57, R62): one run's watch and control
 * page, served on 127.0.0.1 at a random port for the length of the run (D-009).
 *
 * - Every route but the page's own code needs the run's view or control token (`?token=` or `Authorization: Bearer`);
 *   `control.authorize` decides which, and the run control enforces who may send what. Tokens never appear in an
 *   event, a log line or a response body.
 * - `Host` must be this server's own loopback address, so a page elsewhere cannot reach it through DNS rebinding;
 *   responses are `no-store`, `no-referrer`, and the page runs under a strict content security policy.
 * - `GET /events` streams Server-Sent Events: a `hello` with the current state and every pending request (rebuilt, so
 *   a reconnect misses nothing; R62), then run-control events and the browser's notices; each carries `at` (epoch ms).
 * - Stable for verifiers: the page's element ids and `<body data-state>`, which mirrors the run state (with
 *   `data-kind`, the environment, and `data-paused-by`, the pausing sender). `attached` tells open pages the
 *   environment's kind (`environmentKind`) and state once `attach` is called.
 * - `POST /control` passes `{ command, ...fields }` to the run control and answers `{ ok, state }` or `{ ok: false,
 *   state, error }`: 403 when the token's sender may not send that command at all (`SENDER_REFUSALS`, such as the
 *   watch token's `take_over`), 409 when the run's state does not allow it now. `POST /input` forwards a person's input
 *   to `environment.humanInput` during take-over, control token only; coordinates arrive as fractions of the screen.
 *   `GET /screen` is an MJPEG stream of the screencast, running only while someone watches; frames are never written
 *   anywhere.
 * - `GET /runs/<run-id>` is the replay of this run's trajectory (`run.json`, `events.jsonl`, `screenshots/`).
 * - The control URL is written to `$CU_HOME/control/<run-id>` (mode 600) for `cli.mjs control-link`, removed at close.
 * - The page's title, served and set by the page, starts with the fixed marker `[cu live view]` (`TITLE_MARKER`), so
 *   on a desktop run the live view's own browser window is excluded by window (app-policy.md), never captured.
 *
 * Desktop runs (`environment.kind === 'desktop'`, desktop-extension human-control.md):
 * - `/screen` streams the helper's `watch` frames (PNG parts, app-scoped like every capture) at `desktopScreencast.fps`
 *   (2 by default, the driver's own) while someone watches. Before the first approved app joins the scope the driver
 *   holds the viewer without frames, and the page shows "waiting for an approved app", not an error. Each desktop part
 *   carries `x-cu-frame-at` (epoch ms) and `x-cu-scope` (the approved bundle ids when it was written, URI-encoded and
 *   comma-separated), and the facts go out on the stream before the frame, so a watcher can match every frame to the
 *   scope that allowed it (the live probe does). The helper's watch frames name no windows, so no part does.
 * - `POST /input` is refused by name, `unsupported_on_desktop`: remote input to a real display is out of scope (Q-D7).
 *   Take over only changes the run state; the person uses the Mac itself.
 * - The stream adds `localInput` `{ type, at, kind }` and nothing else (trajectory-privacy.md: time and kind only) when
 *   the person's own input paused the run (the state event that goes with it has `source: 'local_input'`), and
 *   `environment_state` with the desktop's facts (`desktopFacts`) whenever they change; the hello carries the same
 *   facts, `environmentKind`, and who paused (`pausedBy`) and why control was handed over (`handoff`).
 * - Agent core's run-control `notice` of kind `point_covered` (CU-38, Q-D11: another app's window covered the point of
 *   the agent's last action) leaves the process as `{ type, kind, app, at }` and nothing else - `app` a bundle id, or
 *   null when agent core clears it after an action went through (`pointCoveredEvent`) - so no title or frame of an
 *   unapproved app can ride along. Until a clear or the next state change the hello carries it too (`covered`), so a
 *   page that connects later, the watch link's included, still shows it. It is information for people only.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const STATIC = Object.freeze({
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/ui-logic.mjs': ['ui-logic.mjs', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
})
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; media-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
const MAX_BODY = 16 * 1024
const BOUNDARY = 'cu-live-frame'
const SCREENSHOT_NAME = /^(step|zoom)-\d{4}(-\d+)?\.png$/
/** The browser notices that join the event stream; a desktop driver emits `crash` among them. */
const NOTICE_KINDS = Object.freeze(['navigation', 'blocked', 'popup', 'dialog', 'download', 'crash', 'notice'])
/** How often the desktop's cached facts are compared, so a scope or secure-input change reaches the page. */
const FACTS_POLL_MS = 500
export const DESKTOP_INPUT_REFUSAL = 'remote input to the desktop is out of scope (Q-D7): a person at the Mac uses it directly; take over only holds the agent'
/**
 * Run control's refusals that are about who sent the command, not when: answered 403, as `/input` answers the watch
 * token, so a client can tell "this link may never do that" from "not in this state" (409) by the status alone.
 */
export const SENDER_REFUSALS = Object.freeze(['not_allowed_for_sender', 'consent_not_accepted_from_caller'])

/** The default path of a run's control link, the same one `cli.mjs control-link` reads. */
export function controlLinkPath(runId, env = process.env) {
  const home = env.CU_HOME && env.CU_HOME.length > 0 ? env.CU_HOME : join(homedir(), '.computer-use')
  return join(home, 'control', String(runId))
}

/** The token a request presents, from `?token=` or `Authorization: Bearer`. */
export function presentedToken(req, url) {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim()
  return url.searchParams.get('token')
}

/** Whether a `Host` header names this server's own loopback address. */
export function hostAllowed(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

/** Strip anything token-like from an event before it leaves the process. */
export function publicEvent(event) {
  const { viewToken, controlToken, token, ...rest } = event ?? {}
  void viewToken
  void controlToken
  void token
  return rest
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('the body is not JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

/** The run's environment as the page knows it: `desktop`, `browser` for any other driver, or null before attach. */
export function environmentKind(environment) {
  if (environment === null || environment === undefined) return null
  return environment.kind === 'desktop' ? 'desktop' : 'browser'
}

/**
 * The facts of a desktop run a watcher may see, from the driver's cached `state()`: the approved apps (`scope`),
 * whether the local-input pause is armed, the time of a local input that still holds the agent (`localInput`, an ISO
 * time or null), whether secure input is on, the grants, and whether the latest capture or watch frame found no window
 * of an approved app (`noAppWindow`, CU-100: the page says so instead of showing black). No window title, frontmost app
 * or anything else from the screen: a person approved what is in scope, and the rest is not the live view's to pass on
 * (trajectory-privacy.md).
 */
export function desktopFacts(state) {
  if (state === null || typeof state !== 'object') return null
  return {
    scope: Array.isArray(state.scope) ? state.scope.filter((id) => typeof id === 'string') : [],
    pauseArmed: state.pauseArmed === true,
    localInput: typeof state.localInput === 'string' ? state.localInput : null,
    secureInput: state.secureInput === true,
    grants: state.grants !== null && typeof state.grants === 'object' ? { ...state.grants } : null,
    // CU-100: #245 set it in the driver's state and read it in ui-logic, but this list dropped it, so the notice never
    // reached a page (cu-verifier, live on helper 0.2.32). The facts poll sends the change within FACTS_POLL_MS.
    noAppWindow: state.noAppWindow === true,
  }
}

/** What the stream says about an environment's state: a browser's as it is, a desktop's as `desktopFacts`. */
function environmentStateOf(environment) {
  if (environment === null) return null
  const state = safeState(environment)
  return environmentKind(environment) === 'desktop' ? desktopFacts(state) : state
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE_MARKER} computer-use</title><link rel="stylesheet" href="/app.css"></head>
<body data-state="connecting">
<header><strong>computer-use</strong> <span id="run"></span> <span id="state" class="state">connecting</span> <span id="who"></span></header>
<div id="attention" class="attention" hidden></div>
<div id="notice" class="notice" hidden><span id="notice-text"></span> <button id="notice-resume" hidden>Resume</button></div>
<main>
<section class="screen-wrap"><img id="screen" alt="the agent's browser" draggable="false" tabindex="0"><p id="screen-wait" class="screen-wait" hidden>Waiting for an approved app: the screen shows only apps a person approved for this run, and none is approved yet.</p><p id="drive-hint" hidden>You have control: mouse and keys go to the browser. Hand back when done.</p><p id="desktop-hint" hidden>You have taken over: the agent sends no input. Use the Mac itself, then hand back.</p></section>
<aside>
<div class="buttons">
<button id="pause">Pause</button><button id="resume">Resume</button><button id="take-over">Take over</button>
<button id="hand-back">Hand back</button><button id="stop" class="danger">Stop</button>
</div>
<div id="nav" class="buttons" hidden><button id="back">Back</button><button id="forward">Forward</button><button id="reload">Reload</button></div>
<div id="dialog" class="panel" hidden><p id="dialog-text"></p><button id="dialog-accept">Accept</button><button id="dialog-dismiss">Dismiss</button></div>
<label for="note">Note for the agent (hand back)</label><input id="note" maxlength="500">
<div id="consents" class="panel"></div>
<form id="guide-form"><label for="guide">Guidance</label><input id="guide" maxlength="2000"><button type="submit">Send</button></form>
<ol id="log"></ol>
</aside>
</main>
<script type="module" src="/app.js"></script>
</body></html>
`

/**
 * Start the live view for one run. Options: `control` (agent-core's run control), `runId`, `runDir` (the run's
 * trajectory directory, for the replay), `linkPath` (default `controlLinkPath(runId)`; `null` writes none), `port`,
 * `screencast` (a browser's screencast options) and `desktopScreencast` (a desktop's, `{ fps }`: low, since every
 * frame is a capture of the person's screen). Resolves to `{ port, origin, viewUrl, controlUrl, attach(environment),
 * close() }`.
 */
export async function startLiveView({ control, runId, runDir = null, linkPath, port = 0, screencast: browserScreencast = { maxWidth: 960, quality: 60 }, desktopScreencast = { fps: 2 } } = {}) {
  if (control === undefined || typeof control.authorize !== 'function') throw new TypeError('startLiveView needs the run control')
  let environment = null
  let lastFrame = null
  let stopCast = null
  let starting = null
  const viewers = new Set()
  const streams = new Set()
  const detachers = []
  let closed = false
  // Rebuilt for a hello, so a page that reconnects during a pause or a hand-off still says why (R62).
  let pausedBy = null
  let handoff = null
  let covered = null
  let factsTimer = null
  let lastFacts = null

  const write = (payload) => {
    const line = `data: ${JSON.stringify(payload)}\n\n`
    for (const res of streams) res.write(line)
  }
  // Every event carries `at`, the server's clock in epoch ms, so a verifier can order it against other logs.
  const broadcast = (event) => write({ ...publicEvent(event), at: Date.now() })

  /**
   * Send the desktop's facts when they changed since the last time; a closed driver has none to send. Returns the
   * facts read (null for none), so a frame can carry the scope it was written under.
   */
  const checkFacts = () => {
    if (closed || environmentKind(environment) !== 'desktop') return null
    const facts = environmentStateOf(environment)
    if (facts === null) return null
    const json = JSON.stringify(facts)
    if (json === lastFacts) return facts
    lastFacts = json
    broadcast({ type: 'environment_state', environmentState: facts })
    return facts
  }

  detachers.push(control.subscribe((event) => {
    let outgoing = event
    if (event?.type === 'state') {
      pausedBy = event.state === 'paused' ? event.source ?? null : null
      if (event.state !== 'taken_over') handoff = null
      // The page drops it on the same events (ui-logic clearsCovered): not on the ask about the covering app itself.
      if (clearsCovered(event)) covered = null
    } else if (event?.type === 'notice' && event.kind === 'handoff') {
      handoff = { reason: event.reason ?? null }
    } else if (event?.type === 'notice' && event.kind === POINT_COVERED) {
      outgoing = pointCoveredEvent(event)
      covered = coveredOf(outgoing)
    }
    broadcast(outgoing)
    // After the driver's own listener: a resume or hand back clears its local-input stop in the same emit.
    if (environment !== null) setImmediate(checkFacts)
  }))

  // A desktop part's metadata comes before its content type, so a reader that looks only for content-type and
  // content-length (a browser's <img>, live-smoke) reads the part as before.
  const writeFrame = (res, frame) => {
    const meta = frame.meta === null ? '' : `x-cu-frame-at: ${frame.meta.at}\r\nx-cu-scope: ${frame.meta.scope.map(encodeURIComponent).join(',')}\r\n`
    res.write(`--${BOUNDARY}\r\n${meta}content-type: ${frame.type}\r\ncontent-length: ${frame.data.length}\r\n\r\n`)
    res.write(frame.data)
    res.write('\r\n')
  }
  /**
   * A browser sends JPEG; the desktop helper's watch frames are PNG, and each part says which it is. A desktop frame
   * first brings the stream's facts up to date, so a scope change always reaches `/events` before the frame it allowed
   * (the 500 ms poll alone could lag a frame), and the part records that scope and the time it was written.
   */
  const onFrame = ({ data, mimeType }) => {
    const desktop = environmentKind(environment) === 'desktop'
    const facts = desktop ? checkFacts() : null
    lastFrame = { data, type: mimeType === 'image/png' ? 'image/png' : 'image/jpeg', meta: desktop ? { at: Date.now(), scope: facts?.scope ?? [] } : null }
    for (const res of viewers) writeFrame(res, lastFrame)
  }
  const ensureCast = async () => {
    if (environment === null || viewers.size === 0 || stopCast !== null || starting !== null || closed) return
    const screencast = environmentKind(environment) === 'desktop' ? desktopScreencast : browserScreencast
    starting = environment.startScreencast({ ...screencast, onFrame }).then((stop) => { stopCast = stop }).catch(() => {}).finally(() => { starting = null })
    await starting
  }
  const maybeStopCast = async () => {
    if (viewers.size > 0) return
    await starting
    const stop = stopCast
    stopCast = null
    if (stop !== null) await stop().catch(() => {})
  }

  const send = (res, status, body, headers = {}) => {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    res.writeHead(status, {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json',
      ...headers,
    })
    res.end(payload)
  }

  const server = http.createServer(async (req, res) => {
    try {
      const actualPort = server.address().port
      if (!hostAllowed(req.headers.host, actualPort)) return send(res, 421, 'wrong host')
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`)
      const asset = STATIC[url.pathname]
      if (req.method === 'GET' && asset !== undefined) {
        return send(res, 200, readFileSync(join(HERE, asset[0])), { 'content-type': asset[1] })
      }
      const source = control.authorize(presentedToken(req, url))
      if (source !== 'view' && source !== 'control') return send(res, 401, { ok: false, error: 'token_required' })

      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, PAGE, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PAGE_CSP, 'x-frame-options': 'DENY' })
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', connection: 'keep-alive' })
        const hello = {
          type: 'hello', at: Date.now(), runId, source, state: control.state, pending: control.pending(), viewport: environment?.viewport ?? null,
          environmentKind: environmentKind(environment), environmentState: environmentStateOf(environment), pausedBy, handoff, covered,
        }
        res.write(`data: ${JSON.stringify(hello)}\n\n`)
        streams.add(res)
        const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15_000)
        heartbeat.unref?.()
        req.on('close', () => {
          clearInterval(heartbeat)
          streams.delete(res)
        })
        return undefined
      }
      if (req.method === 'POST' && url.pathname === '/control') {
        const body = await readBody(req)
        const result = control.send(body, { source })
        return send(res, result.ok ? 200 : SENDER_REFUSALS.includes(result.error) ? 403 : 409, result)
      }
      if (req.method === 'POST' && url.pathname === '/input') {
        if (source !== 'control') return send(res, 403, { ok: false, state: control.state, error: 'control_token_required' })
        // Whatever the state: the person at the Mac acts directly, and nothing from a page ever reaches the helper.
        if (environmentKind(environment) === 'desktop') return send(res, 409, { ok: false, state: control.state, error: 'unsupported_on_desktop', message: DESKTOP_INPUT_REFUSAL })
        if (control.humanMayAct?.() !== true) return send(res, 409, { ok: false, state: control.state, error: 'not_taken_over' })
        if (environment === null) return send(res, 409, { ok: false, state: control.state, error: 'no_environment' })
        const event = await readBody(req)
        return send(res, 200, { ok: true, ...(await handleInput(environment, event)) })
      }
      if (req.method === 'GET' && url.pathname === '/screen') {
        res.writeHead(200, { 'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', connection: 'keep-alive' })
        // At once, not with the first frame: a desktop run has none until an app is approved, and the stream is open.
        res.flushHeaders()
        viewers.add(res)
        if (lastFrame !== null) writeFrame(res, lastFrame)
        req.on('close', () => {
          viewers.delete(res)
          void maybeStopCast()
        })
        await ensureCast()
        return undefined
      }
      if (req.method === 'GET' && url.pathname.startsWith('/runs/')) return serveReplay(res, url.pathname, { runId, runDir, send })
      return send(res, 404, { ok: false, error: 'not_found' })
    } catch (error) {
      if (!res.headersSent) send(res, error.status ?? (error.code === 'invalid_argument' || error.code === 'unsupported_action' ? 400 : 500), { ok: false, state: control.state, error: error.code ?? error.message })
      else res.end()
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const actualPort = server.address().port
  const origin = `http://127.0.0.1:${actualPort}`
  const viewUrl = `${origin}/?token=${control.viewToken}`
  const controlUrl = `${origin}/?token=${control.controlToken}`
  const link = linkPath === undefined ? controlLinkPath(runId) : linkPath
  if (link !== null) {
    mkdirSync(dirname(link), { recursive: true, mode: 0o700 })
    writeFileSync(link, controlUrl + '\n', { mode: 0o600 })
    chmodSync(link, 0o600)
  }

  return {
    port: actualPort,
    origin,
    viewUrl,
    controlUrl,
    /**
     * Attach the run's environment: its notices join the event stream, the screen becomes watchable, and pages already
     * open learn its kind (`attached`). A desktop's local input joins too, as its time and kind only, and its facts are
     * compared every `FACTS_POLL_MS` (cached in the driver, so no helper request) to reach the page when they change.
     */
    attach(env) {
      environment = env
      const listen = (kind, listener) => {
        const off = env.on?.(kind, listener)
        if (typeof off === 'function') detachers.push(off)
      }
      for (const kind of NOTICE_KINDS) listen(kind, (detail) => broadcast({ type: 'environment', kind, ...pick(detail) }))
      const desktop = environmentKind(env) === 'desktop'
      if (desktop) {
        listen('localInput', (detail) => {
          const at = typeof detail?.at === 'string' ? Date.parse(detail.at) : Number.NaN
          write(localInputEvent(Number.isFinite(at) ? at : Date.now(), detail?.kind))
          checkFacts()
        })
      }
      const environmentState = environmentStateOf(env)
      if (desktop) lastFacts = JSON.stringify(environmentState)
      broadcast({ type: 'attached', environmentKind: environmentKind(env), environmentState })
      if (desktop && factsTimer === null && !closed) {
        factsTimer = setInterval(checkFacts, FACTS_POLL_MS)
        factsTimer.unref?.()
      }
      void ensureCast()
    },
    async close() {
      if (closed) return
      closed = true
      if (factsTimer !== null) clearInterval(factsTimer)
      for (const detach of detachers) {
        try { detach() } catch { /* an environment that cannot unsubscribe is closing already */ }
      }
      for (const res of streams) res.end()
      for (const res of viewers) res.end()
      viewers.clear()
      await maybeStopCast()
      if (link !== null && existsSync(link)) rmSync(link, { force: true })
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

/** Only the fields a browser notice may carry to a viewer, renamed so none overrides the event's own `type`. */
export function pick(detail = {}) {
  const renamed = { kind: 'noticeKind', type: 'dialogType' }
  const out = {}
  for (const key of ['url', 'rule', 'tabId', 'type', 'message', 'kind', 'reason']) if (detail[key] !== undefined) out[renamed[key] ?? key] = detail[key]
  return out
}

/**
 * The stream's event for a person's own input on the Mac: when (epoch ms) and whether it was a key or the pointer -
 * never which key or where (trajectory-privacy.md), and no run id or other field, so nothing else can ride along.
 */
export function localInputEvent(at, kind) {
  return { type: 'localInput', at, kind: kind === 'key' ? 'key' : 'pointer' }
}

/**
 * The stream's event for agent core's `point_covered` notice (CU-38): the covering app's bundle id, or null for agent
 * core's clear - never a window title, frame, point or anything else agent core or a driver might attach, because the
 * app is not approved and only its bundle id may reach a person's screen (trajectory-privacy.md).
 */
export function pointCoveredEvent(event) {
  return { type: 'notice', kind: POINT_COVERED, app: coveredOf(event)?.app ?? null }
}

function safeState(environment) {
  try {
    return environment.state()
  } catch {
    return null
  }
}

/** A person's input: pointer events arrive as fractions of the screen; navigation and dialog answers too. */
async function handleInput(environment, event) {
  if (event?.type === 'navigate') {
    if (event.direction === 'reload') return environment.reload()
    return environment.history({ direction: event.direction })
  }
  if (event?.type === 'dialog') return environment.handleDialog({ accept: event.accept === true, promptText: event.promptText })
  if (event?.type === 'mouse' || event?.type === 'wheel') {
    const at = fromFraction(event, environment.viewport)
    if (at === null) throw Object.assign(new Error('the pointer is outside the screen'), { code: 'invalid_argument' })
    const { fx, fy, ...rest } = event
    void fx
    void fy
    return environment.humanInput({ ...rest, ...at })
  }
  return environment.humanInput(event)
}

/** The replay: this run's header, events and screenshot list as JSON, or one screenshot. */
function serveReplay(res, pathname, { runId, runDir, send }) {
  const parts = pathname.split('/').filter(Boolean)
  if (runDir === null || parts[1] !== runId) return send(res, 404, { ok: false, error: 'not_found' })
  if (parts.length === 2) {
    const read = (name) => (existsSync(join(runDir, name)) ? readFileSync(join(runDir, name), 'utf8') : null)
    const header = read('run.json')
    const events = (read('events.jsonl') ?? '').split('\n').filter(Boolean).map((line) => {
      try {
        return publicEvent(JSON.parse(line))
      } catch {
        return null
      }
    }).filter(Boolean)
    const screenshots = existsSync(join(runDir, 'screenshots')) ? readdirSync(join(runDir, 'screenshots')).filter((name) => SCREENSHOT_NAME.test(name)).sort() : []
    return send(res, 200, { runId, header: header === null ? null : JSON.parse(header), events, screenshots })
  }
  if (parts.length === 4 && parts[2] === 'screenshots' && SCREENSHOT_NAME.test(parts[3])) {
    const path = join(runDir, 'screenshots', parts[3])
    if (!existsSync(path)) return send(res, 404, { ok: false, error: 'not_found' })
    return send(res, 200, readFileSync(path), { 'content-type': 'image/png' })
  }
  return send(res, 404, { ok: false, error: 'not_found' })
}
