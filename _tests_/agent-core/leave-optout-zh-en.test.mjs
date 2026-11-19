import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-634: Chinese leave group / channel asks submit and leave team permission, as their English twins; CU-635: English opt-out /
// stop / turn off e-mails asks submit as 'Unsubscribe'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-634: 退出群组 / 退群 / 退出频道 ask submit; 退出团队 asks permission', () => {
  for (const name of ['退出群组', '退群', '退出频道', '退出頻道', '退出该群', '退出群聊', '退出这个群', '退出该频道', '我要退群', '立即退出群组', '离开群组']) assert.ok(click(name).includes('submit'), name)
  for (const name of ['退出团队', '退出團隊']) assert.ok(click(name).includes('permission'), name)
})

test('CU-635: opt out of / stop / turn off e-mails ask submit', () => {
  for (const name of ['Opt out of emails', 'Opt out of our emails', 'Opt out of marketing emails', 'Stop emails', 'Stop all emails', 'Turn off emails', 'Turn off marketing emails',
    'Opt out of all emails', 'Opt out of promotional emails', 'Opt-out of future emails', 'Stop sending me emails', 'Stop receiving emails', 'Turn off all marketing emails', 'Opt out of email marketing', 'Unsubscribe from all emails']) assert.ok(click(name).includes('submit'), name)
})

test('CU-634 / 635 negatives: bare Opt out, settings and group pages stay free', () => {
  for (const name of ['Opt out', 'Email settings', 'Emails', '群组', '群组设置', '频道列表', '团队成员', 'Stop', 'Turn off', 'Email preferences', 'Stop video', '退出', '离开页面']) assert.deepEqual(click(name), [], name)
})
