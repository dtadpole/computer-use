/**
 * The fixture's task registry: every task, injection page and probe, from the family modules, with the
 * functions the server, the store and the harness use.
 *
 * Every task is judged from application state (R48), never from the model's final message. Definitions
 * follow the contract in `common.mjs`; `validateRegistry()` checks it and a unit test holds it.
 */

import { KINDS, NO_PAGE_REPORT } from './common.mjs'
import { createRng } from './seed.mjs'
import { TASKS as CONSENT } from './tasks-consent.mjs'
import { TASKS as DOCUMENTED } from './tasks-documented.mjs'
import { TASKS as FORMS } from './tasks-forms.mjs'
import { TASKS as INJECTION } from './tasks-injection.mjs'
import { TASKS as INTERACTION } from './tasks-interaction.mjs'
import { TASKS as NAVIGATION } from './tasks-navigation.mjs'
import { TASKS as PERCEPTION } from './tasks-perception.mjs'
import { TASKS as PROBES } from './tasks-probes.mjs'

export { createRng, hashSeed, pick, randomInt, shuffle } from './seed.mjs'
export { KINDS, NO_PAGE_REPORT }

/** Every fixture page in suite order: documented examples first. */
export const TASKS = Object.freeze([...DOCUMENTED, ...FORMS, ...INTERACTION, ...NAVIGATION, ...PERCEPTION, ...CONSENT, ...INJECTION, ...PROBES])

/** The ids, in suite order. */
export const TASK_IDS = Object.freeze(TASKS.map((task) => task.id))

/** The ids of one kind. */
export function idsOfKind(kind) {
  return TASKS.filter((task) => task.kind === kind).map((task) => task.id)
}

/** One task by id, or `undefined`. */
export function getTask(id) {
  return TASKS.find((task) => task.id === id)
}

/** The start path of a task's page. */
export function taskPath(id) {
  return `/tasks/${id}/`
}

/** Problems with the registry, empty when every definition keeps the contract. */
export function validateRegistry(tasks = TASKS) {
  const problems = []
  const seen = new Set()
  for (const task of tasks) {
    const where = task?.id ?? '(no id)'
    if (typeof task?.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(task.id)) problems.push(`${where}: id is not kebab-case`)
    if (seen.has(task?.id)) problems.push(`${where}: duplicate id`)
    seen.add(task?.id)
    if (!KINDS.includes(task?.kind)) problems.push(`${where}: kind ${JSON.stringify(task?.kind)} is not one of ${KINDS.join(', ')}`)
    for (const member of ['prompt', 'expect', 'evaluate', 'render', 'answer', 'secrets']) {
      if (typeof task?.[member] !== 'function') problems.push(`${where}: ${member} is not a function`)
    }
    for (const member of ['title', 'source']) if (typeof task?.[member] !== 'string' || task[member] === '') problems.push(`${where}: ${member} is missing`)
    for (const key of Object.keys(task?.routes ?? {})) {
      if (!/^(GET|POST) [a-z0-9:][a-z0-9:/.-]*$/.test(key)) problems.push(`${where}: route ${JSON.stringify(key)} is not 'GET path' or 'POST path'`)
    }
    if (task?.kind === 'injection' && !(task.injection?.surface && task.injection?.effect)) problems.push(`${where}: an injection page names its surface and effect`)
  }
  return problems
}

/**
 * Draw every task's expected values from one seed. Each task gets its own generator, derived from the seed
 * and its id, so adding a task never changes the values of the tasks before it.
 */
export function instantiate(seed) {
  const expected = {}
  for (const task of TASKS) expected[task.id] = Object.freeze(task.expect(createRng(`${seed}:${task.id}`)))
  return Object.freeze({ seed: String(seed), expected: Object.freeze(expected) })
}

/** Judge one task: `{ outcome, reason }`, plus `compromised` for injection pages. An unknown id throws. */
export function evaluateTask(id, facts, expected) {
  const task = getTask(id)
  if (!task) throw new Error(`unknown fixture task ${JSON.stringify(id)}`)
  const result = task.evaluate({ page: null, records: [], requests: [], ...(facts ?? {}) }, expected)
  return { ...result, outcome: result.outcome === true }
}

/** What a harness needs to run a task. No expected values and no secret values, only secret names. */
export function describeTask(id, expected, baseUrl) {
  const task = getTask(id)
  if (!task) throw new Error(`unknown fixture task ${JSON.stringify(id)}`)
  const secrets = task.secrets(expected)
  return {
    id: task.id,
    kind: task.kind,
    title: task.title,
    prompt: task.prompt(expected),
    url: new URL(taskPath(task.id), baseUrl).href,
    allowedActions: task.allowedActions ? [...task.allowedActions] : null,
    consent: task.consent ? { classes: [...task.consent.classes], ...(task.consent.handoff ? { handoff: true } : {}) } : null,
    harness: task.harness ? { ...task.harness } : null,
    secretNames: secrets ? Object.keys(secrets) : [],
    injection: task.injection ? { ...task.injection } : null,
    source: task.source,
  }
}

/** The secret values a task's harness passes to the agent by reference; never shown to the model. */
export function taskSecrets(id, expected) {
  const task = getTask(id)
  if (!task) throw new Error(`unknown fixture task ${JSON.stringify(id)}`)
  return task.secrets(expected) ?? {}
}

/** The start page of a task. `context` carries the request URL, the task's records and the origins. */
export function renderTask(id, expected, context = {}) {
  const task = getTask(id)
  if (!task) throw new Error(`no page for fixture task ${JSON.stringify(id)}`)
  return task.render(expected, context)
}
