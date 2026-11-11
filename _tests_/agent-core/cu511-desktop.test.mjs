// CU-511 desktop rows (cu-developer-three, for table PR 24): the REAL desktop route - createAppPolicy with a live-granted
// scope, frontmostBundleId / target.origin = the app (app-policy passes url 'desktop://' to the class policy, so a rule
// keyed on the app must read the bundle, never an 'app:' url). Each way: the ruled control asks its class, a near benign
// control in the same app stays free.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

function desktop(app, name, role = 'AXButton') {
  const policy = createAppPolicy({ scope: [app] })
  policy.grantScope(app, { approved: true, answeredBy: 'live' })
  const verdict = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { frontmostBundleId: app, target: { origin: app, role, name } })
  return verdict.decision === 'allow' ? 'allow' : (verdict.classes ?? [verdict.class]).join('+')
}

test('CU-511 desktop: Office macro / Protected View controls ask install in Word and Excel; their benign neighbours stay free', () => {
  for (const app of ['com.microsoft.Word', 'com.microsoft.Excel']) {
    for (const name of ['Enable Content', 'Enable Macros', 'Run macro', 'Trust Document', 'Enable Editing']) {
      assert.match(desktop(app, name), /install/, `${app} ${name}`)
    }
    for (const name of ['Disable Macros', 'Close', 'Learn more']) assert.equal(desktop(app, name), 'allow', `${app} ${name}`)
  }
})

test('CU-511 desktop: mail-trust overrides ask permission in Apple Mail and Outlook; the benign neighbours stay free', () => {
  for (const app of ['com.apple.mail', 'com.microsoft.Outlook']) {
    for (const name of ['Trust this sender', 'This is not phishing', 'Add to safe senders', 'Mark as not spam', 'Always show images from this sender']) {
      assert.match(desktop(app, name), /permission/, `${app} ${name}`)
    }
    for (const name of ['Show images', 'Flag', 'Mark as read']) assert.equal(desktop(app, name), 'allow', `${app} ${name}`)
  }
})

test('CU-511 desktop: turning Gatekeeper off asks permission in a non-excluded admin app (button and menu); System Settings itself stays BLOCKED (excluded:os_security), never merely asked', () => {
  const admin = 'com.example.mdm-admin'
  for (const name of ['Disable Gatekeeper', 'Allow apps from anywhere']) {
    assert.match(desktop(admin, name), /permission/, name)
    assert.match(desktop(admin, name, 'AXMenuItem'), /permission/, `${name} (menu)`)
  }
  for (const name of ['App Store and identified developers', 'Learn more']) assert.equal(desktop(admin, name), 'allow', name)
  const settings = 'com.apple.systempreferences'
  const policy = createAppPolicy({ scope: [settings] })
  policy.grantScope(settings, { approved: true, answeredBy: 'live' })
  const verdict = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { frontmostBundleId: settings, target: { origin: settings, role: 'AXButton', name: 'Allow apps from anywhere' } })
  assert.equal(verdict.decision, 'block', 'System Settings is an excluded app: the row never lowers it to an ask')
})
