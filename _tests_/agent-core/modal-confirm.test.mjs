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

test('CU-507: question-shaped titles (cu-researcher 16:09Z); one field shape on both routes', () => {
  const ctxPress = (name, { name: dialogName, description: dialogDescription }) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://cloud.example/storage', target: { role: 'button', name, dialogName, dialogDescription } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(ctxPress('OK', { kind: 'alertdialog', name: 'Delete account?', description: 'This removes all your data.' }).includes('delete'))
  assert.ok(ctxPress('Confirm', { kind: 'dialog', name: 'Are you sure you want to empty bucket?' }).includes('delete'))
  assert.ok(ctxPress('Yes', { kind: 'dialog', name: 'Empty bucket?' }).includes('delete'))
  assert.ok(ctxPress('Continue', { kind: 'dialog', name: 'Do you really want to make this repository public?' }).length > 0)
  assert.deepEqual(ctxPress('OK', { kind: 'dialog', name: 'Are you sure you want to leave this page?', description: 'Unsaved notes will be kept.' }).filter((c) => c === 'delete'), [])
  assert.deepEqual(ctxPress('OK', { kind: 'dialog', name: 'Saved' }), [])
})

test('CU-507 desktop rows each way (cu-developer-three 16:09Z), fed the shape directly', () => {
  const desk = (dialogName, dialogDescription) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.apple.DiskUtility', target: { role: 'AXButton', name: 'OK', origin: 'com.apple.DiskUtility', dialogName, dialogDescription } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(desk('Erase "Untitled"?', 'This will erase all data.').includes('delete'))
  assert.deepEqual(desk('Software Update', 'Restart later'), [])
})

test('#702 round 2 (cu-researcher 16:24Z): the title gets the full canonical form; descriptions lose their lead-in', () => {
  const at = (url, name, dialogName, dialogDescription) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name, dialogName, dialogDescription } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  const sec = 'https://home.example/security/alarms'
  const bare = (() => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: sec, target: { role: 'button', name: 'Silence all alarms' } }); return v.classes ?? [v.class] })()
  for (const cls of bare) assert.ok(at(sec, 'OK', 'Silence all alarms?', '').includes(cls), `quantified title: ${cls}`)
  assert.ok(at('https://cloud.example/x', 'Continue', 'Heads up', 'This will empty bucket.').includes('delete'), 'This will <row>')
  assert.ok(at('https://cloud.example/x', 'OK', 'Warning', 'You are about to delete this repository.').includes('delete'), 'You are about to <row>')
  assert.ok(at('https://cloud.example/x', 'Confirm', 'Are you sure?', 'This will empty the bucket.').includes('delete'), 'determiner in the rest')
  assert.ok(at('https://cloud.example/x', 'OK', 'Careful', 'This cannot be undone and will delete this repository.').includes('delete'))
  assert.deepEqual(at('https://cloud.example/x', 'OK', 'Heads up', 'This will refresh the page.'), [])
})

test('#702 round 3 (cu-developer-three 16:35Z): a sentence about NOT confirming is not judged for the confirm', () => {
  const desk = (name, dialogName, dialogDescription) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.example.notes', target: { role: 'AXButton', name, origin: 'com.example.notes', dialogName, dialogDescription } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.deepEqual(desk('OK', 'Do you want to save the changes made to the document "Notes"?', "Your changes will be lost if you don't save them."), [])
  assert.deepEqual(desk('OK', 'Save changes?', 'Unsaved work will be deleted unless you save it.'), [])
  assert.ok(desk('OK', 'Erase "Untitled"?', 'This will erase all data on the disk.').includes('delete'), 'a plain consequence still asks')
})

test('CU-507 follow-up (cu-coordinator 18:21Z): Continue to / Proceed to inside a dialog asks the union of its rest and the title', () => {
  const at = (name, dialogName, dialogDescription) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://cloud.example/storage', target: { role: 'button', name, dialogName, dialogDescription } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(at('Continue to empty bucket', 'Empty bucket?', '').includes('delete'), 'rest + title')
  assert.ok(at('Proceed to checkout', 'Delete account?', 'This cannot be undone.').includes('delete'), 'the title carries delete')
  assert.ok(at('Continue to delete account', 'Heads up', '').includes('delete'), 'the rest carries delete')
  assert.deepEqual(at('Continue to dashboard', 'Saved', 'Your changes were saved.'), [], 'benign rest + benign dialog stay free')
  const page = (() => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://cloud.example/storage', target: { role: 'button', name: 'Continue to dashboard' } }); return v.decision })()
  assert.equal(page, 'allow', 'outside a dialog the navigation ruling stays')
})
