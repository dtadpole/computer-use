import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-673 (cu-developer-one's go 11:28Z, strict parity with the English set on the issue): signing out of all or other devices or sessions
// asks permission in ja / ko / zh as 'Log out of all devices' does; bare verbs, past forms, negation and the single-device form stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account/sessions', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-673: ja / ko / zh sign-out-everywhere rows ask permission as their English twins (parity)', () => {
  for (const name of ['すべてのデバイスからログアウト', 'すべてのデバイスからログアウトする', '他のデバイスからログアウトしてください', 'すべての端末からサインアウト', '全てのセッションからログアウト', '今すぐすべてのデバイスからログアウト',
 '모든 기기에서 로그아웃', '모든 기기에서 로그아웃하기', '다른 기기에서 로그아웃하세요', '모든 세션에서 로그아웃', '모든 디바이스에서 로그아웃해 주세요', '지금 모든 기기에서 로그아웃',
 '从所有设备退出', '从所有设备退出登录', '在所有设备上退出', '在其他设备上登出', '从所有设备注销', '立即从所有设备退出', 'Log out of all devices', 'Sign out everywhere']) assert.ok(click(name).includes('permission'), name)
})

test('CU-673 controls: bare verbs, past forms, negation and the single-device form stay free', () => {
  for (const name of ['ログアウト', 'サインアウト', 'すべてのデバイスからログアウトしました', 'すべてのデバイスからログアウトしない', 'このデバイスからログアウト', 'デバイス',
 '로그아웃', '모든 기기에서 로그아웃되었습니다', '모든 기기에서 로그아웃하지 마세요', '이 기기에서 로그아웃', '기기',
 '退出', '退出登录', '已从所有设备退出', '不要从所有设备退出', '从此设备退出', '所有设备', 'Log out', "Don't log out of all devices", 'Logged out of all devices']) assert.deepEqual(click(name), [], name)
})

test('CU-673 r2: stacked other + all, the Korean noun-phrase form, zh verb-first and zh-Hant ask, as English does', () => {
  for (const name of ['他のすべてのデバイスからログアウト', 'すべての他のデバイスからログアウト', '다른 모든 기기에서 로그아웃', '모든 기기 로그아웃', '다른 모든 기기 로그아웃하기', '所有其他设备退出', '从所有其他设备退出',
    '退出所有设备', '登出所有设备', '注销所有设备', '注销其他设备', '退出登录所有设备', '從所有裝置登出', '登出所有裝置', '在所有裝置上登出', '從其他裝置登出',
    'Sign out of all other devices', 'Log out all devices', 'Log out all other devices']) assert.ok(click(name).includes('permission'), name)
  for (const name of ['注销', '登出', '已登出所有裝置', '이 기기 로그아웃', '기기 로그아웃', '退出此设备', 'End all sessions', 'Log me out everywhere']) assert.deepEqual(click(name), [], name)
  assert.ok(!click('注销账号').includes('permission'), '注销账号 stays out of the sign-out rule')
})
