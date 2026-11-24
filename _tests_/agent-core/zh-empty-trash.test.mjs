import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-731 (cu-researcher's sweep 2): Chinese 'empty the trash' in every form - 倒空 / 清空 / 清倒 / 清理 with 废纸篓 / 廢紙簍 / 垃圾桶 /
// 資源回收筒 / 资源回收筒 / 回收站 - asks delete on the desktop and the web, as the de / fr / ja twins do.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-731-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const onDesktop = (name) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true } })
const onWeb = (name) => web.classify(click, { url: 'https://files.example/', target: { role: 'button', name } })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.class)

test('CU-731: every Chinese empty-the-trash form asks delete, desktop and web', () => {
  for (const verb of ['倒空', '清空', '清倒', '清理']) {
    for (const noun of ['废纸篓', '廢紙簍', '垃圾桶', '資源回收筒', '资源回收筒', '回收站']) {
      const name = verb + noun
      assert.equal(judged(onDesktop(name)), 'delete', `desktop ${name}`)
      assert.equal(judged(onWeb(name)), 'delete', `web ${name}`)
    }
  }
})

test('CU-731: opening or naming the trash stays free', () => {
  for (const name of ['废纸篓', '打开废纸篓', '垃圾桶', '回收站']) {
    assert.equal(judged(onDesktop(name)), 'allow', `desktop ${name}`)
  }
})
