#!/usr/bin/env node
// Nightly no-model regression on main (CU-59). On a fresh detached worktree of --ref (default origin/main):
//   phase 1, no lock: every node --test suite outside macos-helper and desktop-suite, then the fake-helper verifiers;
//   phase 2, under the team's desktop-run lock: macos-helper (ad-hoc CUHelper), desktop-suite (offscreen CU Fixture),
//   and the desktop-fixture (fixture plans), desktop-helper-protocol and desktop-helper-dryrun verifiers.
// A failing step runs once more; passing on that retry makes it a flake, recorded in <out>/flakes.json.
// No model key reaches a child, no Chrome starts, CU_HOME is private, no helper is installed.
// Writes <out>/<stamp>-<head>/{<step>.log,report.json,report.md}, <out>/latest.md and prints the report.
// Exit 0 green (flakes allowed), 1 a step failed twice, 2 bad arguments or setup, 3 phase 2 skipped.
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireDesktopRun } from '../../_environments_/macos-desktop/run-lock.mjs'
import {
  buildSteps, classify, failingTests, mergeFlakes, nodeCounts, overall, parseArgs, renderReport, strippedEnv, summaryLine, verdictOf,
} from './logic.mjs'

const USAGE = `usage: node _tools_/nightly-regression/nightly.mjs [options]
  --repo DIR        repository to test (default: this checkout)
  --ref REF         commit to test (default origin/main)
  --out DIR         reports and flakes.json (default /tmp/cu-nightly)
  --no-fetch        do not fetch origin first
  --node-only       skip phase 2 (marked skipped)
  --lock-wait S     seconds to wait for the desktop-run lock (default 900)
  --yield-flag F    do not take the lock while file F exists (a seat's hold, run-lock.mjs hold, now does this by itself)
  --on-lock CMD     sh command run when the lock is taken (env NIGHTLY_HEAD, NIGHTLY_RUN_ID, NIGHTLY_SEAT)
  --on-release CMD  sh command run after the lock is released
  --seat SEAT       the lock's seat (default cu-integrator)
  --lock-dir DIR    the lock directory (tests only; default the team's)
  --keep-worktree   leave the worktree for inspection`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const safeName = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_')

// One attempt in its own process group: killed whole on timeout, swept for stragglers when it ends.
function runLogged(cmd, args, { cwd, env, timeoutS, log }) {
  const started = Date.now()
  const fd = openSync(log, 'w')
  const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', fd, fd], detached: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
  }, timeoutS * 1000)
  return new Promise((resolve) => {
    const finish = (exit) => {
      clearTimeout(timer)
      closeSync(fd)
      try { process.kill(-child.pid, 'SIGTERM') } catch { /* no stragglers */ }
      resolve({ exit, timedOut, seconds: (Date.now() - started) / 1000 })
    }
    child.on('error', () => finish(127))
    child.on('close', (code) => finish(code ?? (timedOut ? 124 : 1)))
  })
}

async function attempt(step, n, { wt, env, runDir }) {
  const log = join(runDir, `${safeName(step.name)}${n ? '.retry' : ''}.log`)
  const [cmd, args] = step.kind === 'node'
    ? ['node', ['--test', '--test-reporter=spec', ...step.files]]
    : ['sh', [`_verifiers_/${step.verifier}/verify.sh`]]
  const result = await runLogged(cmd, args, { cwd: wt, env, timeoutS: step.timeout, log })
  const text = readFileSync(log, 'utf8')
  return step.kind === 'node'
    ? { ...result, log, counts: nodeCounts(text), failing: failingTests(text) }
    : { ...result, log, verdict: verdictOf(text) }
}

async function runStep(step, ctx) {
  const first = await attempt(step, 0, ctx)
  const retry = first.exit === 0 ? null : await attempt(step, 1, ctx)
  const attempts = retry ? [first, retry] : [first]
  const status = classify(first, retry)
  console.error(`nightly: ${step.name} ${status}`)
  return { name: step.name, phase: step.phase, kind: step.kind, status, attempts }
}

const skipped = (step, reason) => ({ name: step.name, phase: step.phase, kind: step.kind, status: 'skipped', reason, attempts: [] })

async function takeLock(opts, runId) {
  const deadline = Date.now() + opts.lockWait * 1000
  for (;;) {
    let why
    if (opts.yieldFlag && existsSync(opts.yieldFlag)) {
      why = `yield flag ${opts.yieldFlag} set`
    } else {
      try {
        return { slot: await acquireDesktopRun({ seat: opts.seat, runId, ...(opts.lockDir ? { dir: opts.lockDir } : {}) }) }
      } catch (error) {
        const reason = error?.details?.reason ?? error?.code ?? 'error'
        // desktop_held: another seat's announced hold (CU-75, e.g. step 4) - wait for it like a run, never fail on it.
        if (reason !== 'desktop_run_active' && reason !== 'run_lock_busy' && reason !== 'desktop_held') return { error: `${reason}: ${error?.message ?? error}` }
        const holder = error?.details?.holder
        why = !holder ? reason : holder.runId ? `held by ${holder.seat} (${holder.runId})` : `held by ${holder.seat} until ${holder.until}`
      }
    }
    if (Date.now() >= deadline) return { error: `not taken within ${opts.lockWait}s, ${why}` }
    await sleep(Math.min(15_000, Math.max(1_000, deadline - Date.now())))
  }
}

