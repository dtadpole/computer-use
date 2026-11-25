import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-816 (P1; follow-up to CU-805 after #1475's scope cut, found by cu-developer-two): a ja -te shimau pending delete over the
// trash ('ゴミ箱内の項目は完全に削除されてしまいます。') under '空にする' acts unasked; its negated twin stays free.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-816-'))
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


test('CU-816: cu-developer-two\'s four rows verbatim - three ask, the negated one stays free', () => {
  asks([
    ['空にする', 'ゴミ箱', 'ゴミ箱内の項目は完全に削除されてしまいます。'],
    ['空にする', 'ゴミ箱', '削除されてしまう。'],
    ['空にする', 'ゴミ箱', '削除されてしまいます。元に戻せません。'],
  ])
  free([['空にする', 'ゴミ箱', 'ゴミ箱内の項目が削除されてしまうことはありません。']])
})
