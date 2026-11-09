import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-263 (design note 0.2): a human check - a CAPTCHA - is the person's to solve, as Operator hands it over. By the
// pressed target's name, a text CAPTCHA's entry name, or a challenge provider's frame (the target document's origin).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const WEB = 'https://shop.example/checkout'
const DESKTOP = 'desktop://'
const click = { type: 'click', x: 10, y: 10, button: 'left' }
const key = (...keys) => ({ type: 'keypress', keys })
const type = (text) => ({ type: 'type', text })
const drag = { type: 'drag', path: [{ x: 10, y: 10 }, { x: 200, y: 10 }] }
const judge = (action, target, url = WEB) => {
  const v = policy.classify(action, { url, target })
  return v.decision === 'handoff' ? `handoff:${v.rule}` : v.decision === 'allow' ? 'allow' : v.class
}
const box = (name, extra = {}) => ({ tag: 'div', role: 'checkbox', name, origin: 'https://shop.example', ...extra })

test('CU-263: a click on a control named as a human check hands off, on the web and on the desktop', () => {
  const names = ["I'm not a robot", 'I’m not a robot', 'I am not a robot', 'Im not a robot', 'I am human', 'Verify you are human',
    'Verify you are a human', 'Confirm you are human', "Prove you're not a robot", 'Confirm you are a real person', 'Human verification',
    'Select all images with traffic lights', 'Select all squares with crosswalks', 'Press & Hold to confirm you are a human (and not a bot)',
    '我不是机器人', '我不是機器人', '我是人类', '我是人類', '人机验证', '人機驗證', '进行人机身份验证', '确认您是真人', '確認您是真人']
  for (const name of names) {
    assert.equal(judge(click, box(name)), 'handoff:captcha', `web: ${name}`)
    assert.equal(judge(click, { role: 'AXCheckBox', name, origin: 'com.apple.Safari' }, DESKTOP), 'handoff:captcha', `desktop: ${name}`)
  }
})

test('CU-263: Space or Return on it, a double click and a drag pressed on it hand off too', () => {
  const target = box("I'm not a robot")
  for (const action of [key('SPACE'), key('ENTER'), { type: 'double_click', x: 10, y: 10, button: 'left' }, drag, type(' ')]) {
    assert.equal(judge(action, target), 'handoff:captcha', JSON.stringify(action))
  }
  assert.equal(judge(drag, { tag: 'div', role: 'button', name: 'Press & Hold to confirm you are a human' }), 'handoff:captcha', 'a press-and-hold check')
})

test('CU-263: a text CAPTCHA entry hands off typing into it; clicking into it does not', () => {
  for (const name of ['CAPTCHA', 'Enter the CAPTCHA', 'Type the characters you see', 'Type the text shown', '图形验证码', '圖片驗證碼']) {
    const entry = { tag: 'input', inputType: 'text', role: 'textbox', name, editable: true, origin: 'https://shop.example' }
    assert.equal(judge(type('x7Kp2'), entry), 'handoff:captcha', `type into ${name}`)
    assert.equal(judge(click, entry), 'allow', `click into ${name}`)
  }
})

test('CU-263: inside a challenge provider\'s frame any click, drag, key or typing hands off, whatever the name', () => {
  const origins = ['https://challenges.cloudflare.com', 'https://newassets.hcaptcha.com', 'https://hcaptcha.com', 'https://www.recaptcha.net',
    'https://client-api.arkoselabs.com', 'https://static.geetest.com', 'HTTPS://Challenges.Cloudflare.com']
  for (const origin of origins) {
    const inFrame = { tag: 'button', role: 'button', name: 'Verify', origin }
    for (const action of [click, drag, key('ENTER'), key('TAB'), type('abc'), { type: 'hold_key', keys: ['SPACE'] }]) {
      assert.equal(judge(action, inFrame), 'handoff:captcha', `${origin} ${action.type}`)
    }
  }
})