function hook(cmd, env) {
  if (!cmd) return
  try { execFileSync('sh', ['-c', cmd], { env, stdio: 'ignore', timeout: 60_000 }) } catch (error) {
    console.error(`nightly: hook failed (${String(error?.message ?? error).split('\n')[0]})`)
  }
}

function killLeftovers(paths) {
  const killed = []
  for (const path of new Set(paths)) {
    let out = ''
    try { out = execFileSync('pgrep', ['-f', path], { encoding: 'utf8' }) } catch { continue }
    for (const pid of out.split('\n').filter(Boolean).map(Number)) {
      if (pid === process.pid || killed.includes(pid)) continue
      try { process.kill(pid, 'SIGTERM'); killed.push(pid) } catch { /* gone */ }
    }
  }
  return killed
}

const listTests = (wt) => {
  const root = join(wt, '_tests_')
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(root, d.name)).filter((f) => f.endsWith('.test.mjs')).map((f) => `_tests_/${d.name}/${f}`))
}
const listVerifiers = (wt) => {
  const root = join(wt, '_verifiers_')
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'verify.sh'))).map((d) => d.name)
}

async function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (error) {
    console.error(`nightly: ${error.message}\n${USAGE}`)
    return 2
  }
  if (opts.help) { console.log(USAGE); return 0 }
  const repo = opts.repo ?? fileURLToPath(new URL('../../', import.meta.url))
  let head
  try {
    if (opts.fetch) git(repo, ['fetch', '-q', 'origin'])
    head = git(repo, ['rev-parse', '--verify', `${opts.ref}^{commit}`]).trim()
  } catch (error) {
    console.error(`nightly: cannot resolve ${opts.ref} in ${repo}: ${String(error?.stderr ?? error?.message ?? error).trim()}`)
    return 2
  }
  const startedAt = stamp()
  const runId = `nightly-${startedAt}`
  mkdirSync(opts.out, { recursive: true })
  const runDir = join(opts.out, `${startedAt.replace(/:/g, '')}-${head.slice(0, 9)}`)
  mkdirSync(runDir, { recursive: true })
  const wt = mkdtempSync('/tmp/cu-nightly-wt-')
  try { git(repo, ['worktree', 'add', '--detach', '--quiet', wt, head]) } catch (error) {
    console.error(`nightly: worktree add failed: ${String(error?.stderr ?? error).trim()}`)
    rmSync(wt, { recursive: true, force: true })
    return 2
  }
  const cuHome = mkdtempSync('/tmp/cu-nightly-cuhome-')
  const env = strippedEnv(process.env, { CU_HOME: cuHome, CU_NIGHTLY: '1' })
  const hookEnv = { ...process.env, NIGHTLY_HEAD: head, NIGHTLY_RUN_ID: runId, NIGHTLY_SEAT: opts.seat }
  const ctx = { wt, env, runDir }
  const steps = buildSteps({ testFiles: listTests(wt), verifiers: listVerifiers(wt) })
  const results = []
  let lockNote = 'no phase 2 steps'
  let killed = []
  // A signal still releases the lock: run-lock removes its entry on process exit.
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(130))
  try {
    for (const step of steps.filter((s) => s.phase === 1)) results.push(await runStep(step, ctx))
    const locked = steps.filter((s) => s.phase === 2)
    if (locked.length && opts.nodeOnly) {
      lockNote = 'node-only, not taken'
      for (const step of locked) results.push(skipped(step, 'node-only'))
    } else if (locked.length) {
      const got = await takeLock(opts, runId)
      if (got.error) {
        lockNote = got.error
        for (const step of locked) results.push(skipped(step, `lock ${got.error}`))
      } else {
        const t0 = Date.now()
        hook(opts.onLock, hookEnv)
        try {
          for (const step of locked) results.push(await runStep(step, ctx))
        } finally {
          await got.slot.release()
          lockNote = `held ${Math.round((Date.now() - t0) / 1000)}s`
          hook(opts.onRelease, hookEnv)
        }
      }
    }
  } finally {
    let real = wt
    try { real = realpathSync(wt) } catch { /* removed */ }
    killed = killLeftovers([wt, real])
    rmSync(cuHome, { recursive: true, force: true })
    if (!opts.keepWorktree) {
      try { git(repo, ['worktree', 'remove', '--force', wt]) } catch { rmSync(wt, { recursive: true, force: true }) }
    }
  }
  const run = { head, ref: opts.ref, startedAt, finishedAt: stamp(), seat: opts.seat, lockNote, results, killed, runDir, ...overall(results) }
  run.summary = summaryLine(run)
  const flakesPath = join(opts.out, 'flakes.json')
  const flakes = mergeFlakes(readJson(flakesPath) ?? {}, { results, head, at: run.finishedAt })
  writeFileSync(flakesPath, `${JSON.stringify(flakes, null, 2)}\n`)
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(run, null, 2)}\n`)
  const report = renderReport(run, flakes)
  writeFileSync(join(runDir, 'report.md'), report)
  writeFileSync(join(opts.out, 'latest.md'), report)
  process.stdout.write(report)
  return run.exit
}

process.exitCode = await main()
