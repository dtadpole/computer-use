import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'web-form' (CU-412's desktop half), offscreen: web content in CU Fixture's native window - one <form> with one text
// field and only role=button <div> controls, which HTML submits on Return in the field. Variant 'delete' holds one div
// ('Delete account'); 'unnamed' holds 'Cancel' and an icon-only div. A submit records 'web-submit' with the variant only.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

// A deadline, not a count: the offscreen WKWebView's first load can take well over 5 s on a loaded Mac (cu-integrator's
// gate, 11-12 Nov: timeouts at load 14-22 on PRs that never touch the page), so the page load gets PAGE_LOAD_MS, as the
// other fixture waits do, and each later step STEP_MS. Polls every 50 ms either way.
const PAGE_LOAD_MS = 20_000
const STEP_MS = 5_000

async function until(fixture, check, label, budgetMs = STEP_MS) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const state = await fixture.state()
    if (check(state)) return state
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label} (${budgetMs} ms)`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function withForm(variant, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('web-form', { title: 'Account', ...(variant === undefined ? {} : { variant }) })
    await until(fixture, (state) => state.fields.webFormLoaded === true, 'the page to load', PAGE_LOAD_MS)
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('web-form (CU-412)', () => {
  test('variant delete: the field and one role=button div are targets inside the web view; nothing submitted yet', async () => {
    await withForm('delete', async (fixture) => {
      const targets = await fixture.targets()
      for (const id of ['confirm', 'delete']) {
        assert.ok(targets[`web:${id}`], `web:${id} is a target`)
        assert.ok(targets[`web:${id}`].x >= 20 && targets[`web:${id}`].y >= 56, `web:${id} lies inside the web view`)
      }
      assert.equal(targets['web:cancel'], undefined)
      const state = await fixture.state()
      assert.deepEqual([state.fields.webFormVariant, state.fields.webFormSubmits, state.fields.webFormClicks], ['delete', 0, []])
    })
  })

  test('variant unnamed: Cancel and an icon-only div; an unknown variant falls back to delete', async () => {
    await withForm('unnamed', async (fixture) => {
      const targets = await fixture.targets()
      assert.ok(targets['web:cancel'] && targets['web:icon'] && targets['web:confirm'])
      assert.equal(targets['web:delete'], undefined)
    })
    await withForm('wipe-everything', async (fixture) => {
      assert.equal((await fixture.state()).fields.webFormVariant, 'delete')
    })
  })

  test('variant search: a search field alone, no role=button; it submits on Return like the others', async () => {
    await withForm('search', async (fixture) => {
      const targets = await fixture.targets()
      assert.ok(targets['web:confirm'])
      assert.equal(targets['web:delete'] ?? targets['web:cancel'] ?? targets['web:icon'], undefined, 'no button of any kind')
      await fixture.act({ webFormSubmit: true })
      const state = await until(fixture, (s) => s.fields.webFormSubmits === 1, 'the submit')
      assert.deepEqual(state.events.filter((event) => event.type === 'web-submit').map(({ variant }) => variant), ['search'])
    })
  })

  test('the form submits implicitly (the seam stands for Return in the field) and records web-submit with the variant only', async () => {
    await withForm('delete', async (fixture) => {
      await fixture.act({ webFormSubmit: true })
      const state = await until(fixture, (s) => s.fields.webFormSubmits === 1, 'the submit')
      const submits = state.events.filter((event) => event.type === 'web-submit')
      assert.deepEqual(submits.map(({ variant }) => variant), ['delete'])
      assert.ok(!('value' in submits[0]) && !('text' in submits[0]), 'no field text in the event')
    })
  })
})
