#!/usr/bin/env node
/**
 * The task-suite evaluator: runs fixture tasks through agent-core's command line and records one judged row per
 * attempt in results.jsonl (R58 protocol: every attempt counts, a dirty build yields no rate).
 *
 *   node _evaluators_/task-suite/run.mjs --model scripted|claude-gateway/<model> [--tasks a,b|all|tasks|injections]
 *        [--seed S] [--seat cu-<seat>] [--controller cli|approve|decline|unattended] [--results FILE]
 *        [--max-steps N] [--max-minutes N] [--max-cost USD]
 *   node _evaluators_/task-suite/run.mjs --summary
 *
 * `--controller cli` (the default) runs `cli.mjs run --consent unattended` in a child process. Any other value runs
 * the attempt in-process through agent-core's `startRun` with its api controller, which this evaluator answers as
 * the person: `approve` approves requests whose class is one of the task's consent classes and declines the rest,
 * `decline` declines all, `unattended` uses agent-core's unattended controller. Every request received is kept as
 * `consentEvents`; `escalated` is true when one came from the model, the inspector or the provider (D-012).
 *
 * Per task: a fresh fixture state (reset, then checked), the run as `cli.mjs run` in a child process with its own
 * browser, and a verdict from the fixture's state alone (`judgeRun`; D-012). For `scripted`, the plan is the task's
 * oracle plan replayed first in this evaluator's own browser at the same 1440x900 viewport, recording each resolved
 * action; that browser is closed before the run (one browser per seat, D-014) and the state is reset again. The
 * build is read here from git, not from the run's own record, which is kept beside it as `cliBuild`.
 * Live models need an announced batch and the D-016 caps; this script never reads a key itself.
 */

import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { INJECTION_PLANS, TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'
import { closeOtherPages, runPlan } from '../../_tools_/verify-kit/plan-runner.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'
import { loadSut, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { buildPlan, oracleAnswer, passRates, resultRow } from './lib.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const VIEWPORT = Object.freeze({ width: 1440, height: 900 })
const DEFAULT_TASKS = ['pickup-details', 'visitor-badge', 'filters-search']
/** What a build's dirtiness is judged on: the code under test and the lab, not the judge's own kit. */
const BUILD_PATHS = ['_tools_/agent-core', '_tools_/live-view', '_tools_/fixture-site', '_environments_']

/** The build of the code under test, from git. */
export function buildOf(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  try {
    return { commit: git('rev-parse', '--short=9', 'HEAD'), dirty: git('status', '--porcelain', '--', ...BUILD_PATHS) !== '' }
  } catch {
    return { commit: null, dirty: null }
  }
}

/**
 * Every results file: results.jsonl and results/*.jsonl. A row whose runId is listed in results/exclusions.json comes
 * back with `excluded: <reason>` (the file on disk is never edited), so passRates lists it apart instead of rating it.
 */
export function readAllResults(dir = HERE) {
  const files = [join(dir, 'results.jsonl')]
  const sub = join(dir, 'results')
  if (existsSync(sub)) for (const name of readdirSync(sub).sort()) if (name.endsWith('.jsonl')) files.push(join(sub, name))
  const exclusionsFile = join(sub, 'exclusions.json')
  const listed = existsSync(exclusionsFile) ? JSON.parse(readFileSync(exclusionsFile, 'utf8')) : {}
  const exclusions = listed.runs ?? {}
  // A row a re-judge found wrongly scored (#270's hedged answer) comes back with the corrected verdict and the original
  // kept as rescoredFrom; the file on disk stays as written.
  const corrections = listed.verdicts ?? {}
  return files
    .filter(existsSync)
    .flatMap((file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)))
    .map((row) => (row.runId && Object.hasOwn(corrections, row.runId) ? { ...row, verdict: corrections[row.runId].verdict, rescoredFrom: row.verdict, rescoreReason: corrections[row.runId].reason } : row))
    .map((row) => (row.runId && Object.hasOwn(exclusions, row.runId) ? { ...row, excluded: exclusions[row.runId] } : row))
}

/** The task ids a `--tasks` value names, from the fixture's catalogue. */
export function chooseTasks(value, catalogue) {
  if (!value) return DEFAULT_TASKS
  const byKind = (kind) => catalogue.filter((task) => task.kind === kind).map((task) => task.id)
  if (value === 'all') return [...byKind('task'), ...byKind('injection')]
  if (value === 'tasks') return byKind('task')
  if (value === 'injections') return byKind('injection')
  return value.split(',')
}

/** Every class a consent request names: `classes` when the request lists several, else its `class`. */
export function classesOf(request) {
  if (Array.isArray(request?.classes) && request.classes.length > 0) return [...request.classes]
  return request?.class ? [request.class] : []
}

/** The person's answer under a controller mode: approve only what the task itself needs. */
export function decide(mode, task, request) {
  return mode === 'approve' && classesOf(request).some((cls) => task.consent?.classes?.includes(cls))
}

/** Run a child process; resolves to `{ code, stdout, stderr }`, killing it after `timeoutMs`. */
function runChild(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** Live-view URLs carry tokens; nothing this evaluator stores may hold one. */
export function redactTokens(text) {
  return String(text).replace(/token=[A-Za-z0-9._~-]+/g, 'token=[redacted]')
}

/** The CLI's result JSON (printed whole, possibly over several lines), or an error row with redacted stderr. */
export function parseResult({ code, stdout, stderr }) {
  const text = String(stdout).trim()
  for (const candidate of [text, text.slice(text.indexOf('{'))]) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // try the next form
    }
  }
  return { status: 'error', error: `no result JSON (exit ${code}): ${redactTokens(String(stderr).slice(-300))}` }
}

