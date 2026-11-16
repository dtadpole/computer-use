import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-563 (cu-researcher 01:11Z): compound-clause and specific-rule rows never go free under a polite, confirming or 'Save and' lead-in.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://example.com/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : [...(v.classes ?? [v.class])]
}
const lower = (n) => `${n[0].toLowerCase()}${n.slice(1)}`

test('CU-563: lead-ins keep compound and specific rows asking with their classes', () => {
  for (const base of ['Review and confirm withdrawal', 'Scan and link device', 'Save and disable encryption', 'Open RDP port', 'I understand and want to install anyway', 'Ignore checks and merge', 'Begin sharing location']) {
    const want = classesOf(base)
    assert.notDeepEqual(want, [], `base asks: ${base}`)
    for (const form of [`Please ${lower(base)}`, `Kindly ${lower(base)}`, `Yes, ${lower(base)}`, `OK, ${lower(base)}`, `Save and ${lower(base)}`, `Save changes and ${lower(base)}`, `Danger: ${base}`]) for (const cls of want) assert.ok(classesOf(form).includes(cls), `${form}: ${cls}`)
  }
  for (const name of ['Please wait', 'Yes, show me', 'Save and close', 'Save and continue', 'OK, got it']) assert.deepEqual(classesOf(name), [], name)
})

test('#848 round 2 (cu-researcher 03:21Z): outer quotes / brackets, and every benign head / tail clause', () => {
  for (const base of ['Open RDP port', 'Begin sharing location', 'Turn off two-factor authentication', 'Delete account']) {
    const want = classesOf(base)
    for (const form of [`Review and ${lower(base)}`, `${base} and continue`, `${base}, then close`, `\u201c${base}\u201d`, `[${base}]`, `"${base}"`, `Review, ${lower(base)} and close`]) for (const cls of want) assert.ok(classesOf(form).includes(cls), `${form}: ${cls}`)
  }
  for (const name of ['Review and continue', 'Save, then close', '\u201cSettings\u201d', '[Help]']) assert.deepEqual(classesOf(name), [], name)
})

test("#848 round 3 (cu-researcher 03:36Z): the lead-in drop and the badge strip stack", () => {
  const want = classesOf('Change direct deposit Takes effect immediately')
  assert.notDeepEqual(want, [], 'base asks')
  for (const form of ["I'm sure, change direct deposit Takes effect immediately", 'I am sure, change direct deposit', 'Yes, change direct deposit \u00b7 2 min']) assert.notDeepEqual(classesOf(form), [], form)
  for (const name of ["I'm sure", 'Yes, I am sure']) assert.deepEqual(classesOf(name), [], name)
})
