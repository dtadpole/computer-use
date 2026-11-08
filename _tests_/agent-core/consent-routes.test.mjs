import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { historyMove, planKeypress as planBrowserKeypress, planType as planBrowserType } from '../../_environments_/chrome-browser/input-plan.mjs'
import { activatableAncestor, clickLabel, describeElement, implicitSubmitButton, textEntered } from '../../_environments_/chrome-browser/page-scripts.mjs'
import { planKeypress as planDesktopKeypress, planType as planDesktopType } from '../../_environments_/macos-desktop/input-plan.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from '../macos-desktop/harness.mjs'
import { CARD, IBAN_GB, SEED_TWELVE } from '../fixture-shapes/shapes.mjs'

// D-064, tightened (cu-developer-one's find on #546; gaps from cu-developer-one and cu-verifier on #547): a closed row
// names its CLOSING run - cu-verifier's: an id not within 45 characters after 'before', 'twin', 'probe', 'unasked' or
// another seat's name, nor directly followed by another seat's name ('(id, cu-developer-two)') - or a decision in a closing form: the cell starts with the D-number, 'by design (D-0nn ...)', 'by decision
// D-0nn', or 'D-065 (asserted, not live)'. A D-number cited in passing does not close a row.
const NON_CLOSING = /(before|twin|probe|unasked|cu-developer-\w+|cu-researcher)/i
const SEAT_AFTER = /^[,\s]+(cu-developer-\w+|cu-researcher)/i
const DECISION = /^(D-\d{3}\b|by (design|decision)\b[^.]*D-\d{3})|\bD-065 \(asserted, not live\)/
export function closingRun(live) {
  const text = String(live).trim()
  if (DECISION.test(text)) return true
  for (const m of text.matchAll(/\d{6}Z-[0-9a-f]{6}/g)) {
    const before = text.slice(Math.max(0, m.index - 45), m.index)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25)
    if (!NON_CLOSING.test(before) && !SEAT_AFTER.test(after)) return true
  }
  return false
}

// CU-145 (D-059): the consent-route matrix. One row per route x element class: what agent core's classify() decides,
// the test that pins the rule, and the live proof (a run id, or 'seam only' with the reason). Closed cells assert the
// decision; open cells are todo with the issue that closes them - flip them to closed as each fix lands. Composed routes
// (a focus move then an activation, a split type, a long press composed from down/up) are judged in the loop; their rows
// name the loop/seam tests in _designs_/system-architecture/consent-routes.md. A cell here proves classify() only: CU-152
// showed the loop can drop the context a rule needs, so every rule also needs a pin through the real path (the design table).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const SEND = { role: 'AXButton', name: 'Send' }
const T = {
  deleteButton: { role: 'AXButton', name: 'Delete' },
  okButton: { role: 'AXButton', name: 'OK' },
  unnamedButton: { role: 'AXButton', name: '' },
  // CU-180: what helper 0.2.42 reports for a click on web content inside a native app - the label, icon or unnamed
  // group lifted to the control it sits in, an unnamed control named by its labels; plain text stays itself.
  webDeleteButtonAX: { role: 'AXButton', name: 'Delete' },
  webIconButtonAX: { role: 'AXButton', name: 'Delete' },
  webBuyLinkAX: { role: 'AXLink', name: 'Buy now' },
  webPressGroupAX: { role: 'AXGroup', name: 'Delete' },
  // Plain reading text ('To delete your account, contact support') with no actionable ancestor: never named by its
  // value (cu-researcher's call, parity with the browser's web-click-reading-text), so its words ask nothing.
  webPlainTextAX: { role: 'AXStaticText', name: '' },
  deleteCheckbox: { role: 'AXCheckBox', name: 'Delete originals after import' },
  trashMenuItem: { role: 'AXMenuItem', name: 'Move to Trash' },
  sendField: { role: 'AXTextField', name: 'Send a message' },
  fieldDefaultSend: { role: 'AXTextField', name: '', defaultButton: SEND },
  // CU-190, D-069: the helper reports whether it could read the default button (defaultButtonRead); false or absent asks,
  // true keeps the rule, and no target at all (the driver's good read of nothing focused) keeps it too.
  fieldDefaultUnread: { role: 'AXTextField', name: 'Message', defaultButton: null, defaultButtonRead: false },
  // CU-253 (cu-coordinator): a bare 'Message' field now asks on Return, so the CU-190 negative is judged on a neutral name.
  fieldNoDefault: { role: 'AXTextField', name: 'Subject', defaultButton: null, defaultButtonRead: true },
  chatNameNoDefault: { role: 'AXTextField', name: 'Message', defaultButton: null, defaultButtonRead: true },
  fieldDefaultAbsent: { role: 'AXTextField', name: 'Message' },
  nothingFocused: null,
  areaDefaultSend: { role: 'AXTextArea', name: 'Notes', defaultButton: SEND },
  searchField: { role: 'AXTextField', name: 'Search' },
  // CU-187 / CU-223: the unnamed scratch entry a copied value is pasted into (CU Ledger, CU Fixture copyRow).
  unnamedEntry: { role: 'AXTextField', name: '', editable: true },
  // CU-163: a bank account or tax id field (S9's vendor form in CU Ledger).
  ibanField: { role: 'AXTextField', name: 'IBAN' },
  taxField: { role: 'AXTextField', name: 'Tax ID' },
  // CU-164: secrets and identity documents by field name (text entries only).
  recoveryField: { role: 'AXTextArea', name: 'Recovery phrase' },
  privateKeyField: { role: 'AXTextField', name: 'Private key' },
  otpField: { role: 'AXTextField', name: 'One-time code' },
  passportField: { role: 'AXTextField', name: 'Passport number' },
  dobField: { role: 'AXTextField', name: 'Date of birth' },
  // CU-167: identity and card secrets by field name.
  ssnField: { role: 'AXTextField', name: 'Social security number' },
  cvvField: { role: 'AXTextField', name: 'CVV' },
  passportOnlyField: { role: 'AXTextField', name: 'Passport' },
  licenseField: { role: 'AXTextField', name: "Driver's license" },
  birthdayField: { role: 'AXTextField', name: 'Birthday' },
  securityQuestionField: { role: 'AXTextField', name: "Mother's maiden name" },
  securityEntry: { role: 'AXTextField', name: 'Social Security number' },
  messageTable: { role: 'AXTable', name: 'Messages' },
  sheet: { role: 'AXSheet', name: '' },
  replyInThread: { role: 'AXButton', name: 'Reply in thread' },
  // CU-157 (#376, reply-text-entered.md): the environment reports whether any text entry on the page or window holds text.
  replyNoText: { role: 'AXButton', name: 'Reply in thread', textEntered: false },
  replyText: { role: 'AXButton', name: 'Reply', textEntered: true },
  replyUnknown: { role: 'AXButton', name: 'Reply', textEntered: null },
  sendReplyNoText: { role: 'AXButton', name: 'Send reply', textEntered: false },
  fieldDefaultReplyNoText: { role: 'AXTextField', name: '', defaultButton: { role: 'AXButton', name: 'Reply' }, textEntered: false },
  // CU-148 (#342/#343): the helper reports sheet: true while a sheet is up, whatever holds the focus.
  windowSheetUp: { role: 'AXWindow', name: 'Untitled', sheet: true },
  webDelete: { role: 'button', name: 'Delete' },
  // CU-175: what the browser driver judges for a click on a label or icon inside a control (see the driver-half test).
  webDeleteLabelled: { tag: 'button', role: 'button', name: 'Delete' },
  webIconDelete: { tag: 'button', role: 'button', name: 'Delete' },
  webBuyLink: { tag: 'a', role: 'link', name: 'Buy now' },
  webCheckOutHyphen: { tag: 'button', role: 'button', name: 'Check-out' },
  webSignUpHyphen: { tag: 'button', role: 'button', name: 'Sign-up' },
  webIbanEntry: { role: 'textbox', name: 'IBAN', editable: true },
  ibanEntry: { role: 'AXTextField', name: 'IBAN', editable: true },
  pasteMenuItem: { role: 'AXMenuItem', name: 'Paste', keyEquivalent: { char: 'V', modifiers: 0 } },
  toolbarPaste: { role: 'AXButton', subrole: 'AXToolbarButton', name: 'Paste' },
  // CU-195: shown text is named by its own words; its caption is the label beside it (#460, #464).
  webCaptionedPassport: { role: 'StaticText', name: 'X1234567', caption: 'Passport number' },
  webCaptionedNotes: { role: 'StaticText', name: 'Call back Tuesday', caption: 'Notes' },
  // CU-198: shown text with no caption (a paragraph, a code block, a log line).
  webParagraphText: { role: 'StaticText', name: '' },
  // CU-195 reopened (cu-verifier 004357Z-30bbf7): Chrome gives a value directly inside <dd> the role 'definition', which
  // the drag rule's text-named role list lacks; a list item and a read-only text view are the same shape.
  webDdValue: { role: 'definition', name: 'X1234567', caption: 'Passport' },
  webListItemValue: { role: 'listitem', name: 'ACCT-REF 7731', caption: 'IBAN' },
  readonlyTextViewValue: { role: 'AXTextArea', name: 'ACCT-REF 7731', caption: 'IBAN', editable: false },
  readonlyTextViewNotes: { role: 'AXTextArea', name: 'Bring the blue folder', caption: 'Notes', editable: false },
  webNotesEntry: { role: 'textbox', name: 'Notes', editable: true },
  notesEntry: { role: 'AXTextField', name: 'Notes', editable: true },
  webOnclickDelete: { tag: 'div', role: 'generic', name: 'Delete' },
  webPointerIconDelete: { tag: 'div', role: 'generic', name: 'Delete' },
  webReadingText: { tag: 'span', role: 'generic', name: '' },
  webPointerDivDelete: { tag: 'div', role: 'generic', name: 'Delete' },
  webCardDeleteArticle: { tag: 'div', role: 'generic', name: 'How to delete your account - Learn more' },
  webBodyPointerText: { tag: 'p', role: 'paragraph', name: '' },
  webQuantity: { role: 'textbox', name: 'Quantity' },
  // CU-150 (#337): the browser driver reports the form's implicit submit as defaultButton.
  webQuantityInForm: { role: 'textbox', name: 'Quantity', defaultButton: { role: 'button', name: 'Place order' } },
  webLink: { role: 'link', name: 'Pricing' },
  webComments: { role: 'textbox', name: 'Comments' },
  webPasswordShown: { role: 'textbox', name: 'Password', inputType: 'text', editable: true },
  // CU-170: a click into a plain text entry vs a chooser or a control with the same kind of name.
  webSecurityEntry: { tag: 'input', role: 'textbox', name: 'Social Security number', editable: true },
  webPermissionCombobox: { tag: 'input', role: 'combobox', name: 'Permission level', editable: false },
  webDeleteInEditor: { tag: 'button', role: 'button', name: 'Delete', editable: false },
  // CU-157 in a browser (#375's page-wide textEntered): closed live by E8 from main.
  webReplyNoText: { role: 'button', name: 'Reply', textEntered: false },
  webReplyDraft: { role: 'button', name: 'Reply', textEntered: true },
  webReplyUnknown: { role: 'button', name: 'Reply', textEntered: null },
}
const A = {
  click: { type: 'click', x: 1, y: 1 },
  doubleClick: { type: 'double_click', x: 1, y: 1 },
  space: { type: 'keypress', keys: ['SPACE'] },
  enter: { type: 'keypress', keys: ['ENTER'] },
  cmdEnter: { type: 'keypress', keys: ['META', 'ENTER'] },
  cmdBackspace: { type: 'keypress', keys: ['META', 'BACKSPACE'] },
  cmdOptShiftBackspace: { type: 'keypress', keys: ['META', 'ALT', 'SHIFT', 'BACKSPACE'] },
  cmdD: { type: 'keypress', keys: ['META', 'D'] },
  backspace: { type: 'keypress', keys: ['BACKSPACE'] },
  cmdV: { type: 'keypress', keys: ['META', 'V'] },
  typeSpace: { type: 'type', text: ' ' },
  typeNewline: { type: 'type', text: 'x\n' },
  typeLines: { type: 'type', text: 'line one\nline two' },
  typeKeypadEnter: { type: 'type', text: 'x\u0003' },
  typeCard: { type: 'type', text: CARD },
  typeIban: { type: 'type', text: IBAN_GB },
  typeEin: { type: 'type', text: '12-3456789' },
  typeRoutingAccount: { type: 'type', text: '021000021 / 123456789012' },
  typePlain: { type: 'type', text: 'abc 123' },
  typeHexKey0x: { type: 'type', text: '0x' + 'a3f1'.repeat(16) },
  typeSeedPhrase: { type: 'type', text: SEED_TWELVE },
  holdSpace: { type: 'hold_key', keys: ['SPACE'], duration_ms: 500 },
  longPress: { type: 'drag', path: [{ x: 1, y: 1, holdMs: 1700 }] },
  dragAway: { type: 'drag', path: [{ x: 1, y: 1 }, { x: 50, y: 50 }] },
  menuClick: { type: 'click', x: 1, y: 1, button: 'left' },
  scroll: { type: 'scroll', x: 1, y: 1, scroll_x: 0, scroll_y: 3 },
  reload: { type: 'keypress', keys: ['F5'] },
  mouseForward: { type: 'click', x: 10, y: 10, button: 'forward' },
  middleClick: { type: 'click', x: 10, y: 10, button: 'middle' },
  scrollX: { type: 'scroll', x: 10, y: 10, scroll_x: -2000, scroll_y: 0 },
  // CU-230: paste chords with Shift and/or Option (Paste and Match Style is Command-Option-Shift-V), and Control's.
  cmdShiftV: { type: 'keypress', keys: ['META', 'SHIFT', 'V'] },
  cmdOptShiftV: { type: 'keypress', keys: ['META', 'ALT', 'SHIFT', 'V'] },
  cmdOptV: { type: 'keypress', keys: ['META', 'ALT', 'V'] },
  ctrlShiftV: { type: 'keypress', keys: ['CTRL', 'SHIFT', 'V'] },
}

