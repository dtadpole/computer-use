// The held-out runner (Part of CU-458): a private set written BEFORE the PR, measured ONCE on the test merge, then retired.
// Web items carry their own page; dialog items add the dialog's words (CU-507 seam); desktop items name a bundle id.
// Policy level only (D-098). The set file stays private (never in this tree) until it is spent.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { act, ctx, desk, web } from './shapes.mjs'
import { deskPolicy, webPolicy } from './policies.mjs'

const classes = (r) => (r.decision === 'confirm' ? (r.classes?.length ? r.classes : [r.class]) : [])
const shown = (r) => (r.decision === 'confirm' ? classes(r).join('+') : r.decision)

/**
 * `set`: `{ ask: [[class, name, where, dialog?]], free: [[name, where, dialog?]], out_of_scope?: [names] }`, where `where` is a
 * page URL, or `app:<bundleId>` for a desktop item; `class` may list alternatives as 'a|b'; `dialog` is `{ title, description }`.
 * Returns the counts and the misses; an out-of-scope ask is reported apart and not counted.
 */
export function measure(set) {
  const out = new Set(set.out_of_scope ?? []); const desks = new Map()
  const decide = (name, where, dialog) => {
    const words = dialog ? { ...(dialog.title ? { dialogName: dialog.title } : {}), ...(dialog.description ? { dialogDescription: dialog.description } : {}) } : {}
    if (where.startsWith('app:')) {
      const app = where.slice(4)
      if (!desks.has(app)) desks.set(app, deskPolicy([app]))
      const target = dialog ? { ...desk.sheetButton(app, name, true), ...words } : desk.button(app, name)
      return desks.get(app).policy.classify(act.click(), ctx.desk(app, target))
    }
    return webPolicy([new URL(where).origin]).classify(act.click(), ctx.web(where, { ...web.button(name), ...words }))
  }
  try {
    const result = { counted: 0, asked: 0, inClass: 0, freeOk: 0, freeTotal: set.free.length, misses: [], overAsks: [], apart: [] }
    for (const [want, name, where, dialog] of set.ask) {
      const r = decide(name, where, dialog)
      if (out.has(name)) { result.apart.push(`${name}=${shown(r)}`); continue }
      result.counted += 1
      if (r.decision === 'confirm') result.asked += 1
      if (String(want).split('|').some((c) => classes(r).includes(c))) result.inClass += 1
      else result.misses.push(`${name}=${shown(r)} (want ${want})`)
    }
    for (const [name, where, dialog] of set.free) {
      const r = decide(name, where, dialog)
      if (r.decision === 'allow') result.freeOk += 1; else result.overAsks.push(`${name}=${shown(r)}`)
    }
    return result
  } finally { for (const d of desks.values()) d.dispose?.() }
}

export const summary = (r) => `HELD-OUT ask ${r.asked}/${r.counted} (in class ${r.inClass}); free ${r.freeOk}/${r.freeTotal}`
  + (r.misses.length ? `\n  not in class: ${r.misses.join(' | ')}` : '') + (r.overAsks.length ? `\n  still asking: ${r.overAsks.join(' | ')}` : '')
  + (r.apart.length ? `\n  apart (out of scope): ${r.apart.join(' | ')}` : '')

// CLI: node heldout.mjs SET.json [--retire PR] - prints the summary; --retire writes `spent` into the file so it is never measured again.
// Start the CLI only when run directly; resolve the typed path so a symlinked path (macOS /tmp -> /private/tmp) still runs it.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const file = process.argv[2]; const set = JSON.parse(readFileSync(file, 'utf8'))
  if (set.spent) { console.error(`REFUSED: ${file} was spent on ${set.spent}`); process.exitCode = 2 } else {
    const r = measure(set); console.log(summary(r))
    const i = process.argv.indexOf('--retire')
    if (i > 0) { set.spent = `${process.argv[i + 1] ?? 'unknown'} at ${new Date().toISOString()}`; set.result = summary(r); writeFileSync(file, JSON.stringify(set)); console.log(`retired ${file}`) }
  }
}
