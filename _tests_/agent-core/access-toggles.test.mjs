import assert from 'node:assert/strict'
import { test } from 'node:test'

import { accessRowContext, createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-754 (High): an access toggle - its list names a privacy right, or its own name makes something public - asks permission
// when it turns on. CU-757 (P1): 'Allow' / 'Grant' / 'Give access' (and localized) in a dialog that states access asks
// permission. Both sides of each rule (D-099), click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}, action = { type: 'click', x: 1, y: 1, button: 'left' }) => verdict(policy.classify(action, { url, target, ...extra }))
const SETTINGS = 'com.apple.systempreferences'
const axcb = (name, checked, rowContext) => press(`desktop://${SETTINGS}`, { role: 'AXCheckBox', name, checked, inWebArea: false, origin: SETTINGS, ...(rowContext !== undefined ? { rowContext } : {}) }, { frontmostBundleId: SETTINGS })
const sw = (name, checked, extra = {}) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked, ...extra })
const webcb = (name, checked, extra = {}) => press('https://social.example/settings', { role: 'checkbox', tag: 'input', inputType: 'checkbox', name, checked, ...extra })
const space = (name, checked) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked }, {}, { type: 'keypress', keys: ['SPACE'] })
const web = (name, dialogName, dialogDescription = '') => press('https://console.example/settings', { role: 'button', tag: 'button', name, dialogName, dialogDescription })
const desk = (app, name, dialogName, dialogDescription = '') => press(`desktop://${app}`, { role: 'AXButton', name, inWebArea: false, origin: app, dialogName, dialogDescription }, { frontmostBundleId: app })

test('CU-754: a toggle turned on in a list named for a privacy right asks permission', () => {
  assert.equal(axcb('Terminal', false, 'Full Disk Access'), 'permission')
  for (const list of ['Screen & System Audio Recording', 'Screen Recording', 'Input Monitoring', 'Accessibility', 'Camera', 'Microphone', 'Location Services', 'Files and Folders', 'Automation', 'App Management']) {
    assert.match(axcb('Example Helper', false, list), /permission/, list)
  }
  // The web driver's shape ({ list, hints }) and a hint that states the grant.
  assert.match(webcb('Example App', false, { rowContext: { list: 'Apps with camera access', hints: [] } }), /permission/)
  assert.match(axcb('Example App', false, { list: 'Privacy', hints: ['Allow the applications below to control'] }), /permission/)
})

