import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-195 (copy-caption rule 4): a travelling drag pressed on captioned shown text carries the caption's class to a drop
// that can take text; a drag ending anywhere else selects rather than moves, so it carries nothing.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const DRAG = { type: 'drag', path: [{ x: 1, y: 1 }, { x: 50, y: 50 }] }
const STILL = { type: 'drag', path: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }
const URL = 'https://other.example/profile'
const shown = (caption) => ({ role: 'StaticText', name: 'X1234567', caption })
const ENTRY = { role: 'textbox', name: '', editable: true }
const EDITABLE = { role: 'generic', tag: 'div', name: '', editable: true }
const verdict = (action, target, dropTarget) => {
  const r = policy.classify(action, { url: URL, target, dropTarget })
  return r.decision === 'allow' ? 'allow' : r.class
}

test('CU-195: captioned shown text dragged onto an entry or an editable area carries the caption\'s class', () => {
  assert.equal(verdict(DRAG, shown('Passport number'), ENTRY), 'sensitive_data')
  assert.equal(verdict(DRAG, shown('IBAN'), EDITABLE), 'sensitive_data')
  assert.equal(verdict(DRAG, shown('Value · IBAN'), ENTRY), 'sensitive_data', "a joined caption (copy-caption rule 2) reaches IBAN")
})

test('CU-195 guard: the same drag ending on shown text or a non-text zone selects - it carries nothing', () => {
  assert.equal(verdict(DRAG, shown('Passport number'), { role: 'StaticText', name: 'Expires 2031' }), 'allow', 'a text selection')
  assert.equal(verdict(DRAG, shown('Passport number'), { role: 'generic', tag: 'div', name: '' }), 'allow', 'a non-editable zone')
  assert.equal(verdict(DRAG, shown('Passport number'), null), 'allow', 'no drop target read')
})

test('CU-195 negatives: a neutral caption, no caption, or a press that does not travel carries nothing', () => {
  assert.equal(verdict(DRAG, shown('Notes'), ENTRY), 'allow')
  assert.equal(verdict(DRAG, shown(null), ENTRY), 'allow', "the value's own words never count")
  assert.equal(verdict(STILL, shown('Passport number'), ENTRY), 'allow')
  assert.equal(verdict(DRAG, { role: 'button', name: 'IBAN', caption: 'IBAN' }, ENTRY), 'allow', 'only shown text named by its own words')
})

// CU-195 reopen (cu-verifier 20261108T004357Z-30bbf7): a value directly in a <dd> has Chrome's role 'definition', which the
// text-role list lacked, so the caption rule never fired. Each layer of the fix is pinned on its own.
test('CU-195 reopen: a captioned value in a <dd>, a <dt> or an <li> dragged onto an entry carries the caption\'s class', () => {
  assert.equal(verdict(DRAG, { role: 'definition', name: 'X1234567', caption: 'Passport' }, ENTRY), 'sensitive_data', 'the reported <dd>')
  assert.equal(verdict(DRAG, { role: 'listitem', name: 'DE89 3704', caption: 'IBAN' }, ENTRY), 'sensitive_data')
  // Guard: a shown value's own words never count - a <dd> reading 'PIN' under a neutral caption is not a PIN field.
  assert.equal(verdict(DRAG, { role: 'definition', name: 'PIN', caption: 'Notes' }, ENTRY), 'allow', "the dd's own words never count")
})

test('CU-195 reopen: captioned shown text in a role the list does not know still carries its caption; a control does not', () => {
  assert.equal(verdict(DRAG, { role: 'mark', name: 'X1234567', caption: 'Passport' }, ENTRY), 'sensitive_data', 'an unlisted text role')
  assert.equal(verdict(DRAG, { role: 'AXGroup', name: '', caption: 'IBAN' }, ENTRY), 'sensitive_data', 'a desktop group the helper captioned')
  assert.equal(verdict(DRAG, { role: 'link', name: 'Open', caption: 'IBAN' }, ENTRY), 'allow', 'a captioned control is not shown text')
})

// Follow-up (cu-developer-two, cu-researcher on #522): the menu and tree items the browser driver emits are controls too - a
// captioned one dragged onto an entry carries no caption class (an over-ask otherwise).
test('CU-195 follow-up: a captioned menu item checkbox, menu item radio or tree item is a control, not shown text', () => {
  for (const role of ['menuitemcheckbox', 'menuitemradio', 'treeitem', 'ToggleButton', 'PopUpButton', 'DisclosureTriangle',
    'AXDisclosureTriangle', 'AXIncrementor', 'AXColorWell']) {
    assert.equal(verdict(DRAG, { role, name: 'Show', caption: 'IBAN' }, ENTRY), 'allow', role)
  }
})

// CU-209 (cu-developer-two's trace): a read-only text view arrives with editable false (the caption fallback above), but
// an element whose editable is unread - null or absent, as in the dry run - takes the entry path, where an unnamed entry's
// caption is its name (password-memory rule 5). Either way the caption counts.
test('CU-209: a captioned text area dragged onto an entry asks by its caption whether editable is false, null or unread', () => {
  const FIELD = { role: 'AXTextField', name: '', editable: true }
  for (const editable of [false, null, undefined]) {
    const area = (caption) => ({ role: 'AXTextArea', name: '', caption, ...(editable === undefined ? {} : { editable }) })
    assert.equal(verdict(DRAG, area('IBAN'), FIELD), 'sensitive_data', `editable ${editable}`)
    assert.equal(verdict(DRAG, area('Notes'), FIELD), 'allow', `editable ${editable}, a neutral caption`)
  }
})
