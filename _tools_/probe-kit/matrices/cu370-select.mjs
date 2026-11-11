// CU-370 (High): a select option, a radio or an unread choice reached by keyboard is judged as the choice it lands on.
// node _tools_/probe-kit/matrices/cu370-select.mjs - prints rows that disagree; exit 1 when any does.
import { act, ctx, web } from '../shapes.mjs'
import { check, webPolicy } from '../policies.mjs'

const url = 'https://shop.fixture.example/admin'
const p = webPolicy(['https://shop.fixture.example'])
const keys = [['ARROWDOWN'], ['ARROWUP'], ['PAGEDOWN'], ['HOME'], ['END'], ['D'], ['ENTER'], ['SPACE'], ['ARROWRIGHT']]
const asks = { "option 'Delete'": web.option('Delete'), "ARIA option 'Delete'": web.option('Delete', 'div'), "option 'Buy now'": web.option('Buy now'), "radio 'Delete my account'": web.radioChoice('Delete my account'),
  'unread select': web.unreadChoice(web.select()), 'read-failed select': web.unreadChoice(web.select(), true) }
const rows = []
for (const [name, target] of Object.entries(asks)) for (const k of keys) {
  rows.push([`keypress ${k.join('+')} -> ${name}`, p, act.key(...k), ctx.web(url, target), 'ask'])
  rows.push([`hold ${k.join('+')} -> ${name}`, p, act.hold(...k), ctx.web(url, target), 'ask'])
}
for (const k of [['ARROWDOWN'], ['PAGEDOWN']]) {
  rows.push([`${k} -> option 'Sort: Newest'`, p, act.key(...k), ctx.web(url, web.option('Sort: Newest')), 'allow'])
  rows.push([`${k} -> radio 'Express shipping'`, p, act.key(...k), ctx.web(url, web.radioChoice('Express shipping')), 'allow'])
}
rows.push(['ArrowDown on a bare select (keyTarget threw)', p, act.key('ARROWDOWN'), ctx.web(url, web.select()), 'ask'])
for (const [text, options] of [['Det', [{ name: 'Delete' }, { name: 'Details' }]], ['D', [{ name: 'Delete' }]], ['B', [{ name: 'Buy now' }]], ['D', { unread: true }]]) {
  rows.push([`type ${text} into a select over ${JSON.stringify(options)}`, p, act.type(text), ctx.web(url, web.select(), { typeOptions: options }), 'ask'])
}
const wrong = check(rows)
console.log(`CU-370: ${rows.length - wrong.length}/${rows.length} rows as expected`); for (const w of wrong) console.log('  ' + w)
process.exitCode = wrong.length > 0 ? 1 : 0
