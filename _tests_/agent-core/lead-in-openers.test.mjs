import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-775 + CU-776 (High; cu-coordinator 17:05Z: one class, built generally): the imperative is found after an interjection or
// discourse marker, after a short opener ending in a comma, after '<lead verb(s)> and', and after joined clause openers.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, formEntries) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-775 + CU-776: the filed rows ask', () => {
  assert.deepEqual(typedConfirmClasses(['Slug'], ['Right, quickly jot the workspace slug.', 'All workspace data will be erased.']), ['delete'], "CU-775: an interjection ('Right,')")
  assert.deepEqual(typedConfirmClasses(['ID'], ['Go on and type out the database ID.', 'The database will be dropped.']), ['delete'], "CU-776: 'Go on and'")
  assert.equal(press('OK', ['Go on and type out the database ID.', 'The database will be dropped.']), 'delete', 'CU-776 as pressed')
})

test('CU-775 + CU-776: the class is general', () => {
  assert.deepEqual(typedConfirmClasses(['Name'], ['Okay so, jot down the bucket name.', 'The bucket will be deleted.']), ['delete'], "'Okay so,'")
  assert.deepEqual(typedConfirmClasses(['Name'], ['All right then, put in the repository name.', 'This repository will be deleted.']), ['delete'], 'a short opener of three words')
  assert.deepEqual(typedConfirmClasses(['ID'], ['Try and enter the instance ID.', 'The instance will be terminated.']), ['delete'], "'Try and'")
  assert.deepEqual(typedConfirmClasses(['Handle'], ['Come on and fill in the team handle.', 'Ownership passes to the new owner.']), ['permission'], "'Come on and'")
  assert.deepEqual(typedConfirmClasses(['Name'], ['Once you are sure, and to be safe, write out the cluster name.', 'The cluster will be terminated.']), ['delete'], 'joined clause openers')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Well, okay, go ahead and type the project name.', 'The project is erased for good.']), ['delete'], 'a chain of markers')
})

test('CU-775 + CU-776 near rows stay free', () => {
  assert.deepEqual(typedConfirmClasses(['Slug'], ['Right, quickly jot the workspace slug.', 'Used in your workspace URL.']), [], 'the same entry, no act')
  assert.deepEqual(typedConfirmClasses(['ID'], ['Go on and type out the database ID.', 'Pick a region next.']), [], 'no act')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Okay, give your workspace a name.', 'You can change it later.']), [], 'a naming, no act')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Right, change the project name.', 'The project will be deleted later by an admin.']), [], 'a rename verb stays excluded after the strip')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Name, email and phone are required.', 'The account will be deleted if unverified.']), [], 'a field list is not an opener plus an imperative')
})

test('CU-775 + CU-776: a long sentence is read quickly', () => {
  const long = `${'well, '.repeat(40)}and so on and so on and so on, then nothing here.`
  const started = Date.now()
  typedConfirmClasses(['Name'], [long, 'The project will be deleted.'])
  assert.ok(Date.now() - started < 200, 'no runaway backtracking')
})
