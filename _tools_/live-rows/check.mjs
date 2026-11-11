#!/usr/bin/env node
/**
 * Live rows (CU-458): the done-check over a sweep's results.
 *
 *   node check.mjs <results.json> <rows.json> [--modes click,return]
 *
 * For each row: the click asks a class that includes `expect` (or asks nothing when `expect` is 'free'); every other
 * mode asks the same classes as the click; nothing posts while an ask was declined; every expected cell is present
 * (no Return cell for link kinds, checkboxes and rows). Exit 0 when there is no problem and nothing is missing.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isInvalid, skipsReturn } from './rows.mjs'

const sameClasses = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

/**
 * `{ cells, controls, total, missing: [name], problems: [string], classes: { class: count }, postedWhileDeclined,
 * firstRun, lastRun }` for `results` (sweep rows) against `rows` (the row set). Invalid results are ignored, as the
 * sweep re-runs them.
 */
export function checkResults(results, rows, modes = ['click', 'return']) {
  const valid = results.filter((r) => !isInvalid(r))
  const byId = new Map()
  for (const r of valid) {
    if (!byId.has(r.control)) byId.set(r.control, {})
    byId.get(r.control)[r.mode] = r
  }
  const missing = []
  const problems = []
  const classes = {}
  for (const row of rows) {
    const cells = byId.get(row.id) ?? {}
    const wanted = modes.filter((mode) => !(mode === 'return' && skipsReturn(row.kind)))
    if (wanted.some((mode) => !cells[mode])) missing.push(row.name)
    const click = cells.click
    if (!click) continue
    const key = click.asked.length ? click.asked.join('+') : 'free'
    classes[key] = (classes[key] ?? 0) + 1
    const asksExpected = row.expect === 'free' ? click.asked.length === 0 : click.asked.includes(row.expect)
    if (!asksExpected) problems.push(`${row.name}/click: expected ${row.expect}, got ${click.asked.join('+') || 'free'} (${click.runId})`)
    for (const mode of wanted) {
      if (mode === 'click' || !cells[mode]) continue
      if (!sameClasses(cells[mode].asked, click.asked)) problems.push(`${row.name}/${mode}: asked ${cells[mode].asked.join('+') || 'free'}, the click asked ${key} (${cells[mode].runId})`)
    }
  }
  const postedWhileDeclined = valid.filter((r) => r.asked.length > 0 && r.acted).length
  if (postedWhileDeclined > 0) problems.push(`${postedWhileDeclined} cell(s) posted while an ask was declined`)
  const runs = valid.map((r) => r.runId).filter(Boolean).sort()
  return {
    cells: valid.length,
    controls: byId.size,
    total: rows.length,
    missing,
    problems,
    classes,
    postedWhileDeclined,
    firstRun: runs[0] ?? null,
    lastRun: runs.at(-1) ?? null,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [resultsFile, rowsFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const modesArg = process.argv.find((a) => a.startsWith('--modes='))
  if (!resultsFile || !rowsFile) {
    console.error('usage: node check.mjs <results.json> <rows.json> [--modes=click,return]')
    process.exit(2)
  }
  const modes = modesArg ? modesArg.slice('--modes='.length).split(',') : ['click', 'return']
  const report = checkResults(JSON.parse(readFileSync(resultsFile, 'utf8')), JSON.parse(readFileSync(rowsFile, 'utf8')), modes)
  console.log(`cells ${report.cells}, controls ${report.controls} of ${report.total}, runs ${report.firstRun} .. ${report.lastRun}`)
  console.log(`click classes ${JSON.stringify(report.classes)}`)
  console.log(`missing: ${report.missing.length ? report.missing.join(', ') : 'none'}`)
  console.log(`problems: ${report.problems.length ? '' : 'none'}`)
  for (const p of report.problems) console.log(`  ${p}`)
  process.exit(report.problems.length === 0 && report.missing.length === 0 ? 0 : 1)
}
