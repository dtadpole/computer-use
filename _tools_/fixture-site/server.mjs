#!/usr/bin/env node
/**
 * The fixture site: a dependency-free HTTP server on loopback with tasks whose outcome is machine-checkable.
 *
 * Two planes share one port:
 *
 * - the **application** the agent drives: `/`, `/tasks/<id>/` and each task's own routes under it;
 * - the **control plane** under `/__fixture/`: `report` (the pages' own state reports, POSTed JSON),
 *   `health`, and, behind `Authorization: Bearer <token>`, `tasks`, `state`, `state/<id>`, `targets/<id>`,
 *   `secrets/<id>`, `requests` and `reset`. The token is drawn per server, so the agent's browser can
 *   neither read the answer key nor reset a run.
 *
 * Every application request is logged with its Host, so `127.0.0.1:<port>` and `localhost:<port>` act as two
 * origins: a request the site filter should have stopped shows up in the log if it was not stopped.
 *
 * Library: `startFixtureServer({ port: 0, seed })` resolves to `{ url, port, token, seed, close }`.
 * Command line: `node server.mjs [--port N] [--seed S] [--verbose]` prints one JSON line with the same fields
 * and serves until SIGINT or SIGTERM.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { parseArgs } from 'node:util'

import { renderError, renderIndex } from './pages.mjs'
import {
  addRecord,
  applyReport,
  createStore,
  findRecord,
  logRequest,
  noteStaleReport,
  recordsFor,
  requestsSince,
  resetStore,
  snapshot,
  targetsFor,
  taskState,
  validateReport,
} from './store.mjs'
import { describeTask, getTask, idsOfKind, instantiate, renderTask, TASK_IDS, taskSecrets } from './tasks.mjs'

/** The largest request body the server reads. */
export const MAX_BODY_BYTES = 16 * 1024

/** The hosts the server may bind and answer to; anything wider would expose it beyond this machine. */
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost'])

const COMMON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
})

/** Read a request body up to `limit` bytes; rejects with `code: 'too-large'` beyond it. */
function readBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let failed = false
    request.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > limit) {
        failed = true
        reject(Object.assign(new Error(`body exceeds ${limit} bytes`), { code: 'too-large' }))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks))
    })
    request.on('error', (error) => {
      if (!failed) reject(error)
    })
  })
}

