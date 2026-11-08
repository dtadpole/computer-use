/**
 * Deliberately broken builds this verifier must fail on (M2 done criterion 3), applied to a /tmp copy by
 * `_tools_/verify-kit/prove-failing.mjs`; the real tree never changes.
 */

const LAUNCH = '_environments_/chrome-browser/launch.mjs'

export const MUTANTS = Object.freeze([
  {
    name: 'no-sandbox',
    why: 'the driver adds --no-sandbox and its own sandbox self-check is removed, so it launches anyway',
    mutations: [
      { file: LAUNCH, find: "    '--headless=new',\n", replace: "    '--headless=new',\n    '--no-sandbox',\n" },
      { file: LAUNCH, find: "  if (commandLine.some((arg) => arg === '--no-sandbox' || arg.startsWith('--no-sandbox='))) return 'Chrome is running with --no-sandbox'\n", replace: '' },
    ],
  },
  {
    name: 'wrong-viewport',
    why: 'the declared viewport height is set 100 px short',
    mutations: [{ file: '_environments_/chrome-browser/session.mjs', find: 'height: this.viewport.height, deviceScaleFactor: 1', replace: 'height: this.viewport.height - 100, deviceScaleFactor: 1' }],
  },
  {
    name: 'profile-kept',
    why: 'removeProfile returns at once, so the throwaway profile outlives the run',
    mutations: [
      {
        file: LAUNCH,
        find: 'export async function removeProfile(path, seat, { remove = rmSync, exists = existsSync, attempts = 20, pauseMs = 100, settleMs = 250 } = {}) {\n',
        replace: 'export async function removeProfile(path, seat, { remove = rmSync, exists = existsSync, attempts = 20, pauseMs = 100, settleMs = 250 } = {}) {\n  if (seat) return true\n',
      },
    ],
  },
  {
    name: 'frame-scale-ignored',
    why: 'the screenshot clip always captures at scale 1, whatever the frame limits say',
    mutations: [{ file: '_environments_/chrome-browser/coords.mjs', find: 'height: frame.viewport.height, scale: frame.scale }', replace: 'height: frame.viewport.height, scale: 1 }' }],
  },
  {
    name: 'history-unmarked',
    why: 'CU-153: state().history never names a POST answer, so a reload, back or forward onto one re-sends the form unasked',
    mutations: [{
      file: '_environments_/chrome-browser/session.mjs',
      find: "    return {\n      current: (fresh ? mark(history.currentIndex) : null) ?? own,\n      back: fresh ? mark(history.currentIndex - 1) : null,\n      forward: fresh ? mark(history.currentIndex + 1) : null,\n    }\n",
      replace: "    return { current: null, back: null, forward: null }\n",
    }],
  },

  {
    name: 'resubmit-unjudged',
    why: "CU-153's agent-core half: the policy ignores context.resubmits, so the driver names the POST answer but a reload of it is allowed and re-posts",
    mutations: [{ file: '_tools_/agent-core/policy.mjs', find: "    if (typeof context.resubmits === 'string') classes.push('submit')\n", replace: '' }],
  },
  {
    name: 'interstitial-unrecorded',
    why: "CU-155's driver half: the session never records that the main frame committed Chrome's own warning page, so state().interstitial stays false",
    mutations: [{ file: '_environments_/chrome-browser/session.mjs', find: "        page.errorPage = typeof frame.url === 'string' && frame.url.startsWith('chrome-error:') ? (frame.unreachableUrl ?? frame.url) : null\n", replace: '        page.errorPage = null\n' }],
  },
  {
    name: 'interstitial-not-carried',
    why: "CU-155's agent-core half: contextFor drops state().interstitial, so the policy's hand-off branch never sees a warning page",
    mutations: [{ file: '_tools_/agent-core/loop.mjs', find: '...(state.interstitial === true ? { interstitial: true } : {})', replace: '...({})' }],
  },
])
