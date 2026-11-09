import assert from 'node:assert/strict'
import { test } from 'node:test'

import { launchBrowserEnvironment } from '../../_environments_/chrome-browser/environment.mjs'
import { autofilledFields } from '../../_environments_/chrome-browser/page-scripts.mjs'
import { FakeConnection } from './fake-cdp.mjs'

// CU-319 (CU-302's driver half): a submit-like browser target carries the fields its submit would send that the
// browser autofilled - a saved login filled on load, never typed by the run - as descriptors, never values.

/** A DOM-like element: `autofill` true makes it match :autofill; `value` throws, so a read of it fails the test. */
function el(tagName, { type, role, href, form = null, autofill = false, webkitOnly = false, name } = {}) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    type,
    form,
    name,
    getAttribute: (attr) => (attr === 'role' ? role ?? null : attr === 'href' ? href ?? null : null),
    closest: () => null,
    matches: (selector) => {
      if (selector === ':autofill' && webkitOnly) throw new SyntaxError("':autofill' is not a valid selector")
      return (selector === ':autofill' || selector === ':-webkit-autofill') && autofill
    },
  }
  Object.defineProperty(node, 'value', { get() { throw new Error('the driver read a value') } })
  return node
}

function page(fields) {
  return { querySelectorAll: () => fields }
}

/** The fields of an autofilledFields answer (null stays null); each case starts with an empty memory. */
const fieldsOf = (answer) => (answer === null ? null : answer.fields)
const freshMemory = () => { delete globalThis.__cuAutofillSeen }

test('CU-319: a form\'s submit control and a text entry in it carry the form\'s autofilled fields - never a value', () => {
  freshMemory()
  const username = el('input', { type: 'email', autofill: true, name: 'user' })
  const password = el('input', { type: 'password', autofill: true, name: 'pass' })
  const notes = el('input', { type: 'text' })
  const form = { elements: [] }
  const submit = el('button', { type: 'submit', form })
  form.elements.push(username, password, notes, submit)
  assert.deepEqual(fieldsOf(autofilledFields(submit)), [username, password], 'the button: the two autofilled fields, not the typed one')
  assert.deepEqual(fieldsOf(autofilledFields(el('input', { type: 'submit', form }))), [username, password])
  assert.deepEqual(fieldsOf(autofilledFields(el('input', { type: 'image', form }))), [username, password])
  notes.form = form
  password.form = form
  assert.deepEqual(fieldsOf(autofilledFields(notes)), [username, password], 'a focused entry in the form (its Return submits)')
  assert.deepEqual(fieldsOf(autofilledFields(password)), [username, password], 'an autofilled entry itself counts too')
  const noneForm = { elements: [el('input', { type: 'text' }), el('input', { type: 'password' })] }
  assert.deepEqual(fieldsOf(autofilledFields(el('button', { type: 'submit', form: noneForm }))), [], 'a submit-like target with nothing autofilled: empty')
})

test('CU-319: a control outside any form carries its document\'s autofilled fields; anything else is no submit-like target', () => {
  freshMemory()
  const saved = el('input', { type: 'password', autofill: true })
  const doc = page([el('input', { type: 'text' }), saved])
  const outside = (tag, opts) => Object.assign(el(tag, opts), { ownerDocument: doc })
  assert.deepEqual(fieldsOf(autofilledFields(outside('button', { type: 'submit' }))), [saved], 'a form-less <button>')
  assert.deepEqual(fieldsOf(autofilledFields(outside('div', { role: 'button' }))), [saved], 'a script-driven [role=button] Sign in')
  assert.deepEqual(fieldsOf(autofilledFields(outside('a', { href: '#signin' }))), [saved], 'a link')
  assert.deepEqual(fieldsOf(autofilledFields(outside('input', { type: 'button' }))), [saved])
  const form = { elements: [saved] }
  // cu-researcher's F1: a script may submit on any control's click, inside a form too.
  assert.deepEqual(fieldsOf(autofilledFields(el('button', { type: 'button', form }))), [saved], "a type=button 'Sign in' inside the form")
  assert.deepEqual(fieldsOf(autofilledFields(el('div', { role: 'button', form }))), [saved], 'a [role=button] inside the form')
  assert.deepEqual(fieldsOf(autofilledFields(el('a', { href: '#', form }))), [saved], 'a link inside the form')
  // F2: an entry outside any form (Return handled by script) takes the document's fields.
  assert.deepEqual(fieldsOf(autofilledFields(outside('input', { type: 'text' }))), [saved], 'a form-less entry')
  assert.equal(autofilledFields(el('input', { type: 'checkbox', form })), null, 'a checkbox is no submit-like target')
  assert.equal(autofilledFields(outside('p', {})), null, 'a paragraph')
  assert.equal(autofilledFields(null), null)
})

