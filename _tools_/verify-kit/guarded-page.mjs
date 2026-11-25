/**
 * CU-808 (cu-developer-one's #1477 review): the vendored `openPage` starts Chrome with no notification protection and takes
 * no extra switches, and the vendored files are never edited here (_vendor_/browser-use/INDEX.md). So this is the same
 * one-browser-one-page handle, opened through the vendored `openBrowser` (which passes `args` to its launcher) with the
 * CU-808 layers: the throwaway profile seeded with notifications blocked before Chrome reads it, and the switches that turn
 * the Web Notifications API and Chrome's OS notification bridge off. The verify kit's check browser and the live-view
 * probe open their Chrome only through `openGuardedPage`; a test pins that no other module opens a vendored Chrome.
 */
import { writeFileSync } from 'node:fs'

import { NO_NOTIFICATION_ARGS, writeNoNotificationPreferences } from '../../_environments_/chrome-browser/no-notifications.mjs'
import { click, drag, evaluateScript, fill, fillForm, handleDialog, hover, openBrowser, pressKey, takeSnapshot, typeText } from '../../_vendor_/browser-use/lib.mjs'

/** The vendored `openPage` handle, with the CU-808 protections. `open` and `seed` are injectable for tests. */
export async function openGuardedPage(options = {}, { open = openBrowser, seed = writeNoNotificationPreferences } = {}) {
  if (typeof options.profile !== 'string' || options.profile.length === 0) throw new TypeError('openGuardedPage needs the throwaway profile it may seed')
  seed(options.profile)
  const browser = await open({
    headless: options.visible !== true,
    width: options.width,
    height: options.height,
    colorScheme: options.colorScheme,
    binary: options.binary,
    profile: options.profile,
    args: [...NO_NOTIFICATION_ARGS],
  })
  const page = browser.page()
  const handle = {
    browser,
    page,
    get pageId() {
      return page.pageId
    },
    /** A page-level protocol call, for what the wrapper does not cover. */
    send: (method, params) => page.send(method, params),
    /** Navigate and resolve once the new document can be read. */
    async goto(url, timeoutMs = 20_000) {
      await page.navigate({ url, timeoutMs })
      return handle
    },
    /** Evaluate an expression and return its value. */
    evaluate: (expression, timeoutMs = 10_000) => page.evaluate(expression, { timeoutMs }),
    /** Wait for an expression to become truthy; `true` when it did, `false` on timeout. */
    waitFor: (expression, timeoutMs = 15_000) => page.waitForExpression(expression, timeoutMs),
    /** Save a screenshot and return its path. */
    async screenshot(path) {
      const buffer = await page.screenshot({ format: 'png' })
      writeFileSync(path, buffer)
      return path
    },
    /** The whole surface, for a check that needs to act rather than to read. */
    tools: {
      click: (args) => click(page, args),
      fill: (args) => fill(page, args),
      fillForm: (args) => fillForm(page, args),
      hover: (args) => hover(page, args),
      drag: (args) => drag(page, args),
      pressKey: (args) => pressKey(page, args),
      typeText: (args) => typeText(page, args),
      evaluateScript: (args) => evaluateScript(page, { ...args, args: args?.args ?? [] }),
      handleDialog: (args) => handleDialog(page, args),
      takeSnapshot: (args) => takeSnapshot(page, args),
    },
    close: () => browser.close(),
  }
  return handle
}
