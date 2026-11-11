#!/usr/bin/env node
/**
 * Live rows (CU-458): press each row's control on its own loopback page through the real loop and the real Chrome
 * driver, decline every ask, and record what was asked and whether the press posted.
 *
 *   node sweep.mjs --rows <rows.json> --out <results.json> --seat <seat> [--modes click,return] [--keep-runs]
 *
 * The system under test is verify-kit's loadSut (CU_VERIFY_SUT, else this tree). Results resume: valid cells already in
 * --out are kept and skipped, invalid ones (rows.mjs isInvalid) run again. A cell the team's browser cap refuses
 * (D-005, D-014) waits 20 s and retries in place, up to 8 attempts. D-106: the run lock is read before every run and
 * every 2 s during it; another seat's run or live hold stops the sweep at once. Exit 0 when the sweep finished, 3 when
 * it stopped for the lock or the rows are invalid - after a lock stop, run it again: it resumes. --keep-runs leaves the
 * runs directory (each run's events.jsonl) in place and prints its path; the default removes it.
 */
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSut } from '../verify-kit/sut.mjs'
import { isInvalid, modeSteps, pageHtml, rowIndexOf, rowUrl, skipsReturn, validateRows } from './rows.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const ROWS = arg('rows')
const OUT = arg('out')
const SEAT = arg('seat') ?? process.env.CU_VERIFY_SEAT
const MODES = (arg('modes') ?? 'click,return').split(',')
const KEEP_RUNS = process.argv.includes('--keep-runs')
if (!ROWS || !OUT || !SEAT) {
  console.error('usage: node sweep.mjs --rows <rows.json> --out <results.json> --seat <seat> [--modes click,return] [--keep-runs]')
  process.exit(2)
}
for (const mode of MODES) modeSteps(mode) // an unknown mode fails here, before any browser starts
const rows = JSON.parse(readFileSync(ROWS, 'utf8'))
const invalid = validateRows(rows)
if (invalid.length > 0) {
  for (const p of invalid) console.error(p)
  process.exit(3)
}

const here = dirname(fileURLToPath(import.meta.url))
const LOCK = join(here, '../../_environments_/macos-desktop/run-lock.mjs')
function otherSeatHolds() {
  try {
    const state = JSON.parse(execFileSync('node', [LOCK, 'status'], { encoding: 'utf8' }))
    const other = (entry) => entry && entry.seat && entry.seat !== SEAT
    return other(state.run) || other(state.hold)
  } catch {
    return true // an unreadable lock is treated as held
  }
}

const sut = await loadSut()
const effects = []
const server = http.createServer((req, res) => {
  const index = req.method === 'GET' ? rowIndexOf(req.url) : null
  if (index !== null) {
    const row = rows[index]
    res.writeHead(row ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(row ? pageHtml(row, index) : 'none')
  }
  if (req.method === 'GET' && req.url.startsWith('/effect-get/r')) effects.push({ index: Number(req.url.slice(13)), via: 'GET' })
  else if (req.method === 'POST' && req.url.startsWith('/effect/r')) effects.push({ index: Number(req.url.slice(9)), via: 'POST' })
  else { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end('<p>done</p>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const runsDirectory = mkdtempSync(join(tmpdir(), 'cu-live-rows-'))
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).filter((r) => !isInvalid(r)) : []
const done = new Set(results.map((r) => `${r.control}|${r.mode}`))
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 1))
let stopped = false

try {
  rowLoop: for (const [index, row] of rows.entries()) {
    for (const mode of MODES) {
      if (done.has(`${row.id}|${mode}`) || (mode === 'return' && skipsReturn(row.kind))) continue
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        if (otherSeatHolds()) { console.log(`STOP ${row.id} ${mode}: another seat holds the run lock`); stopped = true; break rowLoop }
        const before = effects.length
        const controller = sut.lib.apiController()
        const plan = modeSteps(mode)
        const handle = await sut.lib.startRun({
          task: { text: 'Live rows: press the control on this page once.', meta: { probe: 'live-rows', row: row.id, mode } },
          startUrl: rowUrl(base, row, index),
          seat: SEAT,
          model: sut.lib.createScriptedAdapter(async (input, { index }) => (index < plan.length ? { actions: plan[index] } : { final: 'Done.' })),
          controller,
          viewport: { width: 1024, height: 768 },
          bounds: { maxWallMs: 30_000, maxSteps: 8 },
          runsDirectory,
          live: false,
        })
        const asked = []
        let finished = false
        const ended = handle.done.finally(() => { finished = true })
        let lastCheck = Date.now()
        let lockStop = false
        while (!finished) {
          if (!lockStop && Date.now() - lastCheck >= 2000) {
            lastCheck = Date.now()
            if (otherSeatHolds()) { lockStop = true; handle.control.send({ command: 'stop', reason: 'another seat took the run lock (D-106)' }, { source: 'caller' }) }
          }
          const request = await controller.waitForRequest(300)
          if (!request) continue
          asked.push(...(Array.isArray(request.classes) && request.classes.length ? request.classes : [request.class]))
          controller.respond({ id: request.id, approved: false, lifetime: 'once' })
        }
        const result = await ended
        if (lockStop) { console.log(`STOP ${row.id} ${mode}: stopped mid-run, another seat took the run lock`); stopped = true; break rowLoop }
        await new Promise((resolve) => setTimeout(resolve, 300))
        const cell = {
          control: row.id, name: row.name, kind: row.kind ?? 'button', expect: row.expect, mode, asked, acted: effects.length > before,
          runId: result?.runId ?? result?.id ?? null, stop: result?.stop ?? result?.status ?? null,
          ...(result?.error ? { runError: String(result.error.message ?? result.error.code ?? result.error).slice(0, 300) } : {}),
        }
        const refused = /resource_refused/.test(String(cell.runError ?? ''))
        if (refused && attempt < 8) { await new Promise((resolve) => setTimeout(resolve, 20_000)); continue }
        results.push(cell)
        save()
        console.log(JSON.stringify(cell))
        break
      }
    }
  }
} finally {
  save()
  server.close()
  if (KEEP_RUNS) console.log(`runs kept in ${runsDirectory}`)
  else if (/^cu-live-rows-[A-Za-z0-9]{6}$/.test(runsDirectory.split('/').pop())) rmSync(runsDirectory, { recursive: true, force: true })
}
process.exit(stopped ? 3 : 0)
