// The reclass map and diff (Part of CU-458; the D-108 guard): classify every name of a set of matrices on its own page for one
// tree, then compare two trees' maps. A High may only ADD asks; a lowering PR may only lose the asks its ruling lists.
// Policy level only (D-098). Run the map once on the base tree and once on the head tree (each in its own checkout).
import { readFileSync, writeFileSync } from 'node:fs'

import { act, ctx, web } from './shapes.mjs'
import { webPolicy } from './policies.mjs'

/** The class set a name gets (sorted, '+'-joined), or 'allow'. */
const verdictOf = (policy, site, name) => {
  const r = policy.classify(act.click(), ctx.web(site, web.button(name)))
  if (r.decision !== 'confirm') return 'allow'
  return (r.classes?.length ? [...r.classes] : [r.class]).sort().join('+')
}

/** `matrices` - `[{ site, rows: [[class, [names]]], free?: [names] }]`; `extra` - names tried on every page. Keys are 'name@host/path'. */
export function reclassMap(matrices, extra = []) {
  const map = {}
  for (const m of matrices) {
    const policy = webPolicy([new URL(m.site).origin]); const page = new URL(m.site).host + new URL(m.site).pathname
    for (const name of [...m.rows.flatMap(([, names]) => names), ...(m.free ?? []), ...extra]) map[`${name}@${page}`] = verdictOf(policy, m.site, name)
  }
  return map
}

/**
 * Compare two maps over their shared keys. `lost` - asked on the base, free on the head; `gained` - free on the base, asks on
 * the head; `changed` - asks on both with another class set; `narrowed` - a changed key whose head set misses a base class
 * (a High must have none: D-108 keeps the older class; a union only adds).
 */
export function reclassDiff(base, head) {
  const lost = [], gained = [], changed = [], narrowed = []
  for (const key of Object.keys(base)) {
    if (!(key in head)) continue
    const b = base[key], h = head[key]
    if (b !== 'allow' && h === 'allow') lost.push(key)
    else if (b === 'allow' && h !== 'allow') gained.push(key)
    else if (b !== h) { changed.push(key); const hs = new Set(h.split('+')); if (b.split('+').some((c) => !hs.has(c))) narrowed.push(key) }
  }
  return { shared: Object.keys(base).filter((k) => k in head).length, lost, gained, changed, narrowed }
}

/** True when `lost` is exactly the ruled list (each entry a name; any page). */
export const lostEquals = (diff, ruled) => {
  const names = new Set(diff.lost.map((k) => k.replace(/@.*$/, '')))
  return names.size === new Set(ruled).size && ruled.every((n) => names.has(n))
}

// CLI: node reclass.mjs map OUT.json MATRIX.json...  |  node reclass.mjs diff BASE.json HEAD.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'map') {
    const [out, ...files] = rest
    const map = reclassMap(files.map((p) => JSON.parse(readFileSync(p, 'utf8'))))
    writeFileSync(out, JSON.stringify(map)); console.log(`RECLASS MAP ${Object.keys(map).length} names -> ${out}`)
  } else if (cmd === 'diff') {
    const d = reclassDiff(JSON.parse(readFileSync(rest[0], 'utf8')), JSON.parse(readFileSync(rest[1], 'utf8')))
    console.log(`RECLASS over ${d.shared} names: ${d.lost.length} asks lost, ${d.narrowed.length} classes narrowed, ${d.changed.length} changed, ${d.gained.length} gained`)
    for (const [label, list] of [['lost', d.lost], ['narrowed', d.narrowed]]) if (list.length) console.log(`  ${label}: ${list.slice(0, 20).join(' | ')}`)
    process.exitCode = d.lost.length || d.narrowed.length ? 1 : 0
  } else { console.error('usage: reclass.mjs map OUT.json MATRIX.json... | reclass.mjs diff BASE.json HEAD.json'); process.exitCode = 2 }
}
