import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-619: calls and meeting joins ask submit in the seven locales, as English 'Call' / 'Join meeting' do. My own twin battery
// (infinitive, imperative, formal, with a noun or object, with an adverb), written before review.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://meet.example/room', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-619: call / join-meeting buttons ask submit in seven languages', () => {
  for (const name of ['Anrufen', 'Jetzt anrufen', 'Videoanruf starten', 'Meeting beitreten', 'Jetzt beitreten', 'Appeler', 'Appelez', 'Appel vidéo', 'Démarrer un appel', 'Rejoindre la réunion',
    'Rejoindre maintenant', 'Llamar', 'Videollamada', 'Iniciar una llamada', 'Unirse a la reunión', 'Únete a la reunión', 'Chamada de vídeo', 'Ligar para Ana', 'Entrar na reunião', 'Participar da reunião',
    'Chiama', 'Videochiamata', 'Avvia una chiamata', 'Partecipa alla riunione', 'Partecipa ora', 'Bellen', 'Nu bellen', 'Videogesprek starten', 'Deelnemen aan vergadering', 'Nu deelnemen',
    'Görüntülü arama', 'Sesli arama', 'Görüntülü ara', 'Toplantıya katıl', 'Toplantıya katılın', 'Şimdi katıl',
    'Rufen Sie uns an', 'Ruf Anna an', 'Treten Sie dem Meeting bei', 'Tritt jetzt bei', 'Rejoignez la réunion', 'Únase a la reunión', 'Llame ahora', 'Ligue para nós', 'Entre na reunião', 'Participe da reunião',
    'Chiami ora', 'Partecipi alla riunione', 'Bel nu', 'Bel Anna', 'Neem deel', 'Neem nu deel',
    'An Besprechung teilnehmen', 'Am Meeting teilnehmen', 'Jetzt teilnehmen', 'Nehmen Sie an der Besprechung teil', 'Nimm jetzt teil', 'Aramaya katıl', 'Aramaya katılın', 'Hemen ara']) assert.ok(click(name).includes('submit'), name)
})

test('CU-619 negatives: search, switch-on, call logs and meeting details stay free', () => {
  for (const name of ['Ara', 'Ligar', 'Ligar Wi-Fi', 'Anrufliste', 'Historique des appels', 'Llamadas recientes', 'Registro chiamate', 'Belgeschiedenis', 'Toplantı ayrıntıları', 'Meeting-Details', 'Détails de la réunion', 'Bel', 'Arayın', 'Ruf-Nummer', 'Neem contact op', 'Şimdi ara']) assert.deepEqual(click(name), [], name)
})