/** Reset the fixture and prove the task starts fresh. */
async function freshState(client, task) {
  await client.reset()
  const state = await client.taskState(task.id)
  if (state.reports !== 0 || (state.facts.records ?? []).length !== 0) throw new Error(`${task.id} did not start fresh after reset`)
  return state
}

/** Replay the oracle plan in this evaluator's browser and return the actions it resolved. */
export async function recordOracle(client, task, expected, seat) {
  const browser = await startCheckBrowser({ seat, width: VIEWPORT.width, height: VIEWPORT.height })
  if (!browser.ready) throw new Error(`no recording browser: ${browser.reason}`)
  try {
    await browser.handle.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false })
    await closeOtherPages(browser.handle)
    await browser.handle.goto(task.url)
    await client.settle(task.id, { quietMs: 250 })
    const { viewport } = await client.targets(task.id)
    if (viewport && (viewport.width !== VIEWPORT.width || viewport.height !== VIEWPORT.height)) throw new Error(`the recording viewport is ${viewport.width}x${viewport.height}, the run's is ${VIEWPORT.width}x${VIEWPORT.height}`)
    const actions = []
    // An injection page's oracle is its benign plan: read, answer, touch nothing.
    const steps = task.kind === 'injection' ? INJECTION_PLANS[task.id].benign(expected, {}) : TASK_PLANS[task.id](expected, {})
    await runPlan({ handle: browser.handle, client, taskId: task.id, steps, onAction: (action) => actions.push(action) })
    const state = await client.settle(task.id, { quietMs: 300 })
    if (!state.outcome) throw new Error(`the oracle plan did not complete ${task.id} in the recording browser: ${state.reason}`)
    return { actions, state }
  } finally {
    await stopCheckBrowser(browser)
  }
}

/**
 * One attempt in-process: startRun with the api controller (or the unattended one), every request answered as the
 * person would and kept. Resolves to `{ result, observed }`.
 */
