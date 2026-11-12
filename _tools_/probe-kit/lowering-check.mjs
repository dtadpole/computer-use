// The lowering check (Part of CU-458; CU-429 rounds): a lowering PR frees EXACTLY its ruled list. Run it on the head tree:
// every ruled LOWER item must be free (allow - a block or a handoff is not free), every KEEP item must still ask, and every CLASS item must carry its ruled class.
// Pair it with reclass.mjs's diff (base -> head) so that nothing outside the list is lost. Policy level only (D-098).
import { readFileSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { act, ctx, desk, web } from './shapes.mjs'
import { deskPolicy, webPolicy } from './policies.mjs'

const classesOf = (r) => (r.decision === 'confirm' ? (r.classes?.length ? r.classes : [r.class]) : [])

/**
 * `ruling`: `{ lower: [item], keep: [item], classes?: [item & { want }] }`; an item is `{ name, site }` for a web button,
 * `{ name, site, role: 'link' }` for a link, `{ name, site, dialog: { title, description } }` for a dialog button, or
 * `{ name, app }` for a desktop button. Returns the three lists with each item's verdict and an `ok` flag.
 */
export function checkLowering(ruling) {
  const desks = new Map()
  const decide = (item) => {
    if (item.app) {
      if (!desks.has(item.app)) desks.set(item.app, deskPolicy([item.app]))
      return desks.get(item.app).policy.classify(act.click(), ctx.desk(item.app, desk.button(item.app, item.name)))
    }
    const base = item.role === 'link' ? web.link(item.name) : web.button(item.name)
    const words = item.dialog ? { ...(item.dialog.title ? { dialogName: item.dialog.title } : {}), ...(item.dialog.description ? { dialogDescription: item.dialog.description } : {}) } : {}
    return webPolicy([new URL(item.site).origin]).classify(act.click(), ctx.web(item.site, { ...base, ...words }))
  }
  try {
    const row = (item) => { const r = decide(item); return { ...item, verdict: r.decision === 'confirm' ? classesOf(r).join('+') : r.decision, asks: r.decision === 'confirm', classes: classesOf(r) } }
    const lower = (ruling.lower ?? []).map(row), keep = (ruling.keep ?? []).map(row), cls = (ruling.classes ?? []).map(row)
    const ok = lower.every((x) => x.verdict === 'allow') && keep.every((x) => x.asks) && cls.every((x) => x.classes.includes(x.want))
    return { ok, lower, keep, classes: cls }
  } finally { for (const d of desks.values()) d.dispose?.() }
}

// CLI: node lowering-check.mjs RULING.json - prints LOWER / KEEP / CLASS lines, exits 1 unless every item is as ruled.
// Start the CLI only when run directly; resolve the typed path so a symlinked path (macOS /tmp -> /private/tmp) still runs it.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const r = checkLowering(JSON.parse(readFileSync(process.argv[2], 'utf8')))
  const line = (label, list, good) => console.log(`${label} ${list.filter(good).length}/${list.length}: ` + list.map((x) => `${x.name}${x.role === 'link' ? ' (link)' : ''}${x.app ? ' (desktop)' : ''}=${x.verdict}${good(x) ? '' : ' <-'}`).join(' | '))
  line('LOWER (want free)', r.lower, (x) => x.verdict === 'allow'); line('KEEP (want ask)', r.keep, (x) => x.asks); line('CLASS (want ruled class)', r.classes, (x) => x.classes.includes(x.want))
  process.exitCode = r.ok ? 0 : 1
}
