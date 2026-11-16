// The kept matrices, rebuilt from the agent-core tests (Part of CU-562, a follow-up to CU-458): per test file, the first web page
// it names is the site, and its quoted 1-8 word names are classified there - the first `cap` that ask become rows by class, a few
// free ones the free list. Built on demand from the tree, so the sweep set never drifts from the tests and no reboot can lose it.
// Policy level only (D-098): a matrix says what the policy decides for a button on that page, not what a run does.
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { act, ctx, web } from './shapes.mjs'
import { webPolicy } from './policies.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SITE = /https:\/\/[a-z0-9.-]*example(?:\.com)?(?:\/[A-Za-z0-9/_.-]*)?/
const NAME = /'([A-Z][^'\\\n]{1,60})'/g

/** The class set a name gets on `site` ('+'-joined, sorted), or 'allow'. */
const verdictOf = (policy, site, name) => {
  const r = policy.classify(act.click(), ctx.web(site, web.button(name)))
  return r.decision === 'allow' ? 'allow' : (r.classes?.length ? [...r.classes].sort().join('+') : String(r.class ?? r.decision))
}

/** `[{ id, site, rows: [[class, [names]]], free }]`, one per agent-core test file that names a page and an asking name. */
export function testMatrices({ root = ROOT, cap = 10, freeCap = 6 } = {}) {
  const dir = join(root, '_tests_', 'agent-core'); const out = []
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
    const src = readFileSync(join(dir, f), 'utf8'); const site = (src.match(SITE) || [])[0]
    if (!site) continue
    const names = [...new Set([...src.matchAll(NAME)].map((m) => m[1]).filter((s) => s.split(/\s+/).length <= 8 && !/[{}$<>=]|https?:/.test(s)))]
    const policy = webPolicy([new URL(site).origin]); const by = {}; const free = []; let n = 0
    for (const name of names) {
      const v = verdictOf(policy, site, name)
      if (v === 'allow') { if (free.length < freeCap) free.push(name); continue }
      if (n >= cap) continue
      n += 1; (by[v] ||= []).push(name)
    }
    if (n) out.push({ id: `t-${f.replace(/\.test\.mjs$/, '')}`, site, rows: Object.entries(by), free })
  }
  return out
}

// CLI: node test-matrices.mjs OUT_DIR [cap] - writes one `{ site, rows, free }` file per matrix for sweeps.mjs / reclass.mjs.
// Start the CLI only when run directly; resolve the typed path so a symlinked path (macOS /tmp -> /private/tmp) still runs it.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [outDir, cap] = process.argv.slice(2)
  if (!outDir) { console.error('usage: test-matrices.mjs OUT_DIR [cap]'); process.exitCode = 2 } else {
    mkdirSync(outDir, { recursive: true }); const ms = testMatrices({ cap: Number(cap ?? 10) })
    for (const { id, ...m } of ms) writeFileSync(join(outDir, `${id}.json`), JSON.stringify(m))
    console.log(`${ms.length} matrices, ${ms.reduce((a, m) => a + m.rows.reduce((b, [, l]) => b + l.length, 0), 0)} asking rows -> ${outDir}`)
  }
}
