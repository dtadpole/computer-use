import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-670 (cu-developer-one's design 08:01Z, strict parity 08:03Z): the locale twins of 'Reset settings' and 'Factory reset' ask delete
// exactly where English does; negation, other or qualified objects, 'Restore defaults' twins, past forms and bare nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings/advanced', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-670: locale reset-settings and factory-reset rows ask delete as their English twins (parity)', () => {
  for (const name of ['Réinitialiser les paramètres', 'Réinitialisez tous les paramètres', 'Réinitialiser vos réglages', 'Restablecer configuración', 'Restablece todos los ajustes', 'Restablecer la configuración',
 'Redefinir configurações', 'Redefinir todas as configurações', 'Ripristina impostazioni', 'Reimposta tutte le impostazioni', 'Ripristinare le impostazioni',
 'Einstellungen zurücksetzen', 'Alle Einstellungen zurücksetzen', 'Setzen Sie die Einstellungen zurück', 'Instellingen resetten', 'Alle instellingen terugzetten', 'Reset de instellingen',
 'Сбросить настройки', 'Сбросьте все настройки', 'СБРОСИТЬ НАСТРОЙКИ', '設定をリセット', 'すべての設定をリセットしてください', '設定を初期化する', '설정 초기화', '모든 설정 초기화하기', '설정을 초기화하세요',
 '重置设置', '重置所有设置', 'Ayarları sıfırla', 'Tüm ayarları sıfırlayın',
 "Réinitialisation d'usine", "Rétablir les paramètres d'usine", 'Restablecer valores de fábrica', 'Restablecimiento de fábrica', 'Restaurar configurações de fábrica', 'Redefinição de fábrica',
 'Ripristina impostazioni di fabbrica', 'Fabrieksinstellingen herstellen', 'Сбросить до заводских настроек', 'Сброс до заводских настроек', '工場出荷時の状態にリセット', '공장 초기화', '恢复出厂设置', 'Fabrika ayarlarına sıfırla', 'Reset settings', 'Factory reset']) assert.ok(click(name).includes('delete'), name)
})

test('CU-670 controls: negation, other objects, restore-defaults twins, past forms and bare nouns stay free, as in English', () => {
  for (const name of ['Ne pas réinitialiser les paramètres', 'Paramètres réinitialisés', 'Paramètres', 'Réinitialiser le zoom', 'Réinitialiser les préférences', 'No restablecer la configuración', 'Restablecer filtros', 'Configuración restablecida',
 'Restaurar padrões', 'Ripristina predefiniti', 'Impostazioni', 'Einstellungen nicht zurücksetzen', 'Einstellungen anzeigen', 'Netzwerkeinstellungen zurücksetzen', 'Einstellungen zurückgesetzt', 'Instellingen niet resetten', 'Standaardinstellingen herstellen',
 'Не сбрасывать настройки', 'Настройки сброшены', 'Настройки', 'Сбросить фильтры', '設定をリセットしました', '設定をリセットしない', '設定', '설정 초기화됨', '설정', '恢复默认设置', '设置', 'Ayarları sıfırlama', 'Ayarlar sıfırlandı',
 "Paramètres d'usine", 'Fábrica', "Don't reset settings", 'Reset preferences', 'Restore defaults']) assert.deepEqual(click(name), [], name)
})

test('CU-670 r2: the reset-to-defaults twins and quantifier + adverb rows ask, as English does', () => {
  for (const name of ['Réinitialiser tous les paramètres maintenant', 'Alle Einstellungen jetzt zurücksetzen', 'Restablecer todos los ajustes ahora', 'Сбросить все настройки сейчас', '今すぐ設定をリセット',
    '지금 모든 설정 초기화', '立即重置所有设置', 'Tüm ayarları şimdi sıfırla', 'Réinitialiser par défaut', 'Réinitialiser aux valeurs par défaut', 'Restablecer valores predeterminados',
    'Restablecer a los valores predeterminados', 'Redefinir para o padrão', 'Reimposta valori predefiniti', 'Auf Standard zurücksetzen', 'Einstellungen auf Standardwerte zurücksetzen', 'Terugzetten naar standaard',
    'Сбросить по умолчанию', 'Сбросить настройки до значений по умолчанию', 'デフォルトにリセット', '기본값으로 초기화', '重置为默认', 'Varsayılana sıfırla', 'Reset all settings now', 'Reset to defaults']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['Ripristina predefiniti', 'Restaurar padrões', 'Standaardinstellingen herstellen', '恢复默认设置', 'Restore defaults', 'Valeurs par défaut', 'Par défaut', 'Standardwerte', 'По умолчанию',
    'Ne pas réinitialiser par défaut', 'Einstellungen nicht zurücksetzen']) assert.deepEqual(click(name), [], name)
})
