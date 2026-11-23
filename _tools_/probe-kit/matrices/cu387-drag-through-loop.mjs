// CU-377/CU-387 (D-103): a desktop drag judged through the real loop, so dragSource is the loop's own derivation.
// node _tools_/probe-kit/matrices/cu387-drag-through-loop.mjs
import { desk } from '../shapes.mjs'
import { lastStatus, throughLoop } from '../loop.mjs'

const FINDER = 'com.apple.finder'; const SLACK = 'com.tinyspeck.slackmacgap'; const APP = 'com.example.notes'; const OTHER = 'com.example.ledger'
const drag = [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }]
const rows = [
  ['Finder row, no filename -> Slack', FINDER, [FINDER, SLACK], desk.row(FINDER, 'report'), desk.webArea(SLACK, 'Message'), 'declined'],
  ['a row known by filename -> another app', APP, [APP, OTHER], desk.row(APP, 'notes.txt', { filename: 'notes.txt' }), desk.button(OTHER, 'Drop files here'), 'declined'],
  ['a row known by its url leaf only -> another app', APP, [APP, OTHER], { ...desk.row(APP, 'notes.txt'), url: 'notes.txt' }, desk.button(OTHER, 'Drop files here'), 'declined'],
  ['a slider -> another app (not a file)', APP, [APP, OTHER], { origin: APP, role: 'AXSlider', name: 'Volume', editable: false }, desk.button(OTHER, 'Notes'), 'done'],
  ['a url-leaf row -> the same app', APP, [APP, OTHER], { ...desk.row(APP, 'a.txt'), url: 'a.txt' }, desk.row(APP, 'Folder'), 'done'],
]
const wrong = []
for (const [label, frontmost, apps, src, dst, want] of rows) {
  const got = lastStatus(await throughLoop({ frontmost, apps, targets: ({ x }) => (x < 200 ? src : dst), actions: drag }))
  if (got !== want) wrong.push(`${label}: got ${got}, want ${want}`)
}
console.log(`CU-387 (through the loop): ${rows.length - wrong.length}/${rows.length} rows as expected`); for (const w of wrong) console.log('  ' + w)
process.exitCode = wrong.length > 0 ? 1 : 0
