import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-657 (cu-developer-one's design, 20 Nov 16:47Z): IT / NL / PT / TR 'empty trash' takes the slots CU-655 gave the other six
// locales - words before the noun, the noun before a final verb in NL and TR, a trailing adverb, negation as its twin - and asks
// delete as 'Empty trash'; past forms, other objects, opening the trash and the bare nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/files/trash') => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const ASK = [
  'Svuota tutto il cestino', 'Svuota il tuo cestino', 'Svuotare il cestino ora', 'Svuotate il cestino', 'Svuoti il cestino', 'Non svuotare il cestino',
  'Leeg de prullenbak nu', 'Maak de prullenbak leeg', 'Maak de prullenbak nu leeg', 'Prullenbak nu legen', 'De prullenbak helemaal leegmaken', 'Prullenbak niet legen', 'Prullenbak leeg maken',
  'Esvaziar toda a lixeira', 'Esvaziar sua lixeira', 'Esvazie a lixeira agora', 'Esvaziem a lixeira', 'Não esvaziar a lixeira', 'Esvaziar a reciclagem agora',
  'Çöp kutusunu şimdi boşalt', 'Çöp kutusunu boşaltın', 'Çöp kutusunu boşaltınız', 'Çöp kutusunu boşaltma', 'Tüm çöp kutusunu boşalt', 'Çöp kutusunu temizle', 'Çöpü boşalt', 'Çöpü boşaltma', 'ÇÖP KUTUSUNU BOŞALT',
]

test('CU-657: IT / NL / PT / TR empty trash with any CU-655 slot asks delete, as its English twin does', () => {
  for (const name of ['Empty trash', 'Empty all trash', 'Empty the trash now', "Don't empty trash", 'Empty trash completely']) assert.ok(click(name).includes('delete'), `the English twin '${name}' asks`)
  for (const name of ASK) assert.ok(click(name).includes('delete'), `${name} -> delete`)
})

test('CU-657 controls: past forms, other objects, opening the trash and the bare nouns stay free', () => {
  for (const name of ['Cestino svuotato', 'Il cestino è stato svuotato', 'Prullenbak geleegd', 'De prullenbak is geleegd', 'Lixeira esvaziada', 'A lixeira foi esvaziada', 'Çöp kutusu boşaltıldı', 'Otomatik çöp kutusu boşaltma', 'Svuotamento del cestino', 'Esvaziamento da lixeira',
    'Svuota il carrello', 'Winkelwagen legen', 'Leeg de winkelwagen', 'Esvaziar o carrinho', 'Sepeti boşalt',
    'Apri il cestino', 'Prullenbak openen', 'Abrir lixeira', 'Çöp kutusunu aç', 'Cestino', 'Prullenbak', 'Lixeira', 'Çöp kutusu',
    // five words between the noun and the verb stay out, as in CU-644 / CU-654 / CU-655
    'Prullenbak van al mijn oude apparaten op de server legen']) assert.deepEqual(click(name), [], name)
})
