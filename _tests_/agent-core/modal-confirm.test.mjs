import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-507: a generic confirm control inside an in-page modal asks the classes of the modal's title + description. Click, Return
// and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (name, dialogName, dialogDescription, how = 'click') => {
  const target = { role: 'button', tag: 'button', name, ...(dialogName !== undefined ? { dialogName } : {}), ...(dialogDescription !== undefined ? { dialogDescription } : {}) }
  const action = how === 'click' ? { type: 'click', x: 1, y: 1, button: 'left' } : { type: 'keypress', keys: [how === 'enter' ? 'ENTER' : 'SPACE'] }
  const v = policy.classify(action, { url: 'https://code.example/org/repo/settings', target })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-507: a generic Confirm / OK / Yes in a risky modal asks the modal\'s class', () => {
  for (const [title, description, row] of [
    ['Make this repository public?', 'Anyone on the internet will be able to see this repository.', 'Make this repository public'],
    ['Delete this repository', 'This action cannot be undone.', 'Delete this repository'],
    ['Disable two-factor authentication?', 'Your account will be less secure.', 'Disable two-factor authentication'],
  ]) {
    const want = (() => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://code.example/org/repo/settings', target: { role: 'button', name: row } }); return v.classes ?? [v.class] })()
    for (const button of ['Confirm', 'OK', 'Yes', 'Continue', 'I understand', 'Yes, I\'m sure']) {
      for (const how of ['click', 'enter', 'space']) {
        const got = press(button, title, description, how)
        for (const cls of want) assert.ok(got.includes(cls), `${how} ${button} in '${title}' has ${cls}`)
      }
    }
  }
})

test('CU-507 negatives: a benign modal stays free; a named button keeps its own class; no dialog fields keep today', () => {
  assert.deepEqual(press('OK', 'Saved', 'Your changes were saved.'), [])
  assert.deepEqual(press('Continue', 'Welcome back', 'Pick up where you left off.'), [])
  assert.deepEqual(press('Confirm'), [], 'no dialog fields: today')
  assert.deepEqual(press('Cancel', 'Delete this repository', 'This action cannot be undone.'), [], 'Cancel is not a confirm')
  assert.ok(press('Delete', 'Delete this repository', 'x').includes('delete'), 'a named button keeps its class')
})

test('CU-507: the desktop sheet shape (AXSheet title + static text in the same fields)', () => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.apple.finder', target: { role: 'AXButton', name: 'OK', origin: 'com.apple.finder', dialogName: 'Are you sure you want to erase the disk?', dialogDescription: 'Erase disk' } })
  assert.equal(v.decision, 'confirm')
})