test('CU-263 round 2 (F1): the keyboard route - a key, typing or a click on a frame host titled for a challenge hands off', () => {
  const host = (name) => ({ tag: 'iframe', role: 'Iframe', name, editable: false, origin: 'https://shop.example' })
  for (const title of ['reCAPTCHA', 'Widget containing checkbox for hCaptcha security challenge', 'Widget containing a Cloudflare security challenge', 'DataDome CAPTCHA']) {
    for (const action of [key('SPACE'), key('ENTER'), type('x'), click]) {
      assert.equal(judge(action, host(title)), 'handoff:captcha', `${title}: ${action.type} ${action.keys?.join('+') ?? ''}`)
    }
  }
  // CU-300's followed focus: the inner check box carries its frame's title as frameHost.
  assert.equal(judge(key('SPACE'), { tag: 'div', role: 'checkbox', name: '', origin: 'https://shop.example', frameHost: { tag: 'iframe', role: 'Iframe', name: 'reCAPTCHA' } }), 'handoff:captcha', 'an inner check box under a reCAPTCHA frame')
  assert.notEqual(judge(key('SPACE'), host('Comments')), 'handoff:captcha', 'a comments frame is no challenge')
  assert.equal(judge(click, { role: 'AXGroup', name: 'reCAPTCHA', tag: 'iframe' }, DESKTOP), 'allow', 'the desktop reads no frame host')
})

test('CU-263 round 2 (F2, F3, F5): reCAPTCHA by frame path, DataDome by host, and the audio challenge entry', () => {
  const verifyIn = (frameUrl) => ({ tag: 'button', role: 'button', name: 'Verify', origin: 'https://www.google.com', frameUrl })
  for (const url of ['https://www.google.com/recaptcha/api2/bframe', 'https://www.google.com/recaptcha/enterprise/anchor', 'https://google.com/recaptcha/api2/anchor']) {
    assert.equal(judge(click, verifyIn(url)), 'handoff:captcha', url)
  }
  for (const url of ['https://www.google.com/maps/embed', 'https://www.google.com/', 'https://www.google.com.evil.example/recaptcha/api2/anchor']) {
    assert.equal(judge(click, verifyIn(url)), 'allow', `${url}: not a challenge`)
  }
  assert.equal(judge(click, { tag: 'button', role: 'button', name: 'Continue', origin: 'https://geo.captcha-delivery.com' }), 'handoff:captcha', 'a DataDome frame')
  assert.equal(judge(type('seven three'), { tag: 'input', role: 'textbox', name: 'Enter what you hear', editable: true, origin: 'https://shop.example' }), 'handoff:captcha', 'the audio challenge entry')
})

test('CU-263 round 3 (F7): a text CAPTCHA keyed character by character or pasted hands off too', () => {
  const entry = { tag: 'input', role: 'textbox', name: 'Enter the CAPTCHA', editable: true, origin: 'https://shop.example' }
  assert.equal(judge(key('X'), entry), 'handoff:captcha', 'a printable key')
  assert.equal(judge(key('SHIFT', '7'), entry), 'handoff:captcha', 'a shifted key')
  assert.equal(policy.classify(key('META', 'V'), { url: WEB, target: entry, paste: { fromOwner: false, text: 'x7Kp2' } }).rule, 'captcha', 'a keystroke paste')
  const pasteItem = { role: 'menuitem', name: 'Paste' }
  assert.equal(policy.classify(click, { url: WEB, target: pasteItem, paste: { fromOwner: false, text: 'x7Kp2', destination: entry } }).rule, 'captcha', 'a menu paste into it')
  assert.equal(judge(key('TAB'), entry), 'allow', 'Tab moves on')
  assert.equal(judge(key('META', 'A'), entry), 'allow', 'Command-A selects')
})

test('CU-263 round 2 (F6): the subdomain boundary holds', () => {
  for (const origin of ['https://myhcaptcha.com', 'https://recaptcha.net.evil.example', 'https://captcha-delivery.com.evil.example', 'https://notgeetest.com']) {
    assert.equal(judge(click, { tag: 'button', role: 'button', name: 'Continue', origin }), 'allow', origin)
  }
})

