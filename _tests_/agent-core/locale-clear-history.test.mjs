import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-654 (cu-developer-one's go, 20 Nov 12:05Z): the locale twins of CU-644 - a clear verb that does not ask alone asks delete before
// a history noun, as 'Clear history' does; Korean casual 보내줘 / 지워줘 take their verbs' classes.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings/privacy', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const GRID = {
  delete: ["Vider l'historique", "Videz l'historique", "Vide ton historique", "Videz tout l'historique", "Vider l'historique de recherche",
    'Limpiar historial', 'Limpia tu historial', 'Limpie su historial', 'Limpiad el historial', 'Limpien el historial', 'Limpiar el historial de búsqueda', 'Vaciar historial',
    'Limpar histórico', 'Limpe o histórico', 'Limpem o histórico', 'Limpar o histórico de navegação', 'Limpar seu histórico',
    'Svuota cronologia', 'Svuota la cronologia', 'Svuotate la cronologia', 'Svuoti la cronologia', 'Pulisci la cronologia',
    'Verlauf leeren', 'Browserverlauf leeren', 'Suchverlauf bereinigen', 'Leere den Verlauf', 'Leert euren Verlauf', 'Leeren Sie Ihren Verlauf',
    'Очистить историю', 'Очистите историю', 'Очисти историю', 'Очистите историю поиска', 'ОЧИСТИТЬ ИСТОРИЮ', 'Очистить всю историю',
    '履歴をクリア', '検索履歴をクリア', '履歴クリア', 'Geçmişi temizle', 'Arama geçmişini temizleyin', '지워', '지워줘', '지워 주세요',
    // r2: words between the noun and a final verb
    'Verlauf jetzt leeren', 'Verlauf vollständig leeren', 'Verlauf beim Beenden leeren', 'Browserverlauf komplett bereinigen', '履歴をすべてクリア', '検索履歴を今すぐクリア', 'Arama geçmişini şimdi temizle', 'Geçmişi tamamen temizleyin'],
  submit: ['보내줘', '보내 줘'],
}

test('CU-654: locale clear + history and the Korean casual imperatives ask as their twins', () => {
  assert.ok(click('Clear history').includes('delete'), 'the English twin asks')
  for (const [cls, names] of Object.entries(GRID)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-654 controls: the clear verbs with other objects, the bare verbs and nouns, and statements stay free', () => {
  for (const name of ['Vider le panier', 'Vider', 'Limpiar filtros', 'Limpiar', 'Limpar filtros', 'Svuota carrello', 'Cache leeren', 'Verlauf', 'Historique', 'Historial',
    'Очистить фильтры', 'Очистить', 'キャッシュをクリア', 'Önbelleği temizle', 'Cache jetzt leeren', 'キャッシュをすべてクリア', 'Önbelleği şimdi temizle', 'Verlauf jetzt anzeigen',
    // r3: past and passive forms stay free
    'Geçmiş temizlendi', 'Arama geçmişi temizlendi', 'Geçmiş temizleniyor', '履歴をクリアしました', '履歴がクリアされました', '履歴をクリアした', '履歴クリア済み', '履歴のクリア完了', 'История очищена', 'Verlauf geleert', 'Historique vidé', 'Historial limpiado', '보내요', '지워졌습니다', 'Afficher l\'historique', 'Ver historial', 'Verlauf anzeigen']) assert.deepEqual(click(name), [], name)
})
