// CU-324 (D-093): a D-065 cell ('asserted, not live') counts only if the mutant it cites, applied alone, makes that
// cell's own row fail. This audit reads every D-065 cell of the D-059/D-061 tables, applies each cited mutant to the
// working tree, runs the cell's table test, restores the file, and reports every cell whose mutant is missing or
// leaves the row passing. A citation reads 'mutant: table-mutants <name>' (a mutant of _tests_/agent-core/table-mutants.mjs,
// cu-coordinator 04:53Z: the one shape); 'mutant: <verifier> <name>' (a mutant of _verifiers_/<verifier>/mutants.mjs) is read too.
// Run from the repository root on a clean tree: `node _tools_/verify-kit/d065-audit.mjs`; exit 0 when every cell holds.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
export function repoAdapters(root) {
  return {
    async loadMutant(verifier, name) {
      try {
        const file = verifier === 'table-mutants' ? join(root, '_tests_', 'agent-core', 'table-mutants.mjs') : join(root, '_verifiers_', verifier, 'mutants.mjs')
        const m = await import(pathToFileURL(file).href)
        return (m.MUTANTS ?? []).find((x) => x.name === name) ?? null
      } catch {
        return null
      }
    },
    async runWith(mutations, file) {
      const originals = mutations.map((u) => [join(root, u.file), readFileSync(join(root, u.file), 'utf8')])
      try {
        for (const u of mutations) {
          const path = join(root, u.file); const text = readFileSync(path, 'utf8')
          if (!text.includes(u.find)) return []
          writeFileSync(path, text.replace(u.find, u.replace))
        }
        const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: root, encoding: 'utf8', timeout: 110000 })
        return [...String(r.stdout).matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1])
      } finally {
        for (const [path, text] of originals) writeFileSync(path, text)
      }
    },
  }
}

/** Row titles in the tables are '<id> ...'; map failing titles back to cell ids. */
export function failingIds(titles, cells) {
  return cells.filter((c) => titles.some((t) => t === c.id || t.startsWith(`${c.id} `) || t.includes(` ${c.id} `) || t.includes(`'${c.id}'`))).map((c) => c.id)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.cwd()
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
