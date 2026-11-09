import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-359 (D-099): a mail app's Sent and Deleted folders named in Chinese, Japanese or Korean are not Send or Delete buttons.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://mail.example/inbox', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-359: past-state folder names stay free', () => {
  for (const name of ['已发送', '已發送', '已删除', '已刪除', '已删除邮件', '送信済み', '削除済み', '삭제됨', '전송됨']) assert.equal(click(name), 'allow', name)
})

test('CU-359: the imperative buttons still ask, also beside a past-state form', () => {
  for (const [name, expected] of [['发送', 'submit'], ['删除', 'delete'], ['送信', 'submit'], ['削除', 'delete'], ['삭제', 'delete'], ['删除已发送邮件', 'delete']]) {
    assert.equal(click(name), expected, name)
  }
})
