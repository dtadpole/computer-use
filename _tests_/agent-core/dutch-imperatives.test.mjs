import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-641 (cu-developer-one's ruling, 17:42Z / 17:41Z correction): Dutch imperatives - the jij stem, the u form, infinitive-first
// and infinitive-final order, separable verbs with their particle at the end - ask as their English twins and Dutch infinitives.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const GRID = {
  submit: ['Verzend', 'Verzendt u', 'Verstuur', 'Verstuurt u', 'Stuur bericht', 'Stuurt u het bericht', 'Bericht sturen', 'Publiceer', 'Publiceert u',
    'Neem deel aan de vergadering', 'Neemt u deel aan de vergadering', 'Meld je af voor de nieuwsbrief', 'Meldt u zich af voor de nieuwsbrief', 'Schrijf je uit', 'Schrijft u zich uit'],
  delete: ['Verwijder uw account', 'Verwijdert u uw account', 'Account verwijderen', 'Wis account', 'Wis uw account', 'Account wissen', 'Wist u uw account', 'Wis geschiedenis',
    'Annuleer abonnement', 'Annuleer uw abonnement', 'Abonnement annuleren', 'Annuleert u uw abonnement', 'Zeg abonnement op', 'Zeg uw abonnement op', 'Zegt u uw abonnement op',
    'Hef uw account op', 'Heft u uw account op', 'Sluit uw account af', 'Maak de prullenbak leeg',
    'Wis je gegevens', 'Wis de gegevens', 'Wis alle bestanden', 'Wis je profiel', 'Gegevens wissen', 'Wist u uw gegevens'],
  purchase: ['Betaal', 'Betaalt u', 'Betaal nu', 'Koop nu', 'Koopt u nu', 'Bestel', 'Bestelt u', 'Maak het geld over', 'Maakt u het geld over', 'Reken af', 'Rekent u af',
    'Lidmaatschap annuleren', 'Annuleer uw lidmaatschap',
    'Plan annuleren', 'Annuleer je plan', 'Annuleert u uw plan', 'Zeg je plan op', 'Plan opzeggen', 'Pakket annuleren', 'Annuleer uw pakket', 'Zeg uw pakket op', 'Zegt u uw pakket op'],
  permission: ['Deel uw locatie', 'Deelt u uw locatie', 'Verleen toegang', 'Verleent u toegang', 'Nodig uit', 'Nodigt u uit', 'Sta toegang toe', 'Staat u toegang toe'],
}

test('CU-641: the Dutch stem x formality x order grid asks each English twin\'s class', () => {
  for (const [cls, names] of Object.entries(GRID)) for (const name of names) assert.ok(click(name).includes(cls), `${name} -> ${cls}`)
})

test('CU-641 controls: clear / filter / steering and bare collisions stay free', () => {
  for (const name of ['Stuur', 'Stuurwiel', 'Sturen', 'Wis', 'Wis zoekopdracht', 'Wis filters', 'Wis de filters', 'Bel', 'Plaats', 'Annuleer', 'Annuleren', 'Verzendkosten']) assert.deepEqual(click(name), [], name)
})