test("CU-319: fields in open shadow roots are found too (sign-in web components, cu-researcher's N1)", () => {
  freshMemory()
  const hidden = el('input', { type: 'password', autofill: true })
  const host = Object.assign(el('sso-login', {}), { shadowRoot: { querySelectorAll: () => [hidden] } })
  const doc = { querySelectorAll: () => [host] }
  const signIn = Object.assign(el('button', { type: 'submit' }), { ownerDocument: doc })
  assert.deepEqual(fieldsOf(autofilledFields(signIn)), [hidden], 'a form-less Sign in: the password inside the component')
  const form = { elements: [], querySelectorAll: () => [host] }
  assert.deepEqual(fieldsOf(autofilledFields(el('button', { type: 'submit', form }))), [hidden], 'inside a form: its shadow roots too')
})

test('CU-319: an engine without :autofill falls back to :-webkit-autofill; at most 20 fields', () => {
  freshMemory()
  const old = el('input', { type: 'password', autofill: true, webkitOnly: true })
  const form = { elements: [old] }
  assert.deepEqual(fieldsOf(autofilledFields(el('button', { type: 'submit', form }))), [old])
  const many = { elements: Array.from({ length: 30 }, () => el('input', { type: 'text', autofill: true })) }
  assert.equal(fieldsOf(autofilledFields(el('button', { type: 'submit', form: many }))).length, 20)
  const isolated = new Function(`return (${autofilledFields.toString()})`)()
  assert.deepEqual(fieldsOf(isolated(el('button', { type: 'submit', form }))), [old], 'self-contained, as the driver runs it in the page')
})

test("CU-319: a field once seen autofilled stays reported, marked edited, after the run's typing cleared :autofill - the run's own typed field never is", () => {
  freshMemory()
  const form = { elements: [] }
  const password = el('input', { type: 'password', autofill: true, form })
  const own = el('input', { type: 'text', form })
  const submit = el('button', { type: 'submit', form })
  form.elements.push(password, own, submit)
  assert.deepEqual(autofilledFields(submit), { fields: [password], edited: [false] }, 'filled on load, seen at the first read')
  password.matches = () => false // the run typed one more character: Chrome cleared :autofill
  assert.deepEqual(autofilledFields(submit), { fields: [password], edited: [true] }, 'still reported, now as edited: a partial edit launders nothing')
  assert.deepEqual(autofilledFields(own), { fields: [password], edited: [true] }, 'from the focused entry too')
  freshMemory()
  assert.deepEqual(autofilledFields(submit), { fields: [], edited: [] }, 'a new document (a fresh world) remembers nothing; a field only the run typed is never reported')
})

/**
 * A page S1 with a sign-in form: backend 31 the Sign in button, 41 a saved username, 42 a saved password, 43 a typed
 * notes field. `world.scope` is what autofilledFields gives in the page: null (no submit-like target), or a list of
 * backend ids; `world.fails` makes the read throw.
 */