// [id, env, action, target, expected ('allow' | class asked), pin, live, status, extra context]; status is null (closed),
// 'todo CU-n' (the verdict is not on main: the cell fails today) or 'open CU-n' (asserted; the issue awaits its live close).
const ROWS = [
  ['click-named-destructive', 'desktop', 'click', 'deleteButton', 'delete', 'policy.test.mjs', "cu-verifier, CU Fixture web-buttons, helper 0.2.48: a click on AXButton 'Delete' declined delete (20261108T001154Z-e1838e) - CU-140", null],
  ['click-benign', 'desktop', 'click', 'okButton', 'allow', 'policy.test.mjs', "cu-verifier, CU Fixture keypad: the 'C' button clicked, allowed (20261107T174423Z-6715b8); earlier cu-researcher S9 rerun 131912Z-744b5e", null],
  ['click-unnamed', 'desktop', 'click', 'unnamedButton', 'allow', 'loop marks targetUnnamed (#311)', "CU Fixture (#447), helper 0.2.42: a click on consent-cells' unnamed entry allowed, marked targetUnnamed (20261107T194540Z-163013)", null],
  ['click-destructive-checkbox', 'desktop', 'doubleClick', 'deleteCheckbox', 'delete', 'keyboard-activation.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: double-click asked delete (20261107T180026Z-3c8ca5)", null],
  ['click-move-to-trash', 'desktop', 'click', 'trashMenuItem', 'delete', 'destructive-labels.test.mjs (#335)', "CU Fixture context-menu with its task params, 0.2.42: 'Move to Trash' (AXMenuItem) asked delete, declined, no event (20261107T180555Z-85b8d0)", null],
  ['click-submit-field-name', 'desktop', 'click', 'sendField', 'submit', 'policy.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: asked submit (20261107T180021Z-9fbf56)", null],
  ['space-destructive', 'desktop', 'space', 'deleteButton', 'delete', 'keyboard-activation.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: asked delete (20261107T180029Z-6bace1)", null],
  ['space-checkbox', 'desktop', 'space', 'deleteCheckbox', 'delete', 'keyboard-activation.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: asked delete (20261107T180028Z-10e10a)", null],
  ['hold-space-destructive', 'desktop', 'holdSpace', 'deleteButton', 'delete', 'keyboard-activation.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: asked delete (20261107T180031Z-cdebdc)", null],
  ['type-space-destructive', 'desktop', 'typeSpace', 'deleteButton', 'delete', 'keyboard-activation.test.mjs', "CU Fixture consent-cells (#447), helper 0.2.42: asked delete (20261107T180033Z-b7b135)", null],
  ['enter-default-send', 'desktop', 'enter', 'fieldDefaultSend', 'submit', '#325 tests', "helper 0.2.42, CU Fixture consent-keys K4: asked submit (20261107T173858Z-6c94df)", null],
  ['newline-default-send', 'desktop', 'typeNewline', 'fieldDefaultSend', 'submit', '#325 tests', "helper 0.2.44, main 5548a7fd7: K1 asked submit, nothing sent (20261107T213026Z-8a665e); the 0.2.42 post-install send (173854Z-3f1e69) was the unread state, now its own cell", null],
  ['newline-default-unread', 'desktop', 'typeNewline', 'fieldDefaultUnread', 'submit', 'CU-190 (defaultButtonRead false asks submit)', "D-065 (asserted, not live): the guard asks; the unread state is not producible on demand - seen once, the 0.2.42 post-install transient (20261107T173854Z-3f1e69); unit rows and mutants in default-button-unread.test.mjs", null],
  ['chat-name-message-no-default', 'desktop', 'typeNewline', 'chatNameNoDefault', 'submit', 'CU-253 (a bare Message field asks; named over-ask in forms)', 'no live row yet', 'open CU-253'],
  ['newline-no-default', 'desktop', 'typeNewline', 'fieldNoDefault', 'allow', 'CU-190 negative: read, no default button', "helper 0.2.44: a newline in a window with no default button (read true, none) allowed (20261107T213028Z-2f5e64)", null],
  ['newline-default-absent', 'desktop', 'typeNewline', 'fieldDefaultAbsent', 'submit', 'D-069: no read state asks on the desktop (fail closed)', 'D-069: decided, not run - a helper before 0.2.44 is refused at the handshake, so this state reaches the policy only by a bug, and then it asks (D-065)', null],
  ['newline-nothing-focused', 'desktop', 'typeNewline', 'nothingFocused', 'allow', 'D-069 negative: no target is the driver\'s good read of nothing focused and no default button', 'D-069: decided - environment.mjs returns null only for a successful read of nothing there, so it keeps the rule (D-065)', null],
  ['newline-text-area', 'desktop', 'typeLines', 'areaDefaultSend', 'allow', '#325 tests', "0.2.42 K2: allowed, both lines in Notes (20261107T173901Z-98cd24)", null],
  ['cmd-enter-text-area', 'desktop', 'cmdEnter', 'areaDefaultSend', 'submit', '#325 tests', "0.2.42 K3: asked (20261107T173905Z-734ddf)", null],
  ['click-label-in-web-button', 'desktop', 'click', 'webDeleteButtonAX', 'delete', 'already AXButton on 0.2.41: WebKit makes a button\'s children presentational (cu-verifier baseline; not discriminating)', '20261107T174104Z-766f5a (0.2.42, asked; already asked on 0.2.41 20261107T165855Z-9bdaef)', null],
  ['click-icon-in-web-button', 'desktop', 'click', 'webIconButtonAX', 'delete', 'already AXButton on 0.2.41: WebKit makes a button\'s children presentational (cu-verifier baseline; not discriminating)', '20261107T174103Z-6da041 (0.2.42, asked; already asked on 0.2.41 20261107T165854Z-72f4ee)', null],
  ['click-text-in-web-link', 'desktop', 'click', 'webBuyLinkAX', 'purchase', 'helper 0.2.42 actionableTarget (CU-180; discriminating: unnamed AXStaticText, allowed on 0.2.41)', '20261107T174100Z-78b6b1 (0.2.42: AXLink Buy now, asked purchase; 0.2.41: AXStaticText unnamed, allowed 20261107T165850Z-bfa704)', null],
  ['click-pressable-web-group', 'desktop', 'click', 'webPressGroupAX', 'delete', 'helper 0.2.42 actionableTarget + displayText (CU-180; discriminating: unnamed AXStaticText, allowed on 0.2.41)', "helper 0.2.44: the onclick div reports AXGroup 'Delete' and asks delete, no click reaches the page (20261107T210749Z-31f657); on 0.2.42 it was unnamed and allowed (174101Z-37a5bf)", null],
  ['click-plain-web-text', 'desktop', 'click', 'webPlainTextAX', 'allow', 'helper 0.2.42: plain reading text stays itself and unnamed - the twin of web-click-reading-text (CU-180)', '20261107T174107Z-05abda and 20261107T174105Z-7c2a2b (0.2.42: unnamed, allowed)', null],
  // CU-143 reopened (cu-verifier, 20261107T045926Z-480671): AppKit offers Command chords to the menu before the field
  // editor, so a plain Command-Backspace in a field fired the app's bound menu item. Judged delete until the helper can
  // say no menu item binds the chord.
  ['cmd-backspace-field', 'desktop', 'cmdBackspace', 'searchField', 'delete', 'command-backspace.test.mjs (#353)', '20261107T053218Z-535da8 (declined; hole was -045926Z-480671)', null],
  ['cmd-backspace-control', 'desktop', 'cmdBackspace', 'okButton', 'delete', 'keyboard-activation.test.mjs', "CU Fixture (#447), helper 0.2.42: after a click on a context-menu row, Command-Backspace asked delete and was declined (20261107T194545Z-a1792d); the keypress target the helper read was AXWindow 'Files', so the class came from CU-143's every-Command-Backspace rule", null],
  ['cmd-opt-shift-backspace-field', 'desktop', 'cmdOptShiftBackspace', 'searchField', 'delete', '#328 command-backspace.test.mjs', "0.2.42 C4 (20261107T173916Z-082dc5); C2 173910Z-5a9c46, C3 173913Z-60f6c7", null],
  ['cmd-d-button', 'desktop', 'cmdD', 'okButton', 'delete', 'keyboard-activation.test.mjs', "consent-keys closeSheet, 0.2.42: Command-D on the sheet asked delete, sheet stayed open (20261107T180859Z-724b2e; also 181113Z-4ab57d, 181119Z-f8938f); an earlier combined run 180558Z-5975d2 allowed it with the sheet state unread", null],
  ['cmd-d-sheet-no-focus', 'desktop', 'cmdD', 'windowSheetUp', 'delete', 'sheet-dont-save.test.mjs (#342, #370)', '20261107T083425Z-4a5eb3 (no focusable button), -074411Z-2f170a (focused)', null],
  ['cmd-d-no-sheet', 'desktop', 'cmdD', 'sendField', 'allow', 'sheet-dont-save.test.mjs (#342)', "CU Fixture (#447), helper 0.2.42: Command-D in consent-keys' Message with no sheet allowed, no sheet after (20261107T194542Z-f57f09)", null],
  // Accepted over-ask (cu-developer-one, cu-verifier): 'Reply' stays a submit word because a forum's or chat's Reply posts;
  // a button that only opens a composer is asked too (S8 x1, S2 x4, all composers). Escape hatch: submit@<bundle id>.
  ['reply-in-thread-over-ask', 'desktop', 'click', 'replyInThread', 'submit', 'policy submit words', "cu-verifier, chat-thread: text in the composer, a click on AXButton 'Reply in thread' declined submit (20261107T134726Z-325231); earlier cu-researcher run 080755Z-0c7c74 (preapproved)", null],
  ['reply-composer-no-text', 'desktop', 'click', 'replyNoText', 'allow', 'reply-text-entered.test.mjs (#376)', 'chat-thread, empty composer: Reply in thread allowed (20261107T134720Z-50ab7b, helper 0.2.41 + #380)', null],
  ['reply-text-entered', 'desktop', 'click', 'replyText', 'submit', 'reply-text-entered.test.mjs (#376)', 'chat-thread, text in the composer: asked (20261107T134726Z-325231)', null],
  ['reply-unknown', 'desktop', 'click', 'replyUnknown', 'submit', 'reply-text-entered.test.mjs (#376)', "mail-inbox, no text entry in the window (the body is hidden until Reply): asked (20261107T134728Z-7fdd88); the target's textEntered is not in the event - null by #377's no-entry rule", null],
  ['send-reply-no-text', 'desktop', 'click', 'sendReplyNoText', 'submit', 'reply-text-entered.test.mjs (#376)', "CU Fixture consent-cells (#447), helper 0.2.42: asked submit (20261107T180035Z-03e609)", null],
  ['default-button-reply-no-text', 'desktop', 'enter', 'fieldDefaultReplyNoText', 'allow', 'reply-text-entered.test.mjs (#376)', 'seam only: the Return path judges the default button with the same judgesSubmit as the live click (20261107T134720Z-50ab7b); no desktop Return row', null],
  ['web-reply-composer-no-text', 'browser', 'click', 'webReplyNoText', 'allow', 'reply-text-entered.test.mjs (#376)', "E8 opener row, real Chrome (20261107T173843Z-eb6b47)", null],
  ['web-reply-draft', 'browser', 'click', 'webReplyDraft', 'submit', 'reply-text-entered.test.mjs (#376)', "E8 restored draft (20261107T173851Z-5c85ab) and decoy (173856Z-ee8a95), real Chrome", null],
  ['web-reply-unknown', 'browser', 'click', 'webReplyUnknown', 'submit', 'reply-text-entered.test.mjs (#376)', "main 1de261e91, real Chrome: canvas Reply (#454) asks submit, 0 POSTs (20261107T192406Z-621ab4)", null],
  ['backspace-list-selection', 'desktop', 'backspace', 'messageTable', 'delete', 'collection-delete.test.mjs (#344)', '20261107T052028Z-9b1d7c (Drafts table, declined)', null],
  ['long-press-destructive', 'desktop', 'longPress', 'deleteButton', 'delete', 'drag-press.test.mjs', "cu-verifier: a long press on Delete, no travel, declined delete (20261107T033148Z-e6a9d5); earlier cu-researcher run 022946Z-435ad5 (hold-delete)", null],
  ['drag-from-destructive', 'desktop', 'dragAway', 'deleteButton', 'delete', 'drag-press.test.mjs', '20261107T014522Z-727ccc (CU-140)', null],
  ['scroll', 'desktop', 'scroll', 'deleteButton', 'allow', 'not judged by design: no consent class changes on scroll', 'D-059 named limit: scroll is not judged', null],
  ['paste-no-own-copy', 'desktop', 'cmdV', 'searchField', 'sensitive_data', 'paste-consent tests (#349)', '20261107T052454Z-bed1eb; count half on 0.2.40 (cu-verifier 10:13Z, no-alert proof)', null, { paste: { fromOwner: true } }],
  ['paste-after-own-copy', 'desktop', 'cmdV', 'searchField', 'allow', 'CU-151 (#349)', "0.2.42 P2: own copy allowed (20261107T173939Z-f03c80)", null, { paste: { fromOwner: false } }],
  // CU-187 desktop half: an own copy of shown text carries its caption's class to a paste into an unnamed entry (the
  // source keeps role and caption, never a name or the text - sourceOf). Live on CU Ledger's ledger-vendor values.
  ['paste-copy-caption-static', 'desktop', 'cmdV', 'unnamedEntry', 'sensitive_data', 'copy-source.test.mjs (CU-187, CU-223)', "cu-verifier, helper 0.2.49, CU Ledger ledger-vendor: the IBAN-captioned value (not IBAN-shaped) copied with Cmd-C and pasted into the unnamed scratch entry - declined sensitive_data, the entry stayed empty (20261108T024023Z-b216e7, again 024027Z-1c6580); on main 8d66c53 with CU-220, helper 0.2.51: declined again (103814Z-51827e)", null, { paste: { fromOwner: false, source: { role: 'AXStaticText', caption: 'IBAN' } } }],
  ['paste-copy-caption-static-vendor', 'desktop', 'cmdV', 'unnamedEntry', 'allow', 'CU-187 negative', "cu-verifier, main 8d66c53 with CU-220, helper 0.2.51, CU Ledger ledger-vendor: the Vendor-captioned value copied and pasted - allowed by count (129 = 128 + 1, own copy), 4 chars arrived (20261108T103817Z-1e544e); on 0.2.49 allowed too (023510Z-b9480c)", null, { paste: { fromOwner: false, source: { role: 'AXStaticText', caption: 'Vendor' } } }],
  // CU-223 (red team of CU-209): since helper 0.2.51 a read-only text view is captioned, so its COPY carries the class too
  // (before, an uncaptioned entry: the paste ran unasked). Closed on cu-verifier's live rows, keys and Edit > Copy.
  ['paste-copy-readonly-textview-iban', 'desktop', 'cmdV', 'unnamedEntry', 'sensitive_data', 'copy-source.test.mjs (CU-223)', "cu-verifier, main 8d66c53, helper 0.2.51, CU Fixture consent-cells readonlyText + copyRow: a word in the IBAN-captioned read-only view, Command-C, pasted into the unnamed entry - declined sensitive_data, own copy by count, nothing arrived (20261108T103751Z-7762ec); by Edit > Copy declined too (103801Z-2004a8)", null, { paste: { fromOwner: false, source: { role: 'AXTextArea', caption: 'IBAN', editable: false } } }],
  ['paste-copy-readonly-textview-notes', 'desktop', 'cmdV', 'unnamedEntry', 'allow', 'copy-source.test.mjs (CU-223 negative)', "cu-verifier, main 8d66c53, helper 0.2.51, CU Fixture consent-cells readonlyText + copyRow: the Notes-captioned read-only view's word, Command-C, pasted - allowed by count, 5 chars arrived (20261108T103756Z-2ffe01); by Edit > Copy allowed too (103807Z-047d66)", null, { paste: { fromOwner: false, source: { role: 'AXTextArea', caption: 'Notes', editable: false } } }],
  ['web-click-destructive', 'browser', 'click', 'webDelete', 'delete', 'policy.test.mjs', "main 1de261e91, real Chrome: bulk-delete 'Delete selected' asks delete, 0 POSTs (20261107T192415Z-7e802c)", null],
  ['web-click-label-in-button', 'browser', 'click', 'webDeleteLabelled', 'delete', 'activatableAncestor (CU-175)', '20261107T151230Z-db195b (main c8af0ec44; before #414 unasked 144600Z-75deb7)', null],
  ['web-click-icon-in-button', 'browser', 'click', 'webIconDelete', 'delete', 'activatableAncestor + clickLabel (CU-175)', '20261107T151235Z-4d0737 (main c8af0ec44; before #414 unasked 144608Z-5284c1)', null],
  ['web-click-text-in-link', 'browser', 'click', 'webBuyLink', 'purchase', 'activatableAncestor (CU-175)', '20261107T151239Z-979b16 (main c8af0ec44; before #414 unasked 144612Z-2403a4)', null],
  // Found red-teaming #429 (CU-178): main reads a hyphen as a word break only where the list says so - a 'Check-out'
  // or 'Sign-up' button runs unasked; #429's hyphen-as-space match closes both.
  ['web-click-hyphen-checkout', 'browser', 'click', 'webCheckOutHyphen', 'purchase', 'namesWord hyphen-as-space (CU-178)', 'main: purchase (20261107T172230Z-e15b41); before #429 unasked (cu-researcher probe 16:15Z)', null],
  ['web-click-hyphen-signup', 'browser', 'click', 'webSignUpHyphen', 'submit', 'namesWord hyphen-as-space (CU-178)', 'main: submit (20261107T172234Z-9bace4)', null],
  ['web-click-onclick-div', 'browser', 'click', 'webOnclickDelete', 'delete', 'activatableAncestor + clickLabel (CU-175)', '20261107T152745Z-38c71b (main c184e26f8; before #419 unasked 151243Z-bdebde)', null],
  ['web-click-pointer-icon', 'browser', 'click', 'webPointerIconDelete', 'delete', 'activatableAncestor + clickLabel (CU-175)', '20261107T152749Z-b3c168 (main c184e26f8; before #419 unasked 151247Z-c5e0d1)', null],
  ['web-click-reading-text', 'browser', 'click', 'webReadingText', 'allow', 'clickLabel (CU-175): not a control', '20261107T152752Z-36bbd2 (main c184e26f8: allowed; also allowed before)', null],
  ['web-click-pointer-div-label', 'browser', 'click', 'webPointerDivDelete', 'delete', 'activatableAncestor + clickLabel (CU-176): a delegated-listener div marked only by cursor:pointer', '20261107T152808Z-df31df (main c184e26f8; before unasked 150908Z-ab7a3d)', null],
  ['web-click-card-over-ask', 'browser', 'click', 'webCardDeleteArticle', 'delete', 'clickLabel (CU-176): accepted over-ask - a clickable card is judged by its words', '20261107T152804Z-7aa92f (main c184e26f8: asks delete, the accepted over-ask; before allowed 150000Z-9b9fd6)', null],
  ['web-click-body-pointer-text', 'browser', 'click', 'webBodyPointerText', 'allow', 'activatableAncestor + clickLabel (CU-176): a pointer cursor on body says nothing', '20261107T152800Z-84b1e9 (main c184e26f8: allowed; branch v2 2cf10d966 asked purchase 145948Z-dea6bd)', null],
  ['web-enter-implicit-submit', 'browser', 'enter', 'webQuantityInForm', 'purchase', 'chrome-browser implicit submit seam (#337)', 'main 1d7059a61: Enter in Quantity asks purchase, declined, no submit (20261107T172341Z-e8b869)', null],
  ['web-newline-implicit-submit', 'browser', 'typeNewline', 'webQuantityInForm', 'purchase', 'chrome-browser implicit submit seam (#337)', 'main: typed newline asks purchase, no submit (20261107T172346Z-2698b2)', null],
  ['web-type-card-third-party', 'browser', 'typeCard', 'webComments', 'sensitive_data', 'policy.test.mjs', "main 1de261e91, real Chrome: a card number typed into share-document's Email asks sensitive_data (20261107T192422Z-75b2d6)", null],
  ['type-into-iban-field', 'desktop', 'typePlain', 'ibanField', 'sensitive_data', 'bank-tax-sensitive.test.mjs (CU-163)', 'name rule live on the Tax ID field (F1 20261107T134312Z-ccea6d); the IBAN field itself not reached (not wholly shown); the IBAN value live in Vendor (V1 20261107T134206Z-da1f65)', null],
  ['type-into-tax-field', 'desktop', 'typePlain', 'taxField', 'sensitive_data', 'bank-tax-sensitive.test.mjs (CU-163)', 'F1 20261107T134312Z-ccea6d', null],
  ['web-type-iban-third-party', 'browser', 'typeIban', 'webComments', 'sensitive_data', 'bank-tax-sensitive.test.mjs (CU-163): mod-97', 'value rule live on the desktop row 20261107T134206Z-da1f65 (CU Fixture Vendor); the browser hands the same text to classify', null],
  ['web-type-ein-third-party', 'browser', 'typeEin', 'webComments', 'sensitive_data', 'bank-tax-sensitive.test.mjs (CU-163)', 'value rule live on the desktop row 20261107T134209Z-7d3ca9 (CU Fixture Contact); the browser hands the same text to classify', null],
  ['web-type-routing-account-third-party', 'browser', 'typeRoutingAccount', 'webComments', 'sensitive_data', 'bank-tax-sensitive.test.mjs (CU-163): ABA check + account', 'value rule live on the desktop row 20261107T134211Z-15347a (CU Fixture Contact); the browser hands the same text to classify', null],
  ['web-type-password-show-toggle', 'browser', 'typePlain', 'webPasswordShown', 'credential', 'secret-fields.test.mjs (CU-164)', 'real Chrome, local page: Show confirmed type=text, typed -> asked credential (20261107T140753Z-00fb31); pre-#398 main typed it unasked (20261107T140757Z-1a3217); secret-fields page P1 asked credential (20261107T141135Z-b2e43b; the page does not report the Show press)', null],
  ['type-into-recovery-phrase-field', 'desktop', 'typePlain', 'recoveryField', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'browser rows: Recovery phrase asked (20261107T140727Z-1d288a, secret-fields 20261107T141139Z-d49bb2); pre-#398 unasked (20261107T140811Z-8bb8e8); desktop by CU-165\'s driver half (#403); no desktop row', null],
  ['type-into-private-key-field', 'desktop', 'typePlain', 'privateKeyField', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'browser row: Private key asked (secret-fields 20261107T141143Z-a0860e); pre-#398 typed unasked (20261107T141050Z-7f13a1); desktop by CU-165\'s driver half (#403); no desktop row', null],
  ['type-into-one-time-code-field', 'desktop', 'typePlain', 'otpField', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'browser row: One-time code asked (secret-fields 20261107T141147Z-f046bd); pre-#398 typed unasked (20261107T141055Z-aaee81); desktop by CU-165\'s driver half (#403); no desktop row', null],
  ['type-into-passport-field', 'desktop', 'typePlain', 'passportField', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'browser row: Passport number asked (secret-fields 20261107T141151Z-7688d2); pre-#398 typed unasked (20261107T141100Z-a41787); desktop by CU-165\'s driver half (#403); no desktop row', null],
  ['type-into-dob-field', 'desktop', 'typePlain', 'dobField', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'browser row: Date of birth asked (secret-fields 20261107T141156Z-17aea8); pre-#398 typed unasked (20261107T141104Z-365078); desktop by CU-165\'s driver half (#403); no desktop row', null],
  ['web-type-0x-key-third-party', 'browser', 'typeHexKey0x', 'webComments', 'sensitive_data', 'secret-fields.test.mjs (CU-164)', 'value rule live on the desktop row (CU Fixture long form, Vendor: K2 20261107T135708Z-1565ac, from main 2cf4149d1); the browser hands the same text to classify', null],
  ['web-type-seed-phrase-third-party', 'browser', 'typeSeedPhrase', 'webComments', 'sensitive_data', 'secret-fields.test.mjs (CU-164): BIP39 list', 'value rule live on the desktop row (CU Fixture long form, Vendor: K1 20261107T135706Z-0d852d, from main 2cf4149d1); the browser hands the same text to classify', null],
  ['click-into-security-entry', 'desktop', 'click', 'securityEntry', 'allow', 'text-entry-focus-click.test.mjs (CU-170)', "CU Fixture consent-cells (#447), helper 0.2.42: allowed (20261107T180023Z-4dddcc)", null],
  ['web-click-into-security-entry', 'browser', 'click', 'webSecurityEntry', 'allow', 'text-entry-focus-click.test.mjs (CU-170)', 'real Chrome on /more at #417 head 09c2a1d74: a click into Social Security number and Security question allowed (20261107T150213Z-7c1671, 20261107T150217Z-aed066), the typing still asked; main asked permission on the click (20261107T150223Z-46dced, 20261107T150226Z-36cf54)', null],
  ['web-click-permission-combobox', 'browser', 'click', 'webPermissionCombobox', 'permission', 'text-entry-focus-click.test.mjs (CU-170)', "fixture controls page (#445): asks permission (20261107T175259Z-b457f1)", null],
  ['web-click-delete-button-in-editor', 'browser', 'click', 'webDeleteInEditor', 'delete', 'text-entry-focus-click.test.mjs (CU-170)', "fixture controls page (#445): asks delete (20261107T175304Z-990ae1)", null],
  ['type-into-ssn-field', 'desktop', 'typePlain', 'ssnField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser rows on /more from main 179505da6: SSN asked (20261107T143618Z-e15b94), Social Security number asked (20261107T143623Z-605fd4, Tab focus); pre-#407 main typed both unasked (20261107T143146Z-8552b0, 20261107T143316Z-3e2028); desktop by CU-165\'s driver half; no desktop row', null],
  ['type-into-cvv-field', 'desktop', 'typePlain', 'cvvField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser row on /more from main 179505da6: CVV asked (20261107T143628Z-754af5); pre-#407 main typed it unasked (20261107T143155Z-6a4f29); desktop by CU-165\'s driver half; no desktop row', null],
  ['type-into-passport-only-field', 'desktop', 'typePlain', 'passportOnlyField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser row on /more from main 179505da6: Passport asked (20261107T143638Z-6565ce); pre-#407 main typed it unasked (20261107T143204Z-329208); desktop by CU-165\'s driver half; no desktop row', null],
  ['type-into-drivers-license-field', 'desktop', 'typePlain', 'licenseField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser row on /more from main 179505da6: Driver\'s license asked (20261107T143643Z-e450c6); pre-#407 main typed it unasked (20261107T143209Z-8821aa); desktop by CU-165\'s driver half; no desktop row', null],
  ['type-into-birthday-field', 'desktop', 'typePlain', 'birthdayField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser row on /more from main 179505da6: Birthday asked (20261107T143647Z-26cd93); pre-#407 main typed it unasked (20261107T143214Z-949cce); desktop by CU-165\'s driver half; no desktop row', null],
  ['type-into-security-question-field', 'desktop', 'typePlain', 'securityQuestionField', 'sensitive_data', 'secret-fields.test.mjs (CU-167)', 'browser row on /more from main 179505da6: Security question asked (20261107T143651Z-788130, Tab focus) - the same name list; this cell\'s name, Mother\'s maiden name, was not typed live; pre-#407 main typed Security question unasked (20261107T143219Z-92588f); desktop by CU-165\'s driver half; no desktop row', null],
  ['web-reload-post-result', 'browser', 'reload', 'webComments', 'submit', 'history-resubmit.test.mjs (#350, #351)', '20261107T054200Z-d9a46e, -054215Z-9a86ac (main: 1 POST)', null, { resubmits: 'reload' }],
  // CU-158: the mouse's back/forward buttons move history too; #381 maps them to history moves on the real path.
  ['web-mouse-forward-post-result', 'browser', 'mouseForward', 'webComments', 'submit', 'environment.test historyAction (#381)', "E6 mouse forward onto a POST answer asks submit (20261107T173941Z-99fd76, 173948Z-eb389c)", null, { resubmits: 'forward' }],
  // CU-158's route class probed (cu-developer-two, real driver, ~10:30Z): a synthetic horizontal or Shift wheel never moves
  // history (headful not probed: a named limit); a middle-click opens a background tab and the site filter refuses an
  // unnamed origin's load, as for a left click.
  ['web-scroll-x-no-history', 'browser', 'scrollX', 'webComments', 'allow', 'probe (no history move)', "main 1de261e91, real Chrome: two scroll_x -800 allowed, the page stays on bulk-delete (20261107T192500Z-d62d0e)", null],
  ['web-middle-click-link', 'browser', 'middleClick', 'webLink', 'allow', 'site filter (environment)', "main 1de261e91, real Chrome: middle click on 'Terms of service' allowed (20261107T192430Z-496caf)", null],
  ['web-reload-prg', 'browser', 'reload', 'webComments', 'allow', 'policy (reload not judged)', '20261107T034225Z-fa2dbf', null, {}],
  // CU-155: a certificate warning commits chrome-error:// but the driver reported the attempted URL, so the hand-off never
  // fired (cu-developer-two's probe); classify hands off on the flag - the real path is the open part (#360).
  ['web-interstitial', 'browser', 'click', 'webDelete', 'handoff', 'interstitial-handoff (#360, #361)', '20261107T061749Z-fc953f (main: handed off, never driven)', null, { interstitial: true }],
  ['web-paste-card', 'browser', 'cmdV', 'webComments', 'sensitive_data', 'paste-consent tests (#349)', '20261107T052524Z-24ff7c (real Chrome)', null, { paste: { text: CARD } }],
  // CU-183: a text drag from a sensitive entry onto another entry moves the value without the clipboard; the press
  // target is known (context.target, CU-140), the drop point too (context.dropTarget), and neither is judged for it today.
  ['web-drag-text-from-iban', 'browser', 'dragAway', 'webIbanEntry', 'sensitive_data', 'CU-183 (drag sibling of the copy carry)', "main d24f2285f, real Chrome: a prefilled IBAN entry ('ACCT-REF 7731'), select all, drag onto an unnamed entry - asked sensitive_data, declined, nothing reached (20261107T194937Z-37c3d3)", null, { dropTarget: { role: 'textbox', name: '', editable: true } }],
  ['drag-text-from-iban', 'desktop', 'dragAway', 'ibanEntry', 'sensitive_data', 'CU-183 (drag sibling of the copy carry)', "CU Fixture consent-cells copyRow (#466), helper 0.2.42, main 07e500d7b: select all in the prefilled IBAN entry, drag onto the unnamed paste target - asked sensitive_data, nothing arrived (20261107T200523Z-06ce1f)", null, { dropTarget: { role: 'AXTextField', name: '', editable: true } }],
  // CU-186 (#457): an Edit > Paste or context-menu Paste clicks a menu item, so it is judged at the focused field it lands
  // in (context.paste.destination, a descriptor); a menu, a role-less placeholder or an unreadable focus asks.
  ['menu-paste-into-iban', 'desktop', 'menuClick', 'pasteMenuItem', 'sensitive_data', 'menu-paste-destination.test.mjs (#457)', "CU Fixture consent-cells copyRow (#466), helper 0.2.42, main 07e500d7b: own copy, then Edit > Paste into IBAN - asked (20261107T201801Z-5265f2)", null, { paste: { fromOwner: false, destination: { role: 'AXTextField', name: 'IBAN' } } }],
  ['menu-paste-into-notes', 'desktop', 'menuClick', 'pasteMenuItem', 'allow', 'menu-paste-destination.test.mjs (#457)', "CU Fixture consent-cells copyRow (#466), helper 0.2.42, main 07e500d7b: own copy, then Edit > Paste into the unnamed paste target (a neutral field, as Notes) - allowed, 5 chars arrived (20261107T201751Z-6ef936)", null, { paste: { fromOwner: false, destination: { role: 'AXTextField', name: 'Notes' } } }],
  ['menu-paste-focus-on-menu', 'desktop', 'menuClick', 'pasteMenuItem', 'sensitive_data', 'menu-paste-destination.test.mjs (#457)', 'D-065 (asserted, not live): the guard asks; AppKit keeps the focus on the field with the Edit menu open (193001Z-f2fde4), so no fixture produces this state; unit rows and mutants in menu-paste-destination.test.mjs', null, { paste: { fromOwner: false, destination: { role: 'AXMenuItem', name: 'Paste' } } }],
  ['menu-paste-focus-unread', 'desktop', 'menuClick', 'pasteMenuItem', 'sensitive_data', 'menu-paste-destination.test.mjs (#457)', 'D-065 (asserted, not live): the guard asks; AppKit keeps the focus on the field with the Edit menu open (193001Z-f2fde4), so no fixture produces this state; unit rows and mutants in menu-paste-destination.test.mjs', null, { paste: { fromOwner: false, destination: null } }],
  ['menu-paste-no-focus-placeholder', 'desktop', 'menuClick', 'pasteMenuItem', 'sensitive_data', 'menu-paste-destination.test.mjs (#457)', 'D-065 (asserted, not live): the guard asks; AppKit keeps the focus on the field with the Edit menu open (193001Z-f2fde4), so no fixture produces this state; unit rows and mutants in menu-paste-destination.test.mjs', null, { paste: { fromOwner: false, destination: { role: null, name: null } } }],
  // CU-230 (paste-chords.md): a paste chord is Command or Control with V whatever else is held, so each meets every paste
  // check - the loop builds the paste context the rows hand classify (pinned through runTask in paste-chords.test.mjs).
  // Desktop Control-V is no macOS paste: judging it as one is a named over-ask. Live rows wait for CU Fixture's Edit menu
  // to bind Paste and Match Style.
  ['paste-shift-owner-board', 'desktop', 'cmdShiftV', 'searchField', 'sensitive_data', 'paste-chords.test.mjs (CU-230)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: Command-Shift-V with no own copy - declined sensitive_data, nothing pasted (20261108T122914Z-59bf61)", null, { paste: { fromOwner: true } }],
  ['paste-match-style-owner-board', 'desktop', 'cmdOptShiftV', 'searchField', 'sensitive_data', 'paste-chords.test.mjs (CU-230)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: Command-Option-Shift-V with no own copy - declined sensitive_data, the sentinel not pasted (20261108T122853Z-70a2ad)", null, { paste: { fromOwner: true } }],
  ['paste-option-owner-board', 'desktop', 'cmdOptV', 'searchField', 'sensitive_data', 'paste-chords.test.mjs (CU-230)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: Command-Option-V with no own copy - declined sensitive_data (20261108T122918Z-3ade8e)", null, { paste: { fromOwner: true } }],
  ['paste-control-shift-owner-board', 'desktop', 'ctrlShiftV', 'searchField', 'sensitive_data', 'paste-chords.test.mjs (CU-230; a named over-ask)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: Control-Shift-V with no own copy - declined sensitive_data, a named over-ask (20261108T122921Z-2dcbbf)", null, { paste: { fromOwner: true } }],
  ['paste-match-style-own-copy-iban', 'desktop', 'cmdOptShiftV', 'searchField', 'sensitive_data', 'paste-chords.test.mjs (CU-230, CU-183)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: an own copy from IBAN (count 135 = 134 + 1), Paste and Match Style - declined by the source's class (20261108T122859Z-5d27a8)", null, { paste: { fromOwner: false, source: { role: 'AXTextField', name: 'IBAN' } } }],
  ['paste-match-style-own-copy-notes', 'desktop', 'cmdOptShiftV', 'searchField', 'allow', 'paste-chords.test.mjs (CU-230 negative)', "cu-verifier, main d090a0c, helper 0.2.51, CU Fixture S5 stash with the paste sentinel: an own copy from Notes (count 133 = 132 + 1) - allowed, the 11 characters arrived through Paste and Match Style (20261108T122855Z-f3e6ad)", null, { paste: { fromOwner: false, source: { role: 'AXTextField', name: 'Notes' } } }],
  ['web-paste-shift-card', 'browser', 'cmdShiftV', 'webComments', 'sensitive_data', 'paste-chords.test.mjs (CU-230)', "cu-verifier, main 46e6d65 with #17, real Chrome, fixture site CU-198 drag page: the card paragraph copied by the run, Command-Shift-V into the unnamed entry - declined sensitive_data on the run clipboard, nothing typed (20261108T114533Z-501264); the words paragraph is allowed and typed (114544Z-92459f)", null, { paste: { text: CARD } }],
  ['web-paste-match-style-card', 'browser', 'cmdOptShiftV', 'webComments', 'sensitive_data', 'paste-chords.test.mjs, keys.test.mjs (CU-230)', "cu-verifier, main 46e6d65 with #17, real Chrome, fixture site CU-198 drag page: the card paragraph, Command-Option-Shift-V - the driver maps it to the run-clipboard paste, no raw chord reaches Chrome; declined sensitive_data, nothing typed (20261108T114539Z-09e886)", null, { paste: { text: CARD } }],
  // CU-192 (#471): a desktop toolbar or popover button named exactly Paste is a paste, judged as a menu paste (CU-186).
  ['toolbar-paste-owner-board', 'desktop', 'menuClick', 'toolbarPaste', 'sensitive_data', 'toolbar-paste.test.mjs (#459, #471)', "CU Fixture consent-cells copyRow (#478), helper 0.2.44: the Paste button with no own copy asked (20261107T213539Z-fda93b); the icon-only Paste asked too (213541Z-a3726e)", null, { paste: { fromOwner: true, destination: { role: 'AXTextField', name: 'Message' } } }],
  ['toolbar-paste-into-iban', 'desktop', 'menuClick', 'toolbarPaste', 'sensitive_data', 'menu-paste-destination.test.mjs (#471)', "CU Fixture consent-cells copyRow (#478), helper 0.2.44: own copy, then the Paste button into IBAN asked (20261107T213548Z-9e573e)", null, { paste: { fromOwner: false, destination: { role: 'AXTextField', name: 'IBAN' } } }],
  ['toolbar-paste-into-neutral', 'desktop', 'menuClick', 'toolbarPaste', 'allow', 'toolbar-paste.test.mjs (#471)', "CU Fixture consent-cells copyRow (#478), helper 0.2.44: own copy, then the Paste button into the unnamed paste target (a neutral field, as Message) allowed, 5 chars arrived (20261107T213543Z-71102e)", null, { paste: { fromOwner: false, destination: { role: 'AXTextField', name: 'Message' } } }],
  // CU-195 (red team of #472): CU-187 carries a caption's class on a copy only; a drag of selected shown text onto an entry
  // moves the value with no class today.
  ['web-drag-captioned-text', 'browser', 'dragAway', 'webCaptionedPassport', 'sensitive_data', 'CU-195 (the drag sibling of CU-187)', "main b438e0ac1, real Chrome, cu-verifier: a span value in <dd> under 'Passport' dragged onto the unnamed entry asked sensitive_data, nothing dropped (20261108T012844Z-ddcfba)", null, { dropTarget: { role: 'textbox', name: '', editable: true } }],
  ['web-drag-captioned-notes', 'browser', 'dragAway', 'webCaptionedNotes', 'allow', 'CU-195 negative', "main b438e0ac1, real Chrome, cu-verifier: the Notes-captioned twins dragged onto the unnamed entry were allowed (20261108T012745Z-3d512f, 012848Z-fe99f7)", null, { dropTarget: { role: 'textbox', name: '', editable: true } }],
  ['web-drag-dd-value', 'browser', 'dragAway', 'webDdValue', 'sensitive_data', 'CU-195 (role definition)', "main b438e0ac1, real Chrome, cu-verifier: a value directly in <dd> under 'Passport' dragged onto the unnamed entry asked sensitive_data, nothing dropped (20261108T012741Z-5a5f14; before #522 allowed, 004357Z-30bbf7)", null, { dropTarget: { role: 'textbox', name: '', editable: true } }],
  ['web-drag-listitem-value', 'browser', 'dragAway', 'webListItemValue', 'sensitive_data', 'CU-195 (role listitem)', "main b438e0ac1, real Chrome, cu-verifier: a labelled list item's value dragged onto the unnamed entry asked sensitive_data, nothing dropped (20261108T012853Z-098e21)", null, { dropTarget: { role: 'textbox', name: '', editable: true } }],
  ['drag-readonly-textview-value', 'desktop', 'dragAway', 'readonlyTextViewValue', 'sensitive_data', 'CU-195 (a read-only AXTextArea)', "cu-verifier, helper 0.2.51, CU Fixture consent-cells readonlyText: a word selected in the IBAN-captioned read-only text view, dragged with a 600 ms dwell onto the unnamed entry - declined sensitive_data, nothing arrived, the view intact (20261108T092702Z-8a0307, again 092705Z-95bd3d) - CU-209", null, { dropTarget: { role: 'AXTextField', name: '', editable: true } }],
  ['drag-readonly-textview-notes', 'desktop', 'dragAway', 'readonlyTextViewNotes', 'allow', 'CU-195 negative (a read-only AXTextArea)', "cu-verifier, helper 0.2.51, CU Fixture consent-cells readonlyText: the Notes-captioned read-only text view dragged onto the unnamed entry was allowed (20261108T092707Z-7eefb3; the word did not arrive, so the run pins the verdict only)", null, { dropTarget: { role: 'AXTextField', name: '', editable: true } }],
  // CU-198 (red team of #485): once a browser drag of selected text delivers it, the dragged text meets no value rule;
  // context.dragText: a string, { unknown: true } on a failed read, null when nothing is selected under the press (the drag selects), undefined with no read (the desktop) - #490.
  ['web-drag-card-paragraph', 'browser', 'dragAway', 'webParagraphText', 'sensitive_data', 'CU-198', "main 9a7821b47, real Chrome, #514's drag page: the card number dragged onto the unnamed entry asked sensitive_data, nothing dropped (20261108T004646Z-a15df9)", null, { dropTarget: { role: 'textbox', name: '', editable: true }, dragText: CARD }],
  ['web-drag-words-paragraph', 'browser', 'dragAway', 'webParagraphText', 'allow', 'CU-198 negative', "main 9a7821b47, real Chrome, #514's drag page: a plain word dragged onto the unnamed entry arrived, 4 chars, allowed (20261108T004650Z-c40a52)", null, { dropTarget: { role: 'textbox', name: '', editable: true }, dragText: 'see you at noon' }],
  // CU-198 (cu-developer-one): a drag INTO an entry named for a secret is not judged by the destination's name (CU-183
  // carries only the source's class); a paste there is (CU-179).
  ['web-drag-into-password', 'browser', 'dragAway', 'webNotesEntry', 'credential', 'CU-198 (destination name rules)', "main 9a7821b47, real Chrome, #514's drag page: a word dragged onto the Password entry asked credential (20261108T004654Z-448b9d)", null, { dropTarget: { role: 'textbox', name: 'Password', editable: true } }],
  ['drag-into-iban', 'desktop', 'dragAway', 'notesEntry', 'sensitive_data', 'CU-198 (destination name rules)', "helper 0.2.49, CU Fixture consent-cells copyRow, cu-verifier: hello selected in an unnamed entry, dragged with a 400 ms dwell onto the entry named IBAN - declined sensitive_data, the IBAN entry unchanged (20261108T023516Z-a51b2d)", null, { dropTarget: { role: 'AXTextField', name: 'IBAN', editable: true } }],
]

const decide = (action, target, env, extra = {}) => {
  const url = env === 'browser' ? 'https://other.example/form' : 'app://ai.reflection.cu.fixture'
  const r = policy.classify(A[action], { url, target: T[target], ...extra })
  return r.decision === 'allow' ? 'allow' : r.decision === 'handoff' ? 'handoff' : r.class
}

for (const [id, env, action, target, expected, pin, live, open, extra] of ROWS) {
  const name = `${id} [${env}] ${action} on ${target} -> ${expected} (pin: ${pin}; live: ${live})`
  if (open?.startsWith('todo ')) test(name, { todo: open }, () => assert.equal(decide(action, target, env, extra), expected))
  else test(name, () => assert.equal(decide(action, target, env, extra), expected))
}

test('the matrix names every row once, and every open cell names its issue', () => {
  assert.equal(new Set(ROWS.map((r) => r[0])).size, ROWS.length)
  for (const r of ROWS) if (r[7] !== null) assert.match(r[7], /^(todo|open) CU-\d+$/)
  // A todo cell must still fail on main: once its fix lands it flips to 'open CU-n' (asserted, awaiting a live row) or closed.
  for (const r of ROWS) if (r[7]?.startsWith('todo ')) assert.notEqual(decide(r[2], r[3], r[1], r[8]), r[4], `${r[0]} passes on main - flip it from todo`)
  // A closed cell names what ran live; 'pending' belongs to an open cell (cu-verifier, 17:15Z: closed cells without a run).
  for (const r of ROWS) if (r[7] === null) assert.doesNotMatch(String(r[6]), /pending/i, `${r[0]} is closed but its live row is pending - mark it open`)
  // D-064: closed means a live run id (YYYYMMDDTHHMMSSZ-xxxxxx, or its HHMMSSZ-xxxxxx short form) or a D-number for a decided limit.
  for (const r of ROWS) if (r[7] === null) assert.ok(closingRun(r[6]), `${r[0]} is closed without a run id or a D-number - mark it open`)
})

test('closingRun: what closes a row and what does not (D-064)', () => {
  assert.equal(closingRun("cu-verifier: asks (030304Z-a6166b); before, typed unasked (203245Z-76e56e)"), true)
  assert.equal(closingRun("cu-developer-two's probe on its branch: asks (024120Z-9794f8)"), false)
  assert.equal(closingRun("cu-developer-two's run on its branch: asks (024120Z-9794f8)"), false)
  assert.equal(closingRun('pending: re-run once D-064 is read (no live row yet)'), false)
  assert.equal(closingRun('typed into Tin can, allowed (20261107T210025Z-d28434, cu-developer-two)'), false)
  assert.equal(closingRun("cu-verifier: allowed (20261108T032436Z-c8275e); cu-developer-two's probe (210022Z-7e0f35)"), true)
  assert.equal(closingRun('by decision D-062: too broad alone'), true)
  assert.equal(closingRun('D-069: decided, not run'), true)
  assert.equal(closingRun('D-065 (asserted, not live): the guard asks'), true)
})

// CU-149 (#332): control characters never reach classify - both drivers refuse them at planning; tab, LF and CR stay keys.
test('keypad-enter-char [desktop, browser] a typed U+0003 (and the other controls) is refused by the driver (pin: input-plan tests, #332)', () => {
  for (const plan of [planDesktopType, planBrowserType]) {
    for (const ch of ['\u0003', '\u2028', '\u2029', '\u001b', '\u0008', '\u007f']) assert.throws(() => plan({ text: `x${ch}` }), undefined, JSON.stringify(ch))
    assert.doesNotThrow(() => plan({ text: 'a\tb\nc\r' }))
  }
})

// CU-161: the driver half of each driver-dependent cell, through the drivers' real functions (CU-149's shape above). A
// row hands classify() its context by hand - resubmits, defaultButton, the paste - so a driver route change (the
// forward button no longer a history move, a typed newline no longer Enter) would still pass it. These fail instead.
const rowsWhere = (pred) => ROWS.map(([id, env, action, target, expected, pin, live, open, extra = {}]) => ({ id, env, action, target, extra })).filter(pred)

test('history cells [browser]: each row\'s resubmits is the move the driver names for its action; the probed routes name none (pin: historyMove, #381)', () => {
  const judged = rowsWhere((r) => r.env === 'browser' && r.extra.resubmits)
  assert.ok(judged.length >= 2, 'the reload and mouse-forward rows')
  for (const r of judged) assert.equal(historyMove(A[r.action]), r.extra.resubmits, r.id)
  for (const id of ['web-scroll-x-no-history', 'web-middle-click-link']) {
    const [r] = rowsWhere((row) => row.id === id)
    assert.equal(historyMove(A[r.action]), null, id)
  }
  assert.equal(historyMove({ ...A.scroll, keys: ['SHIFT'], scroll_y: -2000 }), null, 'a Shift wheel (probed)')
  assert.equal(historyMove({ ...A.mouseForward, button: 'back' }), 'back', 'the back button')
})

test('implicit-submit cells [browser]: the driver reports the form\'s submit button, and a typed newline presses Enter (pin: implicitSubmitButton, #337)', () => {
  const cells = rowsWhere((r) => r.env === 'browser' && T[r.target]?.defaultButton)
  assert.ok(cells.length >= 2, 'the Enter and newline rows')
  const button = { tagName: 'BUTTON', type: 'submit', disabled: false }
  const quantity = { tagName: 'INPUT', type: 'text', form: { elements: [{ tagName: 'INPUT', type: 'text' }, button] } }
  assert.equal(implicitSubmitButton(quantity), button, 'a text input in a form names its submit button')
  assert.equal(implicitSubmitButton({ ...quantity, tagName: 'TEXTAREA', type: 'textarea' }), null, 'a textarea never submits')
  for (const r of cells) if (r.action === 'typeNewline') assert.ok(planBrowserType(A[r.action]).some((e) => e.params?.type === 'keyDown' && e.params.key === 'Enter'), r.id)
})

test('newline cells [desktop, browser]: a typed newline presses the same Return/Enter the policy judges as ENTER (pin: both planType, CU-142)', () => {
  const cells = rowsWhere((r) => /\n/.test(A[r.action].text ?? ''))
  assert.ok(cells.some((r) => r.env === 'desktop') && cells.some((r) => r.env === 'browser'), 'rows on both drivers')
  for (const r of cells) {
    if (r.env === 'desktop') assert.ok(planDesktopType(A[r.action]).input.some((e) => e.kind === 'keyDown' && e.keyCode === 36), r.id)
    else assert.ok(planBrowserType(A[r.action]).some((e) => e.params?.type === 'keyDown' && e.params.key === 'Enter'), r.id)
  }
})

test('paste cells [desktop, browser]: Command-V, and its Shift and Option chords, is a paste on both drivers (pin: both planKeypress, #349, CU-230)', () => {
  const cells = rowsWhere((r) => r.extra.paste && A[r.action].type === 'keypress')
  assert.ok(cells.some((r) => r.env === 'desktop') && cells.some((r) => r.env === 'browser'), 'rows on both drivers')
  for (const r of cells) {
    if (r.env === 'browser') assert.deepEqual(planBrowserKeypress(A[r.action]), [{ kind: 'clipboard', op: 'paste' }], r.id)
    else {
      // CU-230: a modified chord reaches the app whole - its modifiers first (Command 55 or Control 59), V (9) last.
      const down = planDesktopKeypress(A[r.action]).input.filter((e) => e.kind === 'keyDown').map((e) => e.keyCode)
      assert.equal(down.at(-1), 9, `${r.id}: V reaches the app last`)
      assert.ok(down.includes(55) || down.includes(59), `${r.id}: with Command or Control held`)
    }
  }
})

test('reply cells [browser]: the driver\'s page scan yields each textEntered the rows hand classify - false, true, null (pin: page-scripts textEntered, #375)', () => {
  const values = [...new Set(rowsWhere((r) => T[r.target] && 'textEntered' in T[r.target]).map((r) => T[r.target].textEntered))]
  assert.deepEqual(values.sort(), [false, null, true].sort(), 'the rows use all three values')
  const node = (tagName, props = {}, attrs = {}) => ({ tagName, shadowRoot: null, getAttribute: (n) => attrs[n] ?? null, ...props })
  const replyOn = (nodes) => {
    const doc = { designMode: 'off', querySelectorAll: () => nodes }
    const view = { frameElement: null }
    view.parent = view
    doc.defaultView = view
    return node('BUTTON', { ownerDocument: doc })
  }
  const page = {
    false: [node('TEXTAREA', { value: ' \u200b ' }), node('DIV', { textContent: '' }, { contenteditable: 'true' })],
    true: [node('TEXTAREA', { value: 'a draft' })],
    null: [node('TEXTAREA', { value: '' }), node('CANVAS')],
  }
  for (const value of values) assert.equal(textEntered(replyOn(page[String(value)])), value, `a page the driver reads as ${value}`)
})

// The desktop half runs the real desktop environment against the fake helper (macos-desktop/harness.mjs), on scratch
// locks - never the Mac's own run lock (CU-117) - with a Reply button under the point a click would hit.
const desktopLocks = scratchLocks()
after(() => desktopLocks.remove())
const FIXTURE_APP = 'ai.reflection.cu.fixture'
const launchDesktop = fakeLauncher(desktopLocks, { apps: [FIXTURE_APP] })
const REPLY = { bundleId: FIXTURE_APP, pid: 601, role: 'AXButton', subrole: null, title: 'Reply', frame: { x: 150, y: 100, width: 100, height: 30 }, secure: false }
const REPLY_WORLD = {
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE_APP, pid: 601, title: 'CU Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE_APP,
  focused: REPLY,
  elements: [{ rect: REPLY.frame, element: REPLY }],
}
async function desktopReplyTarget(extra) {
  const { env, child } = await launchDesktop({ ...REPLY_WORLD, ...extra })
  try {
    await logged(child, 3)
    return [await env.inspectPoint({ x: 200, y: 115 }), await env.focusedElement()]
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('reply cells [desktop]: the real desktop driver carries each textEntered the rows hand classify, and nothing unread ever becomes false (pin: macos-desktop textEnteredOf, #380)', async () => {
  const cells = rowsWhere((r) => r.env === 'desktop' && T[r.target] && 'textEntered' in T[r.target])
  assert.ok(cells.length >= 4, 'the CU-157 desktop rows')
  const values = [...new Set(cells.map((r) => T[r.target].textEntered))]
  for (const value of values) {
    // null is what an older helper's silence must become: the reply carries no field at all.
    const [atPoint, focused] = await desktopReplyTarget(value === null ? {} : { textEntered: value })
    assert.equal(atPoint.title ?? atPoint.name, 'Reply', 'the click point is the Reply button')
    assert.equal(atPoint.textEntered, value, `inspectPoint carries ${value} (a Reply is a click)`)
    assert.equal(focused.textEntered, value, `focusedElement carries ${value} (a Return)`)
  }
  // false lets a bare Reply run: only the helper's own strict false may produce it.
  for (const unread of ['false', 'true', 0, 1, '', {}]) {
    const [atPoint] = await desktopReplyTarget({ textEntered: unread })
    assert.equal(atPoint.textEntered, null, JSON.stringify(unread))
  }
})

// CU-164's rows hand classify a target by hand: a show-password field ({ inputType: 'text', editable: true }) and desktop
// text entries named for a secret. These pin that the drivers produce exactly those fields.
test('show-password cell [browser]: the driver describes a toggled password input as the text entry the row hands classify (pin: describeElement)', () => {
  const [row] = rowsWhere((r) => r.id === 'web-type-password-show-toggle')
  assert.ok(row, 'the CU-164 show-toggle row')
  const doc = { defaultView: { location: { origin: 'https://other.example' } } }
  // A show-password toggle sets type=text: the DOM keeps no trace of the earlier password type, and no autocomplete.
  const toggled = { tagName: 'INPUT', type: 'text', nodeType: 1, parentElement: null, ownerDocument: doc, isContentEditable: false, getAttribute: () => null }
  const described = describeElement(toggled)
  for (const field of ['inputType', 'editable']) assert.equal(described[field], T[row.target][field], field)
  assert.equal(described.isPassword, false, 'no longer a password input - only the name can tell')
  assert.equal(described.autocomplete, null)
  // A Pin to top control is never a text entry, whether a <button> or an <input> of a button-like type.
  for (const [tagName, type] of [['BUTTON', 'button'], ['INPUT', 'button'], ['INPUT', 'submit'], ['INPUT', 'checkbox']]) {
    assert.equal(describeElement({ ...toggled, tagName, type }).editable, false, `${tagName.toLowerCase()} type=${type}`)
  }
})

test('secret-name cells [desktop]: the driver carries the helper element\'s role and title as the target role and name each row hands classify (pin: macos-desktop target shaping)', async () => {
  const cells = rowsWhere((r) => r.env === 'desktop' && /^type-into-(recovery-phrase|private-key|one-time-code|passport|dob|ssn|cvv|passport-only|drivers-license|birthday|security-question)-field$/.test(r.id))
  assert.equal(cells.length, 11, 'the five CU-164 and six CU-167 desktop rows')
  for (const r of cells) {
    const { role, name } = T[r.target]
    const field = { ...REPLY, role, title: name, editable: true }
    const [atPoint, focused] = await desktopReplyTarget({ focused: field, elements: [{ rect: field.frame, element: field }] })
    for (const target of [atPoint, focused]) assert.deepEqual([target.role, target.name], [role, name], r.id)
  }
})

// CU-175: a click lands on the innermost node - a <span> label, an <svg> icon - not the control it activates. These pin
// that the browser driver resolves each row's click to the element its target describes, and names an unnamed one.
test('inner-click cells [browser]: the driver resolves a click on a label or icon to the control the row judges, and names it by what it shows (pin: activatableAncestor, clickLabel)', () => {
  const view = { getComputedStyle: (n) => ({ cursor: n.cursor ?? 'auto' }) }
  const doc = { defaultView: view }
  const pointerDoc = { defaultView: view }
  const node = (tagName, { attrs = {}, cursor, text, parent } = {}, owner = parent?.ownerDocument ?? doc) => ({
    nodeType: 1, tagName, cursor, innerText: text, parentElement: parent ?? null, ownerDocument: owner,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
  })
  const body = node('BODY')
  const dom = {
    'web-click-label-in-button': () => { const b = node('BUTTON', { text: 'Delete', parent: body }); return node('SPAN', { text: 'Delete', parent: b }) },
    'web-click-icon-in-button': () => { const b = node('BUTTON', { attrs: { 'aria-label': 'Delete' }, parent: body }); return node('RECT', { parent: node('SVG', { parent: b }) }) },
    'web-click-text-in-link': () => { const a = node('A', { attrs: { href: '/buy' }, text: 'Buy now', parent: body }); return node('STRONG', { text: 'Buy now', parent: a }) },
    'web-click-onclick-div': () => { const d = node('DIV', { attrs: { onclick: 'remove()' }, text: 'Delete', parent: body }); return node('SPAN', { text: 'Delete', parent: d }) },
    'web-click-pointer-icon': () => {
      const d = node('DIV', { cursor: 'pointer', parent: node('MAIN', { parent: body }) })
      return node('PATH', { cursor: 'pointer', parent: node('SVG', { cursor: 'pointer', attrs: { 'aria-label': 'Delete' }, parent: d }) })
    },
    'web-click-reading-text': () => node('SPAN', { text: 'Hello', parent: node('P', { parent: body }) }),
    'web-click-pointer-div-label': () => node('SPAN', { cursor: 'pointer', text: 'Delete', parent: node('DIV', { cursor: 'pointer', text: 'Delete', parent: node('MAIN', { parent: body }) }) }),
    'web-click-card-over-ask': () => {
      const card = node('DIV', { cursor: 'pointer', text: 'How to delete your account - Learn more', parent: node('MAIN', { parent: body }) })
      return node('H3', { cursor: 'pointer', text: 'How to delete your account', parent: card })
    },
    // body sets cursor:pointer, so every element inherits it: the paragraph is judged as itself and takes no name.
    'web-click-body-pointer-text': () => {
      const pointerBody = node('BODY', { cursor: 'pointer' })
      pointerDoc.body = pointerBody
      return node('P', { cursor: 'pointer', text: 'Read about our offers and how to delete your account', parent: node('DIV', { cursor: 'pointer', parent: pointerBody }) }, pointerDoc)
    },
  }
  const cells = rowsWhere((r) => r.env === 'browser' && r.id in dom)
  assert.equal(cells.length, Object.keys(dom).length, 'every CU-175 row has its page')
  for (const r of cells) {
    const hit = dom[r.id]()
    const target = activatableAncestor(hit)
    assert.equal(String(target.tagName).toLowerCase(), T[r.target].tag, `${r.id}: the element judged`)
    const words = clickLabel(hit, target)
    if (T[r.target].name === '') assert.equal(words, null, `${r.id}: reading text takes no name`)
    else assert.equal(words, T[r.target].name, `${r.id}: the name it is judged by`)
  }
})

// CU-180 (desktop twin of CU-175/176): helper 0.2.42 lifts the deepest AX element to the control a click activates
// and names an unnamed control by its labels; the reply keeps its shape. These pin that the real desktop driver carries
// the element the helper reports - button, link, pressable group, plain text - as the target each row hands classify.
test('web-content click cells [desktop]: the driver carries the helper\'s lifted element as the target role and name each row hands classify (pin: macos-desktop target shaping, CU-180)', async () => {
  const cells = rowsWhere((r) => r.env === 'desktop' && /^click-(label-in-web-button|icon-in-web-button|text-in-web-link|pressable-web-group|plain-web-text)$/.test(r.id))
  assert.equal(cells.length, 5, 'the five CU-180 desktop rows')
  for (const r of cells) {
    const { role, name } = T[r.target]
    const element = { ...REPLY, role, title: name === '' ? null : name }
    const [atPoint] = await desktopReplyTarget({ elements: [{ rect: element.frame, element }] })
    assert.deepEqual([atPoint.role, atPoint.name ?? ''], [role, name], r.id)
  }
})

// App-policy's verdicts - system-level refusals (P9, CU-242, CU-244, CU-249) and launch_code (P10, CU-252) - are app-policy's, not the class policy's, so these rows are judged
// through createAppPolicy as the loop builds the call: CU Fixture approved and frontmost, url desktop://, the target's
// origin set, and a hold judged as the same chord pressed (loop.mjs, CU-64 H3). Expected 'block:<rule>' for a refusal.
const { createAppPolicy } = await import('../../_tools_/agent-core/app-policy.mjs')
const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
const { mkdtempSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const FIXTURE_ID = 'ai.reflection.cu.fixture'
const APP_STORE_ID = 'com.apple.AppStore'
const ACTIVITY_MONITOR_ID = 'com.apple.ActivityMonitor'
const DISK_UTILITY_ID = 'com.apple.DiskUtility'
const appApprovals = createAppApprovals({ path: join(mkdtempSync(join(tmpdir(), 'cu-routes-')), 'app-approvals.json') })
appApprovals.grantAlways(FIXTURE_ID, { by: 'api' })
appApprovals.grantAlways(APP_STORE_ID, { by: 'api' })
for (const id of [ACTIVITY_MONITOR_ID, DISK_UTILITY_ID]) appApprovals.grantAlways(id, { by: 'api' })
const appPolicy = createAppPolicy({ scope: [FIXTURE_ID, APP_STORE_ID, ACTIVITY_MONITOR_ID, DISK_UTILITY_ID], approvals: appApprovals })
// extra.app names the approved app in front (default CU Fixture); the rest of extra joins the context.
const decideApp = (action, target, extra = {}) => {
  const { app = FIXTURE_ID, ...context } = extra ?? {}
  const judged = action.type === 'hold_key' ? { type: 'keypress', keys: action.keys } : action
  const r = appPolicy.classify(judged, { url: 'desktop://', frontmostBundleId: app, target: { ...target, origin: app }, ...context })
  return r.decision === 'block' ? `block:${r.rule}` : r.decision === 'allow' ? 'allow' : r.class
}
const key = (...keys) => ({ type: 'keypress', keys })
const SYS_A = {
  cmdShiftL: key('META', 'SHIFT', 'L'), cmdShift8: key('META', 'SHIFT', '8'), cmdShiftA: key('META', 'SHIFT', 'A'), cmdOptD: key('META', 'ALT', 'D'),
  ctrlF1: key('CTRL', 'F1'), ctrlSpace: key('CTRL', 'SPACE'), click: { type: 'click', x: 1, y: 1 },
  holdLogOut: { type: 'hold_key', keys: ['META', 'ALT', 'SHIFT', 'Q'], duration_ms: 300 },
  optCmdJ: key('META', 'ALT', 'J'),
}
const SYS_T = {
  field: { role: 'AXTextField', name: 'Notes', editable: true },
  searchWithItem: { role: 'AXMenuItem', name: 'Search With Google' },
  appleScriptItem: { role: 'AXMenuItem', name: 'Get Result of AppleScript' },
  desktopPictureItem: { role: 'AXMenuItem', name: 'Set Desktop Picture' },
  pasteItem: { role: 'AXMenuItem', name: 'Paste' },
  openItem: { role: 'AXMenuItem', name: 'Open' },
  getButton: { role: 'AXButton', name: 'Get' },
  forceQuitButton: { role: 'AXButton', name: 'Force Quit' },
  restoreButton: { role: 'AXButton', name: 'Restore' },
  revertButton: { role: 'AXMenuItem', name: 'Revert to Saved' },
  signOutAllButton: { role: 'AXButton', name: 'Sign Out of All Devices' },
  priceButton: { role: 'AXButton', name: '$4.99' },
  tryFreeButton: { role: 'AXButton', name: 'Try Free' },
}
// [id, action, target, expected, pin, live, status, extra context]
const SYSTEM_ROWS = [
  // CU-249: a macOS Service acts outside the approved app - its default chords and its Services items (clicked).
  ['service-chord-search-with', 'cmdShiftL', 'field', 'block:system_shortcut', 'service-shortcuts.test.mjs (#49, CU-249: the default Services chords refused)', 'no live row yet', 'open CU-249'],
  ['service-chord-run-applescript', 'cmdShift8', 'field', 'block:system_shortcut', 'service-shortcuts.test.mjs (#49, CU-249; Command-* is Shift-8)', 'no live row yet', 'open CU-249'],
  ['service-click-search-with', 'click', 'searchWithItem', 'block:system_service', 'service-shortcuts.test.mjs (#49, CU-249: a Services item clicked)', 'no live row yet', 'open CU-249'],
  ['service-click-run-applescript', 'click', 'appleScriptItem', 'block:system_service', 'service-shortcuts.test.mjs (#49, CU-249)', 'no live row yet', 'open CU-249'],
  ['service-click-set-desktop-picture', 'click', 'desktopPictureItem', 'block:system_service', "CU-249 (changes the owner's wallpaper)", 'no live row yet', 'open CU-249'],
  ['service-chord-app-bound-over-refusal', 'cmdShiftA', 'field', 'block:system_shortcut', 'service-shortcuts.test.mjs (#49: refused even with an app item bound - a named over-refusal)', 'no live row yet', 'open CU-256', { boundMenuItem: { items: [{ role: 'AXMenuItem', name: 'Applications', keyEquivalent: { char: 'A', modifiers: 1 } }] } }],
  ['menu-click-paste', 'click', 'pasteItem', 'allow', 'CU-249 negative (an app menu item)', 'no live row yet', 'open CU-249'],
  // CU-242 (landed, #35) and its follow-up CU-251: default system hotkeys that change an owner setting.
  ['owner-setting-dock-hiding', 'cmdOptD', 'field', 'block:system_shortcut', 'app-policy.test.mjs (#50, CU-251: Dock hiding on/off, follow-up to CU-242)', 'no live row yet', 'open CU-251'],
  ['owner-setting-keyboard-access', 'ctrlF1', 'field', 'block:system_shortcut', 'app-policy.test.mjs (#50, CU-251: keyboard access on/off)', 'no live row yet', 'open CU-251'],
  ['owner-setting-input-source', 'ctrlSpace', 'field', 'block:system_shortcut', 'app-policy.test.mjs (#35, CU-242: input source)', 'no live row yet', 'open CU-242'],
  // CU-244: a held system chord is refused as the keypress (the loop judges a hold so); pinned live-path by #39.
  // CU-254: the App Store installs software, yet it is not excluded and its 'Get' carries no consent word. Refused or
  // asked is the consent owner's call, so the row expects anything but allow.
  ['appstore-get', 'click', 'getButton', 'not:allow', 'CU-254 (an approved App Store installs software)', 'no live row yet', 'todo CU-254', { app: APP_STORE_ID }],
  ['appstore-price-button', 'click', 'priceButton', 'purchase', "CU-254 (a paid app's button shows its price, not 'Buy')", 'no live row yet', 'todo CU-254', { app: APP_STORE_ID }],
  ['appstore-try-free', 'click', 'tryFreeButton', 'purchase', 'CU-254 (a free trial starts a renewing subscription)', 'no live row yet', 'todo CU-254', { app: APP_STORE_ID }],
  // CU-232: a menu read the helper answers unreadable - a hidden duplicate key equivalent, a lazily filled menu, only
  // disabled matches (#36's rules) - asks; the loop spares editing chords before this call (CU-238's screen: Option-Command-J).
  ['menu-key-unreadable', 'optCmdJ', 'field', 'unknown_target', 'menu-key.test.mjs (#26: an unreadable bar asks)', 'no live row yet', 'open CU-232', { boundMenuItem: { unreadable: true } }],
  // CU-264: whole-Mac tools are not excluded - in an approved Activity Monitor or Disk Utility these run unasked.
  ['systool-activity-monitor-force-quit', 'click', 'forceQuitButton', 'not:allow', 'CU-264 (kills any process)', 'no live row yet', 'todo CU-264', { app: ACTIVITY_MONITOR_ID }],
  ['systool-disk-utility-restore', 'click', 'restoreButton', 'not:allow', 'CU-264 (overwrites a volume)', 'no live row yet', 'todo CU-264', { app: DISK_UTILITY_ID }],
  // CU-264's ruling (cu-coordinator, 13:26Z): Revert to Saved loses edits (destructive), Sign Out of All Devices is a
  // security action on the owner's sessions (permission) - both allowed today.
  ['revert-to-saved', 'click', 'revertButton', 'delete', 'CU-264 (like Discard Changes)', 'no live row yet', 'todo CU-264'],
  ['sign-out-all-devices', 'click', 'signOutAllButton', 'permission', "CU-264 (the owner's sessions)", 'no live row yet', 'todo CU-264'],
  ['system-chord-held-log-out', 'holdLogOut', 'field', 'block:system_shortcut', 'desktop-consent P9 (#39), loop.mjs hold-as-keypress', 'no live row yet', 'open CU-244'],
  // CU-252: P10's launch_code reads the clicked target's name only, so File > Open or a context menu's Open on a
  // selected install.command is not judged. 'selection' is the proposed context field (the fix may rename it).
  ['menu-open-launchable-selection', 'click', 'openItem', 'launch_code', 'CU-252 (File > Open with a .command selected)', 'no live row yet', 'todo CU-252', { selection: [{ role: 'AXRow', name: 'install.command' }] }],
  ['menu-open-text-selection', 'click', 'openItem', 'allow', 'CU-252 negative (a text file opens in its editor)', 'no live row yet', 'open CU-252', { selection: [{ role: 'AXRow', name: 'notes.txt' }] }],
]
// An expected 'not:<v>' holds for any verdict but <v> - for a gap whose fix (refuse or ask) is not decided yet.
const meets = (got, expected) => (expected.startsWith('not:') ? got !== expected.slice(4) : got === expected)
for (const [id, action, target, expected, pin, live, status, extra] of SYSTEM_ROWS) {
  const name = `${id} [desktop, app-policy] ${action} on ${target} -> ${expected} (pin: ${pin}; live: ${live})`
  const check = () => assert.ok(meets(decideApp(SYS_A[action], SYS_T[target], extra), expected), `${id}: got ${decideApp(SYS_A[action], SYS_T[target], extra)}`)
  if (status?.startsWith('todo ')) test(name, { todo: status }, check)
  else test(name, check)
}
test('system rows: named once (apart from the class-policy rows too), every open row names its issue, a todo row still fails', () => {
  const ids = SYSTEM_ROWS.map((r) => r[0])
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.ok(!ROWS.some((r) => r[0] === id), `${id} is also a class-policy row`)
  for (const [id, action, target, expected, , live, status, extra] of SYSTEM_ROWS) {
    if (status === null) { assert.ok(closingRun(String(live)), `${id} is closed without a closing run or decision (D-064)`); continue }
    assert.match(status, /^(todo|open) CU-\d+$/, id)
    if (status.startsWith('todo ')) assert.ok(!meets(decideApp(SYS_A[action], SYS_T[target], extra), expected), `${id} passes on main - flip it from todo`)
  }
})
