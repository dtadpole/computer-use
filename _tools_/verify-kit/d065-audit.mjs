// CU-324 (D-093): a D-065 cell ('asserted, not live') counts only if the mutant it cites, applied alone, makes that
// cell's own row fail. This audit reads every D-065 cell of the D-059/D-061 tables, applies each cited mutant to the
// working tree, runs the cell's table test, restores the file, and reports every cell whose mutant is missing or
// leaves the row passing. A citation reads 'mutant: table-mutants <name>' (a mutant of _tests_/agent-core/table-mutants.mjs,
// cu-coordinator 04:53Z: the one shape); 'mutant: <verifier> <name>' (a mutant of _verifiers_/<verifier>/mutants.mjs) is read too.
// Run from the repository root on a clean tree: `node _tools_/verify-kit/d065-audit.mjs`; exit 0 when every cell holds.
// A mutant's originals are journalled before any write - inside the git directory, never in the tree, so it can be
// neither committed nor pushed - and the journal is removed after the restore; an interrupted run (an alarm, SIGTERM, even SIGKILL) is repaired from it at the next start, and a catchable
// signal restores before exiting.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TABLES = Object.freeze(['_tests_/agent-core/consent-routes.test.mjs', '_tests_/agent-core/sensitive-classes.test.mjs'])

/** The D-065 cells of one table's source: { id, verifier, mutant, file }; a D-065 cell without a parsable citation has mutant null. */
export function parseD065Cells(source, file) {
  const cells = []
  for (const line of String(source).split('\n')) {
    const id = line.match(/^\s*\['([^']+)'/)?.[1]
    if (!id || !/D-065/.test(line)) continue
    const cite = line.match(/mutant: ([a-z0-9-]+) ([a-z0-9-]+)/)
    cells.push({ id, file, verifier: cite?.[1] ?? null, mutant: cite?.[2] ?? null })
  }
  return cells
}

/**
 * Judge cells against their mutants. `loadMutant(verifier, name)` gives { mutations: [{ file, find, replace }] } or null;
 * `runWith(mutations, file)` applies the mutations, runs the table file and returns the ids of the failing rows (it must
 * restore the tree). Returns { ok, findings: [{ id, verifier, mutant, problem }] }.
 */
export async function auditCells(cells, { loadMutant, runWith }) {
  const findings = []
  const groups = new Map()
  for (const cell of cells) {
    if (!cell.mutant) { findings.push({ ...cell, problem: 'no mutant cited' }); continue }
    const def = await loadMutant(cell.verifier, cell.mutant)
    if (!def) { findings.push({ ...cell, problem: 'cited mutant does not exist' }); continue }
    const key = `${cell.verifier} ${cell.mutant} ${cell.file}`
    if (!groups.has(key)) groups.set(key, { def, file: cell.file, cells: [] })
    groups.get(key).cells.push(cell)
  }
  for (const { def, file, cells: list } of groups.values()) {
    const failing = new Set(await runWith(def.mutations, file))
    for (const cell of list) if (!failing.has(cell.id)) findings.push({ ...cell, problem: 'the mutant leaves this row passing' })
  }
  return { ok: findings.length === 0, findings }
}

/** Real loaders for a repository root. */
export const JOURNAL = 'd065-audit-journal.json'

/** Where the journal lives: the repository's git directory (a worktree's own), else the root (a bare test folder). */
export function journalPath(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    if (realpathSync(git('rev-parse', '--show-toplevel')) === realpathSync(root)) return join(git('rev-parse', '--absolute-git-dir'), JOURNAL)
  } catch {}
  return join(root, JOURNAL)
}

/** Put back the files an interrupted run left mutated; returns the paths restored ([] when there was no journal). */
export function recoverJournal(root) {
  const journal = journalPath(root)
  if (!existsSync(journal)) return []
  let entries = []
  try { entries = JSON.parse(readFileSync(journal, 'utf8')) } catch { entries = [] }
  for (const { path, text } of entries) writeFileSync(path, text)
  rmSync(journal, { force: true })
  return entries.map(({ path }) => path)
}

export function repoAdapters(root) {
  const loadMutant = async (verifier, name) => {
      try {
        const file = verifier === 'table-mutants' ? join(root, '_tests_', 'agent-core', 'table-mutants.mjs') : join(root, '_verifiers_', verifier, 'mutants.mjs')
        const m = await import(pathToFileURL(file).href)
        const def = (m.TABLE_MUTANTS ?? m.MUTANTS ?? []).find((x) => x.name === name) ?? null
        // A table mutant may stand for a verifier's ({ name, from: '<verifier>' }); follow it once.
        if (def && !def.mutations && typeof def.from === 'string' && def.from !== verifier) return await loadMutant(def.from, name)
        return def?.mutations ? def : null
      } catch {
        return null
      }
  }
  return {
    loadMutant,
    async runWith(mutations, file) {
      const originals = mutations.map((u) => [join(root, u.file), readFileSync(join(root, u.file), 'utf8')])
      writeFileSync(journalPath(root), JSON.stringify(originals.map(([path, text]) => ({ path, text }))))
      try {
        for (const u of mutations) {
          const path = join(root, u.file); const text = readFileSync(path, 'utf8')
          if (!text.includes(u.find)) return []
          writeFileSync(path, text.replace(u.find, u.replace))
        }
        // A clean environment for the row test: inside another test run, NODE_TEST_CONTEXT would turn its TAP into IPC.
        const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
        const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: root, encoding: 'utf8', timeout: 110000, env })
        return [...String(r.stdout).matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1])
      } finally {
        for (const [path, text] of originals) writeFileSync(path, text)
        rmSync(journalPath(root), { force: true })
      }
    },
  }
}

/** Row titles in the tables are '<id> ...'; map failing titles back to cell ids. */
export function failingIds(titles, cells) {
  return cells.filter((c) => titles.some((t) => t === c.id || t.startsWith(`${c.id} `) || t.includes(` ${c.id} `) || t.includes(`'${c.id}'`))).map((c) => c.id)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const root = process.cwd()
  const repaired = recoverJournal(root)
  if (repaired.length) console.error(`d065-audit: restored ${repaired.length} file(s) an interrupted run left mutated`)
  // A catchable signal waits for the running table test (spawnSync), then restores and exits - never leaves a mutant.
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129], ['SIGALRM', 142]]) {
    process.on(signal, () => { recoverJournal(root); process.exit(code) })
  }
  const dirty = execFileSync('git', ['status', '--porcelain', '--', '_tools_', '_tests_'], { cwd: root, encoding: 'utf8' }).trim()
  if (dirty) { console.error('d065-audit: _tools_ or _tests_ has uncommitted changes - run on a clean tree'); process.exit(2) }
  const cells = TABLES.flatMap((file) => parseD065Cells(readFileSync(join(root, file), 'utf8'), file))
  const base = repoAdapters(root)
  const result = await auditCells(cells, {
    loadMutant: base.loadMutant,
    runWith: async (mutations, file) => failingIds(await base.runWith(mutations, file), cells.filter((c) => c.file === file)),
  })
  console.log(JSON.stringify({ cells: cells.length, ok: result.ok, findings: result.findings }, null, 1))
  process.exit(result.ok ? 0 : 1)
}
