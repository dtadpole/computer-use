import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellCount, isInvalid, KINDS, modeSteps, pageHtml, rowIndexOf, rowUrl, skipsReturn, validateRows } from '../../_tools_/live-rows/rows.mjs'

test('validateRows: a good row set has no problems', () => {
  assert.deepEqual(validateRows([
    { id: 't9-01', name: 'Instant payout', expect: 'purchase', path: 'merchant' },
    { id: 't9-02', name: 'Private account', expect: 'permission', kind: 'checkbox', checked: true },
    { id: 'd476-h1', name: 'Alex Morgan', expect: 'submit', kind: 'row', suffix: '#/call' },
    { id: 'd476-s1', name: 'Alex Morgan', expect: 'submit', kind: 'row', host: 'call.localhost' },
  ]), [])
})

test('the id never reaches the URL: page context comes only from path, suffix and host (cu-verifier, #636)', () => {
  for (const id of ['d476-hash-call-bare', 'recharge-wallet', 'meter-topup', 'password-reset', 'place-order']) {
    const url = rowUrl('http://127.0.0.1:4100', { id, name: 'x', expect: 'free' }, 7)
    assert.equal(url, 'http://127.0.0.1:4100/page/r7', id)
    const html = pageHtml({ id, name: 'x', expect: 'free', kind: 'link' }, 7)
    assert.equal(html.includes(id), false, `${id} stays out of the page too`)
  }
})

test('lines: one block per line on a text control; refused on input and checkbox, and when empty', () => {
  const html = pageHtml({ id: 'a1', name: 'Change Direct Deposit Takes Effect Immediately', expect: 'credential', lines: ['Change Direct Deposit', 'Takes Effect Immediately'] }, 0)
  assert.match(html, /<button type="submit"[^>]*><div>Change Direct Deposit<\/div><div>Takes Effect Immediately<\/div><\/button>/)
  assert.deepEqual(validateRows([{ id: 'a1', name: 'x', expect: 'free', lines: ['A', 'B'], kind: 'div' }]), [])
  assert.match(validateRows([{ id: 'a1', name: 'x', expect: 'free', lines: ['A'], kind: 'input' }])[0], /renders text/)
  assert.match(validateRows([{ id: 'a1', name: 'x', expect: 'free', lines: [] }])[0], /non-empty strings/)
})

test('validateRows: bad ids, duplicates, unknown kinds, a checkbox without its state, bad path/suffix/host', () => {
  const problems = validateRows([
    { id: 'Bad_Id', name: 'x', expect: 'free' },
    { id: 'a1', name: 'x', expect: 'free' },
    { id: 'a1', name: 'y', expect: 'free' },
    { id: 'a2', name: 'x', expect: 'free', kind: 'slider' },
    { id: 'a3', name: 'x', expect: 'free', kind: 'checkbox' },
    { id: 'a4', name: 'x', expect: 'free', path: '/call/' },
    { id: 'a5', name: 'x', expect: 'free', suffix: 'call' },
    { id: 'a6', name: 'x', expect: 'free', host: 'call.example.com' },
    { id: 'a7', name: '', expect: '' },
  ])
  for (const re of [/id must be/, /duplicate id/, /unknown kind 'slider'/, /checked: true or false/, /path must be/, /suffix starts/, /\*\.localhost/, /name missing/, /expect missing/]) {
    assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}`)
  }
  assert.deepEqual(validateRows('nope'), ['rows: not an array'])
})

test('rowUrl and rowIndexOf: path, suffix and host give page context; the server finds the row back by index', () => {
  const base = 'http://127.0.0.1:4100'
  assert.equal(rowUrl(base, { id: 'a1' }, 0), 'http://127.0.0.1:4100/page/r0')
  assert.equal(rowUrl(base, { id: 'a1', path: 'call' }, 3), 'http://127.0.0.1:4100/call/page/r3')
  assert.equal(rowUrl(base, { id: 'a1', suffix: '#/call' }, 3), 'http://127.0.0.1:4100/page/r3#/call')
  assert.equal(rowUrl(base, { id: 'a1', host: 'call.localhost' }, 3), 'http://call.localhost:4100/page/r3')
  assert.equal(rowIndexOf('/call/page/r3'), 3)
  assert.equal(rowIndexOf('/page/r12?page=call'), 12)
  assert.equal(rowIndexOf('/page/a1'), null)
  assert.equal(rowIndexOf('/effect/r3'), null)
})

test('pageHtml: UTF-8, the field, and one control per kind', () => {
  for (const kind of KINDS) {
    const html = pageHtml({ id: 'a1', name: 'Unlock scooter →', expect: 'purchase', kind, checked: false }, 4)
    assert.match(html, /<meta charset="utf-8">/)
    assert.match(html, /aria-label="Note"/)
    assert.match(html, /action="\/effect\/r4"/)
    assert.ok(html.includes('Unlock scooter →'), kind)
  }
  assert.match(pageHtml({ id: 'a1', name: 'x', expect: 'free', kind: 'hash-link' }), /href="#"/)
  assert.match(pageHtml({ id: 'a1', name: 'x', expect: 'free', kind: 'js-link' }), /href="javascript:void\(0\)"/)
  assert.match(pageHtml({ id: 'a1', name: 'x', expect: 'free', kind: 'link' }, 2), /href="\/effect-get\/r2"/)
  assert.match(pageHtml({ id: 'a1', name: 'x', expect: 'free', kind: 'row' }), /role="listitem"/)
  assert.match(pageHtml({ id: 'a1', name: 'x', expect: 'free', kind: 'checkbox', checked: true }), / checked /)
  assert.match(pageHtml({ id: 'a1', name: 'Sell', expect: 'free', select: ['New', 'Used'] }), /<select name="asset"/)
  assert.match(pageHtml({ id: 'a1', name: '<b>"x"</b>', expect: 'free' }), /&lt;b&gt;&quot;x&quot;&lt;\/b&gt;/)
})

test('skipsReturn and cellCount: no Return cell for link kinds, checkboxes and rows', () => {
  for (const kind of ['link', 'hash-link', 'js-link', 'span-link', 'aria-link', 'checkbox', 'row']) assert.equal(skipsReturn(kind), true, kind)
  for (const kind of [undefined, 'button', 'input', 'div']) assert.equal(skipsReturn(kind), false, String(kind))
  assert.equal(cellCount([{ kind: 'button' }, { kind: 'link' }, { kind: 'checkbox' }, {}]), 6)
  assert.equal(cellCount([{ kind: 'button' }, { kind: 'row' }], ['click', 'return', 'space', 'dblclick']), 7)
})

test('isInvalid: never-judged, skipped and errored cells run again', () => {
  for (const stop of ['max_time', 'error', 'refused', 'resource_refused']) assert.equal(isInvalid({ control: 'a1', stop }), true, stop)
  assert.equal(isInvalid({ control: 'a1', skipped: 'lock' }), true)
  assert.equal(isInvalid({ error: 'x' }), true)
  assert.equal(isInvalid({ control: 'a1', stop: 'completed' }), false)
})

test('modeSteps: every mode types first, then presses one way; an unknown mode throws', () => {
  for (const mode of ['click', 'return', 'space', 'dblclick']) {
    const steps = modeSteps(mode)
    assert.equal(steps[1][0].type, 'type', mode)
  }
  assert.equal(modeSteps('return').at(-1)[0].keys[0], 'ENTER')
  assert.equal(modeSteps('dblclick').at(-1)[0].type, 'double_click')
  assert.throws(() => modeSteps('triple'), /unknown mode/)
})
