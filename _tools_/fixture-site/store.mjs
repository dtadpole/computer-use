/**
 * The fixture's state: the latest report from each task page, the records the server created, and a log of
 * every application request.
 *
 * A page reports a full snapshot of its observable state on load and on every change, tagged with a per-load
 * id, the load's `performance.timeOrigin` and a sequence number. Reports can arrive out of order, so
 * `acceptReport` keeps only the newest: a higher sequence within one load, or a later load. The state
 * therefore describes the page as it is now, not the best moment of the run.
 *
 * The request log is the outside observer for the site filter and for injection effects: a request the
 * agent's browser never sent cannot appear in it.
 */

import { evaluateTask, getTask, TASK_IDS } from './tasks.mjs'

/** The largest facts object a page sends, in bytes of JSON. */
export const MAX_FACTS_BYTES = 4096

/** The longest string a fact may hold. */
export const MAX_FACT_STRING = 500

/** The most target boxes one report may carry. */
export const MAX_TARGETS = 80

/** The request log keeps this many newest entries. */
export const MAX_LOGGED_REQUESTS = 5000

/** A fresh, empty store. */
export function createStore() {
  return { pages: new Map(), records: new Map(), nextRecordId: 1, requests: [], nextRequestSeq: 1 }
}

/** Empty a store in place, keeping its identity. */
export function resetStore(store) {
  store.pages.clear()
  store.records.clear()
  store.nextRecordId = 1
  store.requests.length = 0
  store.nextRequestSeq = 1
}

/** A fact value is a short string, a boolean, a finite number, null, or an array of those. */
function isFactValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= MAX_FACT_STRING
  if (Array.isArray(value) && depth === 0) return value.length <= 50 && value.every((item) => isFactValue(item, 1))
  return false
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/** Check the optional target boxes: `{ name: [x, y, width, height] }`. */
function checkTargets(targets) {
  if (targets === undefined) return null
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) return 'targets must be an object'
  const entries = Object.entries(targets)
  if (entries.length > MAX_TARGETS) return `at most ${MAX_TARGETS} targets`
  for (const [name, box] of entries) {
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(name)) return `target name ${JSON.stringify(name)} is not allowed`
    if (!Array.isArray(box) || box.length !== 4 || !box.every(finite) || box[2] < 0 || box[3] < 0) return `target ${name} must be [x, y, width, height]`
  }
  return null
}

/**
 * Check a page report's shape. Returns `{ ok: true, report }` or `{ ok: false, error }`.
 * `body` is the parsed JSON the page posted.
 */
export function validateReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'report must be a JSON object' }
  const { task, loadId, origin, seq, facts, targets, viewport } = body
  if (typeof task !== 'string' || !getTask(task)) return { ok: false, error: `unknown task ${JSON.stringify(task)}` }
  if (typeof loadId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(loadId)) return { ok: false, error: 'loadId must be 1-64 letters, digits or dashes' }
  if (!finite(origin) || origin < 0) return { ok: false, error: 'origin must be a finite, non-negative number' }
  if (!Number.isSafeInteger(seq) || seq < 1) return { ok: false, error: 'seq must be a positive integer' }
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return { ok: false, error: 'facts must be an object' }
  if (JSON.stringify(facts).length > MAX_FACTS_BYTES) return { ok: false, error: `facts exceed ${MAX_FACTS_BYTES} bytes` }
  for (const [key, value] of Object.entries(facts)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)) return { ok: false, error: `fact name ${JSON.stringify(key)} is not allowed` }
    if (!isFactValue(value)) return { ok: false, error: `fact ${key} has an unsupported value` }
  }
  const targetProblem = checkTargets(targets)
  if (targetProblem) return { ok: false, error: targetProblem }
  if (viewport !== undefined && !(Array.isArray(viewport) && viewport.length === 5 && viewport.every(finite))) {
    return { ok: false, error: 'viewport must be [width, height, scrollX, scrollY, devicePixelRatio]' }
  }
  return {
    ok: true,
    report: { task, loadId, origin, seq, facts: { ...facts }, targets: targets ? { ...targets } : {}, viewport: viewport ? [...viewport] : null },
  }
}

/**
 * Whether `next` supersedes `previous` (both `{ loadId, origin, seq }`). Within one load the higher
 * sequence wins; across loads the later `origin` wins, and a tie goes to the newcomer so that a reload in
 * the same millisecond is not lost.
 */
export function acceptReport(previous, next) {
  if (!previous) return true
  if (previous.loadId === next.loadId) return next.seq > previous.seq
  return next.origin >= previous.origin
}

