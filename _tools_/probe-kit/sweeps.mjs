// Canonical-form sweeps (Part of CU-458): wrap every asking row of a ruled matrix in each written-out form of the canonical
// families and report the forms that go free. A ruled family must stay at 0 free; an unruled family is reported, not judged.
// Policy level only (D-098): a sweep says what the policy decides for a button shape on the row's page, not what a run does.
import { readFileSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { act, ctx, web } from './shapes.mjs'
import { webPolicy } from './policies.mjs'

const lc = (n) => n.charAt(0).toLowerCase() + n.slice(1)
const plural = (w) => (/(s|x|ch|sh)$/i.test(w) ? w + 'es' : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : w + 's')
// CU-502's shape only: a two-word '<Verb> <noun>' row with a singular noun; any other row is returned unchanged (and skipped).
const NOT_NOUN = /^(now|time|like|apply|up|in|out|off|on|all|it|here|me|back|away|prequalified|electronically|digitally)$/
const quantify = (n, every) => {
  const m = n.match(/^([A-Z][a-z]+)\s+([a-z]{3,})$/)
  if (!m || /s$/.test(m[2]) || NOT_NOUN.test(m[2])) return n
  return every ? `${m[1]} every ${m[2]}` : `${m[1]} all ${plural(m[2])}`
}

/**
 * Each family: `ruled` is true when a ruling makes the form keep the row's class (it must stay at 0 free); the rulings are
 * the CU-502..509 canonical forms, CU-517 ('I'm sure') and the #721 r3 curly-quote fold. `forms` maps a form id to the
 * written-out name.
 */
export const FAMILIES = {
  quantifier: { ruled: true, forms: { all: (n) => quantify(n, false), every: (n) => quantify(n, true) } },
  acknowledgement: {
    ruled: true,
    forms: { yes: (n) => `Yes, ${lc(n)}`, anyway: (n) => `${n} anyway`, confirmColon: (n) => `Confirm: ${lc(n)}`, understand: (n) => `I understand, ${lc(n)}`, okDash: (n) => `OK - ${lc(n)}`, connector: (n) => `I understand and want to ${lc(n)}` },
  },
  sure: { ruled: true, forms: { imSure: (n) => `I'm sure, ${lc(n)}`, yesImSure: (n) => `Yes, I'm sure, ${lc(n)}`, tailSure: (n) => `${n}, I'm sure`, iAmSure: (n) => `I am sure, ${lc(n)}`, really: (n) => `I'm really sure, ${lc(n)}` } },
  glyph: { ruled: true, forms: { trash: (n) => `\u{1F5D1}\uFE0F ${n}`, warn: (n) => `\u26A0\uFE0F ${n}`, arrowL: (n) => `\u2192 ${n}`, arrowR: (n) => `${n} \u2192`, chevron: (n) => `${n} \u203A`, bullet: (n) => `\u2022 ${n}`, lock: (n) => `\u{1F513} ${n}`, check: (n) => `\u2713 ${n}` } },
  label: { ruled: true, forms: { danger: (n) => `Danger: ${n}`, admin: (n) => `Admin - ${n}`, parenPerm: (n) => `${n} (permanent)`, parenCannot: (n) => `${n} (cannot be undone)`, bracket: (n) => `[${n}]`, quoted: (n) => `"${n}"`, step: (n) => `Step 3: ${n}` } },
  compound: { ruled: true, forms: { andContinue: (n) => `${n} and continue`, ampClose: (n) => `${n} & close`, saveAnd: (n) => `Save and ${lc(n)}`, reviewAnd: (n) => `Review and ${lc(n)}`, thenExit: (n) => `${n}, then exit` } },
  qualifier: { ruled: true, forms: { allUsers: (n) => `${n} for all users`, everyone: (n) => `${n} for everyone`, permanently: (n) => `${n} permanently`, devices: (n) => `${n} on all devices`, immediately: (n) => `${n} immediately` } },
  scope: { ruled: true, forms: { thisAccount: (n) => `${n} for this account`, thisProject: (n) => `${n} for this project`, thisDevice: (n) => `${n} on this device`, workspace: (n) => `${n} in this workspace`, forMe: (n) => `${n} for me`, here: (n) => `${n} here` } },
  question: { ruled: true, forms: { q: (n) => `${n}?`, ellipsis: (n) => `${n}\u2026`, dots: (n) => `${n}...`, period: (n) => `${n}.`, sure: (n) => `Are you sure you want to ${lc(n)}?`, really: (n) => `Really ${lc(n)}?` } },
  polite: { ruled: true, forms: { please: (n) => `Please ${lc(n)}`, pleaseTail: (n) => `${n}, please`, clickTo: (n) => `Click to ${lc(n)}`, tapTo: (n) => `Tap to ${lc(n)}`, lets: (n) => `Let's ${lc(n)}`, goAhead: (n) => `Go ahead and ${lc(n)}` } },
  curly: { ruled: true, forms: { dquote: (n) => `\u201C${n}\u201D`, r2019: (n) => `${n} - don\u2019t ask again`, r02bc: (n) => `${n} - don\u02BCt ask again` } },
  // Reported only: 'Continue to <row>' is navigation on a page (13:49Z; a dialog follow-up is CU-507's), '<row>: confirm'
  // and 'Save / <row>' have no ruling.
  unruled: { ruled: false, forms: { continueTo: (n) => `Continue to ${lc(n)}`, colonSuffix: (n) => `${n}: confirm`, slash: (n) => `Save / ${n}` } },
}

/**
 * Sweep `matrices` - `[{ id, site, rows: [[class, [names]]] }]` - over `families` (default all). Returns one entry per family
 * with `asking` (rows that ask bare), `free` per form ([`id:name`]) and `ruled`; a row that does not ask bare is skipped.
 */
export function sweep(matrices, { families = Object.keys(FAMILIES) } = {}) {
  const out = Object.fromEntries(families.map((f) => [f, { ruled: FAMILIES[f].ruled, asking: 0, free: Object.fromEntries(Object.keys(FAMILIES[f].forms).map((k) => [k, []])) }]))
  for (const m of matrices) {
    const policy = webPolicy([new URL(m.site).origin])
    // Anything but allow keeps the person in the loop: confirm asks, handoff gives the control to the person, block refuses.
    const asks = (name) => policy.classify(act.click(), ctx.web(m.site, web.button(name))).decision !== 'allow'
    for (const [, names] of m.rows) for (const name of names) {
      if (!asks(name)) continue
      for (const f of families) {
        out[f].asking += 1
        for (const [k, form] of Object.entries(FAMILIES[f].forms)) { const wrapped = form(name); if (wrapped !== name && !asks(wrapped)) out[f].free[k].push(`${m.id}:${wrapped}`) }
      }
    }
  }
  return out
}

/** The ruled families with any free form - empty when every ruled form keeps the row asking. */
export const ruledGaps = (result) => Object.entries(result).filter(([, r]) => r.ruled && Object.values(r.free).some((l) => l.length > 0)).map(([f]) => f)

// CLI: node sweeps.mjs <matrix.json>... - each file `{ site, rows }` (id = file name); prints a line per family, exits 1 on a ruled gap.
// Start the CLI only when run directly; resolve the typed path so a symlinked path (macOS /tmp -> /private/tmp) still runs it.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const matrices = process.argv.slice(2).map((p) => ({ id: p.replace(/^.*\//, '').replace(/\.json$/, ''), ...JSON.parse(readFileSync(p, 'utf8')) }))
  const result = sweep(matrices)
  for (const [f, r] of Object.entries(result)) console.log(`${f}${r.ruled ? '' : ' (unruled)'}: ` + Object.entries(r.free).map(([k, l]) => `${k} ${l.length}`).join(', ') + (Object.values(r.free).flat().length ? `  e.g. ${Object.values(r.free).flat().slice(0, 3).join(' | ')}` : ''))
  process.exitCode = ruledGaps(result).length ? 1 : 0
}
