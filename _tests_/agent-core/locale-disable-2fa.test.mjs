import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-695 (strict English parity; the English facts are on the issue): turning off two-factor / two-step authentication asks permission
// + credential in the locales as 'Disable two-factor authentication' does; enabling it, the bare noun and other objects take no permission.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/security', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-695: locale disable-2FA rows ask permission + credential as English (parity)', () => {
  for (const name of ['Désactiver l’authentification à deux facteurs', 'Désactiver la validation en deux étapes', 'Désactiver la 2FA', 'Desactivar la autenticación de dos factores', 'Desactivar la verificación en dos pasos', 'Desactivar 2FA', 'Desativar a autenticação de dois fatores',
 'Disattiva l’autenticazione a due fattori', 'Zwei-Faktor-Authentifizierung deaktivieren', 'Bestätigung in zwei Schritten deaktivieren', '2FA deaktivieren', 'Deaktivieren Sie die Zwei-Faktor-Authentifizierung', 'Tweestapsverificatie uitschakelen',
 'Отключить двухфакторную аутентификацию', 'Отключить двухэтапную проверку', 'Отключить 2FA', '2段階認証を無効にする', '2要素認証をオフにする', '2段階認証プロセスを無効にする', '2단계 인증 사용 중지', '2단계 인증 끄기', '2단계 인증 해제', '关闭两步验证', '停用两步验证', '关闭双重验证',
 'İki faktörlü kimlik doğrulamayı devre dışı bırak', 'Disable two-factor authentication', 'Turn off 2FA']) { const r = click(name); assert.ok(r.includes('permission') && r.includes('credential'), name) }
})

test('CU-695 controls: enabling 2FA, the bare noun, status forms and other objects take no permission', () => {
  for (const name of ['Activer l’authentification à deux facteurs', 'Authentification à deux facteurs', 'Désactiver', 'Désactiver les notifications', 'Activar 2FA', 'Zwei-Faktor-Authentifizierung aktivieren', 'Zwei-Faktor-Authentifizierung', 'Включить двухфакторную аутентификацию', 'Двухфакторная аутентификация отключена',
 '2段階認証を有効にする', '2段階認証', '2단계 인증 사용', '2단계 인증', '开启两步验证', '两步验证', '关闭通知', 'Enable 2FA']) assert.ok(!click(name).includes('permission'), name)
})

test('CU-695 r2: zh 双重身份验证 / 双重认证 and Turkish capitals ask permission + credential', () => {
  for (const name of ['关闭双重身份验证', '關閉雙重身份驗證', '停用双重认证', 'İKİ ADIMLI DOĞRULAMAYI KAPAT', 'İKİ FAKTÖRLÜ KİMLİK DOĞRULAMAYI DEVRE DIŞI BIRAK']) { const r = click(name); assert.ok(r.includes('permission') && r.includes('credential'), name) }
  for (const name of ['双重身份验证', 'İKİ ADIMLI DOĞRULAMA']) assert.ok(!click(name).includes('permission'), name)
})
