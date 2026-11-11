import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-422 (High): tips and renewals (purchase); votes, petitions, resignation, offers, applications, enrolment (submit); a
// specific legal consent (permission). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://portal.example/account'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-422: tips, giving and renewals ask purchase', () => {
  for (const name of ['Add tip', 'Give', 'Give now', 'Renew license', 'Renew now']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-422: votes, petitions, resignation, offers, applications and enrolment submit; consent asks permission', () => {
  for (const name of ['Vote', 'Cast ballot', 'Submit vote', 'Sign petition', 'Resign', 'Quit job', 'Decline offer', 'Apply now', 'Apply for this job', 'Submit application', 'Enroll now']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(space(name), 'submit', `Space: ${name}`)
  }
  assert.equal(click('Accept offer'), 'purchase', "Accept offer keeps CU-409's purchase (a High never lowers an older rule)")
  for (const name of ['I consent', 'Give consent']) assert.equal(click(name), 'permission', name)
})

test('CU-422 negatives: lists, settings, Apply filters / changes, bare Apply and I agree (CU-415 named) stay free', () => {
  for (const name of ['Ballot', 'Petitions', 'Jobs', 'Offers', 'Tip settings', 'Apply filters', 'Apply changes', 'Apply', 'I agree', 'Vote history']) assert.equal(click(name), 'allow', name)
})

test('CU-422 round 2 (15:42Z): article / possessive folds submit; Leave a tip, Tip $<n>, Give $<n> purchase; named forms stay free', () => {
  for (const name of ['Cast my vote', 'Submit your ballot', 'Decline the offer', 'Accept the offer', 'Accept the job offer', 'Sign this petition']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
  }
  for (const name of ['Leave a tip', 'Tip $5', 'Give $10']) assert.equal(click(name), 'purchase', name)
  for (const name of ['Renew passport', 'Enroll in course', 'Tip calculator', 'Offer details']) assert.equal(click(name), 'allow', `${name} (named for the grammar)`)
  // The phrase grammar (#554) now catches one of the three named forms by structure: apply + job (D-100 re-expectation).
  assert.equal(click('Apply to job'), 'submit', 'caught by the grammar')
})