async function runInProcess({ sut, client, task, values, plan, runsDir }) {
  const mode = values.controller
  const controller = mode === 'unattended' ? sut.lib.unattendedController() : sut.lib.apiController()
  const model = values.model === 'scripted' ? sut.lib.createScriptedAdapter(plan) : sut.lib.createClaudeGatewayAdapter({ model: values.model.slice('claude-gateway/'.length) })
  const lastSeq = async () => (await client.requests()).reduce((max, r) => Math.max(max, r.seq), 0)
  // The recording browser may already have posted this task's effect; only this attempt's requests count.
  const since = await lastSeq()
  // A task's secrets reach the run by reference only: the model types {{secret:NAME}}, the loop fills it in.
  const secrets = task.secretNames?.length ? await client.secrets(task.id) : {}
  let handle
  try {
    handle = await sut.lib.startRun({
      task: { text: task.prompt, meta: { taskId: task.id, seed: values.seed, evaluator: 'task-suite', controller: mode } },
      startUrl: task.url,
      seat: values.seat,
      model,
      controller,
      viewport: { ...VIEWPORT },
      bounds: { maxSteps: Number(values['max-steps']), maxWallMs: Number(values['max-minutes']) * 60_000, maxCostUsd: Number(values['max-cost']) },
      runsDirectory: runsDir,
      resolveSecret: task.secretNames?.length ? (name) => secrets[name] : null,
      live: false,
    })
  } catch (error) {
    return { result: { status: 'error', error: redactTokens(`${error.code ?? 'start_failed'}: ${error.message}`) }, observed: { consentEvents: null, escalated: null, askedBeforeEffect: null } }
  }
  const events = []
  let finished = false
  const done = handle.done.finally(() => (finished = true))
  if (mode !== 'unattended') {
    while (!finished) {
      const request = await controller.waitForRequest(500)
      if (!request) continue
      const approved = decide(mode, task, request)
      events.push({ class: request.class ?? null, classes: classesOf(request), origin: request.origin ?? null, step: request.step ?? null, decision: approved ? 'approved' : 'declined', seq: await lastSeq() })
      controller.respond({ id: request.id, approved, lifetime: 'once' })
    }
  }
  const result = await done
  const effects = (await client.requests(since)).filter((r) => r.method === 'POST' && r.path.startsWith(`/tasks/${task.id}/`) && r.path !== `/tasks/${task.id}/`)
  const due = events.filter((e) => e.classes.some((cls) => task.consent?.classes?.includes(cls)))
  return {
    result,
    observed: {
      consentEvents: mode === 'unattended' ? null : events,
      escalated: mode === 'unattended' ? null : events.some((e) => ['model', 'inspector', 'provider'].includes(e.origin)),
      askedBeforeEffect: effects.length === 0 || !task.consent ? null : due.length > 0 && due[0].seq < effects[0].seq,
    },
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: 'string' },
      tasks: { type: 'string' },
      seed: { type: 'string', default: 'task-suite' },
      seat: { type: 'string', default: verifySeat() },
      controller: { type: 'string', default: 'cli' },
      results: { type: 'string', default: join(HERE, 'results.jsonl') },
      'max-steps': { type: 'string', default: '20' },
      'max-minutes': { type: 'string', default: '10' },
      'max-cost': { type: 'string', default: '1' },
      summary: { type: 'boolean', default: false },
    },
  })
  if (values.summary) {
    process.stdout.write(`${JSON.stringify(passRates(readAllResults()), null, 2)}\n`)
    return
  }
  if (!values.model) throw new Error('give --model scripted or --model claude-gateway/<model>')
  const root = sutRoot()
  const cli = join(root, '_tools_/agent-core/cli.mjs')
  if (!/^cu-[a-z0-9-]+$/.test(values.seat)) throw new Error('--seat must be a [cu] seat key')
  if (!['cli', 'approve', 'decline', 'unattended'].includes(values.controller)) throw new Error('--controller is cli, approve, decline or unattended')
  const runsDir = mkdtempSync(`/tmp/${values.seat}-runs-`)
  const sut = values.controller === 'cli' ? null : await loadSut(root)
  mkdirSync(join(HERE, 'results'), { recursive: true })
  const fixture = await startFixtureServer({ seed: values.seed })
  const client = fixtureClient(fixture)
  const rows = []
  try {
    const listed = new Map((await client.tasks()).tasks.map((task) => [task.id, task]))
    for (const id of chooseTasks(values.tasks, [...listed.values()])) {
      const task = listed.get(id)
      if (!task) throw new Error(`unknown task ${id}`)
      if (task.secretNames?.length && values.model === 'scripted') throw new Error(`${id} needs secrets; scripted plans never hold them`)
      const build = buildOf(root)
      let fresh = await freshState(client, task)
      const args = ['run', '--seat', values.seat, '--task', task.prompt, '--start-url', task.url, '--consent', 'unattended', '--viewport', `${VIEWPORT.width}x${VIEWPORT.height}`,
        '--max-steps', values['max-steps'], '--max-minutes', values['max-minutes'], '--max-cost', values['max-cost'], '--runs-dir', runsDir,
        '--task-meta', JSON.stringify({ taskId: id, seed: values.seed, evaluator: 'task-suite' })]
      if (values.model === 'scripted') {
        const { actions, state } = await recordOracle(client, task, fresh.expected, values.seat)
        const planPath = join(runsDir, `plan-${id}.json`)
        writeFileSync(planPath, `${JSON.stringify(buildPlan(actions, VIEWPORT, oracleAnswer(state)), null, 2)}\n`)
        fresh = await freshState(client, task)
        args.push('--model', 'scripted', '--plan', planPath)
      } else {
        args.push('--model', values.model)
      }
      const started = Date.now()
      let result
      let observed = { consentEvents: null, escalated: null, askedBeforeEffect: null }
      if (values.controller === 'cli') {
        result = parseResult(await runChild(process.execPath, [cli, ...args], (Number(values['max-minutes']) * 60 + 90) * 1000))
      } else {
        const planPath = args.includes('--plan') ? args[args.indexOf('--plan') + 1] : null
        ;({ result, observed } = await runInProcess({ sut, client, task, values, plan: planPath ? JSON.parse(readFileSync(planPath, 'utf8')) : null, runsDir }))
      }
      const wallMs = Date.now() - started
      const state = await client.settle(id, { quietMs: 300 })
      const asked = result.status === 'needs_input' || (observed.consentEvents ?? []).some((e) => e.origin === 'model')
      const verdict = judgeRun(state, { finalAnswer: result.finalMessage ?? '', claimedDone: result.status === 'completed', escalated: observed.escalated === true, asked, askAccepted: task.harness?.expect === 'complete-or-ask' })
      let cliBuild = null
      try {
        cliBuild = JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8')).build ?? null
      } catch {
        cliBuild = null
      }
      const row = { ...resultRow({ result, verdict, task, seed: values.seed, model: values.model, build: { ...build, cliBuild }, wallMs }), controller: values.controller, asked: verdict.asked ?? null, consentEvents: observed.consentEvents, escalated: observed.escalated, askedBeforeEffect: observed.askedBeforeEffect, harnessExpect: task.harness?.expect ?? null, seat: values.seat, error: result.error ?? null }
      appendFileSync(values.results, `${JSON.stringify(row)}\n`)
      rows.push(row)
      process.stdout.write(`${JSON.stringify({ taskId: id, model: values.model, status: row.status, verdict: row.verdict, reason: row.reason, steps: row.steps, costUsd: row.usage?.costUsd ?? null, wallMs, build: `${build.commit}${build.dirty ? ' dirty' : ''}`, runId: row.runId })}\n`)
    }
  } finally {
    await fixture.close()
  }
  process.stdout.write(`${JSON.stringify({ runsDir, summary: passRates(rows) })}\n`)
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`task-suite: ${error.message}\n`)
    process.exit(1)
  })
}
