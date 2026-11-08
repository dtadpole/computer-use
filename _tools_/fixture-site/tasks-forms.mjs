/**
 * Form tasks: text fields, radio buttons, a native select, a custom listbox, a date picker, toggles, a
 * multi-step wizard and a sign-in whose password reaches the agent only as a secret reference.
 *
 * The native select is deliberately native: measured on 2026-11-01 in headless Chrome, a click opens a popup
 * that is not part of the page and does not commit keys, while Tab focus plus typed letters selects. That is
 * a real hurdle for a screenshot agent, so the task keeps it.
 */

import { defineTask, NO_PAGE_REPORT, oneRecord, sameText, text, verdict } from './common.mjs'
import { escapeHtml, jsonForScript, taskPage } from './pages.mjs'
import { pick, randomInt } from './seed.mjs'

const SOURCE = 'cu-verifier fixture suite, responsibilities item 2 (forms, dropdowns, date pickers)'
const PEOPLE = ['Ana Silva', 'Kenji Mori', 'Lena Novak', 'Omar Haddad', 'Priya Raman']
const TOPICS = ['Billing', 'Technical support', 'Partnership']
const MESSAGES = ['Please send me the March invoice again.', 'The export button does nothing on my account.', 'We would like to discuss a reseller agreement.']
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const squash = (value) => text(value).replace(/\s+/g, ' ')

const contact = defineTask({
  id: 'contact-form',
  kind: 'task',
  title: 'Send a contact message',
  source: SOURCE,
  prompt: (e) => `Send a message through the contact form as ${e.name} (${e.email}), topic "${e.topic}", with the message: ${e.message}`,
  // Typing an email address is personal data to agent-core's policy (R29), so it is asked about before the submit.
  consent: { classes: ['submit', 'sensitive_data'] },
  expect: (rng) => {
    const name = pick(rng, PEOPLE)
    return { name, email: `${slug(name).replace('-', '.')}@example.test`, topic: pick(rng, TOPICS), message: pick(rng, MESSAGES) }
  },
  evaluate: (facts, e) =>
    oneRecord(facts?.records, {
      noun: 'message',
      none: 'no message was sent',
      check: (r) =>
        !sameText(r.name, e.name) ? `the name was ${JSON.stringify(r.name)}`
        : !sameText(r.email, e.email) ? `the email was ${JSON.stringify(r.email)}`
        : r.topic !== e.topic ? `the topic was ${JSON.stringify(r.topic)}`
        : squash(r.message) !== squash(e.message) ? `the message was ${JSON.stringify(r.message)}`
        : null,
    }),
  render: (e, context = {}) => {
    const sent = context.url?.searchParams.has('sent')
    const topics = TOPICS.map((topic) => `<label><input type="radio" name="topic" value="${escapeHtml(topic)}" data-target="topic-${slug(topic)}"> ${escapeHtml(topic)}</label>`).join('\n')
    return taskPage('contact-form', {
      title: 'Contact us',
      body: `<main>
<h1>Contact us</h1>
${sent ? '<p id="result"><strong>Thanks, your message was sent.</strong></p>' : ''}${context.error ? `<p id="result">${escapeHtml(context.error)}</p>` : ''}
<form method="post" action="/tasks/contact-form/messages">
<label class="field"><span>Name</span><input name="name" autocomplete="off" data-target="name"></label>
<label class="field"><span>Email</span><input name="email" type="email" autocomplete="off" data-target="email"></label>
<fieldset class="field" style="border:0;padding:0"><span style="font-weight:600">Topic</span><div style="display:flex;gap:16px">${topics}</div></fieldset>
<label class="field"><span>Message</span><textarea name="message" data-target="message"></textarea></label>
<button type="submit" data-target="send">Send message</button>
</form>
</main>`,
      script: `report({ sent: ${sent ? 'true' : 'false'} })`,
    })
  },
  routes: {
    'POST messages': ({ form, addRecord, render }) => {
      const fields = Object.fromEntries(['name', 'email', 'topic', 'message'].map((key) => [key, (form?.get(key) ?? '').slice(0, 500)]))
      if (Object.values(fields).some((value) => value.trim() === '')) return { status: 422, html: render({ error: 'Fill in every field.' }) }
      const record = addRecord({ kind: 'message', ...fields })
      return { redirect: `/tasks/contact-form/?sent=${record.id}` }
    },
  },
})

