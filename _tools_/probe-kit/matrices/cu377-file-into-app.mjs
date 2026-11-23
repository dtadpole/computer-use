// CU-377 (High): a file put into another approved app - by drag or by paste - and the neutral upload buttons ask.
// node _tools_/probe-kit/matrices/cu377-file-into-app.mjs
import { act, ctx, desk } from '../shapes.mjs'
import { check, deskPolicy } from '../policies.mjs'

const FINDER = 'com.apple.finder'; const SLACK = 'com.tinyspeck.slackmacgap'; const MAIL = 'com.apple.mail'
const { policy: p, dispose } = deskPolicy([FINDER, SLACK, MAIL])
const file = desk.row(FINDER, 'notes.txt')
const slackBox = desk.textField(SLACK, { name: 'Message #general' })
// dragSource as loop.mjs computes it for a file-browser row: 'file'.
const drop = (target) => ctx.desk(FINDER, file, { dropTarget: target, dragSource: 'file' })
const paste = (into, source) => ctx.desk(into.origin, into, { boundMenuItem: ctx.bound.item('Paste'), paste: ctx.pasteOwn(source) })
const rows = [
  ['drag notes.txt -> Slack web area', p, act.drag(), drop(desk.webArea(SLACK, 'general')), 'ask'],
  ['drag notes.txt -> Slack box', p, act.drag(), drop(slackBox), 'ask'],
  ['drag notes.txt -> Mail body', p, act.drag(), drop(desk.webArea(MAIL, 'Message body')), 'ask'],
  ['drag notes.txt -> unreadable drop', p, act.drag(), drop(null), 'ask'],
  ['paste copied notes.txt -> Slack box', p, act.key('META', 'V'), paste(slackBox, file), 'ask'],
  ["click Slack 'Upload'", p, act.click(), ctx.desk(SLACK, desk.button(SLACK, 'Upload')), 'ask'],
  ['drag notes.txt -> a Finder folder', p, act.drag(), drop(desk.row(FINDER, 'Archive')), 'allow'],
  ['paste copied notes.txt -> Finder', p, act.key('META', 'V'), paste(desk.outline(FINDER), file), 'allow'],
  ["click Slack 'Cancel'", p, act.click(), ctx.desk(SLACK, desk.button(SLACK, 'Cancel')), 'allow'],
]
const wrong = check(rows)
dispose()
console.log(`CU-377: ${rows.length - wrong.length}/${rows.length} rows as expected (named residual: a paste with no recorded source)`); for (const w of wrong) console.log('  ' + w)
process.exitCode = wrong.length > 0 ? 1 : 0
