// The live view page: DOM wiring only. Every decision is in ui-logic.mjs, which has unit tests.
import { consentView, controlsFor, describeEvent, initialView, keyInput, mouseInput, pageFor, reduce, wheelInput } from './ui-logic.mjs'

const token = new URLSearchParams(location.search).get('token') ?? ''
const $ = (id) => document.getElementById(id)
let view = initialView()
let attentionShown = false

$('screen').src = `/screen?token=${encodeURIComponent(token)}`

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const answer = await response.json().catch(() => ({ ok: false, error: 'no answer' }))
  if (!answer.ok) log(`refused: ${answer.error}`)
  return answer
}
const command = (name, fields = {}) => post('/control', { command: name, ...fields })

function log(text) {
  const item = document.createElement('li')
  item.textContent = `${new Date().toLocaleTimeString()} ${text}`
  $('log').prepend(item)
  while ($('log').children.length > 200) $('log').lastChild.remove()
}

function beep() {
  try {
    const audio = new AudioContext()
    const tone = audio.createOscillator()
    tone.frequency.value = 880
    tone.connect(audio.destination)
    tone.start()
    tone.stop(audio.currentTime + 0.25)
  } catch { /* audio may be blocked until the person interacts */ }
}

function render() {
  const page = pageFor(view)
  $('state').textContent = view.state
  $('state').dataset.state = view.state
  // Stable for verifiers: running, paused, taken_over, awaiting_consent, finished; the environment; who paused.
  document.body.dataset.state = view.state
  document.body.dataset.kind = view.kind ?? ''
  document.body.dataset.pausedBy = view.pausedBy ?? ''
  $('who').textContent = view.source === 'control' ? '(control)' : view.source === 'view' ? '(watching)' : ''
  for (const [id, hidden] of Object.entries(page.hidden)) $(id).hidden = hidden
  for (const [id, disabled] of Object.entries(page.disabled)) $(id).disabled = disabled
  $('screen').classList.toggle('driving', page.controls.drive)
  $('screen').alt = page.screenLabel
  if (view.dialog) $('dialog-text').textContent = `${view.dialog.type}: ${view.dialog.message}`
  $('notice-text').textContent = page.notice?.text ?? ''
  $('notice').dataset.kind = page.notice?.kind ?? ''
  renderConsents(page.controls.consent)
  $('attention').hidden = !page.attention
  $('attention').textContent = page.attentionText
  if (page.attention && !attentionShown) beep()
  attentionShown = page.attention
  document.title = page.title
}

function renderConsents(canAnswer) {
  const box = $('consents')
  box.replaceChildren()
  for (const request of view.pending) {
    const shown = consentView(request, canAnswer)
    const row = document.createElement('div')
    row.className = 'consent'
    const text = document.createElement('p')
    text.textContent = shown.text
    row.append(text)
    // Human-only (CU-38): another app's window covers the point; shown to watchers too, never sent to the agent.
    if (shown.note !== null) {
      const note = document.createElement('p')
      note.className = 'consent-note'
      note.textContent = shown.note
      row.append(note)
    }
    for (const { label, approved, lifetime } of shown.choices) {
      const button = document.createElement('button')
      button.textContent = label
      button.addEventListener('click', () => command('consent', { id: request.id, approved, lifetime }))
      row.append(button)
    }
    box.append(row)
  }
}

function onEvent(event) {
  view = reduce(view, event)
  log(describeEvent(event, view.kind))
  if (event.type === 'hello') $('run').textContent = event.runId ?? ''
  render()
}

const events = new EventSource(`/events?token=${encodeURIComponent(token)}`)
events.onmessage = (message) => onEvent(JSON.parse(message.data))
events.onerror = () => { $('state').textContent = 'reconnecting' }

$('pause').addEventListener('click', () => command('pause'))
$('resume').addEventListener('click', () => command('resume'))
$('notice-resume').addEventListener('click', () => command('resume'))
$('take-over').addEventListener('click', () => command('take_over'))
$('hand-back').addEventListener('click', () => command('hand_back', { note: $('note').value || undefined }).then(() => { $('note').value = '' }))
$('stop').addEventListener('click', () => { if (confirm('Stop the run? Nothing it already did is undone.')) command('stop', { reason: 'stopped from the live view' }) })
$('guide-form').addEventListener('submit', (event) => {
  event.preventDefault()
  if ($('guide').value.trim()) command('guide', { text: $('guide').value }).then(() => { $('guide').value = '' })
})
for (const [id, direction] of [['back', 'back'], ['forward', 'forward'], ['reload', 'reload']]) $(id).addEventListener('click', () => post('/input', { type: 'navigate', direction }))
$('dialog-accept').addEventListener('click', () => post('/input', { type: 'dialog', accept: true }))
$('dialog-dismiss').addEventListener('click', () => post('/input', { type: 'dialog', accept: false }))

// Driving: only while the person has taken over a browser run (controlsFor(...).drive, never on a desktop run, where
// the person uses the Mac itself); pointer moves are thinned to ~30 a second.
const screen = $('screen')
const driving = () => controlsFor(view.state, view.source, view.kind).drive
let lastMove = 0
for (const type of ['mousedown', 'mouseup', 'mousemove']) {
  screen.addEventListener(type, (event) => {
    if (!driving()) return
    event.preventDefault()
    if (type === 'mousedown') screen.focus()
    if (type === 'mousemove') {
      if (performance.now() - lastMove < 33) return
      lastMove = performance.now()
    }
    const input = mouseInput(event, screen.getBoundingClientRect())
    if (input) post('/input', input)
  })
}
screen.addEventListener('contextmenu', (event) => { if (driving()) event.preventDefault() })
screen.addEventListener('wheel', (event) => {
  if (!driving()) return
  event.preventDefault()
  const input = wheelInput(event, screen.getBoundingClientRect())
  if (input) post('/input', input)
}, { passive: false })
for (const type of ['keydown', 'keyup']) {
  screen.addEventListener(type, (event) => {
    if (!driving()) return
    const input = keyInput(event)
    if (input === null) return
    event.preventDefault()
    post('/input', input)
  })
}
screen.addEventListener('paste', (event) => {
  if (!driving()) return
  const text = event.clipboardData?.getData('text/plain')
  if (text) post('/input', { type: 'text', text })
  event.preventDefault()
})
render()