/** Apply a validated report; returns whether it was kept. */
export function applyReport(store, report, now = Date.now()) {
  const previous = store.pages.get(report.task)
  if (!acceptReport(previous, report)) return false
  store.pages.set(report.task, {
    loadId: report.loadId,
    origin: report.origin,
    seq: report.seq,
    facts: report.facts,
    targets: report.targets ?? {},
    viewport: report.viewport ?? null,
    receivedAt: now,
    reports: (previous?.reports ?? 0) + 1,
    staleReports: previous?.staleReports ?? 0,
  })
  return true
}

/** Count a report that arrived but lost to a newer one, so the state shows it happened. */
export function noteStaleReport(store, task) {
  const entry = store.pages.get(task)
  if (entry) entry.staleReports = (entry.staleReports ?? 0) + 1
}

/** Add a server-side record for a task (for example, a created badge) and return it. */
export function addRecord(store, task, fields, now = Date.now()) {
  if (!getTask(task)) throw new Error(`unknown fixture task ${JSON.stringify(task)}`)
  const record = { id: store.nextRecordId, ...fields, createdAt: now }
  store.nextRecordId += 1
  const list = store.records.get(task) ?? []
  list.push(record)
  store.records.set(task, list)
  return record
}

/** One record by task and id, or `undefined`. */
export function findRecord(store, task, id) {
  return (store.records.get(task) ?? []).find((record) => record.id === id)
}

/** A task's records, copied. */
export function recordsFor(store, task) {
  return (store.records.get(task) ?? []).map((record) => ({ ...record }))
}

/** Log one application request (`{ method, host, path }`); the oldest entries fall off past the cap. */
export function logRequest(store, { method, host, path }, now = Date.now()) {
  const entry = { seq: store.nextRequestSeq, t: new Date(now).toISOString(), method: String(method), host: String(host ?? ''), path: String(path).slice(0, 300) }
  store.nextRequestSeq += 1
  store.requests.push(entry)
  if (store.requests.length > MAX_LOGGED_REQUESTS) store.requests.splice(0, store.requests.length - MAX_LOGGED_REQUESTS)
  return entry
}

/** Logged requests after `since` (a sequence number), copied. */
export function requestsSince(store, since = 0) {
  return store.requests.filter((entry) => entry.seq > since).map((entry) => ({ ...entry }))
}

/** The logged requests under one task's paths. */
export function requestsFor(store, task) {
  const prefix = `/tasks/${task}/`
  return store.requests.filter((entry) => entry.path.startsWith(prefix)).map((entry) => ({ ...entry }))
}

/** The facts a task's evaluator receives. */
export function factsFor(store, task) {
  return { page: store.pages.get(task)?.facts ?? null, records: recordsFor(store, task), requests: requestsFor(store, task) }
}

/** A task's latest target boxes and viewport, as the page measured them. */
export function targetsFor(store, task) {
  const page = store.pages.get(task)
  const targets = {}
  for (const [name, [x, y, width, height]] of Object.entries(page?.targets ?? {})) {
    targets[name] = { x, y, width, height, cx: x + width / 2, cy: y + height / 2 }
  }
  const [width, height, scrollX, scrollY, devicePixelRatio] = page?.viewport ?? [null, null, null, null, null]
  return {
    viewport: page?.viewport ? { width, height, scrollX, scrollY, devicePixelRatio } : null,
    targets,
    reports: page?.reports ?? 0,
    updatedAt: page ? new Date(page.receivedAt).toISOString() : null,
  }
}

/**
 * Expected values with every secret replaced by its name, so the state endpoint - and any log a harness keeps
 * of it - never carries a secret; secrets travel only through `GET /__fixture/secrets/<id>`.
 */
export function redactSecrets(expected, secrets) {
  const values = new Map(Object.entries(secrets ?? {}).map(([name, value]) => [value, name]))
  if (values.size === 0) return expected
  return Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, values.has(value) ? `[secret ${values.get(value)}]` : value]))
}

/** The judged state of one task. */
export function taskState(store, instance, task) {
  const expected = instance.expected[task]
  const facts = factsFor(store, task)
  const { outcome, reason, ...extra } = evaluateTask(task, facts, expected)
  const page = store.pages.get(task)
  return {
    kind: getTask(task).kind,
    outcome,
    reason,
    ...extra,
    facts,
    expected: redactSecrets(expected, getTask(task).secrets(expected)),
    answer: getTask(task).answer(expected),
    reports: page?.reports ?? 0,
    staleReports: page?.staleReports ?? 0,
    updatedAt: page ? new Date(page.receivedAt).toISOString() : null,
  }
}

/** The judged state of every task. */
export function snapshot(store, instance) {
  const tasks = {}
  for (const id of TASK_IDS) tasks[id] = taskState(store, instance, id)
  return { seed: instance.seed, tasks }
}