/** Whether a request carries the server's bearer token, compared in constant time. */
export function hasToken(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const wanted = Buffer.from(token)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

/** The media type of a request, lower-cased and without parameters. */
function mediaType(request) {
  return String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * Match a task route. `routes` is keyed `'METHOD path'`, where a `:name` segment matches one segment.
 * Returns `{ handler, params }` or null.
 */
export function matchRoute(routes, method, rest) {
  const parts = rest.split('/')
  for (const [key, handler] of Object.entries(routes ?? {})) {
    const [routeMethod, pattern] = key.split(' ')
    if (routeMethod !== method) continue
    const expected = pattern.split('/')
    if (expected.length !== parts.length) continue
    const params = {}
    let matched = true
    for (let index = 0; index < expected.length; index += 1) {
      if (expected[index].startsWith(':')) {
        if (parts[index] === '' || !/^[A-Za-z0-9._-]{1,64}$/.test(parts[index])) {
          matched = false
          break
        }
        params[expected[index].slice(1)] = parts[index]
      } else if (expected[index] !== parts[index]) {
        matched = false
        break
      }
    }
    if (matched) return { handler, params }
  }
  return null
}

/** The other loopback origin on the same port, so a page can link off-site without leaving the machine. */
export function originsFor(hostHeader, port, offsitePort = null) {
  const primary = `http://${hostHeader}`
  const secondary = hostHeader.startsWith('localhost') ? `http://127.0.0.1:${port}` : `http://localhost:${port}`
  // A different port is a different site even to a filter that folds loopback aliases together.
  return { primary, secondary, ...(offsitePort ? { offsite: `http://127.0.0.1:${offsitePort}` } : {}) }
}

/**
 * Start a fixture server.
 *
 * @param {object} [options]
 * @param {string} [options.host] `127.0.0.1` (default) or `localhost`; nothing wider is accepted.
 * @param {number} [options.port] 0 (default) for a random free port.
 * @param {string|number} [options.seed] draws the per-instance values; random when omitted.
 * @param {string} [options.token] the control-plane token; random when omitted.
 * @param {(entry: object) => void} [options.log] called once per request with method, path and status.
 */
export async function startFixtureServer(options = {}) {
  const host = options.host ?? '127.0.0.1'
  if (!LOOPBACK_HOSTS.includes(host)) throw new Error(`the fixture binds loopback only, not ${JSON.stringify(host)}`)
  const token = options.token ?? randomBytes(16).toString('hex')
  let instance = instantiate(options.seed ?? randomBytes(4).toString('hex'))
  const store = createStore()
  const log = options.log ?? (() => {})
  let port = 0
  let offsitePort = null
  let allowedHosts = []
  let allowedOrigins = []

  function send(response, status, body, type, extra = {}) {
    response.writeHead(status, { ...COMMON_HEADERS, 'content-type': type, ...extra })
    response.end(body)
    return status
  }
  const json = (response, status, value, extra) => send(response, status, `${JSON.stringify(value, null, 2)}\n`, 'application/json; charset=utf-8', extra)
  const html = (response, status, body, extra) => send(response, status, body, 'text/html; charset=utf-8', extra)
  const htmlError = (response, status, message, extra) => html(response, status, renderError(status, message), extra)
  const notAllowed = (response, allow) => json(response, 405, { error: 'method not allowed' }, { allow })
  const redirect = (response, status, location) => send(response, status, '', 'text/plain; charset=utf-8', { location })

  async function readJson(request) {
    const body = await readBody(request)
    if (body.length === 0) return {}
    return JSON.parse(body.toString('utf8'))
  }

  /** A page script's POST comes from this fixture's own origins; anything else is refused. */
  function sameOrigin(request) {
    const site = request.headers['sec-fetch-site']
    if (site !== undefined && site !== 'same-origin') return false
    const origin = request.headers.origin
    return origin === undefined || allowedOrigins.includes(origin)
  }

  /** The control plane; returns the status it sent. */
  async function control(request, response, url) {
    const path = url.pathname
    if (path === '/__fixture/health') {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      return json(response, 200, { ok: true, fixture: 'cu-fixture-site', tasks: idsOfKind('task').length, injections: idsOfKind('injection').length, probes: idsOfKind('probe').length })
    }
    if (path === '/__fixture/report') {
      if (request.method !== 'POST') return notAllowed(response, 'POST')
      if (!sameOrigin(request)) return json(response, 403, { error: 'reports are same-origin only' })
      if (mediaType(request) !== 'application/json') return json(response, 415, { error: 'reports are application/json' })
      const checked = validateReport(await readJson(request))
      if (!checked.ok) return json(response, 400, { error: checked.error })
      if (!applyReport(store, checked.report)) noteStaleReport(store, checked.report.task)
      return send(response, 204, '', 'text/plain; charset=utf-8')
    }
    if (!hasToken(request.headers.authorization, token)) {
      return json(response, 401, { error: 'the control plane needs Authorization: Bearer <token>' }, { 'www-authenticate': 'Bearer' })
    }
    if (path === '/__fixture/tasks') {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      const kind = url.searchParams.get('kind')
      const ids = kind ? idsOfKind(kind) : TASK_IDS
      const base = `http://${request.headers.host}/`
      return json(response, 200, { seed: instance.seed, tasks: ids.map((id) => describeTask(id, instance.expected[id], base)) })
    }
    if (path === '/__fixture/state') {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      return json(response, 200, snapshot(store, instance))
    }
    if (path === '/__fixture/requests') {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      const since = Number(url.searchParams.get('since') ?? 0)
      return json(response, 200, { requests: requestsSince(store, Number.isFinite(since) ? since : 0) })
    }
    const one = /^\/__fixture\/(state|targets|secrets)\/([a-z0-9-]+)$/.exec(path)
    if (one) {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      const [, what, id] = one
      if (!getTask(id)) return json(response, 404, { error: `unknown task ${id}` })
      if (what === 'state') return json(response, 200, { id, ...taskState(store, instance, id) })
      if (what === 'targets') return json(response, 200, { id, ...targetsFor(store, id) })
      return json(response, 200, { id, secrets: taskSecrets(id, instance.expected[id]) })
    }
    if (path === '/__fixture/reset') {
      if (request.method !== 'POST') return notAllowed(response, 'POST')
      const body = await readJson(request)
      if (body.seed !== undefined) {
        if (!(typeof body.seed === 'string' || Number.isSafeInteger(body.seed)) || String(body.seed).length > 64) {
          return json(response, 400, { error: 'seed must be a string or an integer, at most 64 characters' })
        }
        instance = instantiate(body.seed)
      }
      resetStore(store)
      return json(response, 200, { ok: true, seed: instance.seed })
    }
    return json(response, 404, { error: `no control endpoint ${path}` })
  }

  /** The context a task's page and routes see. */
  function contextFor(request, url, id, extra = {}) {
    return {
      url,
      origins: originsFor(request.headers.host, port, offsitePort),
      records: recordsFor(store, id),
      findRecord: (recordId) => findRecord(store, id, recordId),
      ...extra,
    }
  }

  /** Turn a route handler's answer into a response. */
  function respond(response, result) {
    if (result?.redirect) return redirect(response, 303, result.redirect)
    if (result?.html !== undefined) return html(response, result.status ?? 200, result.html)
    if (result?.json !== undefined) return json(response, result.status ?? 200, result.json)
    if (result?.body !== undefined) return send(response, result.status ?? 200, result.body, result.type ?? 'text/plain; charset=utf-8', result.headers)
    return send(response, result?.status ?? 204, '', 'text/plain; charset=utf-8')
  }

  /** A task's own route under `/tasks/<id>/<rest>`. */
  async function taskRoute(request, response, url, task, rest) {
    const route = matchRoute(task.routes, request.method, rest)
    if (!route) {
      const other = matchRoute(task.routes, request.method === 'GET' ? 'POST' : 'GET', rest)
      return other ? notAllowed(response, request.method === 'GET' ? 'POST' : 'GET') : htmlError(response, 404, `Nothing is served at ${url.pathname}.`)
    }
    let form = null
    let body = null
    if (request.method === 'POST') {
      const type = mediaType(request)
      if (type === 'application/x-www-form-urlencoded') form = new URLSearchParams((await readBody(request)).toString('utf8'))
      else if (type === 'application/json') {
        if (!sameOrigin(request)) return json(response, 403, { error: 'page posts are same-origin only' })
        body = await readJson(request)
      } else return htmlError(response, 415, 'Forms post application/x-www-form-urlencoded; page scripts post application/json.')
    }
    const expected = instance.expected[task.id]
    const context = contextFor(request, url, task.id)
    const result = await route.handler({
      ...context,
      params: route.params,
      form,
      json: body,
      expected,
      addRecord: (fields) => addRecord(store, task.id, fields),
      render: (extra = {}) => renderTask(task.id, expected, { ...context, ...extra }),
    })
    return respond(response, result)
  }

  /** The application the agent drives. */
  async function application(request, response, url) {
    const path = url.pathname
    if (path === '/favicon.ico') return send(response, 204, '', 'image/x-icon')
    logRequest(store, { method: request.method, host: request.headers.host, path: `${path}${url.search}` })
    if (path === '/') {
      if (request.method !== 'GET') return notAllowed(response, 'GET')
      const base = `http://${request.headers.host}/`
      return html(response, 200, renderIndex(TASK_IDS.map((id) => describeTask(id, instance.expected[id], base))))
    }
    const match = /^\/tasks\/([a-z0-9-]+)(\/?)(.*)$/.exec(path)
    const task = match && getTask(match[1])
    if (!task) return htmlError(response, 404, `Nothing is served at ${path}.`)
    if (match[2] === '') return redirect(response, 301, `/tasks/${task.id}/${url.search}`)
    if (match[3] !== '') return taskRoute(request, response, url, task, match[3])
    if (request.method !== 'GET') return notAllowed(response, 'GET')
    return html(response, 200, renderTask(task.id, instance.expected[task.id], contextFor(request, url, task.id)))
  }

  const server = createServer(async (request, response) => {
    let status = 500
    let path = request.url ?? '/'
    try {
      // Only loopback names are answered, so a rebound DNS name cannot reach the control plane.
      if (!allowedHosts.includes(request.headers.host)) {
        status = htmlError(response, 421, 'This fixture answers only to its loopback address.')
        return
      }
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
      path = url.pathname
      status = path.startsWith('/__fixture/') ? await control(request, response, url) : await application(request, response, url)
    } catch (error) {
      if (error?.code === 'too-large') status = json(response, 413, { error: error.message }, { connection: 'close' })
      else if (error instanceof SyntaxError) status = json(response, 400, { error: `invalid JSON: ${error.message}` })
      else if (!response.headersSent) status = json(response, 500, { error: 'internal fixture error' })
      else response.destroy(error)
    } finally {
      log({ method: request.method, path, status })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  port = server.address().port
  // The off-site listener: application pages only, on its own port, logged in the same request log.
  const offsite = createServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://offsite').pathname.startsWith('/__fixture/')) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('The off-site listener has no control plane.')
      return
    }
    server.emit('request', request, response)
  })
  await new Promise((resolve, reject) => {
    offsite.once('error', reject)
    offsite.listen(0, host, () => {
      offsite.off('error', reject)
      resolve()
    })
  })
  offsitePort = offsite.address().port
  allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `127.0.0.1:${offsitePort}`, `localhost:${offsitePort}`]
  allowedOrigins = allowedHosts.map((name) => `http://${name}`)
  const url = `http://${host}:${port}/`

  return {
    url,
    port,
    offsitePort,
    token,
    get seed() {
      return instance.seed
    },
    get instance() {
      return instance
    },
    store,
    close() {
      const stop = (listener) => new Promise((resolve) => {
        listener.close(() => resolve())
        listener.closeAllConnections()
      })
      return Promise.all([stop(server), stop(offsite)]).then(() => undefined)
    },
  }
}

/** Parse the command line; throws on an unknown option. */
export function parseCommandLine(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: '0' },
      seed: { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' },
      verbose: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port must be 0-65535, not ${values.port}`)
  return { port, seed: values.seed, host: values.host, verbose: values.verbose }
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2))
  const log = options.verbose ? (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`) : undefined
  const fixture = await startFixtureServer({ ...options, log })
  process.stdout.write(`${JSON.stringify({ url: fixture.url, port: fixture.port, token: fixture.token, seed: fixture.seed })}\n`)
  const stop = async () => {
    await fixture.close()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`fixture-site: ${error.message}\n`)
    process.exit(2)
  })
}
