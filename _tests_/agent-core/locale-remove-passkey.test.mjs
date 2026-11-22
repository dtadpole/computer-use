import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-696, delete half: the locale remove verbs with a passkey / security-key noun ask delete, as every English remove / delete passkey
// form does. The permission half waits on the ruling about English consistency. Past / status forms and the bare noun stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/security', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-696: locale remove-passkey rows ask delete as English \'Remove passkey\' / \'Delete passkey\'', () => {
  for (const name of ['Retirer la clé d’accès', 'Retirer cette clé d’accès', 'Retirer la clé de sécurité', 'Quitar la llave de acceso', 'Quitar la llave de seguridad', 'Убрать ключ доступа', 'Уберите ключ безопасности',
    'パスキーを取り除く', 'セキュリティキーを外す', '패스키 제거', '보안 키 제거하기', '이 패스키를 제거하세요', 'Remove passkey', 'Delete passkey']) assert.ok(click(name).includes('delete'), name)
})

test('CU-696 controls: past / status forms, the bare noun and other objects stay free of delete', () => {
  // bare 'Retirer' already asks delete on main (CU-686's bare remove verbs), so it is not a control here
  for (const name of ['Clé d’accès retirée', 'Retirer le filtre', 'Llave de acceso quitada', 'パスキーを取り除きました', '패스키가 제거되었습니다', '패스키', 'Passkey removed']) assert.ok(!click(name).includes('delete'), name)
})
