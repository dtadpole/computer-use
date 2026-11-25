import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-807 (P1; follow-up to CU-804 r3, found by cu-developer-two): a Korean trash statement whose delete verb is joined to a
// following clause by a connective ('휴지통의 항목이 영구적으로 삭제되며 복구할 수 없습니다.') over '비우기' acts unasked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-807-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const asks = (rows) => { for (const [n, t, d] of rows) { assert.ok(classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }
const free = (rows) => { for (const [n, t, d] of rows) { assert.ok(!classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(!classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }

test('CU-807: the filed row, verbatim, asks delete on both routes', () => {
  asks([['비우기', '휴지통의 항목이 영구적으로 삭제되며 복구할 수 없습니다.']])
})

test('CU-807: the class - every Korean connective after the delete verb asks, in the title or the description', () => {
  asks([
    ['비우기', '휴지통', '휴지통의 모든 항목이 삭제되고 복원할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 영구적으로 삭제되어 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제되니 주의하세요.'],
    ['비우기', '휴지통', '휴지통의 항목이 모두 지워지며 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 제거되므로 되돌릴 수 없습니다.'],
  ])
})

test('CU-807: negated, past and resultative twins of the connectives stay free', () => {
  free([
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않으며 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않고 보관됩니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제되었으며 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 이미 삭제되어 있습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 지워졌고 비어 있습니다.'],
    // r2: cu-developer-two's three over-asks verbatim - the progressive, the state and the concessive.
    ['비우기', '휴지통', '휴지통의 항목이 지금 삭제되고 있습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 이미 삭제되고 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 삭제되어도 복구할 수 있습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 지워져도 복구할 수 있습니다.'],
  ])
})