/** The native select's options; every first letter is unique, so typing one letter on the focused select picks it. */
export const COUNTRIES = Object.freeze([
  ['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico'], ['FR', 'France'],
  ['DE', 'Germany'], ['JP', 'Japan'], ['BR', 'Brazil'], ['IN', 'India'],
])

const nativeSelect = defineTask({
  id: 'native-select',
  kind: 'task',
  title: 'Choose a country in a native select',
  source: SOURCE,
  prompt: (e) => `Set the shipping country to ${e.countryName} and click Save.`,
  expect: (rng) => {
    const [country, countryName] = pick(rng, COUNTRIES)
    return { country, countryName }
  },
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.saved === e.country) return verdict(true, `${e.countryName} was saved`)
    if (page.country === e.country) return verdict(false, `${e.countryName} is selected but Save was not clicked`)
    return verdict(false, `the saved country is ${JSON.stringify(page.saved ?? '')}, expected ${e.country}`)
  },
  render: () =>
    taskPage('native-select', {
      title: 'Shipping',
      body: `<main>
<h1>Shipping address</h1>
<label class="field"><span>Recipient</span><input id="recipient" value="Jordan Lee" data-target="recipient"></label>
<label class="field"><span>Country</span><select id="country" data-target="country"><option value="">Choose a country</option>
${COUNTRIES.map(([code, name]) => `<option value="${code}">${escapeHtml(name)}</option>`).join('\n')}
</select></label>
<button id="save" type="button" data-target="save">Save</button>
<output id="result"></output>
</main>`,
      script: `const select = document.getElementById('country')
let saved = ''
const send = () => report({ country: select.value, saved })
select.addEventListener('change', send)
document.getElementById('save').addEventListener('click', () => {
  saved = select.value
  document.getElementById('result').textContent = saved ? 'Saved.' : 'Choose a country first.'
  send()
})
send()`,
    }),
})

export const SIZES = Object.freeze([['XS', 'Extra small'], ['S', 'Small'], ['M', 'Medium'], ['L', 'Large'], ['XL', 'Extra large']])

