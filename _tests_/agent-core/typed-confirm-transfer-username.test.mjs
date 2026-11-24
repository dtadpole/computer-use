import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-738 (policy owner 00:36Z; cu-verifier's CU-735 close row): a typed username / user ID inside a transfer zone asks permission.
test('CU-738: a username or user ID prompt in a transfer zone asks permission', () => {
  assert.deepEqual(typedConfirmClasses(['Username'], ['Transfer ownership', 'Enter your username.']), ['permission'], "cu-verifier's row")
  assert.deepEqual(typedConfirmClasses(['Username'], ["Type the new owner's username below.", 'Ownership passes to them at once.']), ['permission'], "the new owner's username")
  assert.deepEqual(typedConfirmClasses(['User ID'], ['Enter their user ID.', 'Admin rights move to another user.']), ['permission'], 'their user ID')
  assert.deepEqual(typedConfirmClasses(['User ID:'], ['Transfer this workspace to a new owner.']), ['permission'], 'a user ID label as the entry')
  assert.deepEqual(typedConfirmClasses(['Login'], ['Type in your login name to continue.', 'The project moves to another owner.']), ['permission'], 'type in a login name')
  // policy owner 00:36Z: 'a username / user ID / e-mail entry counts as the instruction' in a transfer zone
  assert.deepEqual(typedConfirmClasses(['Email'], ['Enter your email address.', 'Transfer ownership']), ['permission'], 'an e-mail in a transfer zone')
  assert.deepEqual(typedConfirmClasses(['E-mail address:'], ['Hand the workspace over to its new owner.']), ['permission'], 'an e-mail label as the entry')
  assert.deepEqual(typedConfirmClasses(['Email'], ['Transfer ownership', "Enter the new owner's email."]), ['permission'], "policy owner 02:39Z: the new owner's e-mail")
})

test('CU-738 near collisions stay free', () => {
  assert.deepEqual(typedConfirmClasses(['Email'], ['Ownership can be transferred later from Settings.']), [], 'policy owner 02:39Z: a transfer that points elsewhere')
  assert.deepEqual(typedConfirmClasses(['Email'], ['Sign in to your account']), [], 'policy owner 02:39Z: a sign-in page')
  assert.deepEqual(typedConfirmClasses(['Username'], ['Enter your username.', 'Forgot your password?']), [], 'a sign-in form')
  assert.deepEqual(typedConfirmClasses(['Username'], ['Enter your username.', 'Your account will be deleted.']), [], 'a destroy zone keeps the personal-field rule')
  assert.deepEqual(typedConfirmClasses(['Email'], ['Enter your email address.', 'Forgot your password?']), [], 'an e-mail in a sign-in form')
  assert.deepEqual(typedConfirmClasses(['Email'], ['Enter your email address.', 'Your account will be deleted.']), [], 'an e-mail in a destroy zone (personal field)')
  assert.deepEqual(typedConfirmClasses(['New username:'], ['Transfer ownership']), [], 'a new username (rename)')
  assert.deepEqual(typedConfirmClasses(['Username'], ['Choose a username.', 'Transfer ownership']), [], 'no typing word')
})