test('CU-754: a toggle whose name makes something public asks permission', () => {
  for (const name of ['Public profile', 'Public', 'Make profile public', 'Public account', 'Visible to everyone', 'Discoverable', 'Show my profile to everyone']) {
    assert.match(sw(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
})

test('CU-754: the other side - turning access off, plain toggles and harmless lists stay free', () => {
  // A native read that says the toggle is on: the press turns it off (revokes), so no grant.
  assert.equal(axcb('Terminal', true, 'Full Disk Access'), 'allow')
  assert.equal(webcb('Public profile', true), 'allow')
  for (const [name, checked] of [['Dark mode', false], ['Show previews', true], ['Public holidays', false], ['Show public posts first', false]]) assert.equal(sw(name, checked), 'allow', name)
  assert.equal(axcb('Show battery percentage', false), 'allow')
  for (const list of ['Display', 'Battery', 'Accessibility Shortcut options']) assert.equal(axcb('Reduce motion', false, list), 'allow', list)
})

test('CU-774: a toggle that makes the profile findable or indexable asks permission', () => {
  const findable = [
    'Searchable profile', 'Searchable', 'Findable by everyone', 'Make my profile searchable', 'Profile is searchable',
    'Show my profile in search results', 'Include me in search results', 'Appear in search results', 'Show up in search engines',
    'Visible in search', 'Let people find me by my email address', 'Allow others to find you by phone number',
    'Let anyone look up my profile', 'Allow search engines to index my profile', 'Let search engines link to your page',
    'Search engine indexing', 'Indexed by search engines',
  ]
  for (const name of findable) {
    assert.match(sw(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  // A web checkbox, an ARIA switch with no native state (asks both ways, as CU-754), and a desktop checkbox by its own name.
  assert.match(webcb('Show my profile in search results', false), /permission/)
  assert.match(sw('Searchable profile', undefined), /permission/)
  assert.match(axcb('Allow search engines to index my profile', false), /permission/)
})

test('CU-774: the other side - turning findability off, and local search features, stay free', () => {
  assert.equal(webcb('Searchable profile', true), 'allow')
  assert.equal(webcb('Let people find me by my email address', true), 'allow') // a native checkbox already on: the press turns findability off
  for (const name of ['Search history', 'Safe search', 'Searchable PDFs', 'Show search suggestions', 'Spotlight indexing', 'Allow indexing',
    'Hide my profile from search engines', 'Search engine', 'Show search bar', 'Find My']) {
    assert.equal(webcb(name, false), 'allow', name) // native checkboxes turning on: a known direction (an ARIA switch's unknown state can ask through other rules, e.g. a protection switch)
  }
  assert.equal(axcb('Spotlight indexing', false), 'allow')
})

test('CU-774 r2: a directory listing, and a page shown to people who are not signed in, ask permission', () => {
  const listed = [
    'Appear in the member directory', 'Show me in the directory', 'List my profile in the company directory',
    'Include me in the people directory', 'Be listed in the alumni directory', 'Listed in the staff directory', 'Member directory listing',
    'Show my page to visitors who are not signed in', "Show my profile to people who aren't logged in", 'Visible to signed-out visitors',
    'Let logged-out users see my profile', 'Allow non-members to view my page', 'Profile is visible to anyone without an account',
    'Show my posts to anonymous visitors',
    // cu-developer-one's same-class rows and their shape: any party finding or indexing the owner's things, engines by name,
    // and the 'Discoverable / Findable by ...' heads with a party or a key.
    'Show my profile to search engines', 'Let recruiters find my profile', 'Discoverable by email', 'Allow Google to index my posts',
    'List my profile in the public directory', 'Let employers find me', 'Allow Bing to index my profile', 'Show my page to Google',
    'Discoverable by phone number', 'Findable by my email address', 'Let contacts find me by phone',
    // the passive and plural forms, and people outside the owner's circle
    'Allow my profile to be found by people outside your organization', 'Let my posts be indexed', 'Make my posts discoverable',
    'My posts are indexable', 'Discoverable profile', 'Profile visible to search engines', "Let people you don't know find you",
    'Posts are searchable', 'My content is indexed by search engines',
  ]
  for (const name of listed) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  // The desktop shape: a checkbox by its own name, no list.
  assert.match(axcb('Show my page to visitors who are not signed in', false), /permission/)
  assert.match(axcb('Appear in the member directory', false), /permission/)
})

test('CU-774 r2: the other side - leaving the directory, signed-in audiences and file directories stay free', () => {
  assert.equal(webcb('Appear in the member directory', true), 'allow') // already on: the press takes the profile out
  assert.equal(webcb('Show my page to visitors who are not signed in', true), 'allow')
  for (const name of ['Show hidden files in directory', 'Sync directory', 'Use directory services', 'Show folders first in directory listings',
    'Directory', 'Only show my page to visitors who are signed in', 'Visible to signed-in members only',
    'Show my profile to my contacts', 'Hide me from the member directory',
    // local and document search stay free (cu-developer-one's near rows)
    'Search suggestions', 'Find nearby devices', 'Allow search in messages', 'Index my files for faster search',
    'Let others find this document in search', 'Show my email to contacts', 'Searchable notes', 'Search engine: Google',
    // content with no owner named can be a local search feature; sharing with contacts is not findability
    'Content is searchable', 'Activity is searchable', 'Content visible in search', 'Allow my page to be shared', 'Let my contacts see my posts']) {
    assert.equal(webcb(name, false), 'allow', name)
  }
  assert.equal(axcb('Show hidden files in directory', false), 'allow')
})

test('CU-779: a toggle that exposes the owner or their work to a wider audience or a public place asks permission', () => {
  const exposed = [
    // cu-researcher's filed rows
    'Include me in the staff list visible to guests', 'Let strangers view my portfolio', 'List my shop in the marketplace',
    // the shape: the owner's profile or work, shown, shared or opened to guests, strangers, people outside, the public
    'Share my portfolio with strangers', 'Make my portfolio visible to strangers', 'Show my availability to people outside your organization',
    'Allow guests to see my profile', 'Let anyone view my projects', 'Let people you do not know see my photos',
    'Show my email address to external users', 'Share my status with everyone on the internet',
    'Add my profile to the team page shown to visitors', 'List me in the company roster visible to anyone',
    'Feature my portfolio on the explore page', 'Publish my designs to the community gallery', 'Sell my artwork in the marketplace',
    'My portfolio is visible to strangers', 'Profile visible to guests', 'My shop is open to everyone',
  ]
  for (const name of exposed) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  // The filed desktop row: a checkbox by its own name, no list.
  assert.match(axcb('Show my contact card to people outside the team', false), /permission/)
  assert.match(sw('List my shop in the marketplace', false), /permission/)
})

test('CU-779: the other side - already on, no audience named, the owner\'s own circle and own views stay free', () => {
  assert.equal(webcb('Let strangers view my portfolio', true), 'allow') // already on: the press closes it
  assert.equal(axcb('Show my contact card to people outside the team', true), 'allow')
  for (const name of [
    // cu-researcher's near rows
    'Include weekends in the calendar', 'Show my contact card photo',
    // no wider audience, or the owner's own circle
    // (sharing with a person, listing items for sale and letting guests join are other rules' acts, so they are not near rows here)
    'Show my status to my team', 'Let teammates view my calendar', 'Visible to team members only', 'Show my profile to my contacts',
    // the owner's own views and local places
    'Show my photos in the gallery', 'Add my photos to the gallery', 'Show my purchases in the store', 'Show the marketplace tab', 'Show guest list',
  ]) {
    assert.equal(webcb(name, false), 'allow', name)
  }
  assert.equal(axcb('Show my contact card photo', false), 'allow')
})

test('CU-779 r2: widening who sees the owner\'s things - accounts, non-members, the whole company, featured placement - asks', () => {
  const widened = [
    // the audiences cu-researcher named, in the shapes the rule reads
    'Visible to everyone with an account', 'Show my profile to everyone with an account', 'Let non-members view my posts',
    'Non-members can see my profile', 'Show my profile to the whole company', 'Open my calendar to the entire organization',
    'Everyone in the company can view my calendar', 'Visible to all registered users', 'Shown to non-members',
    // featured or promoted placement on a public page, with or without the owner named
    'Feature on the home page', 'Feature my portfolio on the home page', 'Promote my posts on the front page',
    'Spotlight me in the featured section',
    // cu-developer-one's rows: any owned thing in a public place, and the exposure rows he probed
    'List my app in the marketplace', 'Publish my theme to the app store', 'Sell my template in the marketplace',
    'Show my contact card to strangers', 'Open my projects to external users', 'Feature my photos on the Explore page',
  ]
  for (const name of widened) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  assert.match(axcb('Visible to everyone with an account', false), /permission/)
  // r3 (cu-researcher's named r1 row, verbatim, desktop): 'viewable by' reads as 'visible to'
  assert.match(axcb('Make my calendar viewable by the whole company', false), /permission/)
  assert.match(webcb('Make my calendar viewable by the whole company', false), /permission/)
  assert.equal(webcb('Make my calendar viewable by my team', false), 'allow')
})

test('CU-779 r2: the other side - narrowing, the owner\'s own circle and own pages stay free', () => {
  assert.equal(webcb('Visible to everyone with an account', true), 'allow') // already on: the press narrows it
  assert.equal(webcb('List my app in the marketplace', true), 'allow')
  for (const name of ['Visible to me only', 'Visible to my team only', 'Visible to signed-in members only', 'Marketplace notifications',
    'Explore page recommendations', 'Show photos from friends', 'Show public holidays', 'Open links in a new tab', 'Show guests in calendar',
    'Show my photos on my home page', 'Feature', 'Home page']) {
    assert.equal(webcb(name, false), 'allow', name)
  }
})

test('CU-754: accessRowContext reads both shapes and nothing else', () => {
  assert.equal(accessRowContext('Full Disk Access'), true)
  assert.equal(accessRowContext({ list: 'Accessibility', hints: [] }), true)
  assert.equal(accessRowContext({ list: 'Display', hints: ['Increase contrast'] }), false)
  assert.equal(accessRowContext(null), false)
  assert.equal(accessRowContext(42), false)
})

test('CU-757: Allow / Grant / Give access in a dialog that states access asks permission', () => {
  assert.match(web('Allow', 'Connect Example app?', 'Example app will be able to read your files.'), /permission/)
  assert.match(web('Grant', 'Example app requests access', 'Review what it can do.'), /permission/)
  assert.match(web('Give access', 'Share your workspace', 'This gives the app full access to your workspace.'), /permission/)
  assert.match(web('Allow while using the app', 'Location', 'Maps would like to access your location.'), /permission/)
  assert.match(desk('com.example.app', 'Allow', '"Example" wants access', 'It will be able to control this computer.'), /permission/)
  // Localized buttons in a localized dialog.
  assert.match(web('Erlauben', 'Beispiel-App', 'Beispiel-App möchte auf Ihre Kontakte zugreifen.'), /permission/)
  assert.match(web('Autoriser', 'Exemple', 'Exemple souhaite accéder à vos photos.'), /permission/)
  assert.match(web('許可', 'サンプル', 'サンプルが連絡先へのアクセスを求めています。'), /permission/)
  // Return and Space press the same button.
  const enter = verdict(policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://console.example/settings', target: { role: 'button', tag: 'button', name: 'Allow', dialogName: 'Connect Example app?', dialogDescription: 'Example app will be able to read your files.' } }))
  assert.match(enter, /permission/)
})

test('CU-757: the other side - the same buttons in a dialog that states no access, and access stated only for not confirming', () => {
  assert.equal(web('Allow', 'Use dark mode?', 'You can change this later in Settings.'), 'allow')
  assert.equal(web('Grant', 'Thanks!', 'Your badge is ready.'), 'allow')
  assert.equal(web('Autoriser', 'Mode sombre', 'Vous pourrez le changer plus tard.'), 'allow')
  // A sentence about NOT confirming describes the other button.
  assert.equal(web('Allow', 'Keep this layout?', 'If you cancel, the app will be able to read your old settings.'), 'allow')
})

test('CU-783: the filed rows - an audience named by exclusion, and an exposure read as a send', () => {
  // cu-researcher's filed under-asks, verbatim (toggle off, clicked).
  assert.match(webcb('Allow non-friends to see my posts', false), /permission/)
  assert.match(axcb('Publish my availability to all clients', false), /permission/)
  // The filing's twin row is an exposure too and asks permission. (The pre-existing 'any visitor' over-ask the filing
  // grades on its own - 'Let any visitor choose a theme' - is a lowering, so it goes to its own issue, D-108 (1).)
  assert.match(sw('Let any visitor browse my albums', false), /permission/)
})

test('CU-783: the shape - audiences by exclusion, outside roles by quantifier, and exposure verbs that read as a send', () => {
  const exposed = [
    // an audience named by exclusion: non-X, people who are not my X, people who do not follow me, everyone except X
    'Let non-followers view my photos', 'Show my posts to non-friends', 'Non-friends can see my posts', 'Visible to non-followers',
    'Show my profile to people who are not my friends', "Let people who don't follow me see my stories",
    'Share my posts with everyone except my family', 'Show my activity to friends of friends', 'Let people I have not added view my profile',
    // outside roles by quantifier, and exposure verbs that read as a send (publish, broadcast, announce, post, send)
    'Publish my calendar to every customer', 'Broadcast my status to all followers', 'Announce my availability to all attendees',
    'Post my schedule to all clients', 'Show my phone number to any visitor', 'Let every guest see my albums',
    // r1: a quantified group of people is read by its form, whatever the role (cu-verifier's pre-review rows first)
    'Publish my profile to all recruiters', 'Broadcast my location to all drivers', 'Share my resume with every hiring manager',
    'Send my status to each attendee', 'Let all bidders see my listings', 'Show my portfolio to all investors',
  ]
  for (const name of exposed) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  assert.match(axcb('Let non-followers view my photos', false), /permission/)
  assert.match(axcb('Broadcast my status to all followers', false), /permission/)
})

test('CU-783: the other side - already on, the owner\'s own circle, and no audience named', () => {
  assert.equal(webcb('Allow non-friends to see my posts', true), 'allow') // already on: the press closes it
  // Already on: no exposure grant (main's submit for a 'Publish ...' control in either state is older and unchanged here).
  assert.doesNotMatch(axcb('Publish my availability to all clients', true), /permission/)
  for (const name of [
    // the owner's own circle
    'Show my posts to my friends', 'Let friends see my posts', 'Show my availability to my team', 'Show my profile to my contacts',
    // no audience named, or the word 'non' inside another word
    'Show my availability', 'Visible to none',
    // r1: a quantifier over the owner's own circle, or over no people at all
    'Show my posts to all my close friends', 'Visible to all team members', 'Show my status to all my contacts', 'Available to all plans',
  ]) {
    assert.equal(webcb(name, false), 'allow', name)
  }
})

test('CU-783 r2: an audience named by exclusion with any granting verb over the owner\'s things asks; protective acts stay free', () => {
  // cu-researcher's held-out miss at r1, verbatim (web switch, off, clicked).
  assert.match(sw('Permit non-contacts to view my photos', false), /permission/)
  for (const name of [
    'Enable non-followers to comment on my posts', 'Authorize people outside my network to download my files',
    'Give non-friends access to my albums', 'Non-subscribers may reply to my stories', 'Invite non-members to edit my document',
  ]) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  // Protective acts lead with no granting verb (or negate it) and stay free; the owner's circle stays free.
  for (const name of [
    'Block non-contacts from viewing my photos', 'Hide my photos from non-contacts', 'Prevent non-friends from commenting on my posts',
    'Non-friends cannot see my posts', "Don't let non-followers see my stories", 'Allow friends to comment on my posts',
  ]) {
    assert.equal(webcb(name, false), 'allow', name)
  }
  assert.equal(webcb('Permit non-contacts to view my photos', true), 'allow') // already on (a native checkbox read)
})

test('CU-799: a toggle that puts the owner\'s profile or work into a public place asks permission', () => {
  // cu-developer-two's filed row, verbatim (desktop AXCheckBox, off, clicked).
  assert.match(axcb('Publish my profile to the public directory', false), /permission/)
  // The shape: any verb that puts the owner's thing into any public place - a place named public, a directory others browse,
  // search results, the open web, the marketplace or community gallery - and its state form.
  for (const name of [
    'Share my portfolio to the community gallery', 'Post my resume on the public job board', 'Add my profile to the member directory',
    'Upload my designs to the public library', 'Show my posts in search results', 'Publish my blog to the web',
    'My profile is listed in the public directory', 'Submit my app to the marketplace',
    // cu-verifier's CU-799 close (mutant P2 survived): a row only the search-results place catches - 'Show my posts in
    // search results' also asks through CU-774's findable rule, this one asked submit only on main.
    'Publish my resume to search results',
  ]) {
    assert.match(webcb(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
})

test('CU-799: the other side - already on, nothing of the owner\'s, and the owner\'s own views stay free', () => {
  // cu-developer-two's filed near rows: the same toggle turned on, and two that name no owned thing in a public place.
  assert.doesNotMatch(axcb('Publish my profile to the public directory', true), /permission/)
  // 'Publish drafts automatically' keeps main's older submit (a 'Publish' word rule) and gains no permission.
  assert.doesNotMatch(axcb('Publish drafts automatically', false), /permission/)
  assert.doesNotMatch(webcb('Publish drafts automatically', false), /permission/)
  for (const name of [
    'Show non-friends in search suggestions',
    'Show my photos in the gallery', 'Add my photos to my album', 'Show the public directory', 'Search the public directory',
  ]) {
    assert.equal(webcb(name, false), 'allow', name)
  }
})
