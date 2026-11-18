import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-620: a factory reset in any word order and language asks delete. My own twin battery (word orders, imperative, formal,
// with the device as object), written before review.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-620: factory reset asks delete in any order and language', () => {
  for (const name of ['Reset to factory settings', 'Restore factory defaults', 'Restore to factory settings', 'Reset to factory default', 'Factory data reset', 'Wipe and restore factory settings',
    '恢复出厂设置', '恢復原廠設定', '重置为出厂设置', '还原出厂设置',
    'Auf Werkseinstellungen zurücksetzen', 'Werkseinstellungen wiederherstellen', 'Setzen Sie das Gerät auf die Werkseinstellungen zurück', 'Auf Werkszustand zurücksetzen',
    "Réinitialiser les paramètres d'usine", 'Rétablir les paramètres d’usine', "Réinitialisez l'appareil aux paramètres d'usine", "Restaurer les paramètres d'usine",
    'Restablecer valores de fábrica', 'Restablecer a los valores de fábrica', 'Restablezca la configuración de fábrica', 'Restaurar configurações de fábrica', 'Redefinir para as configurações de fábrica', 'Repor definições de fábrica',
    'Ripristina impostazioni di fabbrica', 'Ripristinare le impostazioni di fabbrica', 'Reimposta ai valori di fabbrica', 'Fabrieksinstellingen herstellen', 'Terugzetten naar fabrieksinstellingen', 'Zet terug naar fabrieksinstellingen',
    'Fabrika ayarlarına sıfırla', 'Fabrika ayarlarına geri yükle', 'Fabrika ayarlarına döndürün',
    'Fabrika verilerine sıfırla', 'Fabrika verilerine sıfırlayın', 'Fabrieksgegevens herstellen', 'Werksdaten zurücksetzen', 'Restablecer datos de fábrica', "Réinitialiser les données d'usine", 'Ripristino dati di fabbrica', '恢复出厂数据',
    'Return to factory settings', 'Revert to factory defaults', 'Load factory settings', 'Load factory defaults', 'Go back to factory settings',
    'Werkseinstellungen laden', 'Zu den Werkseinstellungen zurückkehren', 'Lade die Werkseinstellungen', "Revenir aux paramètres d'usine", "Revenez aux paramètres d'usine", "Charger les paramètres d'usine", "Retour aux paramètres d'usine",
    'Volver a los valores de fábrica', 'Vuelva a la configuración de fábrica', 'Cargar valores de fábrica', 'Voltar às configurações de fábrica', 'Volte às definições de fábrica', 'Carregar configurações de fábrica',
    'Torna alle impostazioni di fabbrica', 'Ritorna alle impostazioni di fabbrica', 'Carica impostazioni di fabbrica', 'Fabrieksinstellingen laden', 'Terug naar fabrieksinstellingen', 'Keer terug naar fabrieksinstellingen',
    'Fabrika ayarlarına dön', 'Fabrika ayarlarına dönün', 'Fabrika ayarlarına geri dön', 'Fabrika ayarlarını yükle']) assert.ok(click(name).includes('delete'), name)
})

test('CU-620 negatives: factory pages without a reset verb, and resets of other things, stay free', () => {
  for (const name of ['Factory settings', 'Werkseinstellungen', "Paramètres d'usine", 'Valores de fábrica', 'Impostazioni di fabbrica', 'Fabrieksinstellingen', 'Fabrika ayarları', 'Fabrika verileri', 'Fabrieksgegevens', 'Werksdaten', 'Factory outlet', 'Return to factory page', 'Werkseinstellungen anzeigen', "Voir les paramètres d'usine", '出厂设置',
    'Reset', 'Reset zoom', 'Restore window', 'Zurücksetzen', 'Réinitialiser le filtre', 'Restablecer filtros', 'Ripristina finestra', 'Sıfırla']) assert.deepEqual(click(name), [], name)
})
