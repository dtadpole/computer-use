// CU-384: the probe kit's shapes follow the drivers and the loop. A producing file that stops naming a field fails here,
// so a renamed driver or loop field cannot leave the kit (and every probe built on it) judging a stale shape.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SOURCES, act, ctx, desk, web } from '../../_tools_/probe-kit/shapes.mjs'
import { check, deskPolicy, verdict, webPolicy } from '../../_tools_/probe-kit/policies.mjs'
import { describeElement } from '../../_environments_/chrome-browser/page-scripts.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = (file) => readFileSync(join(root, file), 'utf8')
// A field counts as named when it appears in property syntax - obj.field, field:, 'field', { field or , field - so a
// common word in a comment ('a drag pressed at') does not count.
const names = (text, field) => new RegExp(`(\\.${field}\\b|\\b${field}\\s*:|['"]${field}['"]|[{,]\\s*${field}\\b)`).test(text)

test('every landed field the kit builds is still named by the file that produces it', () => {
  for (const { field, file, pending } of SOURCES) {
    if (pending) continue
    assert.ok(names(source(file), field), `${field} is no longer named in ${file} - update the kit`)
  }
})

test('a pending field is still pending: when its pull request lands, the list must drop the mark', () => {
  for (const { field, file, pending } of SOURCES.filter((one) => one.pending)) {
    assert.ok(!names(source(file), field), `${field} is now in ${file}; remove 'pending: ${pending}' from SOURCES`)
  }
})

test('the browser builders carry exactly the page-script keys describeElement returns for the same element', () => {
  const el = (tagName, attrs = {}, extra = {}) => ({ nodeType: 1, tagName: tagName.toUpperCase(), childNodes: [], parentElement: null, getAttribute: (n) => (n in attrs ? attrs[n] : null), getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }), ...extra })
  const read = describeElement(el('input', { type: 'text' }, { type: 'text', readOnly: false, disabled: false }))
  for (const key of ['tag', 'inputType', 'editable']) assert.ok(key in read, `describeElement no longer returns ${key}`)
  const kit = web.textbox()
  assert.equal(kit.tag, read.tag); assert.equal(kit.editable, read.editable); assert.equal(kit.inputType, read.inputType)
  const select = describeElement(el('select', {}, { readOnly: false, disabled: false }))
  assert.equal(select.editable, web.select().editable, 'a select is a control, never editable (CU-370)')
})

test('the kit judges through the real components: a known ask and a known free action', () => {
  const p = webPolicy()
  assert.deepEqual(check([
    ['Delete on a row asks', p, act.key('DELETE'), ctx.web('https://mail.fixture.example/inbox', web.row()), 'ask'],
    ['typing into a search box is free', p, act.type('hello'), ctx.web('https://mail.fixture.example/inbox', web.textbox()), 'allow'],
  ]), [])
  const { policy, dispose } = deskPolicy(['com.apple.finder'])
  try {
    assert.equal(verdict(policy.classify(act.click(), ctx.desk('com.apple.finder', desk.menuItem('com.apple.finder', 'Move to Trash')))), 'confirm:delete')
  } finally { dispose() }
})
