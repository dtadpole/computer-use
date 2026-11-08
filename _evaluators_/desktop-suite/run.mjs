#!/usr/bin/env node
/**
 * The desktop suite (ULTIMATE_GOAL 2.0 evaluation row): every CU Fixture task and injection screen, attempted by an
 * agent through `cli.mjs run --env macos-desktop`, judged from the fixture's private channel, one R58 row per attempt.
 *
 *   node _evaluators_/desktop-suite/run.mjs --model scripted|claude-gateway/<model> --results FILE --announced
 *        [--tasks all|tasks|injections|a,b] [--seed S] [--seat cu-<seat>] [--max-steps N] [--max-minutes N] [--max-cost USD]
 *        [--input-mode global|pid]   (the driver's input mode, Q-D3; recorded on every row; unset is the CLI's default)
 *        [--simulate-scale 2]   (Retina-like frames on a scale-1 display through the capture seam, CU-61; on every row and in the build)
 *        [--prune-with-thinking allow]   (CU-84: prune old screenshots even with thinking present - only for an account proven
 *                               to accept it; passed to the CLI and recorded in the build, so its rates are grouped apart)
 *        [--simulate-display WxH]   (a top-left region of the main display as the run's whole display, CU-70; in the build)
 *
 * Desktop runs share the owner's display (D-024): they need --announced (after an inbox announcement) and run one at
 * a time. Until the CLI under test offers `macos-desktop` (agent-core C6) it exits 3 without an attempt.
 */

import { appendFileSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { buildOf } from '../task-suite/run.mjs'
import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { DESKTOP_TASKS, expectedFor, idsOfKind } from '../../_tools_/desktop-fixture/tasks.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'
import { loadSut, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { cliRunner, cliSupportsDesktop, desktopBuild, missingApprovals, runDesktopAttempt, scriptable } from './lib.mjs'

/** The task ids a `--tasks` value names. Opt-in items (task.optIn: long proofs such as CU-65's) run only when named. */
export function chooseDesktopTasks(value = 'all') {
  const listed = (ids) => ids.filter((id) => DESKTOP_TASKS[id]?.optIn !== true)
  if (value === 'all') return listed([...idsOfKind('task'), ...idsOfKind('injection')])
  if (value === 'tasks') return listed(idsOfKind('task'))
  if (value === 'injections') return listed(idsOfKind('injection'))
  return value.split(',')
}

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: 'string' }, results: { type: 'string' }, tasks: { type: 'string', default: 'all' }, seed: { type: 'string', default: 'desktop-suite' },
      seat: { type: 'string', default: verifySeat() }, announced: { type: 'boolean', default: false },
      'max-steps': { type: 'string', default: '20' }, 'max-minutes': { type: 'string', default: '10' }, 'max-cost': { type: 'string', default: '1' },
      'input-mode': { type: 'string' }, 'simulate-scale': { type: 'string' }, 'simulate-display': { type: 'string' }, 'prune-with-thinking': { type: 'string' },
    },
    strict: true,
  })
  if (!values.model || !values.results) throw new Error('--model and --results are required')
  const inputMode = values['input-mode'] ?? null
  if (inputMode !== null && !['global', 'pid'].includes(inputMode)) throw new Error('--input-mode is global or pid')
  const pruneWithThinking = values['prune-with-thinking'] ?? null
  if (pruneWithThinking !== null && pruneWithThinking !== 'allow') throw new Error('--prune-with-thinking is allow (the default is the fail-safe skip)')
  const simulateScale = values['simulate-scale'] === undefined ? null : Number(values['simulate-scale'])
  if (simulateScale !== null && simulateScale !== 2) throw new Error('--simulate-scale is 2')
  const simulateDisplay = values['simulate-display'] ?? null
  if (simulateDisplay !== null && !/^\d{3,4}x\d{3,4}$/.test(simulateDisplay)) throw new Error('--simulate-display is WIDTHxHEIGHT')
  const sut = await loadSut()
  if (!(await cliSupportsDesktop(sut.cli))) {
    process.stderr.write('desktop-suite: the CLI under test offers no macos-desktop environment yet (agent-core C6); no attempt made\n')
    process.exit(3)
  }
  // The owner approves the fixture apps 'always' once, through the consent gate; the suite only reads that store.
  const { createAppApprovals } = await import(pathToFileURL(join(sutRoot(), '_tools_/agent-core/app-approvals.mjs')))
  const chosen = chooseDesktopTasks(values.tasks).map((id) => DESKTOP_TASKS[id] ?? { id })
  const missing = missingApprovals(chosen, createAppApprovals())
  if (missing.length > 0) {
    process.stderr.write(`desktop-suite: the owner has not approved ${missing.join(', ')} 'always', so every unattended attempt would stop at the start-app question (P11); approve each once (cli.mjs run --env macos-desktop --app <id> --consent tty, answer always), then run again; no attempt made\n`)
    process.exit(3)
  }
  if (!values.announced) throw new Error('desktop runs share the owner\'s display: announce the batch by inbox, then pass --announced (D-024)')
  const built = buildFixtureApp()
  const runner = cliRunner({ cli: sut.cli, seat: values.seat, runsDir: mkdtempSync(`/tmp/${values.seat}-runs-`), inputMode, simulateScale, simulateDisplay, pruneWithThinking })
  const { cuHome } = await import(pathToFileURL(join(sutRoot(), '_tools_/agent-core/trajectory.mjs')))
  // A simulated scale is part of the build, so its rates never mix with scale-1 rows.
  const build = { ...desktopBuild(buildOf(sutRoot()), sutRoot(), join(cuHome(), 'helper/CUHelper.app')), ...(simulateScale ? { simulateScale } : {}), ...(simulateDisplay ? { simulateDisplay } : {}), ...(pruneWithThinking ? { pruneWithThinking } : {}) }
  let ids = chooseDesktopTasks(values.tasks)
  if (values.model === 'scripted') {
    // The scripted plan plays only oracles of set, press and chord steps; the rest are left to the model runs.
    const skipped = ids.filter((id) => !scriptable(DESKTOP_TASKS[id]?.oracle?.(expectedFor(id, values.seed)) ?? [], DESKTOP_TASKS[id]))
    ids = ids.filter((id) => !skipped.includes(id))
    process.stderr.write(`desktop-suite: scripted plays ${ids.length} task(s): ${ids.join(', ')}; not scripted: ${skipped.join(', ') || 'none'}\n`)
  }
  for (const id of ids) {
    const row = await runDesktopAttempt({ id, seed: values.seed, built, runner, model: values.model, build, inputMode, simulateScale, bounds: { maxSteps: Number(values['max-steps']), maxMinutes: Number(values['max-minutes']), maxCostUsd: Number(values['max-cost']) } })
    appendFileSync(values.results, `${JSON.stringify(row)}\n`)
    process.stdout.write(`${JSON.stringify({ taskId: id, status: row.status, verdict: row.verdict, reason: row.reason })}\n`)
  }
}

// Started as a program, through any symlink (macOS /tmp is one): process.argv[1] keeps the link while import.meta.url
// is the real file, so the two are compared as real paths; compared as given, a start via /tmp did nothing (CU-79).
const startedAsProgram = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (process.argv[1] && startedAsProgram()) {
  main().catch((error) => {
    process.stderr.write(`desktop-suite: ${error.message}\n`)
    process.exit(1)
  })
}