test('CU-263 negatives: a bare Verify, a terms box, a google.com frame, look-alike hosts and plain words stay as judged', () => {
  assert.equal(judge(click, { tag: 'button', role: 'button', name: 'Verify', origin: 'https://bank.example' }), 'allow', 'a bare Verify (named limit)')
  assert.equal(judge(click, box('I agree to the terms')), 'allow', 'a terms box')
  assert.equal(judge(click, box('Verify', { origin: 'https://www.google.com' })), 'allow', 'google.com frames carry maps and sign-in too')
  for (const origin of ['https://hcaptcha.com.evil.example', 'https://evilhcaptcha.com', 'https://challenges-cloudflare.com.example', 'com.apple.Safari', 'ai.reflection.cu.fixture', null]) {
    assert.equal(judge(click, { tag: 'button', role: 'button', name: 'Continue', origin }), 'allow', `origin ${origin}`)
  }
  for (const name of ['Human resources', 'Robots.txt', 'Verify email', 'Verify your identity', 'Select all', 'Recaptcha settings']) {
    assert.equal(judge(click, box(name)), 'allow', name)
  }
  // Typing into a field merely named like a check is not a press; a one-time code field (验证码) meets the D-061 value rules.
  assert.equal(judge(type('hello'), { tag: 'input', role: 'textbox', name: "I'm not a robot", editable: true }), 'allow', 'typing letters is no press')
  assert.equal(judge(type('482913'), { tag: 'input', role: 'textbox', name: '验证码', editable: true }), 'sensitive_data', 'a bare 验证码 is a one-time code')
  // A mouse move or a scroll over the check does nothing to it.
  assert.equal(judge({ type: 'scroll', x: 10, y: 10, scroll_x: 0, scroll_y: 100 }, box("I'm not a robot")), 'allow', 'a scroll')
})

test('CU-263 on the desktop as the loop calls it: app-policy hands a named check in an approved app to the person; in an approved browser D-089 refuses the page first', () => {
  // A native app's embedded sign-in sheet (Mail's account setup, a game launcher) can show a provider's check outside any browser.
  const MAIL = 'com.apple.mail'
  const SAFARI = 'com.apple.Safari'
  const apps = createAppPolicy({ scope: [MAIL, SAFARI] })
  apps.grantScope(MAIL, { approved: true, answeredBy: 'api' })
  apps.grantScope(SAFARI, { approved: true, answeredBy: 'api' })
  const at = (app, action, target) => apps.classify(action, { frontmostBundleId: app, target: { origin: app, fingerprint: 't', ...target } })
  for (const name of ["I'm not a robot", 'Verify you are human', '我不是机器人']) {
    const v = at(MAIL, click, { role: 'AXCheckBox', name })
    assert.deepEqual([v.decision, v.rule], ['handoff', 'captcha'], name)
    // D-089 (#204): a desktop target in an approved browser not read as outside the page is refused - stricter than the
    // hand-off, and the browser route (where CU-263 hands it off) is the place for pages.
    const inBrowser = at(SAFARI, click, { role: 'AXCheckBox', name })
    assert.deepEqual([inBrowser.decision, inBrowser.rule], ['block', 'browser_web_content'], `${name} in Safari`)
  }
  assert.equal(at(MAIL, click, { role: 'AXCheckBox', name: 'Remember me' }).decision, 'allow', 'a plain check box in the same app')
})

test('CU-263: a CAPTCHA hand-off is never pre-approved', () => {
  const lenient = createPolicy({ sitePolicy: () => 'allow', preApprovals: ['submit', 'permission', 'sensitive_data'].map((cls) => ({ class: cls })) })
  const v = lenient.classify(click, { url: WEB, target: box('Verify you are human') })
  assert.deepEqual([v.decision, v.rule], ['handoff', 'captcha'])
})

test('CU-263 in the loop: unattended, a click on the check is declined handoff_unavailable and never performed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-263-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.inspectPoint = async () => ({ ...box("I'm not a robot"), origin: 'http://127.0.0.1:43117', fingerprint: 'c' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
    const result = await runTask({ task: 'sign up', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const event = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    assert.deepEqual([event.decision, event.rule, event.status, event.code], ['handoff', 'captcha', 'declined', 'handoff_unavailable'])
    assert.equal(environment.log.length, 0, 'the click never reached the page')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
