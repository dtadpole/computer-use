import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'named-controls' (CU-245, CU-258, CU-261, CU-323), offscreen: entries, buttons, check boxes and menu items named by the
// harness, for live rows decided by a control's name alone. Each entry carries its name as its accessibility label; each
// button records only 'pressed' with its index, each check box 'toggled' with its index and state, each Actions menu
// item 'chosen' with its index; the state reports entry lengths, never their text.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withNamed(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('named-controls', { title: 'Account', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('named-controls (live rows decided by a name)', () => {
  test('each entry and button carries exactly the name the harness gave, in order', async () => {
    await withNamed({ fields: ['Bank account', 'Recovery key'], buttons: ['Always Allow', 'Join Meeting'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['field-0'].role, audit['field-0'].name], ['AXTextField', 'Bank account'])
      assert.deepEqual([audit['field-1'].role, audit['field-1'].name], ['AXTextField', 'Recovery key'])
      assert.deepEqual([audit['button-0'].role, audit['button-0'].name], ['AXButton', 'Always Allow'])
      assert.deepEqual([audit['button-1'].role, audit['button-1'].name], ['AXButton', 'Join Meeting'])
      const targets = await fixture.targets()
      for (const key of ['field-0', 'field-1', 'button-0', 'button-1']) assert.ok(targets[key], `no target for ${key}`)
    })
  })

  test('a press records only its index; the state reports lengths, never the text typed', async () => {
    await withNamed({ fields: ['Backup codes'], buttons: ['Always Allow'] }, async (fixture) => {
      assert.deepEqual((await fixture.state()).fields.namedPressed, [])
      await fixture.act({ press: 'button-0' })
      const pressed = await fixture.state()
      assert.deepEqual(pressed.fields.namedPressed, [0])
      assert.deepEqual(pressed.events.filter((event) => event.type === 'pressed').map((event) => event.index), [0])
      await fixture.act({ set: 'field-0', value: 'abcd efgh' })
      const typed = await fixture.state()
      assert.deepEqual(typed.fields.namedFieldLengths, [9])
      assert.doesNotMatch(JSON.stringify(typed), /abcd efgh/, 'the text never comes back through the channel')
    })
  })

  test('areas (CU-253): multi-line text areas named by the harness, AXTextArea with the name, reporting length and lines only', async () => {
    await withNamed({ areas: ['iMessage', 'Type a new message'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['area-0'].role, audit['area-0'].name], ['AXTextArea', 'iMessage'])
      assert.deepEqual([audit['area-1'].role, audit['area-1'].name], ['AXTextArea', 'Type a new message'])
      const targets = await fixture.targets()
      for (const key of ['area-0', 'area-1']) assert.ok(targets[key], `no target for ${key}`)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.namedAreaLengths, fields.namedAreaLines], [[0, 0], [1, 1]])
    })
  })

  test('placeholders (CU-349): entries labelled only by a placeholder - AXTextField, the placeholder served apart from the name; lengths only', async () => {
    const names = ['One-time code', 'CVV', 'Search']
    await withNamed({ fields: ['Bank account'], placeholders: names, buttons: ['Continue'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      names.forEach((name, index) => {
        const entry = audit[`placeholder-${index}`]
        assert.equal(entry.role, 'AXTextField')
        // No caption or label is set; what AppKit serves as a name is not the placeholder's words (the policy must find
        // them in the placeholder, CU-349).
        assert.notEqual(entry.name, name, `placeholder-${index} must not carry its placeholder as its name`)
        assert.equal(entry.placeholder, name)
      })
      assert.equal(audit['field-0'].name, 'Bank account', 'the named entry keeps its name above them')
      const targets = await fixture.targets()
      for (const key of ['placeholder-0', 'placeholder-1', 'placeholder-2', 'field-0', 'button-0']) assert.ok(targets[key], `no target for ${key}`)
      assert.ok(targets['placeholder-0'].y > targets['field-0'].y && targets['button-0'].y > targets['placeholder-2'].y, 'they sit between the named entries and the buttons')
      await fixture.act({ set: 'placeholder-1', value: '123' })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.placeholderFieldLengths, [0, 3, 0])
      assert.doesNotMatch(JSON.stringify(await fixture.state()), /"123"/, 'the text never comes back through the channel')
    })
  })

  test('layoutLabels (CU-361): entries named only by a text beside them - no label, title element or placeholder; lengths only', async () => {
    await withNamed({ placeholders: ['Search'], layoutLabels: ['Password', { name: 'CVV', above: true }], buttons: ['Continue'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      for (const [index, words] of [[0, 'Password'], [1, 'CVV']]) {
        const entry = audit[`layout-${index}`]
        assert.equal(entry.role, 'AXTextField')
        // Nothing links the text to the box: the policy has to find it by position (helper 0.2.64's nearbyLabel).
        assert.notEqual(entry.name, words, `layout-${index} must not carry its label as its name`)
        assert.ok(!entry.placeholder, `layout-${index} has no placeholder`)
      }
      const targets = await fixture.targets()
      const [left, above] = [targets['layout-0'], targets['layout-1']]
      assert.ok(left && above && targets['button-0'], 'targets for both entries and the button')
      assert.ok(left.y > targets['placeholder-0'].y && targets['button-0'].y > above.y, 'they sit under the placeholder entries, above the buttons')
      assert.ok(left.x > above.x, 'the left-labelled box starts right of its text; the above-labelled one at the margin')
      await fixture.act({ set: 'layout-0', value: 'abc' })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.layoutFieldLengths, [3, 0])
      assert.doesNotMatch(JSON.stringify(await fixture.state()), /"abc"/, 'the text never comes back through the channel')
    })
  })

  test('popups (CU-372): closed pop-up buttons, first item selected; a choice records the pop-up index and item title', async () => {
    await withNamed({ popups: [{ name: 'When I leave', items: ['Keep my data', 'Delete all my data'] }], buttons: ['Done'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.equal(audit['popup-0'].role, 'AXPopUpButton')
      assert.equal(audit['popup-0'].name, 'When I leave')
      const targets = await fixture.targets()
      assert.ok(targets['popup-0'] && targets['button-0'] && targets['button-0'].y > targets['popup-0'].y, 'the pop-up sits above the buttons')
      assert.deepEqual((await fixture.state()).fields.popupSelected, ['Keep my data'])
      await fixture.act({ select: 'popup-0', value: 'Delete all my data' })
      const state = await fixture.state()
      assert.deepEqual(state.fields.popupSelected, ['Delete all my data'])
      assert.ok(state.events.some((e) => e.type === 'select' && e.popup === 0 && e.item === 'Delete all my data'), 'the choice is recorded')
    })
  })

  test('at most six of each, names trimmed and capped at 60, empty names dropped', async () => {
    const long = 'x'.repeat(80)
    await withNamed({ fields: ['  Debit card  ', '', long, 'a', 'b', 'c', 'd', 'e'], buttons: [] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.equal(audit['field-0'].name, 'Debit card')
      assert.equal(audit['field-1'].name, 'x'.repeat(60))
      assert.equal((await fixture.state()).fields.namedFieldLengths.length, 6)
      assert.equal(audit['field-6'], undefined)
    })
  })

  test('checkboxes (CU-323): AXCheckBox with the exact names, CJK included; a toggle records its index and state only', async () => {
    const names = ['Remember this decision', '\u8bb0\u4f4f\u6b64\u51b3\u5b9a', '\u8a18\u4f4f\u6b64\u6c7a\u5b9a', 'Remember me']
    await withNamed({ checkboxes: names }, async (fixture) => {
      const audit = await fixture.axAudit()
      names.forEach((name, index) => assert.deepEqual([audit[`checkbox-${index}`].role, audit[`checkbox-${index}`].name], ['AXCheckBox', name]))
      const targets = await fixture.targets()
      for (const index of [0, 1, 2, 3]) assert.ok(targets[`checkbox-${index}`], `no target for checkbox-${index}`)
      assert.deepEqual((await fixture.state()).fields.namedChecked, [0, 0, 0, 0])
      await fixture.act({ press: 'checkbox-1' })
      const after = await fixture.state()
      assert.deepEqual([after.fields.namedChecked, after.fields.namedToggled], [[0, 1, 0, 0], [1]])
      const toggles = after.events.filter((event) => event.type === 'toggled')
      assert.deepEqual(toggles.map(({ index, on }) => [index, on]), [[1, true]])
      assert.ok(toggles.every((event) => !Object.values(event).includes(names[1])), 'a toggle carries no name')
    })
  })

  test('menuItems (CU-323): an Actions menu of AXMenuItem with the exact names; a bound item serves its key equivalent; choosing records the index', async () => {
    const disguised = ['P', '\u0585', 'st'].join('')
    await withNamed({ fields: ['Message'], menuItems: ['Cancel Meeting', 'Revert to Saved', { name: disguised, key: 'U', shift: true }] }, async (fixture) => {
      const actions = (await fixture.call('menuAX')).menus.find((menu) => menu.title === 'Actions')
      assert.ok(actions, 'the Actions menu is in the menu bar')
      assert.deepEqual(actions.items.map(({ title, role }) => [title, role]), [['Cancel Meeting', 'AXMenuItem'], ['Revert to Saved', 'AXMenuItem'], [disguised, 'AXMenuItem']])
      assert.deepEqual([actions.items[2].char, actions.items[2].modifiers], ['U', 1], 'Command-Shift-U: char U, modifiers shift')
      assert.equal(actions.items[0].char, null, 'an unbound item has no key equivalent')
      assert.ok(['x', 'y', 'width', 'height'].every((key) => typeof actions.frame?.[key] === 'number'), 'the bar item carries its frame (global points, top-left)')
      const bound = await fixture.call('menuItemForKey', { key: 'shift+cmd+u' })
      assert.deepEqual([bound.title, bound.action], [disguised, 'choose:'])
      assert.equal((await fixture.state()).fields.namedMenuItems, 3)
      await fixture.act({ menu: 'Revert to Saved' })
      const after = await fixture.state()
      assert.deepEqual(after.fields.namedChosen, [1])
      assert.deepEqual(after.events.filter((event) => event.type === 'chosen').map((event) => event.index), [1])
      assert.equal(after.events.filter((event) => event.type === 'menu').length, 0, 'not recorded by title')
    })
  })

  test('the Actions menu exists only while named-controls is open', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('named-controls', { title: 'Account', menuItems: ['Cancel Meeting'] })
      assert.ok((await fixture.call('menuAX')).menus.some((menu) => menu.title === 'Actions'))
      await fixture.open('named-controls', { title: 'Account', buttons: ['OK'] })
      assert.deepEqual((await fixture.call('menuAX')).menus.filter((menu) => menu.title === 'Actions'), [])
      assert.equal((await fixture.state()).fields.namedMenuItems, 0)
    } finally {
      await fixture.close()
    }
  })
})
