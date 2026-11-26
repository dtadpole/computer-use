import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-830 (P2 under-ask, found in CU-824 test1): grant verbs the grammar did not read - 'Permit visitors to control the heating'
// went free while 'Let / Allow visitors ...' asks. cu-researcher's marker table r2 (OK 26 Nov 09:15Z): permit, authorize /
// authorise, empower and entitle read as 'allow' with a people slot, enable only as 'enable <people> to <act>', permit also with an
// access object; a past state, a noun, 'enable <feature>' and 'invite' keep main's verdict. Parity rows: each verb gives exactly the
// ask / free decision the 'Allow' form gives, on a web switch, a web button and a desktop check box. The class may differ where main's
// own rules already class the raw name (a synonym never outranks them, CU-481): 'Enable guests ...' is physical there, still an ask.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}) => verdict(policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target, ...extra }))
const HOME = 'com.example.homehub'
const sw = (name) => press('https://home.example/settings', { role: 'switch', tag: 'button', name, checked: false })
const button = (name) => press('https://home.example/settings', { role: 'button', tag: 'button', name })
const axcb = (name) => press(`desktop://${HOME}`, { role: 'AXCheckBox', name, checked: false, inWebArea: false, origin: HOME }, { frontmostBundleId: HOME })
const ROUTES = { sw, button, axcb }

// Shapes whose 'Allow' / 'Let' form asks on main (CU-824's device grant; the exposure rows of the visibility suites).
const SHAPES = ['%s visitors to control the thermostat', '%s guests to control the lights', '%s non-friends to see my posts',
  '%s guests to see my profile', '%s search engines to index my profile']
const FOLDED = ['Permit', 'Authorize', 'Authorise', 'Empower', 'Entitle']

test('CU-830: the filed row asks like its Allow form', () => {
  for (const [route, f] of Object.entries(ROUTES)) {
    assert.notEqual(f('Permit visitors to control the heating'), 'allow', route)
    assert.equal(f('Permit visitors to control the heating'), f('Allow visitors to control the heating'), route)
  }
})

test('CU-830: permit / authorize / authorise / empower / entitle over a people slot ask exactly as allow does', () => {
  for (const shape of SHAPES) {
    for (const [route, f] of Object.entries(ROUTES)) {
      const base = f(shape.replace('%s', 'Allow'))
      if (route === 'sw') assert.notEqual(base, 'allow', `the Allow form asks on main: ${shape} (sw)`)
      for (const verb of FOLDED) {
        const got = f(shape.replace('%s', verb))
        // CU-830 is the under-ask: wherever the Allow form asks, the verb asks. Where Allow is free (a button can be, under the site's
        // policy), the verb's verdict is main's own (e.g. an 'Authorize ...' button) - the head-vs-main probe judges that, not this row.
        if (base !== 'allow') assert.notEqual(got, 'allow', `${verb}: ${shape} (${route}) - free while Allow asks ${base}`)
      }
    }
  }
})

test("CU-830: enable folds only as 'enable <people> to <act>'", () => {
  for (const shape of SHAPES) {
    for (const [route, f] of Object.entries(ROUTES)) {
      const got = f(shape.replace('%s', 'Enable')); const base = f(shape.replace('%s', 'Allow'))
      assert.equal(got === 'allow', base === 'allow', `Enable: ${shape} (${route}) - ${got} vs Allow ${base}`)
    }
  }
  // 'enable <feature>' with no people word stays free.
  for (const f of Object.values(ROUTES)) assert.equal(f('Enable dark mode'), 'allow')
})

// Table r3 (cu-researcher OK with a bound, 26 Nov 10:47Z): 'search engine(s)' is a grantee only before policy.mjs's findability acts
// (index / find / show / list / link to / crawl). Row 1 is the class row above ('Permit search engines to index my profile'); these
// are its public review rows - ask / free parity on every route.
test('CU-830 r3: the search-engine grantee reads only before the findability acts', () => {
  const same = (name, twin) => {
    for (const [route, f] of Object.entries(ROUTES)) {
      const got = f(name); const base = f(twin)
      assert.equal(got === 'allow', base === 'allow', `${name} (${route}) - ${got} vs ${twin} ${base}`)
    }
  }
  // Row 2, negation: decides as its 'Do not allow' twin.
  same('Do not permit search engines to index my profile', 'Do not allow search engines to index my profile')
  // Row 3, other meaning: not read by the grantee - the decision of an unknown-grantee twin. ('Allow search engine suggestions' asks
  // physical: #595 re-reads 'Allow X' as 'turn on X' and 'engine' is in OBJECTS.phys - a main-side reading, outside CU-830.)
  same('Permit search engine suggestions', 'Permit weather widget suggestions')
  // Row 4, past event: decides as its 'allowed' twin.
  same('Search engines were permitted to index my profile', 'Search engines were allowed to index my profile')
  // The bound: before another act the grantee is not read either.
  same('Permit search engines to delete my posts', 'Permit weather widgets to delete my posts')
})

test('CU-830: nouns and past states stay free - one past-event row per added verb', () => {
  for (const name of ['Parking permit', 'Permit number', 'Permitted visitors', 'Authorized visitors', 'Empowered teams', 'Entitled members', 'Enabled features']) {
    for (const [route, f] of Object.entries(ROUTES)) assert.equal(f(name), 'allow', `${name} (${route})`)
  }
})
