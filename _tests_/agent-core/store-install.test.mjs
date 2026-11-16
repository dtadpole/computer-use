import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, isExtensionStoreDetail } from '../../_tools_/agent-core/policy.mjs'

// CU-513: a bare 'Install' / 'Get' / 'Add' on an extension / add-on / plug-in store detail page asks install; the same words
// elsewhere keep today's judgement.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (url, name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }
const PAGES = ['https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm', 'https://chrome.google.com/webstore/detail/abc/def',
  'https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/', 'https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak',
  'https://addons.opera.com/en/extensions/details/ublock/', 'https://marketplace.visualstudio.com/items?itemName=ms-python.python', 'https://blog.example/wp-admin/plugin-install.php']

test('CU-513: a bare install word on a store detail page asks install', () => {
  for (const url of PAGES) for (const name of ['Install', 'Get', 'Add', 'Install now', 'Get it']) assert.equal(click(url, name), 'install', `${url} ${name}`)
})

test('CU-513: the page test is host and path, and other words on the page keep their judgement', () => {
  assert.equal(isExtensionStoreDetail('https://chromewebstore.google.com/category/extensions'), false)
  assert.equal(isExtensionStoreDetail('https://addons.mozilla.org/en-US/firefox/search/?q=ad'), false)
  assert.equal(isExtensionStoreDetail('https://example.com/detail/x'), false)
  for (const name of ['Details', 'Reviews', 'Support', 'Privacy practices', 'Get started', 'Add a review']) assert.equal(click(PAGES[0], name), 'allow', name)
  assert.equal(click(PAGES[0], 'Remove from Chrome'), 'delete')
})

test('CU-513 negatives: the same bare words off a store detail page stay as they were', () => {
  for (const url of ['https://docs.example/start', 'https://chromewebstore.google.com/category/extensions']) for (const name of ['Install', 'Get', 'Add']) assert.equal(click(url, name), 'allow', `${url} ${name}`)
})
