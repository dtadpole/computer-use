import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-813 (P1; follow-up to CU-807 after #1480 r2, found by cu-researcher): a Korean causal connective after a pending trash
// delete ('…영구 삭제되기 때문에 복구할 수 없습니다.') over '비우기' acts unasked.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-813-'))
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


test('CU-813: the filed row, verbatim, asks delete on both routes', () => {
  asks([['비우기', '경고', '휴지통 항목은 영구 삭제되기 때문에 복구할 수 없습니다.']])
})

test('CU-813: every causal form after the delete verb asks, per the table cu-researcher OK\'d (16:46Z)', () => {
  asks([
    ['비우기', '휴지통', '휴지통의 항목이 삭제되기에 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 영구 삭제되는 만큼 신중히 선택하세요.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제될 것이기 때문에 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 모두 지워지기 때문에 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목은 영구적으로 삭제되기 때문입니다.'],
  ])
})

test('CU-813: negated, past, possibility and "before" rows stay free; "before" reads as its English twin does', () => {
  free([
    ['비우기', '휴지통', '휴지통의 항목은 삭제되지 않기 때문에 그대로 남습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 이미 삭제되었기 때문에 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 이미 삭제된 만큼 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통의 항목이 삭제될 수 있기 때문에 주의하세요.'],
    ['비우기', '휴지통', '휴지통의 항목이 영구적으로 삭제되기 전에 백업하세요.'],
    ['Empty', 'Trash', 'Back up before the items in the Trash are permanently deleted.'],
  ])
})

test('#1482 r2: cu-researcher\'s two misses verbatim, a causal noun after a present / future adnominal, and the causal endings ask', () => {
  asks([
    ['비우기', '휴지통', '휴지통 항목은 영구 삭제되는 관계로 복구가 불가능합니다.'],
    ['비우기', '경고', '휴지통 파일이 모두 영구 삭제되는 까닭에 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 영구 삭제될 탓에 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 모두 지워지는 이상 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 영구 삭제되니까 주의하세요.'],
    ['비우기', '휴지통', '휴지통 항목이 영구 삭제되길래 미리 알려 드립니다.'],
    ['비우기', '휴지통', '휴지통 항목이 영구 삭제되는지라 되돌릴 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 영구 삭제될 테니 주의하세요.'],
  ])
  free([
    ['비우기', '휴지통', '휴지통 항목은 삭제되지 않는 관계로 복구할 필요가 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 이미 삭제된 관계로 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목은 삭제되지 않으니 안심하세요.'],
    ['비우기', '휴지통', '휴지통 항목이 이미 삭제되었으니 복구할 수 없습니다.'],
    ['비우기', '휴지통', '휴지통 항목이 이미 삭제됐길래 복구할 수 없었습니다.'],
    // D-121 (1) cut (cu-developer-two's r2 over-ask, verbatim): '-는 바람에' reports a past mishap and stays free.
    ['비우기', '휴지통', '휴지통의 항목이 실수로 삭제되는 바람에 복구할 수 없었습니다.'],
  ])
})
