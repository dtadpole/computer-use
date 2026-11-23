import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-668 (cu-developer-one's design, 21 Nov 06:47Z): clearing browsing or site data asks delete in the locales whose clear verb does not
// ask alone, as 'Clear browsing data' does - both orders, slot words, negation, ja / ko politeness; nouns, show / settings labels, past
// forms, caches and other objects stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings/privacy', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-668: locale clear-data rows ask delete as their English twin (parity)', () => {
  for (const name of ['Vider les données de navigation', 'Videz les données du site', 'Vider toutes les données de navigation', 'Ne pas vider les données de navigation', 'Ne videz pas les données du site',
 'Limpiar datos de navegación', 'Limpia los datos del sitio', 'Limpiar todos los datos de navegación', 'No limpiar los datos de navegación', 'Vaciar datos de navegación',
 'Limpar dados de navegação', 'Limpe os dados do site', 'Limpar todos os dados de navegação', 'Não limpar os dados de navegação',
 'Svuota dati di navigazione', 'Svuotate i dati del sito', 'Non svuotare i dati di navigazione',
 'Browserdaten leeren', 'Websitedaten jetzt leeren', 'Leeren Sie die Browserdaten', 'Browserdaten nicht leeren', 'Daten der Website leeren',
 'Browsegegevens legen', 'Sitegegevens leegmaken', 'Leeg de browsegegevens', 'Browsegegevens nu wissen',
 'Очистить данные сайта', 'Очистите данные браузера', 'Данные сайта очистить', 'Не очищать данные сайта', 'ОЧИСТИТЬ ДАННЫЕ САЙТА',
 'Tarama verilerini temizle', 'Site verilerini temizleyin', 'Tarama verilerini şimdi temizle',
 '閲覧データをクリア', '閲覧データをクリアする', 'サイトデータをクリアしてください', '사이트 데이터 비우기', '사이트 데이터를 비워 주세요', 'Clear browsing data',
    // r2 (cu-developer-two, cu-developer-one 07:26Z): the ja / ko browser-data nouns
    'ブラウザのデータを空にする', 'ブラウザのデータを空にしてください', 'ブラウザーデータをクリア', '브라우저 데이터를 비우세요', '브라우저 데이터 비우기']) assert.ok(click(name).includes('delete'), name)
})

test('CU-668 controls: nouns, show / settings labels, past forms, caches and other objects stay free', () => {
  for (const name of ['Données de navigation', 'Afficher les données de navigation', 'Données de navigation effacées', 'Vider le cache', 'Vider le panier',
 'Datos de navegación', 'Configuración de datos de navegación', 'Datos borrados', 'Limpiar filtros', 'Limpiar caché',
 'Dados de navegação', 'Dados do site limpos', 'Limpar filtros', 'Dati di navigazione', 'Svuota il carrello',
 'Browserdaten', 'Browserdaten anzeigen', 'Browserdaten gelöscht', 'Cache leeren', 'Browsegegevens', 'Browsegegevens bekijken', 'Browsegegevens gewist',
 'Данные сайта', 'Очистить кэш', 'Tarama verileri', 'Tarama verileri temizlendi', '閲覧データ', '閲覧データをクリアしました', 'ブラウザのデータ', 'ブラウザのデータを空にしました', '브라우저 데이터', '브라우저 데이터를 비웠습니다', '사이트 데이터', '사이트 데이터를 비웠습니다', 'Clear cache']) assert.deepEqual(click(name), [], name)
})
