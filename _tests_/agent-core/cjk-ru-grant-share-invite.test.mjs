import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-687 (strict English parity; the English facts are on the issue): ru / ja / ko grant-access, share-with-everyone and invite twins
// (and zh grant) ask permission as their English twins; bare grant verbs and past / status forms do not take permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-687: ru / ja / ko / zh grant, share and invite rows ask permission as their English twins (parity)', () => {
  for (const name of ['Предоставить доступ', 'Дать доступ Анне', 'Поделиться со всеми', 'Поделиться', 'Пригласить участника', 'Пригласите друзей', 'Пригласить', 'アクセスを許可', 'アクセス権を付与してください', '全員と共有', 'リンクを共有', 'メンバーを招待', '友達を招待する',
 '액세스 권한 부여', '접근 권한 허용', '권한 부여하기', '모든 사용자와 공유', '링크 공유하기', '멤버 초대', '친구를 초대하세요', '授予访问权限', '授权访问权限', 'Grant access', 'Share with everyone', 'Invite member']) assert.ok(click(name).includes('permission'), name)
})

test('CU-687 controls: bare grant verbs and past / status forms do not take permission, as in English', () => {
  for (const name of ['Доступ предоставлен', 'Приглашение отправлено', 'Предоставить скидку', '共有済み', '共有しました', '招待済み', '공유됨', '초대됨', '부여', '許可', '授予', 'Grant', 'Access granted', 'Invited']) assert.ok(!click(name).includes('permission'), name)
})