function harness(world) {
  const NODES = {
    31: { nodeName: 'BUTTON', backendNodeId: 31, attributes: ['type', 'submit'] },
    41: { nodeName: 'INPUT', backendNodeId: 41, attributes: ['type', 'email', 'autocomplete', 'username'] },
    42: { nodeName: 'INPUT', backendNodeId: 42, attributes: ['type', 'password', 'autocomplete', 'current-password'] },
    43: { nodeName: 'INPUT', backendNodeId: 43, attributes: ['type', 'text'] },
  }
  const AX = { 31: ['button', 'Sign in'], 41: ['textbox', 'Email'], 42: ['textbox', 'Password'], 43: ['textbox', ''] }
  const idOf = (params) => params.backendNodeId ?? Number(String(params.objectId ?? '').replace(/^node-/, ''))
  const connection = new FakeConnection({
    'DOM.getNodeForLocation': () => ({ result: { backendNodeId: world.hit ?? 31, frameId: 'F-S1' } }),
    'DOM.describeNode': (params) => ({ result: { node: NODES[idOf(params)] } }),
    'Accessibility.getPartialAXTree': (params) => {
      const [role, name] = AX[params.backendNodeId] ?? [null, '']
      return { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: role }, name: { value: name } }] } }
    },
    'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
    'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
    'Runtime.evaluate': () => ({ result: { result: { type: 'object', objectId: `node-${world.focus ?? 43}` } } }),
    'Runtime.getProperties': () => ({ result: { result: [...world.scope.map((id, index) => ({ name: String(index), value: { type: 'object', objectId: `node-${id}` } })), { name: 'length', value: { type: 'number', value: world.scope.length } }] } }),
    'Runtime.callFunctionOn': (params) => {
      const fn = params.functionDeclaration
      if (fn.includes(':-webkit-autofill')) {
        if (world.fails) throw Object.assign(new Error('Execution context was destroyed'), { code: -32000 })
        return { result: { result: world.scope === null ? { type: 'object', subtype: 'null', value: null } : { type: 'object', objectId: 'scope-1' } } }
      }
      if (fn.includes('return this.edited')) return { result: { result: { type: 'object', value: world.scope.map((id) => (world.edited ?? []).includes(id)) } } }
      if (fn.includes('return this.fields')) return { result: { result: { type: 'object', subtype: 'array', objectId: 'fields-1' } } }
      if (fn.includes('CONTROL_ROLES') && params.returnByValue === false) return { result: { result: { type: 'object', objectId: params.objectId } } }
      if (fn.includes('function (target)')) return { result: { result: { value: null } } }
      if (fn.includes('IMPLICIT')) return { result: { result: { type: 'object', subtype: 'null', value: null } } }
      if (fn.includes('NOT_TEXT_INPUTS')) {
        const id = idOf(params)
        return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: id !== 31, href: null, entryCaption: id === 43 ? 'Notes' : null } } } }
      }
      return { result: { result: { value: false } } }
    },
  })
  const options = {
    seat: 'cu-test-seat',
    viewport: { width: 1280, height: 800 },
    frame: { maxWidth: 960 },
    sitePolicy: (url) => (url.startsWith('http://127.0.0.1:43117') ? 'allow' : { block: 'not_allowed' }),
    isFixedDenied: () => false,
    resourceGate: async () => ({ setChromePid: () => {}, release: () => {} }),
    proxy: false,
    startChrome: async () => ({ wsUrl: 'ws://fake', child: { pid: 4242 }, profile: '/tmp/cu-test-seat-chrome-abcdef', stderr: () => '', stop: async () => {} }),
    connect: async () => connection,
  }
  return { connection, options }
}

test('CU-319: inspectPoint on a Sign in button carries the autofilled fields as descriptors; none, a failed read and no submit-like target each say so', async () => {
  const world = { scope: [41, 42] }
  const { options } = harness(world)
  const env = await launchBrowserEnvironment(options)
  const at = { x: 127, y: 326 }
  const button = await env.inspectPoint(at)
  assert.deepEqual([button.tag, button.name, button.autofillRead], ['button', 'Sign in', true])
  assert.deepEqual(button.autofilledFields, [
    { tag: 'input', inputType: 'email', name: 'Email', autocomplete: 'username', caption: null },
    { tag: 'input', inputType: 'password', name: 'Password', autocomplete: 'current-password', caption: null },
  ], 'descriptors only: tag, type, accessible name, autocomplete, caption')
  assert.ok(!JSON.stringify(button.autofilledFields).includes('value'), 'never a value')
  world.edited = [42]
  assert.deepEqual((await env.inspectPoint(at)).autofilledFields.map((f) => [f.autocomplete, f.edited]), [['username', undefined], ['current-password', true]], 'an autofilled field the run edited is still reported, marked edited')
  world.edited = []
  world.scope = [43]
  assert.deepEqual((await env.inspectPoint(at)).autofilledFields, [{ tag: 'input', inputType: 'text', name: '', autocomplete: null, caption: 'Notes' }], 'an unnamed field carries its caption, as any entry')
  world.scope = []
  const none = await env.inspectPoint(at)
  assert.deepEqual([none.autofillRead, 'autofilledFields' in none], [true, false], 'read, and nothing autofilled')
  assert.equal(none.fingerprint, button.fingerprint, 'the fingerprint ignores autofill')
  world.fails = true
  const unread = await env.inspectPoint(at)
  assert.deepEqual([unread.autofillRead, unread.autofilledFields], [false, null], 'a failed read on a control: agent core asks on its submit')
  world.fails = false
  world.scope = null
  const plain = await env.inspectPoint(at)
  assert.deepEqual(['autofillRead' in plain, 'autofilledFields' in plain], [false, false], 'no submit-like target: nothing added')
  await env.close()
})

test('CU-319: focusedElement on an entry of an autofilled form carries the form\'s fields, for its Return', async () => {
  const world = { scope: [41, 42], focus: 43 }
  const { options } = harness(world)
  const env = await launchBrowserEnvironment(options)
  const focused = await env.focusedElement()
  assert.deepEqual([focused.tag, focused.autofillRead, focused.autofilledFields.map((f) => f.autocomplete)], ['input', true, ['username', 'current-password']])
  assert.equal(focused.defaultButton, null, 'the default-button read is unchanged')
  await env.close()
})
