import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-735 (cu-researcher's miss): an English typed-confirm prompt that says YOUR <x> name, its name, <x>'s name or a bare
// '<x> name' asks like 'the <x> name' - only inside a zone that holds a destroy / transfer act.
test("CU-735: possessive and bare name shapes ask inside a destroy / transfer zone", () => {
  assert.deepEqual(typedConfirmClasses(['Full name'], ['Type your full name to confirm.', 'Your account will be deleted.']), ['delete'], "'to confirm' still takes a personal name (strongConfirm)")
  assert.deepEqual(typedConfirmClasses(['Account name'], ['Enter your account name below.', 'Your account will be deleted.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Team'], ["Type your team's name.", 'The team and its projects will be deleted.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Repository'], ['Enter repository name below.', 'The repository will be removed.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Project'], ['Type its name to continue.', 'This deletes the project for good.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Handle'], ['Enter your organisation handle.', 'Ownership passes to a new owner.']), ['permission'])
  assert.deepEqual(typedConfirmClasses(['Enter your account name'], ['Your account will be permanently deleted.']), ['delete'], 'the prompt as the entry')
})

test('CU-735 near collisions: rename, sign-in and zones without an act stay free', () => {
  assert.deepEqual(typedConfirmClasses(['New name'], ['Enter a new name for the project.', 'Links to the old name are removed.']), [], 'rename')
  assert.deepEqual(typedConfirmClasses(['Username'], ['Enter your username.', 'Old sessions are removed after 30 days.']), [], "sign-in: 'username' is no name shape")
  assert.deepEqual(typedConfirmClasses(['User ID'], ['Enter your user ID.', 'Inactive users are deleted yearly.']), [], 'sign-in: user ID')
  assert.deepEqual(typedConfirmClasses(['Display name'], ['Type your display name.', 'Old avatars are removed.']), [], 'profile field')
  assert.deepEqual(typedConfirmClasses(['Account name'], ['Enter your account name.', 'We will e-mail you a sign-in link.']), [], 'no act in the zone')
  assert.deepEqual(typedConfirmClasses(['Enter your account name'], []), [], 'an entry alone, no act')
  // policy owner 22:41Z: personal-name fields stay free; a real typed confirm for them says 'to confirm'
  assert.deepEqual(typedConfirmClasses(['Full name'], ['Enter your full name.', 'Inactive accounts are deleted after 2 years.']), [], 'your full name (sign-up)')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Enter your name.', 'Inactive accounts are deleted after 2 years.']), [], "a bare 'your name'")
  assert.deepEqual(typedConfirmClasses(['ID'], ['Type your ID.', 'Old records are removed.']), [], "a bare 'your ID'")
})

test("CU-735 r2 (cu-researcher's NOT OK at cc32afab3): 'type in', a possessive field label, and a personal word before the noun", () => {
  assert.deepEqual(typedConfirmClasses(['Store'], ['Type in your store name.', 'Your store will be deleted.']), ['delete'], 'type in')
  assert.deepEqual(typedConfirmClasses(['Workspace ID'], ['Your workspace ID:', 'Deleting removes the workspace for good.']), ['delete'], 'a possessive label in the zone')
  assert.deepEqual(typedConfirmClasses(['Your workspace ID:'], ['This deletes the workspace.']), ['delete'], 'a possessive label as the entry')
  assert.deepEqual(typedConfirmClasses(['Account'], ['Type your full account name exactly as shown.', 'Your account will be deleted.']), ['delete'], 'full before the noun')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Your name:', 'Inactive accounts are deleted after 2 years.']), [], "a bare 'Your name:' label")
  assert.deepEqual(typedConfirmClasses(['User ID'], ['Your user ID:', 'Old sessions are removed.']), [], "'Your user ID:' (sign-in)")
  assert.deepEqual(typedConfirmClasses(['Email'], ['Type in your email.', 'Your account will be deleted.']), [], 'type in an email: no name shape')
  assert.deepEqual(typedConfirmClasses(['New project name'], ['Type your new project name.', 'The old name is removed from links.']), [], "'new' anywhere stays a rename")
})
