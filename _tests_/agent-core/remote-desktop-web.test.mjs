import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSitePolicy, isFixedDenied } from '../../_tools_/agent-core/sites.mjs'

// CU-394 follow-up (cu-coordinator 02:57Z): Chrome Remote Desktop's web client is a window onto another machine - denied on
// the browser route whatever the allow list says, like the remote_surface apps on the desktop.
test('CU-394: remotedesktop.google.com is fixed-denied, subdomains and case included, even when allowed', () => {
  for (const url of ['https://remotedesktop.google.com/access', 'https://REMOTEDESKTOP.google.com./support', 'https://x.remotedesktop.google.com/', 'https://start.teamviewer.com/', 'https://login.teamviewer.com/LogOn', 'https://web.parsec.app/', 'https://parsec.app/']) assert.equal(isFixedDenied(url), true, url)
  const policy = createSitePolicy({ allowed: ['https://remotedesktop.google.com'] })
  assert.deepEqual(policy('https://remotedesktop.google.com/access'), { block: 'fixed_deny' })
})

test('CU-394 negatives: other Google hosts are not fixed-denied', () => {
  for (const url of ['https://www.google.com/', 'https://docs.google.com/document/d/1', 'https://desktop.google.com/', 'https://www.teamviewer.com/en/']) assert.equal(isFixedDenied(url), false, url)
})

// CU-394 (cu-coordinator 18:02Z): the AVD web client, Windows 365, AnyDesk web and Splashtop web - case, scheme, port and
// trailing-dot forms as the CRD rows; self-hosted Guacamole and noVNC are a named limit.
test('CU-394: the AVD, Windows 365, AnyDesk and Splashtop web clients are fixed-denied, in every host form, even when allowed', () => {
  for (const url of ['https://client.wvd.microsoft.com/arm/webclient/', 'https://CLIENT.WVD.microsoft.com./arm/webclient/', 'http://client.wvd.microsoft.com/',
    'https://client.wvd.microsoft.com:443/', 'https://windows.cloud.microsoft/', 'https://windows365.microsoft.com/', 'https://Windows365.Microsoft.com.:443/ent',
    'https://web.anydesk.com/', 'http://WEB.ANYDESK.com./', 'https://web.splashtop.com/', 'https://web.splashtop.com:443/#/login']) assert.equal(isFixedDenied(url), true, url)
  const policy = createSitePolicy({ allowed: ['https://web.anydesk.com', 'https://windows365.microsoft.com'] })
  assert.deepEqual(policy('https://web.anydesk.com/'), { block: 'fixed_deny' })
  assert.deepEqual(policy('https://windows365.microsoft.com/'), { block: 'fixed_deny' })
})

test('CU-394 negatives: the vendors\' marketing and account hosts stay allowed; a self-hosted gateway is a named limit', () => {
  for (const url of ['https://www.microsoft.com/', 'https://learn.microsoft.com/azure/virtual-desktop/', 'https://anydesk.com/en', 'https://www.splashtop.com/',
    'https://my.splashtop.com/', 'https://outlook.office.com/']) assert.equal(isFixedDenied(url), false, url)
  assert.equal(isFixedDenied('https://guacamole.example.com/'), false, 'named limit: self-hosted Guacamole cannot be host-listed')
})