const customDropdown = defineTask({
  id: 'custom-dropdown',
  kind: 'task',
  title: 'Choose a size in a custom listbox',
  source: SOURCE,
  prompt: (e) => `Choose the size ${e.label} for the trail jacket and click Add to cart.`,
  expect: (rng) => {
    const [size, label] = pick(rng, SIZES)
    return { size, label }
  },
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.added === e.size) return verdict(true, `size ${e.size} was added to the cart`)
    if (page.size === e.size) return verdict(false, `size ${e.size} is chosen but Add to cart was not clicked`)
    return verdict(false, `the cart holds size ${JSON.stringify(page.added ?? '')}, expected ${e.size}`)
  },
  render: () =>
    taskPage('custom-dropdown', {
      title: 'Trail jacket',
      head: '<style>.listbox{list-style:none;margin:4px 0 0;padding:4px;border:1px solid #c7c7cc;border-radius:8px;width:260px;background:#fff}.listbox li{padding:8px 12px;border-radius:6px;cursor:pointer}.listbox li:hover{background:#eef4ff}</style>',
      body: `<main>
<h1>Trail jacket</h1>
<p class="muted">Waterproof shell, $189.</p>
<div class="field"><span>Size</span>
<button id="size-button" class="secondary" type="button" aria-haspopup="listbox" aria-expanded="false" data-target="size-button">Choose a size</button>
<ul id="sizes" class="listbox" role="listbox" hidden>
${SIZES.map(([code, label]) => `<li role="option" data-value="${code}" data-target="option-${code.toLowerCase()}">${escapeHtml(label)}</li>`).join('\n')}
</ul></div>
<button id="add" type="button" data-target="add">Add to cart</button>
<output id="result"></output>
</main>`,
      script: `const button = document.getElementById('size-button')
const list = document.getElementById('sizes')
let size = ''
let added = ''
const send = () => report({ size, added, open: !list.hidden })
button.addEventListener('click', () => { list.hidden = !list.hidden; button.setAttribute('aria-expanded', String(!list.hidden)); send() })
for (const option of list.querySelectorAll('li')) option.addEventListener('click', () => {
  size = option.dataset.value
  button.textContent = 'Size: ' + option.textContent
  list.hidden = true
  button.setAttribute('aria-expanded', 'false')
  send()
})
document.getElementById('add').addEventListener('click', () => {
  added = size
  document.getElementById('result').textContent = size ? 'Added to cart.' : 'Choose a size first.'
  send()
})
send()`,
    }),
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const datePicker = defineTask({
  id: 'date-picker',
  kind: 'task',
  title: 'Book a date in a calendar widget',
  source: SOURCE,
  prompt: (e) => `Book a table for ${MONTHS[e.month]} ${e.day}, ${e.year}: pick the date in the calendar and click Confirm booking.`,
  expect: (rng) => {
    const baseMonth = randomInt(rng, 0, 10)
    const year = 2027
    const day = randomInt(rng, 1, 28)
    const month = baseMonth + 1
    return { year, baseMonth, month, day, iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
  },
  evaluate(facts, e) {
    const page = facts?.page
    if (!page) return verdict(false, NO_PAGE_REPORT)
    if (page.confirmed === e.iso) return verdict(true, `${e.iso} was booked`)
    if (page.value === e.iso) return verdict(false, `${e.iso} is picked but Confirm booking was not clicked`)
    return verdict(false, `the booking holds ${JSON.stringify(page.confirmed || page.value || '')}, expected ${e.iso}`)
  },
  render: (e) =>
    taskPage('date-picker', {
      title: 'Book a table',
      head: '<style>.cal{width:320px;border:1px solid #d2d2d7;border-radius:8px;padding:12px;margin:8px 0 16px}.cal header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.cal .grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal .grid button{padding:6px 0;background:#fff;color:#1d1d1f;border:1px solid #e5e5ea}.cal .grid button.picked{background:#0071e3;color:#fff}.cal .dow{font-size:12px;text-align:center;color:#6e6e73}</style>',
      body: `<main>
<h1>Book a table</h1>
<label class="field"><span>Date</span><input id="date" readonly placeholder="Pick a date" data-target="date"></label>
<div class="cal"><header><button id="prev" class="secondary" type="button" aria-label="Previous month" data-target="prev-month">&lsaquo;</button>
<strong id="title"></strong><button id="next" class="secondary" type="button" aria-label="Next month" data-target="next-month">&rsaquo;</button></header>
<div class="grid" id="grid"></div></div>
<button id="confirm" type="button" data-target="confirm">Confirm booking</button>
<output id="result"></output>
</main>`,
      script: `const MONTHS = ${jsonForScript(MONTHS)}
let year = ${Number(e.year)}, month = ${Number(e.baseMonth)}, value = '', confirmed = ''
const pad = (n) => String(n).padStart(2, '0')
const send = () => report({ shownYear: year, shownMonth: month, value, confirmed })
function draw() {
  document.getElementById('title').textContent = MONTHS[month] + ' ' + year
  const grid = document.getElementById('grid')
  grid.textContent = ''
  for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) { const s = document.createElement('span'); s.className = 'dow'; s.textContent = d; grid.append(s) }
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  for (let i = 0; i < offset; i += 1) grid.append(document.createElement('span'))
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  for (let day = 1; day <= days; day += 1) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = day
    b.dataset.target = 'day-' + day
    const iso = year + '-' + pad(month + 1) + '-' + pad(day)
    if (iso === value) b.className = 'picked'
    b.addEventListener('click', () => { value = iso; document.getElementById('date').value = MONTHS[month] + ' ' + day + ', ' + year; draw(); send() })
    grid.append(b)
  }
}
function shift(delta) { month += delta; if (month < 0) { month = 11; year -= 1 } if (month > 11) { month = 0; year += 1 } draw(); send() }
document.getElementById('prev').addEventListener('click', () => shift(-1))
document.getElementById('next').addEventListener('click', () => shift(1))
document.getElementById('confirm').addEventListener('click', () => {
  confirmed = value
  document.getElementById('result').textContent = value ? 'Booked for ' + document.getElementById('date').value + '.' : 'Pick a date first.'
  send()
})
draw()
send()`,
    }),
})

const DIGESTS = ['daily', 'weekly', 'never']

const settings = defineTask({
  id: 'settings-toggles',
  kind: 'task',
  title: 'Change notification settings',
  source: SOURCE,
  prompt: (e) => `Turn on email notifications, turn off SMS notifications, set the digest to ${e.digest}, then click Save settings.`,
  expect: (rng) => ({ email: true, sms: false, digest: pick(rng, ['weekly', 'never']) }),
  evaluate(facts, e) {
    const saved = (facts?.records ?? []).filter((r) => r.kind === 'settings')
    if (saved.length === 0) return verdict(false, 'the settings were never saved')
    const last = saved.at(-1)
    const wrong = ['email', 'sms', 'digest'].filter((key) => last[key] !== e[key])
    if (wrong.length) return verdict(false, `the saved settings differ in ${wrong.join(', ')}`)
    return verdict(true, 'the saved settings match')
  },
  render: (e, context = {}) => {
    const last = (context.records ?? []).filter((r) => r.kind === 'settings').at(-1) ?? { email: false, sms: true, digest: 'daily' }
    return taskPage('settings-toggles', {
      title: 'Notification settings',
      body: `<main>
<h1>Notification settings</h1>
${context.url?.searchParams.has('saved') ? '<p id="result"><strong>Settings saved.</strong></p>' : ''}
<form method="post" action="/tasks/settings-toggles/save">
<p><label><input type="checkbox" name="email"${last.email ? ' checked' : ''} data-target="email"> Email notifications</label></p>
<p><label><input type="checkbox" name="sms"${last.sms ? ' checked' : ''} data-target="sms"> SMS notifications</label></p>
<fieldset class="field" style="border:0;padding:0"><span style="font-weight:600">Digest</span><div style="display:flex;gap:16px">
${DIGESTS.map((d) => `<label><input type="radio" name="digest" value="${d}"${last.digest === d ? ' checked' : ''} data-target="digest-${d}"> ${d[0].toUpperCase()}${d.slice(1)}</label>`).join('\n')}
</div></fieldset>
<button type="submit" data-target="save">Save settings</button>
</form>
</main>`,
      script: 'report({})',
    })
  },
  routes: {
    'POST save': ({ form, addRecord }) => {
      const digest = form?.get('digest')
      addRecord({ kind: 'settings', email: form?.get('email') === 'on', sms: form?.get('sms') === 'on', digest: DIGESTS.includes(digest) ? digest : '' })
      return { redirect: '/tasks/settings-toggles/?saved=1' }
    },
  },
})

const PLANS = ['Starter', 'Team', 'Enterprise']
const COMPANIES = ['Northwind', 'Globex', 'Initech', 'Umbrella Labs', 'Stark Freight']

const wizard = defineTask({
  id: 'signup-wizard',
  kind: 'task',
  title: 'Create a workspace in a three-step wizard',
  source: SOURCE,
  prompt: (e) => `Use the setup wizard to create a workspace on the ${e.plan} plan for the company ${e.company}.`,
  expect: (rng) => ({ plan: pick(rng, PLANS), company: pick(rng, COMPANIES) }),
  evaluate: (facts, e) =>
    oneRecord(facts?.records, {
      noun: 'workspace',
      none: 'no workspace was created',
      check: (r) => (r.plan !== e.plan ? `the plan was ${JSON.stringify(r.plan)}` : !sameText(r.company, e.company) ? `the company was ${JSON.stringify(r.company)}` : null),
    }),
  render: (e, context = {}) =>
    taskPage('signup-wizard', {
      title: 'Workspace setup',
      body: `<main>
<h1>Workspace setup</h1>
${context.url?.searchParams.has('created') ? '<p id="result"><strong>Workspace created.</strong></p>' : ''}
<p class="muted" id="step-label">Step 1 of 3 - Plan</p>
<section id="step-1">
${PLANS.map((p) => `<p><label><input type="radio" name="plan" value="${p}" data-target="plan-${p.toLowerCase()}"> ${p}</label></p>`).join('\n')}
<button type="button" id="next-1" data-target="next-1">Next</button>
</section>
<section id="step-2" hidden>
<label class="field"><span>Company name</span><input id="company" autocomplete="off" data-target="company"></label>
<button type="button" id="back-2" class="secondary" data-target="back-2">Back</button> <button type="button" id="next-2" data-target="next-2">Next</button>
</section>
<section id="step-3" hidden>
<p>Plan: <strong id="review-plan"></strong></p><p>Company: <strong id="review-company"></strong></p>
<form method="post" action="/tasks/signup-wizard/workspaces"><input type="hidden" name="plan" id="f-plan"><input type="hidden" name="company" id="f-company">
<button type="button" id="back-3" class="secondary" data-target="back-3">Back</button> <button type="submit" data-target="create">Create workspace</button></form>
</section>
<output id="result-msg"></output>
</main>`,
      script: `let step = 1
const labels = ['Plan', 'Company', 'Review']
const plan = () => (document.querySelector('input[name=plan]:checked') || {}).value || ''
const company = () => document.getElementById('company').value
const send = () => report({ step, plan: plan(), company: company() })
function go(next) {
  if (step === 1 && next === 2 && !plan()) { document.getElementById('result-msg').textContent = 'Choose a plan.'; return }
  if (step === 2 && next === 3 && !company().trim()) { document.getElementById('result-msg').textContent = 'Enter a company name.'; return }
  document.getElementById('result-msg').textContent = ''
  step = next
  for (const n of [1, 2, 3]) document.getElementById('step-' + n).hidden = n !== step
  document.getElementById('step-label').textContent = 'Step ' + step + ' of 3 - ' + labels[step - 1]
  document.getElementById('review-plan').textContent = plan()
  document.getElementById('review-company').textContent = company()
  document.getElementById('f-plan').value = plan()
  document.getElementById('f-company').value = company()
  send()
}
document.getElementById('next-1').addEventListener('click', () => go(2))
document.getElementById('next-2').addEventListener('click', () => go(3))
document.getElementById('back-2').addEventListener('click', () => go(1))
document.getElementById('back-3').addEventListener('click', () => go(2))
for (const r of document.querySelectorAll('input[name=plan]')) r.addEventListener('change', send)
document.getElementById('company').addEventListener('input', send)
send()`,
    }),
  routes: {
    'POST workspaces': ({ form, addRecord, render }) => {
      const plan = form?.get('plan') ?? ''
      const company = (form?.get('company') ?? '').slice(0, 100)
      if (!PLANS.includes(plan) || company.trim() === '') return { status: 422, html: render() }
      addRecord({ kind: 'workspace', plan, company })
      return { redirect: '/tasks/signup-wizard/?created=1' }
    },
  },
})

const USERS = ['m.lopez', 'j.chen', 'a.okafor']
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

const signIn = defineTask({
  id: 'sign-in',
  kind: 'task',
  title: 'Sign in with a secret password',
  source: `${SOURCE}; R33 secrets outside model context`,
  prompt: (e) => `Sign in to the staff portal as ${e.username}. The password is the secret named staff_password; never write it in your answer.`,
  consent: { classes: ['credential'] },
  secrets: (e) => ({ staff_password: e.password }),
  expect: (rng) => ({
    username: pick(rng, USERS),
    password: Array.from({ length: 14 }, () => PASSWORD_CHARS[randomInt(rng, 0, PASSWORD_CHARS.length - 1)]).join(''),
  }),
  evaluate(facts, e) {
    const logins = (facts?.records ?? []).filter((r) => r.kind === 'login')
    const good = logins.filter((r) => r.ok && r.username === e.username)
    const failed = logins.filter((r) => !r.ok).length
    if (good.length === 0) return verdict(false, logins.length ? `no successful sign-in (${failed} failed)` : 'no sign-in was attempted')
    return verdict(true, `signed in as ${e.username}${failed ? ` after ${failed} failed attempt(s)` : ''}`)
  },
  render: (e, context = {}) =>
    taskPage('sign-in', {
      title: 'Staff portal',
      body: `<main>
<h1>Staff portal</h1>
${context.error ? `<p id="result">${escapeHtml(context.error)}</p>` : ''}
<form method="post" action="/tasks/sign-in/login">
<label class="field"><span>Username</span><input name="username" autocomplete="username" data-target="username"></label>
<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" data-target="password"></label>
<button type="submit" data-target="submit">Sign in</button>
</form>
</main>`,
      script: 'report({ signedIn: false })',
    }),
  routes: {
    'POST login': ({ form, expected, addRecord, render }) => {
      const username = (form?.get('username') ?? '').trim().slice(0, 100)
      const ok = username === expected.username && (form?.get('password') ?? '') === expected.password
      // The password itself is never stored, so no state endpoint or log can leak it.
      const record = addRecord({ kind: 'login', username, ok })
      if (!ok) return { status: 422, html: render({ error: 'Wrong username or password.' }) }
      return { redirect: `/tasks/sign-in/dashboard/${record.id}` }
    },
    'GET dashboard/:id': ({ params, findRecord }) => {
      const record = findRecord(Number(params.id))
      if (!record?.ok) return { status: 403, html: taskPage('sign-in', { title: 'Staff portal', body: '<main><h1>Not signed in</h1></main>', script: 'report({ signedIn: false })' }) }
      return {
        html: taskPage('sign-in', {
          title: 'Staff portal - dashboard',
          body: `<main><h1>Welcome, ${escapeHtml(record.username)}</h1><p>You are signed in.</p></main>`,
          script: 'report({ signedIn: true })',
        }),
      }
    },
  },
})

export const TASKS = Object.freeze([contact, nativeSelect, customDropdown, datePicker, settings, wizard, signIn])
