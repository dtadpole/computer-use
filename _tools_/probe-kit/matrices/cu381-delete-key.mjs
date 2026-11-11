// CU-381 (High): Delete or Backspace outside a text entry on a web page asks delete; inside one it edits text.
// node _tools_/probe-kit/matrices/cu381-delete-key.mjs
import { act, ctx, web } from '../shapes.mjs'
import { check, webPolicy } from '../policies.mjs'

const url = 'https://mail.fixture.example/inbox'
const p = webPolicy()
const targets = { null: web.none, div: web.div(), row: web.row(), listItem: web.listItem(), button: web.button(), link: web.link() }
const keys = [['DELETE'], ['BACKSPACE'], ['SHIFT', 'DELETE'], ['ALT', 'BACKSPACE'], ['CTRL', 'BACKSPACE']]
const rows = []
for (const [name, target] of Object.entries(targets)) for (const k of keys) {
  rows.push([`keypress ${k.join('+')} on ${name}`, p, act.key(...k), ctx.web(url, target), 'ask'])
  rows.push([`hold ${k.join('+')} on ${name}`, p, act.hold(...k), ctx.web(url, target), 'ask'])
}
for (const [name, target] of [['textbox', web.textbox()], ['contenteditable', web.contentEditable()]]) for (const k of [['DELETE'], ['BACKSPACE']]) {
  rows.push([`${k} in ${name}`, p, act.key(...k), ctx.web(url, target), 'allow'])
}
const wrong = check(rows)
console.log(`CU-381: ${rows.length - wrong.length}/${rows.length} rows as expected`); for (const w of wrong) console.log('  ' + w)
process.exitCode = wrong.length > 0 ? 1 : 0
