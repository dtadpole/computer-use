import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-540 + CU-541 (High; cu-coordinator 01:51Z), table PR 40: a course site and payroll. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://app.example/x'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-540: course rows ask their ruled class', () => {
  for (const [name, cls] of [['Release grades to students', 'submit'], ['Release grades', 'submit'], ['Change grade', 'submit'], ['Override final grade', 'submit'], ['Drop course', 'purchase'], ['Make student a TA', 'permission'], ['Promote student to TA', 'permission']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Grades', 'Gradebook', 'Course details', 'Students']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Withdraw from course').includes('purchase'), 'older row unchanged')
})

test('CU-541: payroll rows ask purchase', () => {
  for (const name of ['Off-cycle payment', 'Run off-cycle payment', 'Change tax withholding', 'Update W-4', 'Edit W-4', 'Skip payroll', 'Skip next payroll']) {
    assert.ok(classesOf(name).includes('purchase'), name)
    assert.ok(classesOf(name, true).includes('purchase'), `Space: ${name}`)
  }
  for (const name of ['Payroll', 'Tax documents', 'W-4 help']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Run off-cycle payroll').includes('purchase'), 'older row unchanged')
})

test('#780 round 2 (cu-researcher 02:01Z): scores / marks, grader, user as instructor', () => {
  for (const name of ['Release scores to students', 'Publish marks']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Make this student a grader', 'Make student a grader', 'Make user an instructor']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Scores', 'Graders', 'Instructors']) assert.deepEqual(classesOf(name), [], name)
})
