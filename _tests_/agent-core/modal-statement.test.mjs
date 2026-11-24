import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, modalStatementNames } from '../../_tools_/agent-core/policy.mjs'

// CU-746 (High; cu-researcher's sweep 5): a generic confirm in a modal whose risk is a statement, a framed description or a noun
// title acted unasked. The modal's text is now also read as the act it states.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, dialogName, dialogDescription) => {
  const target = { role: 'button', tag: 'button', name, ...(dialogName !== undefined ? { dialogName } : {}), ...(dialogDescription !== undefined ? { dialogDescription } : {}) }
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class]).slice().sort()
}
const sheet = (name, dialogName, formEntries) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://', frontmostBundleId: 'com.example.notes', target: { role: 'AXButton', name, origin: 'com.example.notes', dialogName, ...(formEntries ? { formEntries } : {}) } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class]).slice().sort()
}

test('CU-746: the filed rows ask', () => {
  assert.deepEqual(press('OK', 'Your account will be deleted'), ['delete'], 'a statement title')
  assert.deepEqual(sheet('Continue', 'This project will be deleted.', ['Project name:']), ['delete'], 'a desktop sheet')
  assert.deepEqual(press('Confirm', 'Account deletion', 'Last chance.'), ['delete'], 'a noun-phrase title')
  assert.deepEqual(press('Done', 'Final step', 'Your account and all data will be erased.'), ['delete'])
  assert.deepEqual(press('Continue', 'Heads up', 'Doing so permanently erases the volume.'), ['delete'])
  assert.deepEqual(press('Yes', 'One more step', 'Once you confirm, the repository and its history are gone for good.'), ['delete'])
  assert.deepEqual(press('Proceed', 'Warning', 'Proceeding wipes every device linked to this account.'), ['delete'])
  assert.deepEqual(press('Continue', 'Acme Bot requests access', 'It will be able to read and write all your repositories.'), ['permission'])
  assert.deepEqual(press('Continue', 'Heads up', 'Doing so gives the app full disk access.'), ['permission'])
  assert.deepEqual(press('OK', 'Last step', 'Finishing transfers ownership to Sam.'), ['permission'], "a final step's lead-in")
})

test('CU-746: what the reading produces', () => {
  assert.ok(modalStatementNames('Your account will be deleted').includes('Delete Your account'))
  assert.ok(modalStatementNames('Account deletion').includes('Delete Account'))
  assert.ok(modalStatementNames('Deletion of your workspace').includes('Delete your workspace'))
  assert.ok(modalStatementNames('Doing so permanently erases the volume.').includes('Erase the volume'))
  assert.ok(modalStatementNames('Once you confirm, the repository and its history are gone for good.').includes('Delete the repository and its history'))
  assert.ok(modalStatementNames('The bucket is going to be dropped.').includes('Drop The bucket'), 'a doubled consonant')
  assert.ok(modalStatementNames('Finishing transfers ownership to Sam.').includes('Transfer ownership to Sam'), "a final step's lead-in (cu-developer-one, for CU-747)")
  assert.ok(modalStatementNames('By completing this step you erase the backup.').length === 0, "'By completing' needs the verb next ('you erase' is a clause)")
  assert.deepEqual(modalStatementNames('Your account has been deleted.'), [], 'a notice of what already happened')
  assert.deepEqual(modalStatementNames('Doing so opens the volume in a new window.'), [], 'a harmless verb')
  assert.deepEqual(modalStatementNames('Unsaved notes will be kept.'), [], 'keep is no risk verb')
})

test('CU-746 near collisions stay free', () => {
  assert.deepEqual(press('OK', 'Deleted items', 'Items stay here for 30 days.'), [], "cu-researcher's free row")
  assert.deepEqual(press('Continue', 'Heads up', 'Doing so opens the volume in a new window.'), [], "cu-researcher's free row")
  assert.deepEqual(press('OK', 'Password changed', 'Use it next time you sign in.'), [], "cu-researcher's free row")
  assert.deepEqual(press('OK', 'All set', 'Your account has been deleted.'), [], 'a notice after the fact')
  assert.deepEqual(press('OK', 'Save changes?', 'Unsaved work will be deleted unless you save it.'), [], 'the other button (unchanged)')
})
