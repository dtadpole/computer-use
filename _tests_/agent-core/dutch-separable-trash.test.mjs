import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-800 (P1; follow-up to CU-777, found by cu-verifier): the Dutch separable trash verb as a bare button - 'Leegmaken',
// 'Leeghalen', 'Leeg maken' - under a trash dialog acts unasked, while its English twin 'Empty' asks delete.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-800-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName } })
const onDesktop = (name, dialogName) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName } })

test('CU-800: the filed rows, verbatim, ask delete on both routes', () => {
  for (const [name, title] of [
    ['Leegmaken', 'Moet de prullenbak nu worden geleegd?'],
    ['Leeghalen', 'Wil je de prullenbak leeghalen?'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${name} | ${title}`)
    assert.ok(classes(onDesktop(name, title)).includes('delete'), `desktop ${name} | ${title}`)
  }
})

test('CU-800: the class - the separable and two-word spellings, their participles, the separable imperative', () => {
  for (const [name, title] of [
    ['Leeg maken', 'Moet de prullenbak nu worden geleegd?'],
    ['Leeghalen', 'Moet de prullenbak worden leeggehaald?'],
    ['Leeg halen', 'Wil je de prullenbak leeg halen?'],
    ['Leegmaken', 'Wil je de prullenbak leegmaken?'],
    ['Leegmaken', 'Blijft de prullenbak daarna leeggemaakt?'],
    ['Leegruimen', 'Moet de prullenbak worden leeggeruimd?'],
    ['OK', 'Haal de prullenbak nu leeg'],
  ]) {
    assert.ok(classes(onWeb(name, title)).includes('delete'), `web ${name} | ${title}`)
  }
})

test('CU-800: the English twin asks, as on main', () => {
  assert.ok(classes(onWeb('Empty', 'Should the trash be emptied now?')).includes('delete'))
})

test('CU-800: near rows stay free of delete - a field or form, a mismatched button, a completed notice', () => {
  for (const [name, title] of [
    ['Leegmaken', 'Moet het zoekveld nu worden geleegd?'],
    ['Leeghalen', 'Wil je het formulier leeghalen?'],
    ['Openen', 'Moet de prullenbak nu worden geleegd?'],
    ['Leegmaken', 'De prullenbak is leeggemaakt.'],
  ]) {
    assert.ok(!classes(onWeb(name, title)).includes('delete'), `web ${name} | ${title}`)
  }
})
