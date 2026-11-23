import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-735 (cu-researcher's miss): an English typed-confirm prompt that says YOUR <x> name, its name, <x>'s name or a bare
// '<x> name' asks like 'the <x> name' - only inside a zone that holds a destroy / transfer act.
test("CU-735: possessive and bare name shapes ask inside a destroy / transfer zone", () => {
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
})
