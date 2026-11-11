import { isMessagingApp } from './app-kinds.mjs'
import { normaliseForPolicy, normaliseText } from './normalise.mjs'
import { BIP39_ENGLISH } from './bip39-english.mjs'
import { normalizeKey } from './keys.mjs'
import { originPattern } from './sites.mjs'
import { amountClass, canonicalForms, grammarClasses, grammarClassesBase, inertLinkAmountClass, synonymForms } from './phrase-grammar.mjs'

/**
 * The action policy (design: action-policy.md, consent-gate.md). `classify` runs in the dispatcher for every action,
 * inside every batch (R27), and answers `{ decision, class, rule, reason }` with `decision` one of `allow`,
 * `confirm`, `block`, `handoff`; the most restrictive rule wins. Only the caller grants pre-approvals, never the model
 * or the page; `purchase`, `delete` and `permission` always confirm at action time.
 */

export const CLASSES = Object.freeze(['submit', 'purchase', 'delete', 'permission', 'credential', 'sensitive_data', 'new_site', 'page_dialog', 'install', 'file_choice', 'launch_code', 'physical'])
export const NEVER_PRE_APPROVED = Object.freeze(['purchase', 'delete', 'permission', 'file_choice', 'launch_code', 'physical'])

/** Word lists matched on a target's accessible name, case-insensitively, at word boundaries; they err toward confirm. */
// CU-293 (cu-developer-one; cu-coordinator: Urgent - the owner works in Chinese): each name class in Simplified and
// Traditional Chinese. CJK has no word gaps, so a phrase matches inside a longer label ('立即购买' asks purchase); named
// over-asks: a label that merely contains one ('删除线', strikethrough). Other languages are a named limit.
const ZH_WORDS = Object.freeze({
  purchase: ['购买', '購買', '支付', '付款', '结账', '結帳', '结算', '結算', '下单', '下單', '提交订单', '提交訂單', '订阅', '訂閱', '充值',
    '儲值', '转账', '轉帳', '汇款', '匯款', '捐款', '捐赠', '捐贈', '免费试用', '免費試用', '预订', '預訂', '续订', '續訂', '升级套餐', '升級方案',
    // CU-294 (cu-researcher's web sweep): renewals and memberships.
    '续费', '續費', '开通会员', '開通會員', '立即开通', '立即開通', '升级会员', '升級會員', '开通vip', '開通vip'],
  delete: ['删除', '刪除', '移到废纸篓', '移到垃圾桶', '清空废纸篓', '清空垃圾桶', '抹掉', '抹除', '清除', '清空', '卸载', '解除安裝', '移除',
    '丢弃', '捨棄', '不保存', '不儲存', '替换', '取代', '覆盖', '覆寫', '还原到上次存储', '回復到上次儲存', '注销账户', '註銷帳號',
    '关闭账户', '關閉帳號', '取消订阅', '取消訂閱',
    // cu-researcher's zh sweep (Apple guide labels): Traditional words differ, not just glyphs.
    '丟到垃圾桶', '丟到資源回收筒', '清倒废纸篓', '清倒垃圾桶', '不存储',
    // CU-294: an account closed in other words.
    '注销账号', '註銷帳號', '注销帐号', '删除账号', '刪除帳號', '注销账户'],
  permission: ['共享', '分享', '邀请', '邀請', '授权', '授權', '公开', '公開', '始终允许', '總是允許', '总是允许', '永遠允許', '一律允许',
    '允许访问', '允許存取', '不再询问', '不再詢問', '不再提示', '记住我的选择', '記住我的選擇', '记住此选择', '设为默认', '設為預設',
    '保存密码', '儲存密碼', '记住密码', '記住密碼', '保存通行密钥', '儲存通行密鑰', '创建通行密钥', '建立通行密鑰', '关闭两步验证',
    '關閉兩步驟驗證', '关闭双重认证', '關閉雙重認證', '打开摄像头', '開啟相機', '打开麦克风', '開啟麥克風',
    // CU-289's amended ruling in Chinese: Never Save keeps a per-site exception.
    '永不保存', '永不儲存',
    // CU-294 (cu-researcher; Firefox's own 'Remember this decision' checkbox, mozilla-l10n).
    '记住此决定', '記住此決定'],
  submit: ['发送', '發送', '傳送', '发布', '發佈', '發布', '提交', '注册', '註冊', '送出', '发表', '發表', '加入会议', '加入會議', '加入通话',
    // CU-421: running a script.
    'run script', 'run the script',
    // CU-422: civic, legal and employment acts in the owner's name.
    'cast ballot', 'cast your ballot', 'cast vote', 'sign petition', 'sign the petition', 'quit job', 'quit my job', 'decline offer',
    'accept offer', 'apply now', 'enroll now', 'submit vote',
    // CU-430: accepting an airline's new itinerary or schedule change binds the trip.
    'accept new itinerary', 'accept the new itinerary', 'accept schedule change', 'accept the schedule change', 'accept itinerary change',
    // CU-428: listing or relisting an item and accepting a return bind a sale.
    'list now', 'list it now', 'relist', 'relist item', 'accept return', 'accept the return',
    '视频通话', '視訊通話', '语音通话', '語音通話', '开始会议', '開始會議', '接受邀请', '接受邀請', '拒绝邀请', '拒絕邀請',
    '部署', '退出群聊', '退出群組', '取消会议', '取消會議', '举报', '檢舉', '申请加入', '申請加入', '报税', '報稅',
    // cu-researcher on #145: Reply (回复 / 回覆) - judged like English 'reply', by CU-157's text-entered rule.
    '回复', '回覆',
    // CU-294: joining or starting a meeting, and placing a call, in a meeting app's words.
    '入会', '入會', '立即入会', '发起会议', '發起會議', '快速会议', '拨打', '撥打'],
})
// CU-352 (design note 0.1; cu-coordinator: High) and CU-345: the same name classes in German, French, Spanish, Russian,
// Japanese and Korean, so a 'Zahlungspflichtig bestellen', 'Supprimer', 'Отправить' or '결제하기' button asks as its English
// would. Latin and Cyrillic entries match whole words (namesWord's letter-aware boundary); Japanese and Korean ones match
// inside a label, as Chinese does. Named over-asks: a label that merely contains a phrase ('削除線'). Other languages stay
// a named limit.
const LOCALE_WORDS = Object.freeze({
  purchase: ['kaufen', 'jetzt kaufen', 'bezahlen', 'jetzt bezahlen', 'bestellen', 'zahlungspflichtig bestellen', 'kaufen und bezahlen', 'zur kasse',
    'acheter', 'payer', 'commander', 'passer la commande', 'valider la commande', 'acheter maintenant',
    'comprar', 'pagar', 'realizar pedido', 'finalizar compra', 'tramitar pedido', 'comprar ahora',
    'купить', 'оплатить', 'заказать', 'оформить заказ',
    '購入', '支払', '注文を確定', '注文する', 'レジに進む', '今すぐ買う',
    '구매', '결제', '주문하기', '바로구매'],
  delete: ['löschen', 'entfernen', 'verwerfen', 'supprimer', 'effacer', 'eliminar', 'borrar', 'удалить', 'стереть', '削除', '消去', '삭제', '지우기'],
  submit: ['senden', 'absenden', 'abschicken', 'envoyer', 'soumettre', 'enviar', 'отправить', '送信', '보내기', '전송', '제출'],
  // CU-345: a PIN, one-time code, security code or password field named in these languages.
  secret: ['passwort', 'kennwort', 'sicherheitscode', 'prüfziffer', 'mot de passe', 'code de sécurité', 'cryptogramme',
    'contraseña', 'código de seguridad', 'пароль', 'код безопасности', 'パスワード', '暗証番号', 'セキュリティコード', '認証コード',
    '비밀번호', '보안코드', '인증번호',
    // cu-researcher's red team of PR #323: PIN, one-time code, card-check and card-number names the first list missed.
    // German writes compounds: an entry led by '…' also matches as the end of a longer word (Kreditkartennummer).
    '…geheimzahl', '…bestätigungscode', '…sicherheitscode', '…prüfnummer', '…prüfziffer', '…kartennummer', '…karten nummer', '…einmalcode', 'einmal code',
    'sms code', 'bestätigungs code', 'sicherheits code', 'code de vérification', 'numéro de carte',
    'código de verificación', 'número de tarjeta', 'код подтверждения', 'номер карты', 'pin-код', '確認コード', 'カード番号',
    '인증 코드', '카드 번호', '카드번호'],
})
// CU-355 (design note 0.1): personal-ID field names in German, French, Spanish, Russian, Japanese and Korean - the third
// locale side beside CU-352's action names and CU-345's credential names. '…' leads a German compound ending.
const LOCALE_ID_NAMES = Object.freeze(['reisepass', '…passnummer', 'geburtsdatum', '…steuernummer', 'steuer id', 'steuer-id',
  'steueridentifikationsnummer', '…ausweisnummer', 'personalausweis', '…versicherungsnummer', '…kontonummer',
  'passeport', 'numéro de passeport', 'date de naissance', 'numéro fiscal', "numéro d'identification fiscale", 'numéro de sécurité sociale',
  'numéro de compte', "carte d'identité",
  'pasaporte', 'número de pasaporte', 'fecha de nacimiento', 'número de identificación fiscal', 'nif', 'dni', 'número de cuenta',
  'número de seguridad social',
  'паспорт', 'номер паспорта', 'дата рождения', 'инн', 'снилс', 'номер счета', 'номер счёта',
  'パスポート', '旅券番号', '生年月日', 'マイナンバー', '個人番号', '口座番号',
  '여권', '여권번호', '생년월일', '주민등록번호', '계좌번호', '사업자등록번호'])
const WORDS = Object.freeze({
  purchase: ['buy', 'pay', 'order', 'place order', 'checkout', 'check out', 'subscribe', 'donate', 'purchase', 'transfer', 'withdraw', 'wire', 'send money',
    // CU-452 (cu-coordinator 22:28Z): an unlimited token approval lets a contract drain the wallet - purchase leads over the older submit.
    'approve unlimited', 'approve unlimited spending', 'allow unlimited spending',
    // CU-444 (cu-coordinator 20:54Z): publishing a campaign starts paid spend - purchase leads over the older 'publish' submit.
    'publish campaign', 'publish the campaign', 'publish ad', 'publish ads', 'publish the ad',
    // CU-422 (High; cu-coordinator 15:23Z): tips and renewals spend money.
    'add tip', 'add a tip', 'renew license', 'renew my license',
    // CU-430 (High; cu-coordinator 17:09Z): travel add-ons, seat upgrades, miles and flight changes spend money or points.
    'add bag', 'add bags', 'add checked bag', 'add a checked bag', 'add checked bags', 'add insurance', 'add travel insurance',
    'upgrade seat', 'upgrade my seat', 'use miles', 'use points', 'redeem miles', 'change flight', 'change my flight', 'change dates',
    'change travel dates',
    // cu-coordinator 17:20Z (round 2): trip insurance.
    'add trip insurance', 'add flight insurance',
    // CU-436 (cu-coordinator 19:06Z): removing a spending limit lifts cloud spending - purchase leads over the older 'remove' delete.
    'remove spending limit', 'remove the spending limit', 'remove spending cap', 'remove the spending cap',
    // CU-428 (High; cu-coordinator 16:45Z): memberships and trials start a recurring charge; a counteroffer binds a sale.
    'become a member', 'become a premium member', 'start my trial', 'start trial', 'start your trial', 'start my free trial',
    'accept counteroffer', 'accept counter offer', 'accept the counteroffer',
    // CU-415 (High; cu-coordinator 13:10Z): bookings commit money.
    'book flight', 'book a flight', 'book hotel', 'book room', 'book a room', 'confirm booking', 'complete booking',
    // cu-coordinator 13:19Z (round 3).
    'book tickets', 'book car', 'book a car', 'book trip', 'book a trip', 'confirm reservation',
    // CU-416 (High; cu-coordinator 13:32Z): admin consoles move other people's money.
    'run payroll', 'release payment', 'send payment', 'approve payment run', 'process refund', 'issue card', 'issue a card',
    'issue new card', 'raise credit limit', 'increase credit limit',
    // cu-coordinator 13:43Z: plurals and synonyms.
    'release payments', 'process refunds', 'run payrolls', 'process payroll', 'refund customer', 'raise limit', 'increase limit',
    'increase spending limit', 'raise spending limit', 'issue virtual card', 'reimburse', 'send payments', 'approve payment',
    'approve payments',
    // CU-417 (High; cu-coordinator 14:03Z): launching or creating cloud resources spends money.
    'launch instance', 'launch an instance', 'create instance', 'create an instance', 'create cluster', 'create a cluster',
    // cu-coordinator 14:34Z (round 3): plurals and synonyms.
    'launch instances', 'create instances', 'create vm', 'create a vm', 'spin up', 'scale up',
    // CU-410 (High; cu-coordinator 10:17Z): billing wordings one word from the asking ones.
    'add seats', 'add licenses', 'add credits', 'top up credits', 'resume subscription', 'upgrade seats', 'gift a subscription',
    'send gift', 'get tickets',
    // CU-408 (High; cu-coordinator 09:43Z): payments, schedules, autopay, refunds and charges move money.
    'confirm payment', 'authorize payment', 'authorise payment', 'submit payment', 'make payment', 'make a payment', 'pay now',
    'schedule payment', 'schedule a payment', 'set up autopay', 'enable autopay', 'turn on autopay', 'issue refund', 'issue a refund',
    'charge card', 'charge customer', 'capture payment', 'send invoice payment',
    // CU-409 (High; cu-coordinator 10:08Z): positions, liquidity, listings and offers, and token-spend approvals move money.
    'open position', 'close position', 'add liquidity', 'remove liquidity', 'list for sale', 'make offer', 'make an offer', 'accept offer',
    'set spending cap', 'increase allowance', 'approve spending',
    // cu-coordinator 10:19Z: the near forms.
    'open long', 'open short', 'close all positions', 'market close', 'list nft', 'list item', 'repay loan',
    // CU-401 (High; cu-coordinator 05:16Z): ending a paid plan.
    'cancel plan', 'cancel membership', 'downgrade', 'end trial',
    // CU-400 (High; cu-coordinator 04:39Z): a trade, swap, stake or signature moves money and cannot be taken back.
    'confirm transaction', 'sign transaction', 'sign message', 'swap', 'stake', 'trade', 'sell now', 'confirm swap', 'confirm trade', 'confirm sale',
    // cu-coordinator 04:44Z (cu-verifier's stand-in: 'Bridge' acted unasked): a bridge moves tokens between chains.
    'bridge', 'bridge tokens', 'confirm bridge',
    // cu-coordinator 04:50Z: minting and unstaking, selling all, converting now.
    'mint', 'mint nft', 'confirm mint', 'unstake', 'sell all', 'convert now',
    // CU-386 (High pending a live row; cu-coordinator 23:42Z): money committed outside a checkout - an irreversible spend
    // (D-063), as whole phrases.
    'place bid', 'bid now', 'make offer', 'make an offer', 'accept offer', 'pledge', 'top up', 'top-up', 'add funds', 'add money',
    'cash out', 'place bet', 'place a bet', 'send tip', 'send a tip', 'tip creator',
    'confirm bid', 'back this project', 'bet now', 'swap now', 'confirm swap', 'stake now', 'mint now', 'rent now', 'tip now',
    'sell now', 'confirm sale',
    // CU-288 (cu-researcher's real-app wordings, round 2): a booking, an upgrade or a renewal commits money.
    'book now', 'book this', 'reserve now', 'upgrade plan', 'upgrade now', 'upgrade to pro', 'upgrade to premium', 'renew subscription', 'renew now',
    'renew plan', ...ZH_WORDS.purchase, ...LOCALE_WORDS.purchase],
  // CU-135: replace and overwrite (a save panel's 'already exists' sheet), don't save (a close sheet discards work).
  delete: ['delete', 'remove', 'discard', 'erase', 'empty trash', 'cancel subscription', 'replace', 'overwrite', "don't save", 'don\u2019t save',
    // CU-430 (CU-415 family): cancelling a flight cancels a trip.
    'cancel flight', 'cancel my flight', 'cancel this flight', 'cancel this trip', 'cancel my trip', 'cancel the trip',
    // CU-415: cancelling a booking is often fee-bearing and not undoable.
    'cancel reservation', 'cancel booking', 'cancel my booking', 'cancel my reservation',
    'cancel trip', 'cancel my trip', 'cancel appointment', 'cancel my appointment',
    // CU-416: ending someone's employment or access.
    'terminate employee', 'offboard user', 'offboard employee', 'offboard',
    // CU-417: dropping or terminating data and infrastructure; 'Force push' (CU-403's #477, carried so CU-417 closes alone).
    'drop database', 'drop table', 'drop schema', 'terminate instance', 'terminate instances', 'force push',
    'drop collection', 'truncate table', 'terminate server', 'terminate servers', 'terminate cluster', 'terminate clusters',
    // CU-411 (High; cu-coordinator 11:00Z): closing, terminating, resetting or wiping an account or its data.
    'close my account', 'close account', 'terminate account', 'reset account', 'clear data', 'clear all data', 'wipe data',
    'erase account', 'factory reset',
    // CU-401: disabling an account, like deactivating it.
    'disable account', 'disable my account',
    // CU-146 (the CU-145 audit): destructive labels the list missed.
    'move to trash', 'move to bin', 'empty bin', 'clear history', 'clear all', 'reset all', 'reset settings', 'reset to defaults', 'uninstall', 'wipe', 'purge',
    'deactivate', 'close account', 'forget', 'factory reset',
    // cu-researcher's 13:23Z sweep: unsaved edits lost, like Discard Changes.
    'revert to saved', 'revert all changes', ...ZH_WORDS.delete, ...LOCALE_WORDS.delete],
  permission: ['share', 'invite', 'permission', 'permissions', 'api key', 'grant access', 'make public', 'security', 'revoke',
    // CU-431 (High; cu-coordinator 17:23Z): router / NAS admin acts that expose the home network or its admin access.
    'enable remote management', 'enable remote access', 'enable ssh', 'enable telnet', 'open port', 'open a port', 'add port forwarding',
    'add port forward', 'enable dmz', 'enable upnp', 'expose to internet', 'expose to the internet', 'allow wan access',
    // cu-coordinator 17:39Z (round 2): verb synonyms, a plural and an article.
    'turn on remote management', 'turn on remote access', 'allow remote access', 'allow remote management', 'turn on upnp',
    'turn on ssh', 'open ports', 'enable the dmz', 'turn on dmz', 'turn on the dmz',
    // CU-420 (High; cu-coordinator 15:00Z): turning machine protection off, or trusting a device.
    'disable filevault', 'turn off filevault', 'turn off firewall', 'disable firewall', 'disable the firewall', 'disable antivirus',
    'turn off antivirus', 'turn off real-time protection', 'disable real-time protection', 'trust this device', 'trust device',
    'disable defender', 'turn off defender', 'pause protection', 'remember this device',
    // CU-421 (High; cu-coordinator 15:00Z): system-level control - SIP off, full disk access, accessibility.
    'disable sip', 'disable system integrity protection', 'grant full disk access', 'allow full disk access', 'enable full disk access',
    'enable accessibility', 'allow accessibility access', 'grant accessibility access',
    // cu-coordinator 15:25Z: trusting or installing a root certificate.
    'trust certificate', 'trust this certificate', 'install certificate', 'install the certificate', 'always trust',
    // CU-422: a specific legal consent (unlike CU-415's named 'I agree' click-through limit, which stays free).
    'i consent', 'give consent', 'give my consent',
    // CU-423 (High; cu-coordinator 15:50Z): home access codes and keys, photo-library grants.
    'create access code', 'create an access code', 'share access code', 'add home key', 'share home key', 'invite to home',
    'allow access to all photos', 'grant photo library access', 'allow full photo access',
    // cu-coordinator 16:11Z (round 2).
    'change access code', 'edit access code', 'create new access code', 'create a new access code', 'allow full access',
    // CU-424 (High; cu-coordinator 16:02Z): OAuth grants, delegates and location sharing hand an outside party the owner's
    // account, mail or location. It carries #448's (CU-393) OAuth phrases as duplicates so the High closes alone.
    'authorize', 'authorise', 'authorize app', 'authorize access', 'allow access', 'connect app', 'connect account',
    'connect your account', 'link account', 'link your account', 'sign in with google', 'sign in with apple',
    'sign in with microsoft', 'sign in with github', 'sign in with facebook', 'continue with google', 'continue with apple',
    'continue with microsoft', 'continue with github', 'continue with facebook', 'log in with google', 'log in with apple',
    'add delegate', 'add a delegate', 'grant mailbox access', 'share my location', 'share location', 'start sharing location',
    // cu-coordinator 16:36Z (round 2).
    'link accounts', 'delegate access', 'grant inbox access', 'grant calendar access', 'start sharing my location',
    'turn on location sharing',
    // CU-427 (High; cu-coordinator 16:36Z): approving another agent's actions - a one-click route for an injected command.
    'allow tool', 'allow this tool', 'always allow', 'trust workspace', 'trust this workspace', 'trust folder', 'trust this folder',
    'turn on yolo mode', 'enable yolo mode', 'auto-approve', 'auto approve', 'accept all edits', 'accept all changes', 'apply all changes',
    // cu-coordinator 16:52Z (round 2): VS Code's workspace-trust button and the bulk-accept forms.
    'trust the authors', 'yes, i trust the authors', 'accept all suggestions', 'apply all edits',
    // CU-415: signatures bind the owner; releasing records shares personal data.
    'sign document', 'sign the document', 'e-sign', 'esign', 'adopt and sign', 'sign and submit', 'accept terms', 'accept the terms',
    'accept agreement', 'accept the agreement', 'authorize release', 'authorise release', 'release records',
    'sign agreement', 'sign the agreement', 'sign contract', 'sign the contract', 'release my records',
    // CU-416: acting as another person.
    'impersonate', 'impersonate user', 'view as user', 'view as this user',
    // CU-417: collaborators (CU-403's #477, carried) and branch protection open access.
    'add collaborator', 'add collaborators', 'disable branch protection', 'remove branch protection',
    'add member', 'add members', 'disable protection', 'unprotect branch',
    // CU-411: ownership and admin grants widen access.
    'make owner', 'make co-owner', 'transfer ownership', 'make admin', 'grant admin',
    // CU-408: adding a payee widens who can be paid.
    'add payee', 'add a payee', 'add recipient', 'add beneficiary',
    // CU-401: leaving a shared space or unlinking an account.
    'leave workspace', 'leave organization', 'leave organisation', 'leave org', 'leave team', 'leave server', 'unlink account',
    // CU-386 (cu-coordinator 23:54Z): asking someone else for money.
    'request money',
    // CU-258 (cu-researcher): standing choices an app keeps after the run, as whole phrases. A bare 'Allow' stays free so
    // cookie banners do not ask (named limit).
    'always allow', 'always trust', 'always open', 'allow access', "don't ask again", 'don\u2019t ask again', 'do not ask again',
    'remember my choice', 'remember this choice', 'remember my decision', 'never for this website', 'never for this site',
    'set as default', 'make default',
    // cu-coordinator 14:17Z (with CU-258): Finder's Get Info 'Change All...' sets the default app for every file of a type.
    'change all',
    // cu-researcher's CU-258 remainder (#63): more standing-choice wordings.
    'always use this app', 'always use this application', 'do not ask me again', "don't ask me again", 'don\u2019t ask me again',
    // CU-286 (cu-researcher's real-app wordings): the same standing choices in other words.
    'allow always', 'remember this decision', 'remember decision',
    // CU-261 (cu-researcher): a camera or microphone switched on reaches other people.
    'turn on camera', 'turn on microphone', 'turn on video', 'start video', 'unmute',
    // CU-289 (cu-researcher): storing a credential in a browser's or app's password store is a standing choice. 'Remember
    // me' (staying signed in) and a plain or draft Save stay free; 'Update password' already hands off (password_change).
    'save password', 'save passwords', 'remember password', 'remember passwords', 'save login', 'save logins',
    'save login info', 'remember login', 'save credentials', 'save to keychain', 'save in keychain',
    // cu-researcher on #136: a passkey is a credential too; 'Never save' keeps a standing exception like 'Never for this site'.
    'save passkey', 'save a passkey', 'save passkeys', 'save this passkey', 'never save',
    // cu-developer-one's ruling: creating a passkey registers a new credential with the site; using one to sign in stays free.
    'create passkey', 'create a passkey', 'add passkey', 'add a passkey',
    // cu-researcher's 13:23Z sweep: an account-wide sign-out.
    'sign out of all devices', 'sign out everywhere', 'log out of all devices', 'log out everywhere',
    // CU-270 (cu-researcher): switching an account's protection off - every verb with every protection, as whole phrases
    // ('Turn off notifications' stays free). ChatGPT confirms any change to account permissions.
    ...['turn off', 'disable', 'remove', 'allow'].flatMap((verb) => ['2 step', 'two step', 'two factor', '2fa', 'mfa', 'multi factor',
      'password', 'passkey', 'passkeys', 'security key', 'security keys', 'login alerts', 'sign in alerts', 'account recovery', 'find my',
      'less secure apps', 'less secure app access'].map((what) => `${verb} ${what}`)), ...ZH_WORDS.permission],
  submit: ['send', 'post', 'submit', 'publish', 'reply', 'sign up', 'register',
    // CU-261 (cu-researcher; cu-coordinator: High): actions that reach other people or commit shared work, as whole
    // phrases. A bare Accept, Connect, Join or Follow stays free (cookie banners, Wi-Fi, generic joins: named limits).
    'facetime', 'video call', 'audio call', 'voice call', 'start call', 'start a call', 'join meeting', 'join call',
    'join with video', 'join with audio', 'join now', 'start meeting', 'start a meeting', 'accept invitation',
    'decline invitation', 'accept invite', 'decline invite', 'rsvp', 'tweet', 'approve', 'merge pull request',
    'confirm merge', 'squash and merge', 'rebase and merge', 'deploy', 'run workflow',
    // CU-377 (cu-coordinator 21:43Z): a file leaving through another app - an upload or attachment sends it.
    'upload file', 'upload files', 'attach', 'attach file', 'attach files', 'share file',
    // cu-researcher's 13:23Z sweep: messages to the sender or the group.
    'unsubscribe', 'report spam', 'report junk', 'leave group', 'leave conversation', 'leave channel',
    // cu-researcher on #98: a cancellation goes to every attendee.
    'cancel meeting', 'cancel event', 'cancel invitation', 'send cancellation',
    // CU-286 (cu-researcher's real-app wordings): a request to join a meeting, and Slack's huddle (a call to the channel).
    'ask to join', 'start huddle', 'start a huddle', 'join huddle',
    // CU-288: a tax filing goes to the authority.
    'file return', 'file tax return', 'file your return', 'file my return', 'e-file', 'efile', 'submit return', 'submit tax return', ...ZH_WORDS.submit, ...LOCALE_WORDS.submit],
})
// CU-377 follow-up: the file browsers whose rows are files (the same set as app-policy's FILE_BROWSERS).
const FILE_BROWSER_APPS = new Set(['com.apple.finder', 'com.cocoatech.PathFinder', 'com.binarynights.ForkLift-3', 'com.binarynights.ForkLift', 'com.eltima.cmd1', 'com.mrrsoftware.marta', 'org.yanex.marta'])
const SHARE_DESTINATION = /\b(?:airdrop|shared(?:\s+(?:folder|with\s+me|with\s+you))?|drop\s+box|dropbox|public\s+folder|server|network|(?:smb|afp|nfs|webdav):)/i
const ACCOUNT_SECURITY = /\b(?:(?:generate|create|new|add)\s+(?:an?\s+)?app[\s-]?(?:specific[\s-]?)?passwords?|app[\s-]?(?:specific[\s-]?)?passwords?|(?:enable|disable|turn\s+(?:on|off)|set\s+up|add\s+(?:a\s+)?)?\s*(?:auto[\s-]?forward(?:ing)?|automatic(?:ally)?\s+forward(?:ing)?|forwarding(?:\s+address)?|forward\s+(?:a\s+copy|incoming|all|to)\b)|two[\s-]?(?:factor|step)(?:\s+(?:authentication|verification|login))?|2[\s-]?step\s+verification|create\s+(?:a\s+|new\s+)?filter|2fa|multi[\s-]?factor(?:\s+authentication)?|(?:change|update|edit)\s+(?:your\s+)?e-?mail(?:\s+address)?(?!\s+(?:notifications?|preferences|settings))|(?:change|update|edit)\s+(?:your\s+)?phone(?:\s+number)?|recovery\s+(?:e-?mail|phone|codes?))\b/i
// CU-395 (High; cu-coordinator 03:01Z): 'physical' - a control that acts in the physical world (a lock, a garage door, an
// alarm, a lost device) - leads every class, is never pre-approved and asks each time.
// cu-coordinator 03:14Z: 'unlock' only beside a physical noun - paywalls ('Unlock Premium', 'Unlock all features') stay free.
const PHYSICAL_NOUN = '(?:door|doors|lock|locks|deadbolt|gate|garage|front|back|side|car|vehicle|trunk)'
const UNLOCK_PHYSICAL = new RegExp(`\\bunlock\\b.*\\b${PHYSICAL_NOUN}\\b|\\b${PHYSICAL_NOUN}\\b.*\\bunlock\\b`, 'i')
const TRADE_ASSET = /\b(?:btc|eth|usd|eur|gbp|jpy|usdt|usdc|dai|sol|xrp|ada|doge|bnb|bitcoin|ethereum|crypto|coins?|tokens?|shares?|stocks?)\b/i
const TRADE_WORDS = /\b(?:trade|trading|swap|swaps|stake|staking|unstake|sell|selling|bridge|mint|minting)\b/gi
const TRADE_NAV = /\b(?:trade|trading|swap|swaps|stake|staking|unstake|sell|selling|bridge|mint|minting)\b[\s\S]*\b(?:history|settings|faq|guide|policy|fees|rates|limits)\b/i
// cu-coordinator 11:13Z adds 'Rotate secret', 'Regenerate token', 'New token' and a settings 'Reset password' (CU-401's family).
const KEY_TOKEN_ACT = /^\s*(?:(?:rotate|regenerate|revoke)\s+(?:the\s+|your\s+)?(?:api\s+|access\s+|secret\s+)?(?:key|secret|token)|(?:generate|create|revoke|new)\s+(?:an?\s+|new\s+)?(?:api\s+|access\s+|personal\s+access\s+)?token|new\s+api\s+key)\b/i
const RESET_PASSWORD = /^\s*reset\s+(?:your\s+|my\s+)?password\s*$/i
// CU-411 round 2: my / your / the between the verb and account / data ('Close your account', 'Clear my data').
const ACCOUNT_WIPE = /^\s*(?:(?:close|terminate|reset|erase)\s+(?:my\s+|your\s+|the\s+)account|(?:clear|wipe|erase)\s+(?:all\s+)?(?:my\s+|your\s+|the\s+)(?:all\s+)?data)\b/i
const PRECEDENCE = ['physical', 'purchase', 'launch_code', 'delete', 'permission', 'page_dialog', 'credential', 'sensitive_data', 'submit', 'new_site', 'install']
// CU-418 (High; cu-coordinator 14:14Z): the physical near forms - disabling an alarm or a security camera, starting a car,
// heating an oven, heater or stove, buzzing someone in.
const PHYSICAL_NEAR = ['disable alarm', 'disable the alarm', 'turn off camera', 'turn off cameras', 'disable camera', 'disable cameras',
  'start car', 'start the car', 'remote start', 'start engine', 'start the engine', 'turn on oven', 'turn on the oven', 'preheat oven',
  'preheat the oven', 'turn on heater', 'turn on the heater', 'turn on stove', 'turn on the stove', 'buzz in', 'let guest in',
  'let the guest in', 'open gate']
// cu-coordinator 14:28Z: one adjective may sit between the verb and these physical objects ('Turn on space heater', 'Start
// the rental car'), the object ends the name (optionally 'now'); plus 'Oven on' and a bare 'Preheat'. Bare 'Stop recording'
// stays free (named: screen and media recorders share the words).
const PHYSICAL_GRAMMAR = new RegExp([
  '^\\s*(?:turn\\s+on|preheat|light|switch\\s+on)\\s+(?:the\\s+)?(?:\\S+\\s+)?(?:oven|heater|stove|burner|fireplace)(?:\\s+now)?\\s*$',
  '^\\s*(?:remote\\s+)?start\\s+(?:the\\s+)?(?:\\S+\\s+)?(?:car|engine|vehicle)(?:\\s+now)?\\s*$',
  '^\\s*let\\s+(?:the\\s+)?(?:\\S+\\s+)?(?:guest|visitor)s?\\s+in\\s*$',
  '^\\s*(?:disable|turn\\s+off|pause)\\s+(?:the\\s+)?(?:\\S+\\s+)?(?:alarm|camera|cameras)(?:\\s+now)?\\s*$',
  '^\\s*(?:oven\\s+on|preheat)\\s*$',
].join('|'), 'i')
const PHYSICAL = ['unlatch', 'disarm', 'disarm security system', 'disarm alarm',
  'turn off alarm', 'open garage', 'open garage door', 'open gate', 'open the gate', 'mark as lost', 'erase device',
  'erase this device', 'lock mode',
  // D-105 ruling (b), cu-coordinator 03:45Z: arming can dispatch responders; 'Lock this device' is Mark As Lost's web twin.
  'arm security system']
// cu-coordinator 03:52Z: the patterns, whole-word and case-insensitive - 'Lock Front Door' and a bare Arm/Open/Lock stay free.
const PHYSICAL_PATTERN = /\barm\s+(?:away|stay|night|home|alarm|system)\b|\bopen\s+(?:the\s+|front\s+|back\s+|side\s+)?door\b|\block\s+(?:this\s+)?(?:device|iphone|ipad|mac|watch)\b/i
const POINTER = new Set(['click', 'double_click', 'triple_click'])
// CU-135 (keyboard-activation.md): a focused button; any control a click activates (Space presses or toggles it); and a
// text input, as the environments name their roles.
const BUTTON_ROLE = /^(ax)?(button|defaultbutton|menubutton|popupbutton)$/i
const CONTROL_ROLE = /^(ax)?(button|defaultbutton|menubutton|popupbutton|checkbox|radiobutton|radio|switch|menuitem|menuitemcheckbox|menuitemradio|link|disclosuretriangle)$/i
// CU-147: a focused collection, where a plain Backspace or Delete removes the selection.
const COLLECTION_ROLE = /^(ax)?(table|outline|list|browser|row|cell|grid|listbox|treegrid|tree|gridcell|option|listitem)$/i
// CU-146: delete words that delete only on a button or menu item - a sidebar row or a link named Trash opens the folder.
const CONTROL_DELETE = ['trash', 'bin']
const TRASH_ROLE = /^(ax)?(button|defaultbutton|menubutton|menuitem)$/i
// CU-142: a multi-line text input, where a Return is text and does not press the default button.
const TEXT_AREA_ROLE = /^(ax)?textarea$/i
// CU-140: a drop zone that deletes - the delete words, and a trash or bin.
// CU-288 (cu-researcher): a free trial starts a renewing subscription wherever it is offered - the whole name, with or
// without its length ('Start 14-day free trial', 'Try 3 months free', 'Try it free'); 'Free trial info' stays free.
const TRIAL_NAME = /^(start (a |your |my )?(\d+[- ]?(day|week|month|year)s? )?free trial|(\d+[- ]?(day|week|month|year)s? )?free trial|try (it |us )?free( for \d+ (days?|weeks?|months?|years?))?|try \d+ (days?|weeks?|months?|years?) (for )?free|get \d+ (days?|weeks?|months?) free)\s*[.!\u2026]?$/i
// cu-researcher on #145: 永不保存 / 永不儲存 (Never Save) is a standing choice; its '不保存' / '不儲存' is not Don't Save.
// CU-359 (D-099: a past-state folder name that over-asks is Medium): CJK phrases match inside a label, so a mail app's
// Sent or Deleted folder (已发送, 送信済み, 삭제됨) read as Send or Delete. The past-state forms are taken out before the
// action-name match; an imperative beside one ('删除已发送邮件', delete the sent mail) still matches.
const PAST_STATE = /已(?:经|經)?(?:发送|發送|傳送|删除|刪除|提交|支付|付款|购买|購買|下单|下單)|(?:送信|削除|購入|支払い?|注文)済み?|(?:삭제|전송|결제|구매|제출)(?:됨|완료|된)/g
const withoutPastState = (name) => String(name ?? '').replace(PAST_STATE, ' ')
const namesDelete = (name) => namesWord(withoutPastState(name).replace(/永不(保存|儲存|存储)/g, ''), WORDS.delete)
const namesPurchase = (name) => namesWord(withoutOrderReferences(withoutPastState(name)), WORDS.purchase) || TRIAL_NAME.test(String(name ?? '').trim())
const DROP_DELETE = [...WORDS.delete, 'trash', 'bin']
const TEXT_ROLE = /^(ax)?(textfield|textarea|searchfield|combobox|textbox|searchbox)$/i

/**
 * The keys of a keypress or a key hold, canonical ('META', 'SPACE', 'BACKSPACE', 'RETURN' as 'ENTER'), or an empty set
 * for any other action. A hold is judged as the same chord pressed (CU-64 H3): its release presses a focused control.
 */
function keysOf(action) {
  return new Set((action.type === 'keypress' || action.type === 'hold_key') && Array.isArray(action.keys) ? action.keys.map((key) => normalizeKey(String(key))) : [])
}

/**
 * CU-135: a keypress that activates a control is judged like a click on it - Space alone presses or toggles the focused
 * button, checkbox, radio, pop-up, menu item, link or disclosure on a Mac (in a text input it types a space). Command-
 * Backspace or Command-Delete, Option too, deletes - Move to Trash, delete immediately, a dialog's Delete - except in a
 * text input, where it deletes text; Command-D with a button focused presses a focused sheet's Don't Save or Delete.
 */
function keyboardActivation(action, target, context = {}) {
  // A typed space or newline on a focused control (not a text input) presses it as Space or Return would (cu-researcher).
  if (action.type === 'type') return { activates: CONTROL_ROLE.test(String(target?.role ?? '')) && /[ \r\n]/.test(String(action.text ?? '')), deletes: false }
  const keys = keysOf(action)
  if (keys.size === 0) return { activates: false, deletes: false }
  // CU-353: an accesskey chord fires the element the browser driver reports for it (target.accessKey) - a press on it.
  if (action.type === 'keypress' && target?.accessKey === true) return { activates: true, deletes: false }
  const button = BUTTON_ROLE.test(String(target?.role ?? ''))
  // CU-234 (keyboard-activation.md): a variant is recognised generously - a miss is an under-ask, a recognised no-op only
  // over-asks. Space with any of Shift, Option or Control presses a focused control (an app that handles Space itself,
  // as CU Fixture's buttons do, presses on them); Command-Space is the system's.
  const onlyWith = (main, allowed) => [...keys].every((key) => key === main || allowed.includes(key))
  const activates = keys.has('SPACE') && onlyWith('SPACE', ['SHIFT', 'ALT', 'CTRL']) && CONTROL_ROLE.test(String(target?.role ?? ''))
  // CU-143 (live, 0.2.34): AppKit sends a key equivalent to the menu before the field editor, so even a plain
  // Command-Backspace in a focused text field fires the app's menu item bound to it (Finder's Move to Trash, Mail's
  // Delete) - Command-Backspace and Command-Delete, with any modifiers, are judged delete on every target.
  // CU-148: with a sheet or alert up, Command-D and Command-Delete press its Don't Save whatever holds the focus - with
  // keyboard navigation off (a default Mac) the focus is the sheet or its window, never the button. The helper reports
  // it (sheet); a Command-D right after Command-W or Command-Q in the batch is aimed at the sheet that close raises.
  const sheetUp = target?.sheet === true || context.afterClose === true
  // CU-234: Command-D with Shift, Option or Control too presses the sheet's Don't Save.
  const deletes = keys.has('META') && ((keys.has('BACKSPACE') || keys.has('DELETE')) || (keys.has('D') && onlyWith('D', ['META', 'SHIFT', 'ALT', 'CTRL']) && (button || sheetUp)))
  // CU-147: exactly Backspace or Delete on a focused collection - a list, table, outline, row or cell, not a text input
  // (a cell being edited is a text field) - removes the selection: Mail moves messages to the Trash with no dialog.
  // CU-234: with Shift, Option or Control too (Shift-Backspace is deleteBackward: in the standard key bindings); with
  // Command it is CU-143's delete above.
  const deleteKey = keys.has('BACKSPACE') ? 'BACKSPACE' : keys.has('DELETE') ? 'DELETE' : null
  const removesSelection = deleteKey !== null && onlyWith(deleteKey, ['SHIFT', 'ALT', 'CTRL']) && COLLECTION_ROLE.test(String(target?.role ?? '')) && !TEXT_ROLE.test(String(target?.role ?? ''))
  return { activates, deletes: deletes || removesSelection }
}
const SECRET = /\{\{secret:[a-z0-9_-]+\}\}/i

/**
 * CU-301: the character a printable key puts into the focused field - a keypress or a hold whose one non-modifier key is
 * a single character or Space, with Shift and/or Option at most (Option types the Mac's special characters); null for
 * anything else. Command or Control make it a shortcut, judged by the rules for chords.
 */
function printableKeyChar(action) {
  if (action.type !== 'keypress' && action.type !== 'hold_key') return null
  const keys = keysOf(action)
  if (keys.has('META') || keys.has('CTRL')) return null
  const main = [...keys].filter((key) => key !== 'SHIFT' && key !== 'ALT')
  if (main.length !== 1) return null
  if (main[0] === 'SPACE') return ' '
  return main[0].length === 1 ? main[0] : null
}

/**
 * A reference to an existing order ('Order #4344', 'Order 4344' with three or more digits, 'Order details') names a record;
 * it is dropped before the purchase words are matched, so the verb ('Order', 'Order now', 'Place order') still confirms
 * and any other purchase word in the same name still counts (CU-8: a double-click on a list cell 'Order #4344').
 */
const ORDER_REFERENCE = /(^|[^a-z])order\s*(?:#|no\.|number\b|id\b)\s*#?[\w-]*\d[\w-]*|(^|[^a-z])order\s+\d{3,}[\w-]*|(^|[^a-z])order\s+(?:details|history|status|summary|tracking|lookup)([^a-z]|$)/gi

// CU-443 (cu-coordinator 20:54Z, a class fold): transferring a phone number is a port-out (credential, from the grammar's phone
// rows), not a money transfer - the 'transfer' purchase word does not read it; CU-446 adds a domain's transfer lock.
const NUMBER_TRANSFER = /(^|[^a-z])transfer\s+(?:(?:my\s+|this\s+|your\s+|the\s+)?(?:phone\s+|mobile\s+)?number|lock)([^a-z]|$)/gi
function withoutOrderReferences(name) {
  return String(name ?? '').replace(ORDER_REFERENCE, ' ').replace(NUMBER_TRANSFER, ' ')
}

/**
 * Typed text minus the values the person wrote in the task itself: an address or number the task names is what the
 * person asked to have typed, not data the agent leaks (CU-8 send-message: typing the task's own address asked
 * sensitive_data). Tokens are compared case-insensitively with punctuation trimmed at their ends; anything left that
 * still looks sensitive - a value the task does not name - still asks.
 */
const TOKEN_EDGES = /^[^\w+@]+|[^\w]+$/g
// CU-354 (design note 0.1): whole values, never tokens. The task's own values are the shortest runs of 1-6 of its tokens
// that the value rules accept; only those, typed back whole (any case, any run of spaces between their tokens), are taken
// out of the typed text. A task word that is only part of a value ('1234' in 'Visa ending in 1234') or a keyword
// ('password') exempts nothing.
function taskValuesOf(task) {
  const tokens = String(task ?? '').split(/\s+/).map((t) => t.replace(TOKEN_EDGES, '')).filter(Boolean)
  const values = []
  for (let i = 0; i < tokens.length; i++) {
    for (let k = 1; k <= 6 && i + k <= tokens.length; k++) {
      const run = tokens.slice(i, i + k).join(' ')
      if (looksSensitive(run)) { values.push(tokens.slice(i, i + k)); break }
    }
  }
  return values
}
function withoutTaskValues(text, task) {
  let out = String(text ?? '')
  for (const parts of taskValuesOf(task)) {
    out = out.replace(new RegExp(parts.map((part) => escapeRegExp(part)).join('\\s+'), 'gi'), ' ')
    // A card or IBAN field reformats as it is typed (cu-researcher): the task's card or IBAN typed back plain, spaced or
    // dashed is the same value, so it is compared on its digits and letters with any spaces or dashes between them.
    const joined = parts.join(' ')
    if (['card', 'iban'].includes(looksSensitive(joined))) {
      const compact = joined.replace(/[\s-]/g, '')
      out = out.replace(new RegExp([...compact].map((ch) => escapeRegExp(ch)).join('[\\s-]*'), 'gi'), ' ')
    }
  }
  return out
}

// CU-178: a name and a list entry are compared normalised - lower case, a curly apostrophe straight, licence spelled
// license, '#' read as 'number', dots dropped (D.O.B., Exp. date, Tax no.) - so one canonical list covers the spellings.
// An entry then matches whole, its regex specials literally, a space in it as any run of spaces or hyphens (Sort-code).
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normaliseName = (text) => String(text ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/licence/g, 'license')
  .replace(/#/g, ' number ').replace(/\./g, '').replace(/\s+/g, ' ').trim()
// CU-352: an entry with an accented Latin or a Cyrillic letter is bounded by any letter, so 'удалить' does not match inside
// a longer word; ASCII entries keep the a-z boundary they always had.
const LETTER_BOUNDED = /[\u00c0-\u024f\u0400-\u04ff]/
function namesWord(name, words) {
  const text = normaliseName(name)
  return words.some((word) => {
    // CU-345: '…' leads a German compound ending - matched after any letters, bounded only on its right.
    if (word.startsWith('\u2026')) return new RegExp(`${escapeRegExp(normaliseName(word.slice(1))).replace(/ /g, '[\\s-]+')}([^\\p{L}]|$)`, 'u').test(text)
    if (!LETTER_BOUNDED.test(word)) return new RegExp(`(^|[^a-z])${escapeRegExp(normaliseName(word)).replace(/ /g, '[\\s-]+')}([^a-z]|$)`).test(text)
    // A judged name has passed normaliseText, which folds homoglyphs case by case (a Cyrillic 'К' reads as Latin 'K'), so the
    // entry is folded the same way as written, capitalised and in capitals before it is compared.
    const forms = new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))
    return [...forms].some((form) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(form).replace(/ /g, '[\\s-]+')}([^\\p{L}]|$)`, 'u').test(text))
  })
}

// CU-157 (reply-text-entered.md): a control whose only submit word is 'reply' submits typed text only when some text
// entry on its page or window holds text. The environment reports that as target.textEntered, read at each action's
// own judgement; only a strict false - every entry read and empty - lets it run. True, null or absent asks, as before.
const REPLY_WORDS = new Set(['reply', '回复', '回覆'])
const SUBMIT_BUT_REPLY = Object.freeze(WORDS.submit.filter((word) => !REPLY_WORDS.has(word)))
// CU-261: a control named only Call, Answer or Merge submits; inside a longer name ('Call Stack', 'Merge Cells') it does not.
// CU-293: the same whole names in Chinese - 合并单元格 (Merge Cells) stays free like its English.
const SUBMIT_WHOLE_NAMES = new Set(['call', 'answer', 'merge', '呼叫', '接听', '接聽', '合并', '合併'])
function judgesSubmit(name, target) {
  if (SUBMIT_WHOLE_NAMES.has(normaliseName(name).trim())) return true
  if (!namesWord(withoutPastState(name), WORDS.submit)) return false
  return !(target?.textEntered === false && !namesWord(name, SUBMIT_BUT_REPLY))
}

function luhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

// CU-163: an IBAN counts only with a registered country code, that country's exact length (ISO 13616 registry) and a
// passing mod-97 check - so a random token (a temp folder's name, a hash) does not match, and an IBAN followed by a word
// is still found at its known length.
const IBAN_LENGTH = Object.freeze({ AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22,
  GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20 })
function ibanValid(candidate) {
  const iban = candidate.replace(/\s+/g, '').toUpperCase()
  if (IBAN_LENGTH[iban.slice(0, 2)] !== iban.length || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  return rest === 1
}

// CU-163: a US routing number (ABA: weights 3-7-1 sum to a multiple of 10) counts only beside an account number - a bare
// nine-digit number passes the check one time in ten, too often alone.
function abaValid(digits) {
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  return digits.length === 9 && [...digits].reduce((sum, d, i) => sum + Number(d) * w[i], 0) % 10 === 0
}

// CU-172 (cu-researcher measured 0 of 474 typed actions): an Indian Aadhaar number passes Verhoeff, an Australian TFN
// the weights 1-4-3-7-5-8-6-9-10 mod 11 - random digits pass about one time in ten, so each counts only in its
// canonical spacing (dddd dddd dddd with a first digit 2-9; ddd ddd ddd) and never as part of a longer run of groups.
const VERHOEFF_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
const VERHOEFF_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 7, 8, 0, 6], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
const verhoeffValid = (digits) => [...digits].reverse().reduce((c, d, i) => VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(d)]], 0) === 0
const tfnValid = (digits) => [1, 4, 3, 7, 5, 8, 6, 9, 10].reduce((sum, w, i) => sum + w * Number(digits[i]), 0) % 11 === 0

// CU-163: a field for a bank account or a tax id asks whatever is typed into it, as a payment form's most consequential
// value is the account a payout or a direct debit goes to.
const BANK_OR_TAX_FIELD = Object.freeze(['iban', 'account number', 'account no', 'routing', 'routing number', 'sort code', 'tax id', 'tax number', 'tax file number', 'ein',
  // CU-178: spellings and abbreviations of the same fields.
  'acct number', 'acct no', 'bsb', 'tax identification', 'tax no',
  // CU-245 (cu-researcher's D-061 red team): a field named only 'Bank account'.
  'bank account',
  // CU-285 (cu-researcher): the US form's own words - Taxpayer Identification Number, Taxpayer ID.
  'taxpayer identification', 'taxpayer id',
  // CU-293: a bank account or tax id in Chinese.
  '银行账号', '銀行帳號', '银行账户', '銀行帳戶', '开户行', '開戶行', '税号', '稅號', '纳税人识别号', '納稅人識別號', '统一社会信用代码'])
function bankOrTaxField(target) {
  return entryNamesOf(target).some((name) => namesWord(name, BANK_OR_TAX_FIELD))
}

// CU-164: a text entry - the browser's editable flag, or a desktop text role - named for a password asks credential, and
// one named for a recovery phrase, a private key, a one-time code or an identity document asks sensitive_data, whatever
// is typed. A show-password toggle turns type=password into type=text, so the name is the only signal left.
const TEXT_ENTRY_ROLES = new Set(['AXTextField', 'AXSecureTextField', 'AXTextArea', 'AXSearchField', 'AXComboBox', 'textbox', 'searchbox', 'combobox'])
// CU-187 (copy-caption.md): a source named by its own words - static text, a generic element, a cell - whose name is the
// value itself; it takes no class from that name, and the loop does not keep it (D-060).
const TEXT_NAMED_ROLES = new Set(['StaticText', 'text', 'generic', 'none', 'cell', 'gridcell', 'paragraph', 'AXStaticText', 'AXCell'])
// Controls a caption may label that are not shown text: a drag pressed on one does not carry its caption (CU-195).
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'treeitem', 'option', 'combobox', 'listbox',
  'spinbutton', 'ToggleButton', 'PopUpButton', 'DisclosureTriangle', 'AXButton', 'AXLink', 'AXCheckBox', 'AXRadioButton', 'AXPopUpButton', 'AXMenuButton', 'AXMenuItem', 'AXSlider', 'AXTab', 'AXDisclosureTriangle', 'AXIncrementor', 'AXColorWell'])
// CU-195 reopen (cu-verifier, 20261108T004357Z-30bbf7): an element the driver captioned that is neither an entry nor a
// control is captioned shown text, whatever role the page gives it - a <dd> is Chrome's 'definition', a <dt> 'term', an
// <li> 'listitem', none of them in the list above - so no text role can skip the caption rule by being unlisted.
const captionedShownText = (t) => !!t && typeof t === 'object' && typeof t.caption === 'string' && t.caption.trim() !== '' &&
  !isTextEntry(t) && !INTERACTIVE_ROLES.has(t.role)
export function textNamedSource(target) {
  if (!target || typeof target !== 'object') return false
  if (TEXT_NAMED_ROLES.has(target.role)) return true
  return !target.role && typeof target.tag === 'string' && !['input', 'textarea', 'select'].includes(target.tag.toLowerCase())
}

export function isTextEntry(target) {
  if (!target || target.editable === false) return false
  return target.editable === true || TEXT_ENTRY_ROLES.has(target.role)
}
// CU-257: token formats beyond the key rule's sk/pk/ghp/xoxb/AKIA prefixes.
const API_TOKEN = new RegExp([
  'github_pat_[A-Za-z0-9_]{22,}',
  'gh[ousr]_[A-Za-z0-9]{30,}',
  'glpat-[A-Za-z0-9_-]{20,}',
  'AIza[0-9A-Za-z_-]{35}',
  'hf_[A-Za-z0-9]{30,}',
  'npm_[A-Za-z0-9]{36}',
  'xox[aprs]-[A-Za-z0-9-]{16,}',
  'shp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}',
  // cu-verifier on #61: Slack app-level tokens, SendGrid keys (two dot-joined parts), Stripe restricted keys.
  'xapp-[A-Za-z0-9-]{20,}',
  'SG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}',
  'rk_(?:live|test)_[A-Za-z0-9]{16,}',
].map((one) => `\\b${one}\\b`).join('|'))
const PASSWORD_NAMES = Object.freeze(['password', 'passcode', 'passphrase', 'pin', 'pin code',
  // CU-293: the same names in Chinese.
  '密码', '密碼', '口令', '支付密码', '支付密碼'])
// CU-265: the schemes a page navigates itself; any other hands the link to another app.
// cu-researcher on #112: data: and blob: stay in the browser (blob: is how sites serve a generated 'Download CSV'); a
// download they start still meets the page's download handling.
const WEB_SCHEMES = new Set(['http', 'https', 'javascript', 'about', 'data', 'blob'])
// CU-241 (cu-researcher's amendment): the elements that host another document - the page's focus read stops at them
// when the document inside is cross-origin (a fenced frame always is), so what the key reaches is unread.
const FRAME_HOST_TAGS = new Set(['iframe', 'frame', 'object', 'embed', 'fencedframe'])
const FRAME_HOST_ROLES = new Set(['iframe', 'iframepresentational', 'embeddedobject', 'pluginobject'])
function framesHost(target) {
  if (!target || typeof target !== 'object') return false
  return FRAME_HOST_TAGS.has(String(target.tag ?? '').toLowerCase()) || FRAME_HOST_ROLES.has(String(target.role ?? '').toLowerCase())
}
// CU-263 (design note 0.2): a human check - a CAPTCHA - is the person's to solve, as Operator hands it over. Known by the
// pressed target's name (also inside a longer label: 'Press & Hold to confirm you are a human'), the providers' Chinese
// labels included; a bare 'Verify' or 'I agree' stays judged by its own words (named limit).
const CAPTCHA_NAME = new RegExp([
  "\\bi\\s*(?:['’]\\s*m|\\s+am)\\s+not\\s+a\\s+robot\\b",
  '\\bim\\s+not\\s+a\\s+robot\\b',
  "\\bi\\s*(?:['’]\\s*m|\\s+am)\\s+(?:a\\s+)?human\\b",
  "\\b(?:verify|confirm|prove)\\s+(?:that\\s+)?you\\s*(?:['’]\\s*re|\\s+are)\\s+(?:a\\s+)?(?:human|real\\s+person|not\\s+a\\s+(?:robot|bot))\\b",
  '\\bhuman\\s+verification\\b',
  '\\bselect\\s+all\\s+(?:images|squares)\\s+with\\b',
  '我不是机器人', '我不是機器人', '我是人类', '我是人類', '人机验证', '人機驗證', '人机身份验证', '人機身份驗證', '确认您是真人', '確認您是真人',
].join('|'), 'i')
// ... a text CAPTCHA's entry, where typing the shown characters (or the heard ones) is solving it (a bare 验证码 is as often a
// one-time code, which the D-061 value rules judge) ...
const CAPTCHA_ENTRY = /\bcaptcha\b|\btype\s+the\s+(?:characters|letters|text)\s+(?:you\s+see|shown|in\s+the\s+(?:image|picture))\b|\benter\s+what\s+you\s+hear\b|图形验证码|圖形驗證碼|图片验证码|圖片驗證碼/i
// ... the challenge providers' own frames, by the target document's origin (the browser driver describes an element
// inside a cross-site frame through its frame session) or, once the driver reports it (CU-300), its frame URL - read in
// memory, never recorded - which lets reCAPTCHA's frames under www.google.com/recaptcha/ count without a google.com-wide
// rule (cu-researcher's F2); DataDome serves its challenges from captcha-delivery.com (F3) ...
const CAPTCHA_HOSTS = Object.freeze(['challenges.cloudflare.com', 'hcaptcha.com', 'recaptcha.net', 'arkoselabs.com', 'geetest.com', 'captcha-delivery.com'])
function hostAndPath(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return null
  try {
    const parsed = new URL(url.trim())
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname }
  } catch {
    return null
  }
}
function captchaFrame(target) {
  for (const url of [target?.origin, target?.frameUrl]) {
    const at = hostAndPath(url)
    if (at === null) continue
    if (CAPTCHA_HOSTS.some((provider) => at.host === provider || at.host.endsWith(`.${provider}`))) return true
    if ((at.host === 'www.google.com' || at.host === 'google.com') && at.path.startsWith('/recaptcha/')) return true
  }
  return false
}
// ... and a frame host titled for a challenge (cu-researcher's F1): the focus read stops at the provider's iframe, titled
// 'reCAPTCHA', 'Widget containing checkbox for hCaptcha security challenge' or 'Widget containing a Cloudflare security
// challenge', so a Space or Return after Tab reaches the check box through it; CU-300's frameHost carries the same title.
const CAPTCHA_FRAME_TITLE = /\b(?:re)?captcha\b|\bhcaptcha\b|\bsecurity\s+challenge\b|\bhuman\s+verification\b|\bturnstile\b/i
// CU-253, CU-287: messaging apps are known by kind (app-kinds.mjs, exact bundle ids with sources), and the names of compose
// fields judge every other app.
// CU-287: a search field takes Return to search, in a messaging app too ('Search Acme' in Slack).
const SEARCH_NAME = /^(search|find)\b/i
function isSearchField(target) {
  if (!target || typeof target !== 'object') return false
  if (target.role === 'AXSearchField' || target.subrole === 'AXSearchField' || target.role === 'searchbox' || target.inputType === 'search') return true
  return SEARCH_NAME.test(String(target.name ?? '').trim())
}
// Compose fields by their usual accessible names (Messages' 'iMessage', WhatsApp and Teams 'Type a message', Slack and
// Discord 'Message #channel'), and - cu-coordinator's ruling - a bare 'Message', 'Reply' or 'Chat' in any app. Named
// over-ask: a form's multi-line 'Message' box, whose Return is a line break.
// CU-253 (cu-researcher): 'Type a new message' is Microsoft Teams' compose wording - 'new' is optional in the phrases - and a
// placeholder may end in ' here' or an ellipsis or stop ('Write a message…', Telegram's; 'Type a message here').
const CHAT_COMPOSE_NAME = /^(i?message(\s+[#@].*)?|(type|write|send) a (new )?message|text message|reply|chat)(\s+here)?\s*(…|\.{3}|[.!])?$/i
// CU-167 (cu-researcher's probe): a social security number, a card's CVV, a bare Passport field, a driving licence, a
// birthday and a security question too - typed unasked before; the apostrophe in either form (' and ’).
const SECRET_NAMES = Object.freeze(['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key', 'secret key',
  'one-time code', 'one time code', 'verification code', 'security code', 'passport', 'national insurance',
  'ni number', 'date of birth', 'birth date', 'dob', 'birthday', 'ssn', 'social security', 'social insurance', 'national id', 'cvv', 'cvv2', 'cvc', 'csc',
  "driver's license", 'drivers license', 'driver license', 'driving license',
  "mother's maiden name", 'maiden name', 'security question', 'security answer',
  // CU-172 (the D-061 table, sensitive-classes.md): the rest of government ids, payment, auth secrets and health.
  'national identity', 'aadhaar', 'card number', 'credit card', 'expiry', 'expiration date', 'mm/yy', 'vat number', 'vat id',
  '2fa', 'authenticator code', 'api key', 'access token', 'secret', 'medicare', 'health insurance', 'policy number',
  'medical record',
  // CU-345: the same secrets named in German, French, Spanish, Russian, Japanese and Korean.
  ...LOCALE_WORDS.secret,
  // CU-355: passport, birth date, tax, national and account numbers named in the same six languages.
  ...LOCALE_ID_NAMES,
  // D-062 (cu-coordinator): an e-mail or phone field, and a street-level address, ask by name; a city, postcode or ZIP
  // alone does not, and neither does an IP or web address.
  'email', 'e-mail', 'phone', 'mobile number', 'telephone', 'street', 'address line', 'home address', 'shipping address',
  'billing address', 'mailing address', 'postal address',
  // CU-178 (both sweeps; scope by the table owner): further labels of decided classes - spellings are left to normaliseName.
  'dl number', 'license number', 'birthdate', 'birth day', 'exp date', 'expiration', 'valid thru', 'valid through', 'otp',
  'card no', 'cell number', 'mobile', 'tel',
  // CU-245 (cu-researcher's D-061 red team): a debit card, an account recovery key and two-factor backup codes.
  'debit card', 'recovery key', 'backup code', 'backup codes',
  // CU-293: D-061's field names in Chinese (an id, a passport, a card, a birth date, a code, contact data).
  '身份证', '身份證', '身分證', '护照', '護照', '社保号', '社会保障号', '出生日期', '生日', '银行卡', '銀行卡', '卡号', '卡號', '信用卡',
  '有效期', '安全码', '安全碼', '验证码', '驗證碼', '动态码', '手机号', '手機號', '电话', '電話', '邮箱', '电子邮件', '電子郵件',
  '街道', '详细地址', '詳細地址', '收货地址', '收貨地址', '病历', '病歷', '医保', '醫保',
  // CU-288: a one-time code named by its length ('Enter the 6-digit code', 'six-digit code').
  'digit code', 'digit verification code'])
// CU-172: acronyms match case-sensitively as whole tokens, so 'PAN' asks and 'Pan size' or 'Panel' does not.
const SECRET_ACRONYMS = Object.freeze(['SIN', 'TFN', 'PAN', 'NHS', 'MRN', 'TIN', 'CPF', 'NRIC'])
const namesAcronym = (name) => SECRET_ACRONYMS.some((word) => new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`).test(String(name ?? '')))

// CU-170 (text-entry-focus-click.md): a pointer press on a plain text entry only places the cursor, so the entry's own
// name gives it no purchase, delete or permission class. Plain: a desktop AX text role not reported read-only, or in a
// browser an editable <input>/<textarea> or textbox/searchbox (editable alone is inherited inside a rich editor). A
// combobox, list or pop-up is never plain - a choice there can grant access.
const DESKTOP_ENTRY_ROLES = new Set(['AXTextField', 'AXSecureTextField', 'AXTextArea', 'AXSearchField'])
const CHOOSER_ROLE = /^(ax)?(combobox|popupbutton|listbox|menubutton)$/i
function plainTextEntry(target) {
  if (!target || target.editable === false || CHOOSER_ROLE.test(String(target.role ?? ''))) return false
  if (DESKTOP_ENTRY_ROLES.has(target.role)) return true
  return target.editable === true && (['input', 'textarea'].includes(String(target.tag ?? '').toLowerCase()) || ['textbox', 'searchbox'].includes(target.role))
}

// CU-349 (cu-coordinator 15:55Z: upgrade only): an entry's placeholder (helper 0.2.63, target.placeholder) is an extra
// name for the field-name rules below - it can make a field ask ('Notes' with placeholder 'CVV' asks, a named over-ask),
// never stop one asking, and never replaces the name a question shows. Each rule tests the name and the placeholder apart.
// CU-361 (cu-coordinator 20:23Z): the helper's nearbyLabel (0.2.64: the static text beside a box with no title, caption
// or placeholder) is one more upgrade-only name - but a value-shaped text (a card, IBAN, key, e-mail) is never a name.
const nearbyLabelOf = (target) => {
  const text = typeof target?.nearbyLabel === 'string' ? target.nearbyLabel.trim() : ''
  return text !== '' && !looksSensitive(text) ? text : null
}
const entryNamesOf = (target) => [target?.name, typeof target?.placeholder === 'string' && target.placeholder.trim() !== '' ? target.placeholder : null, nearbyLabelOf(target)]
  .filter((name) => name !== null && name !== undefined)
const passwordNamedEntry = (target) => isTextEntry(target) && entryNamesOf(target).some((name) => namesWord(name, PASSWORD_NAMES))
// CU-184 (desktop-rules.md): a text entry named for a password - shown or not, it holds one - unless its name says it is
// a hint; the desktop hands a key action into it to the person, as it does a secure field (R83).
export const namesPasswordField = (target) => isTextEntry(target) && entryNamesOf(target).some((name) => namesWord(name, PASSWORD_NAMES) && !namesWord(name, ['hint']))
const secretNamedEntry = (target) => isTextEntry(target) && entryNamesOf(target).some((name) => namesWord(name, SECRET_NAMES) || namesAcronym(name))

// CU-164: a wallet recovery phrase - twelve or more words in a row, every one on the BIP39 list; ordinary prose breaks
// the run with words the list does not hold (the, is, to, of, a).
function hasSeedPhrase(value) {
  let run = 0
  for (const token of String(value).toLowerCase().match(/[a-z]+/g) ?? []) {
    run = BIP39_ENGLISH.has(token) ? run + 1 : 0
    if (run >= 12) return true
  }
  return false
}

// CU-185: a national number without a country code - a leading 0, digit groups joined by one space, dot or dash, 10 or
// 11 digits in all (020 7946 0958, (020) 7946 0958, 07700 900123, 01 23 45 67 89, 030 1234567). Grouped only: an
// unbroken run (07700900123), a date - also with a time after it (07.11.2026 10:30, cu-researcher's red team) - a version
// or a time does not match; a grouped reference (01-2345-6789) asks, an accepted over-ask. The 00 international prefix is
// not covered here.
const DATE_LEAD = /^(\d{2})([ .-])(\d{2})\2((?:19|20)\d{2})(?!\d)/
const datedLead = (text) => {
  const d = DATE_LEAD.exec(text)
  return d !== null && Number(d[1]) >= 1 && Number(d[1]) <= 31 && Number(d[3]) >= 1 && Number(d[3]) <= 12
}
function nationalPhone(value) {
  for (const m of value.matchAll(/(^|[^\d+(])((?:0\d{1,4}|\(0\d{1,4}\))(?:[ .-]\d{2,8}){1,4})(?!\d)/g)) {
    const digits = m[2].replace(/\D/g, '').length
    if ((digits === 10 || digits === 11) && !datedLead(m[2])) return true
  }
  return false
}

/** Whether text looks like sensitive data being transmitted (R29): card, IBAN, routing + account, national id, tax id, phone, e-mail, key, recovery phrase. */
// CU-260 (cu-researcher): query parameters that carry a secret by name - a reset or session token, an API key.
const SECRET_PARAM = /^(token|access_?token|refresh_?token|id_?token|api_?key|apikey|client_?secret|secret|password|passwd)$/i
// cu-verifier on #91: a password or secret parameter asks whatever its length ('hunter2'); a token keeps the 8-character floor.
// cu-researcher: aligned with D-061's credential names (passcode, passphrase, PIN) and any name ending in secret.
const PASSWORD_PARAM = /^([a-z0-9]*[_-]?secret|password|passwd|pwd|pass|passcode|passphrase|pin)$/i

// CU-281 (cu-coordinator: High, cu-researcher's idea on CU-260): a query or fragment parameter named for a D-061 field -
// passport, ssn, date_of_birth, card_number, iban, tax_id - carries that value whatever its shape. D-062's contact names
// (email, phone, address) and the bare card-expiry words stay out (their values are judged by shape; 'expiry' is a cache
// parameter as often as a card's). Matched as whole words after splitting snake, kebab and camel case.
const URL_FIELD_SKIP = new Set(['email', 'e-mail', 'phone', 'mobile number', 'telephone', 'street', 'address line', 'home address',
  'shipping address', 'billing address', 'mailing address', 'postal address', 'cell number', 'mobile', 'tel', 'expiry',
  'expiration date', 'mm/yy', 'exp date', 'expiration', 'valid thru', 'valid through', 'secret', 'api key', 'access token',
  // CU-285: a bare 'routing' is a map's or an API's parameter as often as a bank's; 'routing number' stays.
  'routing'])
// CU-285: every bank-or-tax field name counts as a URL parameter name too (tax_number, tax_file_number, ein, bsb), and a
// lower-case tin= (a field's TIN is matched as an acronym, case-sensitively).
const URL_FIELD_NAMES = Object.freeze([...[...SECRET_NAMES, ...BANK_OR_TAX_FIELD].filter((name) => !URL_FIELD_SKIP.has(name)), 'tin', 'iban', 'tax id', 'taxid',
  'account number', 'routing number', 'sort code', 'bank account', 'national id number', 'id number'])
// cu-verifier on #120: a phone, mobile or tel parameter whose value holds seven or more digits carries a phone number
// (D-062) even unformatted; ?mobile=1 or ?mobile=true (a layout flag) stays free.
// CU-291 (cu-researcher): the joined lower-case forms too ('phonenumber', 'cellphone').
const URL_PHONE_NAME = /(^| )(phone|mobile|tel|telephone|cell|phonenumber|cellphone|mobilephone|mobilenumber|telephonenumber|cellnumber)( |$)/
const urlPhone = (name, value) => URL_PHONE_NAME.test(` ${String(name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `)
  && (String(value ?? '').match(/\d/g) ?? []).length >= 7
// CU-284 (cu-researcher; cu-coordinator: Medium): a street or address parameter whose value reads as a street address - a
// house number beside a street word ('10 Downing Street', '221B Baker St') - carries it out as a typed one would (D-062).
// A city or postcode alone stays free (D-061), and so do an ip, mac, e-mail, wallet or web address.
const URL_ADDRESS_NAME = /(^| )(address|addr|street|address line|street address)( |$)/
const URL_ADDRESS_NOT = /(^| )(ip|mac|email|e mail|wallet|web|url|server|host)( |$)/
const urlAddress = (name, value) => {
  const words = ` ${String(name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  const text = String(value ?? '')
  return URL_ADDRESS_NAME.test(words) && !URL_ADDRESS_NOT.test(words) && /\d/.test(text) && /[a-z]{3,}/i.test(text)
}
// CU-291 (cu-researcher; cu-coordinator: High, CU-281's class): an acct or acctnum parameter holding six or more digits
// is a bank-account number; acct=<handle> (a fediverse account) stays free, as does a bare account=.
const URL_ACCOUNT_NAME = /^(acct|acctnum|acct_num|acctno|acct_no|acct_number)$/i
const urlAccount = (name, value) => URL_ACCOUNT_NAME.test(String(name ?? '').trim()) && (String(value ?? '').match(/\d/g) ?? []).length >= 6
function urlFieldName(name) {
  const words = ` ${String(name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9/']+/g, ' ').trim()} `
  return words.trim() !== '' && URL_FIELD_NAMES.some((field) => words.includes(` ${field} `))
}

/**
 * CU-260: the D-061 value a navigate URL would carry off the page, or null - the value rules over the decoded query
 * values, fragment and path segments, a password in the address, or a query parameter named for a secret (a value of 8
 * or more). A path segment's card or phone match is a numeric id (a post or order number), not counted. Named over-ask:
 * a 40-hex commit hash in a code host's URL (the digest rule; cu-coordinator: keep it).
 */
// CU-325 (cu-coordinator 06:30Z, High): a card number in a URL path. A path segment counts when it holds a card-shaped
// digit run - bare or in card groupings, not touching other digits, so a file name ('<card>.pdf') or a suffix counts too
// (cu-researcher on #245) - that passes Luhn and carries a card brand's prefix with that brand's length (a random numeric id
// then trips about one time in a hundred, not one in ten), or when its digits hold a card-length run the run itself typed or
// pasted (typedDigits, the loop's in-memory buffer, CU-267), whatever its prefix. CU-326: a host label, a card split across
// all-digit segments and a zero-padded run count too (urlSecret).
const CARD_RUN = /(?<!\d)(\d{4}(?:[ -]\d{4}){3}(?:[ -]\d{3})?|\d{4}[ -]\d{6}[ -]\d{4,5}|\d{13,19})(?!\d)/g
const CARD_BRANDS = [
  [/^4/, [13, 16, 19]],
  [/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, [16]],
  [/^3[47]/, [15]],
  [/^(6011|64[4-9]|65)/, [16, 17, 18, 19]],
  [/^35(2[89]|[3-8]\d)/, [16, 17, 18, 19]],
  [/^62/, [16, 17, 18, 19]],
  [/^(36|38|30[0-5])/, [14, 15, 16, 17, 18, 19]],
]
const brandCard = (digits) => CARD_BRANDS.some(([prefix, lengths]) => prefix.test(digits) && lengths.includes(digits.length))
const cardNumber = (digits) => digits.length >= 13 && digits.length <= 19 && luhn(digits) && brandCard(digits)
export function pathCard(segment, typedDigits = []) {
  const text = String(segment ?? '').trim()
  const digits = text.replace(/\D/g, '')
  for (const match of text.matchAll(CARD_RUN)) {
    // CU-326: leading zeros pad a card into a longer number ('00<card>') without changing its Luhn sum.
    const run = match[0].replace(/\D/g, '').replace(/^0+/, '')
    if (cardNumber(run)) return true
  }
  return (Array.isArray(typedDigits) ? typedDigits : []).some((run) => typeof run === 'string' && run.length >= 13 && run.length <= 19 && digits.includes(run))
}

export function urlSecret(raw, typedDigits = []) {
  let url
  try {
    url = new URL(String(raw ?? ''))
  } catch {
    return looksSensitive(String(raw ?? ''))
  }
  if (url.password !== '') return 'password'
  const decode = (part) => {
    try {
      return decodeURIComponent(part.replace(/\+/g, ' '))
    } catch {
      return part
    }
  }
  // CU-348 (design note 0.1): the userinfo username is read like a path segment - a card, SSN or other value there asks.
  if (url.username !== '') {
    const user = decode(url.username)
    if (pathCard(user, typedDigits)) return 'card'
    const kind = looksSensitive(user)
    if (kind !== null) return kind
  }
  const params = [...url.searchParams]
  const fragment = url.hash.slice(1)
  if (fragment.includes('=')) params.push(...new URLSearchParams(fragment))
  for (const [name, value] of params) {
    if (PASSWORD_PARAM.test(name.trim()) && value.trim() !== '') return 'key'
    if (SECRET_PARAM.test(name.trim()) && value.trim().length >= 8) return 'key'
    if (value.trim() !== '' && urlFieldName(name)) return 'field_name'
    if (urlPhone(name, value)) return 'phone'
    if (urlAccount(name, value)) return 'bank_account'
    if (urlAddress(name, value)) return 'address'
    const kind = looksSensitive(value)
    if (kind !== null) return kind
  }
  const loose = looksSensitive(decode(fragment))
  if (loose !== null) return loose
  for (const segment of url.pathname.split('/').filter(Boolean)) {
    if (pathCard(decode(segment), typedDigits)) return 'card'
    const kind = looksSensitive(decode(segment))
    if (kind !== null && kind !== 'card' && kind !== 'phone') return kind
  }
  // CU-326: a card as a host label, or split across two to four all-digit path segments (/p/41111111/11111111).
  if (url.hostname.split('.').some((label) => pathCard(label))) return 'card'
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => decode(segment).trim())
  for (let i = 0; i < segments.length; i += 1) {
    let joined = ''
    for (let k = i; k < Math.min(segments.length, i + 4) && /^\d+$/.test(segments[k]); k += 1) {
      joined += segments[k]
      if (k > i && cardNumber(joined)) return 'card'
    }
  }
  // CU-325 follow-up (cu-coordinator 06:41Z): digits the run typed are matched against every digit of the address - host
  // labels, the joined path, query and fragment - so a typed card split across segments or put in a host label asks too.
  const typedRuns = (Array.isArray(typedDigits) ? typedDigits : []).filter((run) => typeof run === 'string' && run.length >= 13 && run.length <= 19)
  if (typedRuns.length > 0) {
    const every = decode(`${url.username}${url.hostname}${url.pathname}${url.search}${url.hash}`).replace(/\D/g, '')
    if (typedRuns.some((run) => every.includes(run))) return 'card'
  }
  return null
}

export function looksSensitive(text) {
  const value = String(text ?? '')
  for (const match of value.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'card'
  }
  // CU-346 (cu-researcher): a card's groups split by dots, slashes, commas, underscores, tabs or line breaks - any of
  // them per gap, each optionally followed by a space - in 4-4-4-4(-1..3) or Amex 4-6-5 groups, passing Luhn. Named
  // over-ask: a grouped number that fits.
  const gap = '(?:[./,_\\-][ \\t]?|\\r?\\n|\\t)'
  for (const m of value.matchAll(new RegExp(`(?<!\\d)\\d{4}${gap}(?:\\d{4}${gap}\\d{4}${gap}\\d{4}(?:${gap}\\d{1,3})?|\\d{6}${gap}\\d{5})(?!\\d)`, 'g'))) {
    if (luhn(m[0].replace(/\D/g, ''))) return 'card'
  }
  // The match is greedy (an IBAN followed by a word runs on into it), so it is cut at its country's length.
  for (const match of value.matchAll(/\b[A-Za-z]{2}\d{2}(?:\s?[A-Za-z0-9]){11,30}\b/g)) {
    const compact = match[0].replace(/\s+/g, '')
    const length = IBAN_LENGTH[compact.slice(0, 2).toUpperCase()]
    if (length !== undefined && compact.length >= length && ibanValid(compact.slice(0, length))) return 'iban'
  }
  for (const match of value.matchAll(/(?:^|[^\d])(\d{9})\s*(?:[/,:;|-]|\s)\s*(?:acct\.?|account)?\s*#?\s*(\d{4,17})(?=[^\d]|$)/gi)) {
    if (abaValid(match[1])) return 'bank_account'
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return 'national_id'
  // CU-346: an SSN in 3-2-4 groups split by dots, slashes, commas, underscores or line breaks (the same separator twice), held
  // to the issuing rules below. Named over-ask: a reference written that way that fits them.
  for (const m of value.matchAll(/(?<!\d)(\d{3})([./,_]|\r?\n)[ \t]?(\d{2})\2[ \t]?(\d{4})(?!\d)/g)) {
    if (m[1] !== '000' && m[1] !== '666' && m[1][0] !== '9' && m[3] !== '00' && m[4] !== '0000') return 'national_id'
  }
  // CU-245: an SSN in spaced 3-2-4 groups, held to the issuing rules (no area 000 or 666, no group 00, no serial 0000)
  // so most spaced references do not fit; an area 9xx is an ITIN only with its group in 50-65, 70-88, 90-92 or 94-99
  // (cu-researcher: the dashed form asks for both). Named over-ask: a spaced nine-digit reference that fits.
  const itinGroup = (g) => (g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || (g >= 94 && g <= 99)
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])(\d{3}) (\d{2}) (\d{4})(?![ -]?\d)/g)) {
    const areaOk = m[1][0] === '9' ? itinGroup(Number(m[2])) : m[1] !== '000' && m[1] !== '666'
    if (areaOk && m[2] !== '00' && m[3] !== '0000') return 'national_id'
  }
  // CU-172: a UK National Insurance number (HMRC's letter rules, not BG/GB/KN/NK/NT/TN/ZZ, a final A-D) and an Indian PAN
  // (five letters, the fourth a holder type, four digits, a letter) - upper case, as issued.
  for (const m of value.matchAll(/\b([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]) ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g)) {
    if (!['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ'].includes(m[1])) return 'national_id'
  }
  if (/\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/.test(value)) return 'national_id'
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])([2-9]\d{3}) (\d{4}) (\d{4})(?![ -]?\d)/g)) {
    if (verhoeffValid(m[1] + m[2] + m[3])) return 'national_id'
  }
  for (const m of value.matchAll(/(?<!\d)(?<!\d[ -])(\d{3}) (\d{3}) (\d{3})(?![ -]?\d)/g)) {
    if (tfnValid(m[1] + m[2] + m[3])) return 'tax_id'
  }
  if (/(^|[^\d-])\d{2}-\d{7}([^\d-]|$)/.test(value)) return 'tax_id'
  // CU-272 (cu-researcher): bounded (RFC 5321's 64-character local part, 63-character labels) and only tried when an '@'
  // is present - the unbounded form was quadratic on a long word run (an 80k paste took seconds in one classify).
  if (value.includes('@') && /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{1,190}/.test(value)) return 'email'
  if (/\+\d(?:[\s().-]{0,2}\d){8,}/.test(value) || /(^|[^\d])\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}([^\d]|$)/.test(value)) return 'phone'
  if (nationalPhone(value)) return 'phone'
  if (/\b(?:sk|pk|ghp|xox[bp]|AKIA)[-_A-Za-z0-9]{16,}\b/.test(value) || /\b[A-Fa-f0-9]{40,}\b/.test(value)) return 'key'
  // CU-257 (cu-researcher's D-061 sweep): widely used token prefixes, each with its format's length floor so a short word,
  // a file name or 'AIza' in prose stays free - GitHub fine-grained and OAuth/app/user/refresh tokens, GitLab, Google
  // API keys, Hugging Face, npm, the other Slack token kinds and Shopify. Named over-ask: a documentation page's example.
  if (API_TOKEN.test(value)) return 'key'
  // CU-347 (design note 0.1): two credential shapes the rules above missed (a Google 'AIza' key is already API_TOKEN's;
  // key-shapes.test pins it). An AWS secret access key - exactly 40 characters of [A-Za-z0-9/+] standing alone, with upper and lower
  // case and a digit (named over-ask: any such 40-character run); and a credential assignment - password, passwd, pwd,
  // secret, token, api key, access key or client secret, - also as the end of an UPPER_SNAKE name (DB_PASSWORD) or a quoted JSON key - then '=' or ':', then a
  // value of 6 or more non-space characters holding a digit or a symbol (named over-ask: 'token: abc123' in prose).
  for (const m of value.matchAll(/(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g)) {
    if (/[A-Z]/.test(m[0]) && /[a-z]/.test(m[0]) && /\d/.test(m[0])) return 'key'
  }
  for (const m of value.matchAll(/(?<![A-Za-z0-9])(?:password|passwd|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)["']?\s*[=:]\s*["']?([^\s"',}]{6,})/gi)) {
    if (/[\d\W_]/.test(m[1])) return 'key'
  }
  // CU-350 (design note 0.1): an UPPER_SNAKE or run-together upper-case name ending in PASSWORD, PASSWD, SECRET or TOKEN
  // (PGPASSWORD=, MYSQL_ROOT_PASSWORD=), a bearer token, and a password glued to a database client's flag.
  for (const m of value.matchAll(/(?<![A-Za-z0-9])[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN)["']?\s*[=:]\s*["']?([^\s"',}]{6,})/g)) {
    if (/[\d\W_]/.test(m[1])) return 'key'
  }
  for (const m of value.matchAll(/\bbearer\s+([A-Za-z0-9._~+/-]{16,}=*)/gi)) {
    if (/\d/.test(m[1])) return 'key'
  }
  if (/\b(?:mysql|mariadb|mysqldump|psql|pg_dump|mongo|mongosh|redis-cli)\b[^\n]*?(?:\s-p(?!\s)\S{4,}|\s--password=\S{4,})/i.test(value)) return 'key'
  // cu-researcher's red team: 'curl -u user:<pw>', 'sshpass -p <pw>', and an 'Authorization: Basic' value whose base64 decodes
  // to user:password.
  if (/\b(?:curl|wget|http|https)\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:\S{4,}/i.test(value)) return 'key'
  if (/\bsshpass\b[^\n]*?\s-p\s*\S{4,}/i.test(value)) return 'key'
  for (const m of value.matchAll(/\bbasic\s+([A-Za-z0-9+/]{8,}={0,2})(?![A-Za-z0-9+/=])/gi)) {
    let decoded = ''
    try { decoded = atob(m[1]) } catch { decoded = '' }
    if (/^[^:\s]+:\S{4,}$/.test(decoded)) return 'key'
  }
  // CU-164: a 0x-prefixed 64-hex private key (the word boundary after 'x' kept the rule above from seeing it); a 0x + 40
  // hex wallet address is public and stays allowed.
  if (/\b0x[0-9a-fA-F]{64}\b/.test(value)) return 'key'
  // CU-245: a PEM or PGP armour block naming a private key (RSA, EC, OPENSSH, ENCRYPTED, bare, or PGP's '... BLOCK'),
  // and a JWT - three dot-joined base64url parts whose first decodes to a JSON header naming its 'alg'; an unsigned
  // one (alg none) has an empty third part and still carries the session's claims (cu-verifier).
  if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/.test(value)) return 'key'
  for (const m of value.matchAll(/(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g)) {
    try {
      const header = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (header && typeof header === 'object' && typeof header.alg === 'string') return 'key'
    } catch { /* not a JSON header */ }
  }
  if (hasSeedPhrase(value)) return 'recovery_phrase'
  return null
}

// CU-186: menu roles as the desktop driver reports them (a pop-up's own AXMenuButton is not a menu).
const MENU_ROLE = /^AXMenu(Item|BarItem|Bar)?$/

// CU-183: a drag travels when its path has two or more points and its ends differ.
function travels(action) {
  const path = Array.isArray(action?.path) ? action.path : []
  if (path.length < 2) return false
  const [first, last] = [path[0], path[path.length - 1]]
  return first?.x !== last?.x || first?.y !== last?.y
}

// CU-183: the drop lands back in the entry it was pressed on - the same fingerprint, or with none the same role and a
// non-empty name.
function sameEntry(pressed, dropped) {
  if (!pressed || !dropped) return false
  if (pressed.fingerprint && dropped.fingerprint) return pressed.fingerprint === dropped.fingerprint
  const name = String(pressed.name ?? '')
  return name !== '' && String(dropped.name ?? '') === name && String(dropped.role ?? '') === String(pressed.role ?? '')
}

// CU-179: the class of text put into a target, typed or pasted - by the field (a credential field, a password-named entry;
// a bank, tax, secret or identity name) and, when the text is known, by the value. null text: names only.
function insertedClass(text, target, context) {
  if (credentialField(target) || passwordNamedEntry(target) || (text !== null && SECRET.test(text))) return 'credential'
  if (bankOrTaxField(target) || secretNamedEntry(target) || (text !== null && looksSensitive(withoutTaskValues(text, context.task)))) return 'sensitive_data'
  return null
}

// CU-187: the class a copy's source lends its paste - the stronger of its own name (none for a text-named source; a form
// control's label counts, editable or not) and its caption, both through the entry name rules.
const asNamedEntry = (name) => ({ role: 'textbox', editable: true, name })
function sourceClass(source, context) {
  if (!source || typeof source !== 'object') return null
  // CU-196: a copy whose source could not be read (a menu copy with a menu, role-less or unreadable focus) fails closed.
  if (source.unknown === true) return 'sensitive_data'
  const own = textNamedSource(source) ? { ...source, name: '' } : (TEXT_ENTRY_ROLES.has(source.role) ? { ...source, editable: true } : source)
  const caption = typeof source.caption === 'string' && source.caption.trim() !== '' ? insertedClass(null, asNamedEntry(source.caption), context) : null
  const mine = insertedClass(null, own, context)
  return mine === 'credential' || caption === 'credential' ? 'credential' : mine ?? caption
}

// CU-194 (password-memory.md rule 5): an unnamed entry takes its structural caption as its name for every name rule -
// read only when its own accessible name is empty; a named entry's caption is ignored.
const captionNamed = (target) => (isTextEntry(target) && !String(target.name ?? '').trim() && typeof target.caption === 'string' && target.caption.trim()
  ? { ...target, name: target.caption.trim() } : target)
function withCaptionNames(context) {
  const target = captionNamed(context.target)
  const dropTarget = captionNamed(context.dropTarget)
  if (target === context.target && dropTarget === context.dropTarget) return context
  return { ...context, ...(context.target !== undefined ? { target } : {}), ...(context.dropTarget !== undefined ? { dropTarget } : {}) }
}

function credentialField(target) {
  if (!target) return false
  // CU-194 (password-memory.md): an entry the run saw as a password field stays one when shown in plain text.
  if (target.seenAsPassword === true) return true
  const auto = String(target.autocomplete ?? '').toLowerCase()
  return target.isPassword === true || target.inputType === 'password' || auto === 'one-time-code' ||
    auto.startsWith('cc-') || auto === 'current-password' || auto === 'new-password'
}

/**
 * Create the policy. `sitePolicy` is the run's site filter; `preApprovals` are `[{ class, origin }]` from the caller,
 * with `origin` an origin pattern such as `http://127.0.0.1:43117` (default: any origin the site filter allows).
 */
/**
 * A toggle's state before the press, trusted for its direction only from a native read (CU-373, fail closed): a web
 * `<input type=checkbox>`, or (CU-418 option b, helper 0.2.70) a desktop AXCheckBox - a checkbox, switch or toggle -
 * outside any web area, whose AXValue AppKit reports. Inside a web area the desktop state is the page's aria-checked claim,
 * untrusted like an ARIA state on the web; an older helper sends none. true or false, else null (the caller asks).
 */
export function nativeToggleState(target) {
  const webNative = String(target?.tag ?? '').toLowerCase() === 'input' && /^checkbox$/i.test(String(target?.inputType ?? ''))
  const desktopNative = String(target?.role ?? '') === 'AXCheckBox' && target?.inWebArea === false
  return (webNative || desktopNative) && typeof target?.checked === 'boolean' ? target.checked : null
}

export function createPolicy({ sitePolicy, preApprovals = [] } = {}) {
  if (typeof sitePolicy !== 'function') throw new TypeError('the policy needs the run site policy')
  const granted = preApprovals
    .filter((p) => CLASSES.includes(p?.class) && !NEVER_PRE_APPROVED.includes(p.class))
    .map((p) => ({ class: p.class, origin: p.origin ? originPattern(p.origin) : null }))

  const preApproved = (cls, url) => granted.some((p) => p.class === cls && (p.origin === null || p.origin === originPattern(url)))

  /**
   * `context`: `{ url, target, dialog, task }`, where `target` is `inspectPoint` for pointer actions or
   * `focusedElement()` for `type` and `keypress`, and `dialog` the held dialog from `state()`.
   */
  function classify(rawAction, rawContext = {}) {
    // CU-266: every rule below reads the normalised copy (zero-width and format characters, look-alikes, fullwidth forms).
    const { action, context: normalised } = normaliseForPolicy(rawAction, rawContext)
    let context = normalised
    context = withCaptionNames(context)
    const url = context.url ?? ''
    const verdict = sitePolicy(url)
    if (verdict !== 'allow' && verdict.block !== 'not_allowed') {
      return { decision: 'block', class: null, rule: `site:${verdict.block}`, reason: `the page ${url} is refused by the site filter (${verdict.block})` }
    }
    if (action.type === 'navigate') {
      const next = sitePolicy(action.url)
      if (next !== 'allow' && next.block !== 'not_allowed') {
        return { decision: 'block', class: null, rule: `site:${next.block}`, reason: `${action.url} is refused by the site filter (${next.block})` }
      }
      // CU-260 (cu-researcher; cu-coordinator: High): a secret in the address leaves with the request, so the D-061 value
      // rules run over the decoded URL before the site verdict, and a new-site ask that carries one names the class too.
      const secret = urlSecret(action.url, context.typedDigits)
      const asks = [...(secret !== null ? ['sensitive_data'] : []), ...(next !== 'allow' ? ['new_site'] : [])]
      const needed = asks.filter((cls) => !preApproved(cls, action.url) || NEVER_PRE_APPROVED.includes(cls))
      if (asks.length === 0) return { decision: 'allow', class: null, rule: 'site:allowed', reason: '' }
      if (needed.length === 0) return { decision: 'allow', class: asks[0], rule: 'pre_approved', reason: '' }
      if (needed[0] === 'new_site') return { decision: 'confirm', class: 'new_site', classes: needed, rule: 'site:not_allowed', reason: `open ${originPattern(action.url)}, a site the task did not name` }
      return { decision: 'confirm', class: 'sensitive_data', classes: needed, rule: 'url:sensitive_data', reason: `open ${originPattern(action.url)} with a ${secret.replace('_', ' ')} in its address` }
    }
    if (url.startsWith('chrome-error:') || context.interstitial === true) {
      return { decision: 'handoff', class: null, rule: 'interstitial', reason: 'a browser safety warning needs the person' }
    }

    const target = context.target ?? null
    const name = target?.name ?? ''
    const classes = []
    // CU-271 (cu-coordinator's ruling): a web terminal runs every line it is given, so a key or text into it - typed, a
    // paste, a chord, a page menu's Paste with the terminal focused - or text dropped on it is refused, as a terminal view
    // is on the desktop.
    if ((['type', 'keypress', 'hold_key'].includes(action.type) && target?.terminal === true) || (action.type === 'drag' && context.dropTarget?.terminal === true)
      || context.paste?.intoTerminal === true) {
      return { decision: 'block', class: null, rule: 'terminal_view', reason: 'typing into a web terminal is refused, as in a terminal app' }
    }
    // CU-263 (design note 0.3): a human check is handed to the person - never pre-approvable; unattended the loop declines
    // it (handoff_unavailable). Any click, drag, key or typing inside a challenge provider's frame or on a frame host titled
    // for one (the keyboard route after Tab); a click, drag, Space or Return on a target named as one (the desktop has
    // names only - its origin is a bundle id); typing into a text CAPTCHA's entry. Named limit: a slider or picture
    // puzzle drawn into the page itself, outside any provider frame and unnamed (cu-researcher's F4).
    {
      const captcha = { decision: 'handoff', class: null, rule: 'captcha', reason: 'a human check (CAPTCHA) is the person\'s to solve' }
      const acts = POINTER.has(action.type) || ['drag', 'type', 'keypress', 'hold_key'].includes(action.type)
      const onWeb = context.url != null && !/^(app|desktop):/.test(String(context.url))
      const titledFrame = onWeb && ((framesHost(target) && CAPTCHA_FRAME_TITLE.test(name)) || CAPTCHA_FRAME_TITLE.test(String(target?.frameHost?.name ?? '')))
      if (acts && (captchaFrame(target) || titledFrame)) return captcha
      const presses = POINTER.has(action.type) || action.type === 'drag' || keysOf(action).has('ENTER') || keyboardActivation(action, target, context).activates
      if (presses && CAPTCHA_NAME.test(name)) return captcha
      // F7 (cu-researcher): a text CAPTCHA keyed character by character (CU-301's printable keys) or pasted is solved as
      // surely as one typed; a menu paste is judged at its read destination.
      const intoEntry = action.type === 'type' || printableKeyChar(action) !== null || (context.paste && !Object.prototype.hasOwnProperty.call(context.paste, 'destination'))
      if (intoEntry && isTextEntry(target) && CAPTCHA_ENTRY.test(name)) return captcha
      const menuInto = context.paste?.destination
      if (menuInto && isTextEntry(menuInto) && CAPTCHA_ENTRY.test(String(menuInto.name ?? ''))) return captcha
    }
    // CU-271: running code asks launch_code, never pre-approved - a run chord (Shift-, Control-, Command- or Alt-Return) in
    // a notebook's code cell or on a notebook page's non-text focus (JupyterLab's command mode focuses the cell container),
    // Colab's run chords (Control-F8, F9, F10) on a notebook page, or a control named Run or Execute (whole words) on a
    // notebook or code page (an online IDE or playground). Typing code and a plain Return stay as they are.
    {
      const keys = keysOf(action)
      const isKeys = action.type === 'keypress' || action.type === 'hold_key'
      const runChord = keys.has('ENTER') && ['SHIFT', 'CTRL', 'META', 'ALT'].some((key) => keys.has(key))
      const colabChord = keys.has('CTRL') && ['F8', 'F9', 'F10'].some((key) => keys.has(key))
      const inCell = target?.notebookCell === true || (target?.notebookSurface === true && !isTextEntry(target))
      const runControl = POINTER.has(action.type) && (target?.notebookSurface === true || target?.codeSurface === true) && /\b(run|execute)\b/i.test(name)
      if ((isKeys && ((runChord && inCell) || (colabChord && target?.notebookSurface === true))) || runControl) classes.push('launch_code')
    }
    const held = context.dialog && ['confirm', 'prompt', 'beforeunload'].includes(context.dialog.type)
    // Canonical keys (cu-researcher): 'RETURN', 'Return', 'enter' are ENTER too, whoever the caller is; a hold of it too.
    // CU-142: a typed newline presses the same Return as ENTER, so it is judged as ENTER on the focused element - in a
    // text input too ('hi\n' into a 'Send a message' field asks submit, as ENTER there does).
    const pressesEnter = keysOf(action).has('ENTER') || (action.type === 'type' && /[\r\n]/.test(String(action.text ?? '')))
    if (held && (pressesEnter || action.type === 'type')) {
      classes.push('page_dialog')
      for (const cls of ['purchase', 'delete', 'permission']) if (namesWord(context.dialog.message, WORDS[cls])) classes.push(cls)
    }
    // CU-265 (cu-researcher; cu-coordinator: ask): a link whose scheme is not the web's - facetime:, tel:, zoommtg:,
    // mailto:, file:, an app's own - hands the click to another app, outside the run. The browser driver reports the
    // clicked link's scheme only (target.linkScheme, lower case, no colon); a click or a Return on it asks permission,
    // never pre-approved. No scheme reported keeps today's judgement (a named limit until the driver sends it).
    const scheme = typeof target?.linkScheme === 'string' ? target.linkScheme.trim().toLowerCase().replace(/:$/, '') : ''
    const pressesLink = ['click', 'double_click', 'triple_click'].includes(action.type) || keysOf(action).has('ENTER')
    if (scheme !== '' && !WEB_SCHEMES.has(scheme) && pressesLink) classes.push('permission')
    // CU-382 (cu-coordinator 23:10Z; helper 0.2.66): a Finder Quick Action runs an owner's Automator workflow, like a Service,
    // so a press on an item marked quickActions (or a chord bound to one) asks; a menu whose context could not be walked
    // (menuContextUnread) asks unknown.
    // Design 0.2 (cu-coordinator 23:12Z): Finder's built-in actions and the holder's own 'More…' / 'Customize…' stay free by
    // name; a custom workflow's name asks.
    // The loop's bound item is one item or { items } (boundItemOf); the marked one is found in the list, as app-policy's
    // appleItem is, and its name decides the built-in exemption (cu-researcher 08:07Z).
    const boundList = context.boundMenuItem && typeof context.boundMenuItem === 'object' ? (Array.isArray(context.boundMenuItem.items) ? context.boundMenuItem.items : [context.boundMenuItem]) : []
    const boundQuick = boundList.find((one) => one?.quickActions === true)
    const boundUnread = boundList.some((one) => one?.menuContextUnread === true)
    const chordPress = action.type === 'keypress' || action.type === 'hold_key'
    const quickName = String((chordPress ? boundQuick?.name : undefined) ?? target?.name ?? boundQuick?.name ?? context.boundMenuItem?.title ?? '').trim()
    // 'Open in Terminal' (and New Terminal at Folder) hands a shell to the folder - asks like a Quick Action.
    const terminalOpen = /^(?:open\s+in\s+terminal|new\s+terminal\s+(?:tab\s+)?at\s+folder)$/i.test(quickName)
    const builtInQuick = /^(?:rotate(?:\s+(?:left|right))?|markup|trim|compress|create\s+pdf|convert\s+image|remove\s+background|more(?:\u2026|\.\.\.)|customi[sz]e(?:\u2026|\.\.\.))$/i.test(quickName)
    const quickAction = ((target?.quickActions === true || boundQuick !== undefined) && !builtInQuick) || terminalOpen
    const quickPress = action.type === 'click' || action.type === 'double_click' || action.type === 'keypress' || action.type === 'hold_key'
    if (quickPress && quickAction) {
      // cu-coordinator 23:18Z: each workflow is different code - asked each time, so a yes never covers another ask.
      return { decision: 'confirm', class: 'permission', classes: ['permission'], rule: 'quick_action', askEachTime: true, reason: `run the Quick Action "${target?.name ?? boundQuick?.name ?? context.boundMenuItem?.title ?? ''}", an Automator workflow` }
    }
    if (quickPress && (target?.menuContextUnread === true || boundUnread)) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'menu:context_unread', reason: `press "${target?.name ?? ''}" in a menu whose context could not be read` }
    }
    // Open-menu focus (cu-coordinator 22:03Z; Medium until cu-verifier's live row): with a menu open the helper reads only the
    // system-wide focus, never the highlighted item, so Return or Space there commits an item the policy cannot see - asks.
    if ((action.type === 'keypress' || action.type === 'hold_key') && (target?.menuOpen === true || target?.role === 'AXMenu')
      && [...keysOf(action)].some((key) => /^(ENTER|RETURN|SPACE)$/.test(key))) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'menu:open_unread', reason: `press ${(action.keys ?? []).join('+')} in an open menu whose highlighted item could not be read` }
    }
    const keyboard = keyboardActivation(action, target, context)
    if (keyboard.deletes) classes.push('delete')
    // CU-381 (High; cu-coordinator 22:09Z): on a web page Delete or Backspace with no text entry focused - a null or
    // role-less focus, the page body, a row the driver could not name - reaches the page's own handler, which may delete
    // (cu-verifier's live row) - it asks delete, at CU-363's level. A text entry and a frame host keep their rules.
    if (context.url != null && !/^(app|desktop):/.test(String(context.url ?? '')) && (action.type === 'keypress' || action.type === 'hold_key')
      && [...keysOf(action)].some((key) => key === 'DELETE' || key === 'BACKSPACE') && !isTextEntry(target) && !framesHost(target)) classes.push('delete')
    // CU-370 (design note 0.1; cu-developer-two's driver contract): the option a key lands on is judged like a click on it.
    // A keypress's keyTarget answers the option itself (selectOption: true) - or the select with optionUnread: true when an
    // open popup's highlight cannot be read, which asks. A type is judged by every option its prefix passes through
    // (context.typeOptions); with no such read, a type into a non-editable choice takes its text as the option's name.
    if (target?.optionUnread === true && ['keypress', 'hold_key'].includes(action.type)) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'select:option_unread', reason: `press ${(action.keys ?? []).join('+')} on "${target?.name ?? 'a list'}", whose highlighted option could not be read` }
    }
    const choiceTarget = target && /combo|listbox|select/i.test(String(target.role ?? '')) && target.editable !== true
    // cu-coordinator 20:15Z, both asks (the safe direction): a type whose options the driver could not read
    // (typeOptions { unread: true }), and on a web page a navigation key on a bare select-like focus - keyTarget threw or
    // read no option, so where the key lands is unknown.
    if (action.type === 'type' && choiceTarget && context.typeOptions?.unread === true) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'select:options_unread', reason: `type into "${target?.name ?? 'a list'}", whose options could not be read` }
    }
    const onWebPage = context.url != null && !/^(app|desktop):/.test(String(context.url ?? ''))
    const NAV_KEY = /^(ARROW(UP|DOWN|LEFT|RIGHT)|PAGEUP|PAGEDOWN|HOME|END|ENTER|RETURN|SPACE)$/
    if (onWebPage && choiceTarget && target.selectOption !== true && target.radioChoice !== true && ['keypress', 'hold_key'].includes(action.type) && [...keysOf(action)].some((key) => NAV_KEY.test(key))) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'select:option_unknown', reason: `press ${(action.keys ?? []).join('+')} on "${target?.name ?? 'a list'}", where the option it lands on could not be read` }
    }
    // The driver marks a radio the key checks with radioChoice (cu-coordinator 20:11Z): judged the same way by its name.
    const optionRead = (target?.selectOption === true || target?.radioChoice === true) && action.type !== 'type'
    // A choice whose landing the driver read (the option, the radio, or every option a type passes through) is judged by
    // what it lands on, so a benign landing types freely - no page-shortcut fallback (cu-verifier's 'Archive' over-ask).
    const choiceRead = optionRead || (action.type === 'type' && choiceTarget && Array.isArray(context.typeOptions) && context.typeOptions.length > 0)
    const optionNames = optionRead ? [String(target.name ?? '')]
      : action.type === 'type' && Array.isArray(context.typeOptions) ? context.typeOptions.map((option) => String(option?.name ?? ''))
        : action.type === 'type' && choiceTarget ? [String(action.text ?? '').trim()] : []
    for (const optionName of optionNames.filter((name) => name.trim() !== '')) {
      if (namesPurchase(optionName)) classes.push('purchase')
      if (namesDelete(optionName)) classes.push('delete')
      if (namesWord(optionName, WORDS.permission)) classes.push('permission')
      // CU-388 (High; cu-coordinator 00:28Z): a choice reached by key is judged like a click on it, CU-373's account-security
      // names included - turning forwarding on, an app password, a bare two-factor or recovery option ask credential; the
      // safe directions by name (protection on, forwarding off) stay free as on a click.
      const protectionOnByName = /\b(?:turn\s+on|enable|set\s+up|activate)\b/i.test(optionName) && !/forward|app[\s-]?(?:specific[\s-]?)?password/i.test(optionName)
      const forwardingOffByName = /\b(?:disable|turn\s+off|stop|off)\b/i.test(optionName) && /forward/i.test(optionName)
      if (ACCOUNT_SECURITY.test(optionName) && !protectionOnByName && !forwardingOffByName) classes.push('credential')
    }
    // CU-363 (design note 0.1; High pending a live row): on a web page a printable key pressed outside text entry goes to
    // the page, whose own handler may delete, archive or send (Gmail '#', 'e', '!') - its effect cannot be read, so it asks
    // once per key, site and run (permission, never pre-approved; the answer keys 'permission:page-shortcut:<key>' -
    // cu-researcher: an approval covers that key on that site, never every character, nor a permission request).
    // Named over-ask: the first printable shortcut on any site (j/k navigation, '/') asks once a run.
    const onDesktop = /^(app|desktop):/.test(String(context.url ?? ''))
    const browserRoute = context.url != null && !onDesktop
    // CU-363 round 3 (cu-coordinator 17:40Z): the desktop route too - an app's own key equivalent outside a text entry
    // that fires no menu item (the loop's boundMenuItem read says none, or there is none to read).
    const desktopNoMenu = onDesktop && (context.boundMenuItem == null || context.boundMenuItem.none === true)
    // The key is the character it produces (Shift+3 is '#'), so a yes for '3' never frees '#' (cu-researcher).
    const SHIFTED = { 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~' }
    let chordShortcut = false
    const shortcutKey = (() => {
      if (action.type === 'type') {
        // cu-verifier's live rows: a type outside text entry delivers every character to the page ('###', 'ok #').
        const text = String(action.text ?? '').replace(/[\r\n]/g, '')
        if (text.trim() === '') return null
        // A control is no text entry: its typed text reaches the page's handlers as a keypress would (cu-researcher: rows are
        // often links). Only an entry-like role the driver reports read-only is left to its own rules.
        // CU-370: a select is a choice, not a text entry - a combobox or listbox the driver reports not editable (a native
        // <select>) keeps no exemption: its type-ahead picks an option (judged below) and reaches the page's handlers.
        const choice = target && /combo|listbox/i.test(String(target.role ?? '')) && target.editable !== true
        if (target && !choice && /text|search|combo/i.test(String(target.role ?? ''))) return null
        return text
      }
      const keys = keysOf(action)
      if (action.type !== 'keypress' && action.type !== 'hold_key') return null
      const MODS = ['CMD', 'COMMAND', 'META', 'SUPER', 'CTRL', 'CONTROL', 'ALT', 'OPTION', 'SHIFT']
      const main = [...keys].filter((key) => !MODS.includes(key))
      if (main.length !== 1 || [...main[0]].length !== 1) return null
      const ch = main[0]
      const produced = keys.has('SHIFT') ? (SHIFTED[ch] ?? ch.toUpperCase()) : ch.toLowerCase()
      const accel = ['CMD', 'COMMAND', 'META', 'SUPER', 'CTRL', 'CONTROL'].some((key) => keys.has(key))
      const alt = keys.has('ALT') || keys.has('OPTION')
      if (!accel && !alt) return produced
      // CU-365 (design note 0.1): a Control, Option or Command chord with one printable key reaches the page or app too.
      // Excluded, keeping their own rules: the editing set (select all, undo, redo, copy, cut, paste) and, in the
      // browser, the chords the driver turns into browser actions or refuses (chrome-browser keys.mjs chordMeaning).
      const lower = ch.toLowerCase()
      // Find and find-next (Cmd/Ctrl + F, G) join the editing set (cu-coordinator 18:59Z).
      if (accel && (lower === 'v' || (!alt && 'azycxfg'.includes(lower)))) return null
      if (browserRoute && accel && !alt && 'r[]ltnwq'.includes(lower)) return null
      // On the desktop a chord usually fires a menu item: only the loop's read that none fires makes it the app's own.
      if (onDesktop && context.boundMenuItem?.none !== true) return null
      chordShortcut = true
      const label = [keys.has('CTRL') || keys.has('CONTROL') ? 'ctrl' : null, alt ? 'alt' : null, ['CMD', 'COMMAND', 'META', 'SUPER'].some((key) => keys.has(key)) ? 'cmd' : null].filter(Boolean)
      return `${label.join('+')}+${produced}`
    })()
    // A key into a frame host goes to the frame's own field (CU-297 judges it by the frame's name), not to a page handler.
    // An unread focus counts (cu-coordinator 17:40Z: printable input of any length into an unread focus asks - a named
    // over-ask: typing into a desktop field whose focus cannot be read asks).
    // On the desktop a null target (nothing focused, or a focus the driver could not read) holds no text entry either, so
    // printable input there asks too (cu-coordinator 17:53Z) - a typed line break alone is no printable input (D-069 keeps it).
    const desktopTarget = desktopNoMenu
    // cu-verifier 180522Z: 'ok #' typed on a focused link row - its space presses the link, its other characters still reach
    // the page's handlers - so a typed text is an activation only when it holds nothing but spaces and line breaks.
    const activationOnly = keyboard.activates && !(action.type === 'type' && /\S/.test(String(action.text ?? '')))
    const pageShortcut = !choiceRead && (browserRoute || desktopTarget) && shortcutKey !== null && !isTextEntry(target) && !framesHost(target) && !keyboard.deletes && !activationOnly
    // CU-140 (press-and-drop.md): a drag pressed on a control - a long press, or any drag starting there - is judged like
    // a click on it; a file, row, cell or image at the press point is not judged by its name (dragging it moves it).
    const pressesTarget = POINTER.has(action.type) || (action.type === 'drag' && CONTROL_ROLE.test(String(target?.role ?? '')))
    // ... and the drop point of a drag that travels: a drop onto a Trash, Delete or Remove zone deletes.
    if (action.type === 'drag' && context.dropTarget && namesWord(String(context.dropTarget.name ?? ''), DROP_DELETE)) classes.push('delete')
    // CU-377 (High pending a live row; cu-coordinator 21:35Z): a desktop drag that carries a file, or whose source is unknown,
    // asks when its drop is in another app or cannot be read (fail closed only where it matters, cu-researcher); a drag of
    // anything else, or inside one app, keeps today's judgement. The loop computes context.dragSource.
    if (action.type === 'drag' && travels(action) && (context.dragSource === 'file' || context.dragSource === 'unknown')) {
      const appOf = (element) => (element ? (typeof element.origin === 'string' && element.origin !== '' ? element.origin : String(context.frontmostBundleId ?? '')) : '')
      const from = appOf(target)
      const to = appOf(context.dropTarget)
      // CU-392 (High pending a live row; cu-coordinator 01:13Z): a drop onto a share destination sends the file away even
      // inside one app - AirDrop (or a person in its window), a Shared folder, a Drop Box, a server or network volume.
      // A server named by its host ('fileserver.local', an IPv4 address) counts too; a person in the AirDrop window is named
      // only by the person - the interim cell rule below until helper 0.2.67's dropDestination.
      const dropName = String(context.dropTarget?.name ?? '').trim()
      const hostShaped = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|lan|home|corp|internal|intranet)$/i.test(dropName) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(dropName)
      // The driver owner's names bind (cu-coordinator 01:23Z): networkVolume (a drop target whose AXURL is smb/afp/nfs/webdav/
      // ftp, a boolean) and, from helper 0.2.67, dropDestination in {airdrop, shared, server}.
      const driverShare = context.dropTarget?.networkVolume === true || ['airdrop', 'shared', 'server'].includes(String(context.dropTarget?.dropDestination ?? ''))
      // Interim fail-closed rule until 0.2.67 (cu-coordinator 01:21Z): a drop into Finder onto a person or device button with
      // no file name, url or file-like name asks (named over-ask: a file dropped on another Finder button).
      const dropRole = String(context.dropTarget?.role ?? '')
      // Narrowed to buttons (cu-researcher 01:29Z): column-view folder cells and the icon-view background are ordinary moves.
      const personCell = context.dropTarget?.origin === 'com.apple.finder' && /^AXButton$/i.test(dropRole)
        && !String(context.dropTarget?.filename ?? '').trim() && !String(context.dropTarget?.url ?? '').trim() && !/\.[a-z][a-z0-9]{0,7}$/i.test(dropName)
      const shareDrop = driverShare || personCell || SHARE_DESTINATION.test(dropName) || hostShaped
      if (to === '' || from === '' || from !== to || shareDrop) classes.push('permission')
    }
    let grammarEligible = false
    if (pressesTarget || pressesEnter || keyboard.activates) {
      if (POINTER.has(action.type) && /change\s+password|update\s+password|修改密码|更改密码|修改密碼|更改密碼|重设密码|重設密碼/i.test(name)) {
        return { decision: 'handoff', class: null, rule: 'password_change', reason: 'the final step of a password change is the person\'s' }
      }
      const focusesEntry = POINTER.has(action.type) && plainTextEntry(target)
      for (const cls of ['purchase', 'delete', 'permission']) {
        if (focusesEntry) break
        if ((cls === 'purchase' ? namesPurchase(name) : cls === 'delete' ? namesDelete(name) : namesWord(name, WORDS[cls]))) classes.push(cls)
      }
      if (judgesSubmit(name, target)) classes.push('submit')
      // CU-377: a control named only Upload (an 'Uploader' service keeps its name rules - CU-250).
      if (/^upload(?:\s*(?:\u2026|\.\.\.))?$/i.test(name.trim())) classes.push('submit')
      // CU-373 (design note 0.1): a control named for account security reaches a credential (D-063) - an app password, mail
      // auto-forwarding, two-factor or recovery settings - so a press asks credential, whatever a toggle's direction.
      // Turning two-factor or recovery protection ON by an explicit name stays free (CU-270); a bare toggle, whose direction
      // the driver does not report yet, asks.
      const protectionOn = /\b(?:turn\s+on|enable|set\s+up|activate)\b/i.test(name) && !/forward|app[\s-]?password/i.test(name)
      // Turning forwarding OFF is the safe direction (cu-coordinator 21:00Z).
      const forwardingOff = /\b(?:disable|turn\s+off|stop)\b/i.test(name) && /forward/i.test(name)
      // CU-373 refinement (fail closed, cu-researcher 20:56Z): the driver's state before the press decides a toggle's
      // direction only when the read is native (an input of type checkbox or radio) - an ARIA-sourced, 'mixed' or missing
      // state asks. A native two-factor/recovery box that is off turns protection ON; a native forwarding box that is on
      // turns forwarding OFF - both the safe direction, so free.
      // A native CHECKBOX only - a radio has no on/off direction; its label decides (cu-researcher 21:15Z).
      const toggleState = nativeToggleState(target)
      const nativeOn = toggleState === true
      const nativeOff = toggleState === false
      const isForwarding = /forward/i.test(name)
      // The explicit protection list (CU-270's two-factor and recovery names), never 'every security name but a few'.
      const isProtection = /two[\s-]?(?:factor|step)|2[\s-]?step|\b2fa\b|multi[\s-]?factor|recovery\s+(?:e-?mail|phone|codes?)/i.test(name)
      const safeToggle = (isProtection && nativeOff) || (isForwarding && nativeOn)
      if (!focusesEntry && ACCOUNT_SECURITY.test(name) && !protectionOn && !forwardingOff && !safeToggle) classes.push('credential')
      // CU-401 round 2 (cu-coordinator): a plan word beside a navigation noun ('Downgrade options', 'Cancel plan details')
      // opens a page - free unless another purchase word remains.
      if (/\b(?:downgrade|cancel\s+(?:plan|membership)|end\s+trial)\b[\s\S]*\b(?:options|settings|details|faq|guide|policy|info)\b/i.test(name)
        && !namesPurchase(name.replace(/\b(?:downgrade|cancel\s+(?:plan|membership)|end\s+trial)\b/gi, ' '))) {
        for (let i = classes.length - 1; i >= 0; i -= 1) if (classes[i] === 'purchase') classes.splice(i, 1)
      }
      // CU-400: 'Sell', 'Convert' or 'Deposit' beside an asset or an amount (Sell BTC, Convert 0.5 ETH, Deposit USD) is a
      // trade; a marketplace 'Sell' and a file 'Convert' stay free (named).
      // CU-402 (High; cu-coordinator 05:21Z): a bare 'Sell'/'Convert'/'Deposit' submit inside a form reads its form's context
      // (cu-developer-two's driver: formContext {options: up to 3 selected texts, amountEntry}) - an asset among the selected
      // options makes it a trade; an amount entry alone never does (cu-coordinator 05:26Z - a marketplace 'Sell' stays free).
      const form = target?.formContext
      const formTrade = form && typeof form === 'object' && Array.isArray(form.options) && form.options.some((text) => TRADE_ASSET.test(String(text)))
      if (!focusesEntry && /\b(?:sell|convert|deposit)\b/i.test(name) && (/\d|[$\u20ac\u00a3\u00a5\u20bf]/.test(name) || TRADE_ASSET.test(name) || formTrade)) classes.push('purchase')
      // CU-430: 'Upgrade to <cabin>' (Business, First, Premium Economy ...) spends money.
      if (!focusesEntry && /^\s*upgrade\s+to\s+(?:business|first|premium(?:\s+economy)?|economy\s+plus|comfort|main\s+cabin|extra\s+legroom)\b/i.test(name)) classes.push('purchase')
      // Round 2: 'Add <n> bags' (a count).
      if (!focusesEntry && /^\s*add\s+\d+\s+(?:checked\s+|carry[\s-]?on\s+)?bags?\b/i.test(name)) classes.push('purchase')
      // CU-431: changing or resetting an admin password asks credential; updating, uploading or flashing firmware asks install.
      if (!focusesEntry && /^\s*(?:change|reset|set)\s+(?:the\s+)?(?:(?:router|device|wi-?fi|nas)\s+(?:admin(?:istrator)?\s+)?|admin(?:istrator)?\s+)password\b/i.test(name)) classes.push('credential')
      // CU-481 residual (cu-coordinator 06:49Z, b): change / edit / modify the firmware asks install like 'Update firmware'.
      if (!focusesEntry && /^\s*(?:update|upload|flash|install|upgrade|change|edit|modify)\s+(?:the\s+)?(?:router\s+|new\s+)?firmware\b/i.test(name)) classes.push('install')
      // CU-431 switches (cu-coordinator 17:27Z, CU-418's switch rule): a router switch named Remote management / access, SSH,
      // Telnet, UPnP, DMZ, WAN access or Port forwarding turned ON asks permission and OFF is free - the direction is trusted
      // only from a native read (nativeToggleState); an ARIA, mixed or missing state (and a desktop web area without it) asks
      // both ways.
      if (!focusesEntry && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
        && /^\s*(?:remote\s+(?:management|access|administration)|ssh|telnet|upnp|dmz|wan\s+access|port\s+forwarding)\s*$/i.test(name)) {
        if (nativeToggleState(target) !== true) classes.push('permission')
      }
      // CU-420: exporting, revealing, showing, viewing or copying passwords or secrets and getting recovery codes expose credentials;
      // 'Show password' asks everywhere, the sign-in eye toggle included - the plaintext reaches the next screenshot (cu-coordinator
      // 15:16Z, superseding 15:13Z); 15:18Z adds keychain / credentials exports, secrets and 'Get backup codes'.
      if (!focusesEntry && /^\s*(?:export\s+(?:all\s+|my\s+)?(?:passwords?|vault|logins?|keychain|credentials)|(?:reveal|show|copy|view)\s+(?:the\s+)?(?:saved\s+)?(?:passwords?|secrets?)|(?:download|view|show|copy|print|get)\s+(?:your\s+|my\s+)?(?:backup|recovery)\s+codes?)\b/i.test(name)) classes.push('credential')
      // CU-421: overriding a malware warning or installing a profile or helper asks install (CU-254's class).
      // cu-coordinator 15:25Z adds a page's 'Keep dangerous file' (Chrome's own shelf stays the named limit).
      if (!focusesEntry && /^\s*(?:(?:open|run|keep|download|install)\s+anyway|keep\s+(?:the\s+)?dangerous\s+file|install\s+(?:the\s+)?(?:configuration\s+)?(?:profile|helper))\b/i.test(name)) classes.push('install')
      // CU-422: a bare 'Give' / 'Give now' pays; a bare 'Vote' (or 'Vote for <x>'), 'Resign' and 'Apply for <noun>' submit.
      // cu-coordinator 15:42Z (round 2): money forms 'Leave a tip', 'Tip $<n>', 'Give $<n>'.
      if (!focusesEntry && (/^\s*give(?:\s+now)?\s*$/i.test(name) || /^\s*leave\s+(?:a\s+)?tip\b/i.test(name)
        || /^\s*(?:tip|give)\s+(?:[A-Z]{3}\s*)?[$\u20ac\u00a3\u00a5]\s*\d/i.test(name))) classes.push('purchase')
      // Round 2: an article or possessive between the verb and the object ('Cast my vote', 'Decline the offer').
      if (!focusesEntry && (/^\s*(?:cast|submit)\s+(?:my|your|the|a|our)\s+(?:vote|ballot)\b/i.test(name)
        || /^\s*(?:accept|decline)\s+(?:the|this|my|your|an?)\s+(?:job\s+)?offer\b/i.test(name)
        || /^\s*sign\s+(?:this|a|our)\s+petition\b/i.test(name) || /^\s*quit\s+(?:the|this)\s+job\b/i.test(name))) classes.push('submit')
      if (!focusesEntry && (/^\s*vote(?:\s+now|\s+for\s+\S.*)?\s*$/i.test(name) || /^\s*resign(?:\s+now)?\s*$/i.test(name) || /^\s*apply\s+for\s+(?!(?:a\s+)?refund\s+policy)\S/i.test(name))) classes.push('submit')
      // CU-423: 'Make <noun> public anyway' grants access; a password change with an object between ('Change my password',
      // 'Change account password', 'Update your password') asks credential - the bare 'Change password' keeps its hand-off.
      if (!focusesEntry && /^\s*make\s+(?:\S+\s+){0,2}public\s+anyway\s*$/i.test(name)) classes.push('permission')
      // Round 2: 'New Password' / 'Add Password' (a password-manager entry) ask credential.
      if (!focusesEntry && /^\s*(?:new|add)\s+(?:a\s+)?password\s*$/i.test(name)) classes.push('credential')
      if (!focusesEntry && /^\s*(?:change|update|reset)\s+(?:(?:my|your|the|this)\s+(?:account\s+|apple\s+id\s+|login\s+|icloud\s+(?:account\s+)?)?|(?:account|apple\s+id|login|icloud(?:\s+account)?)\s+)password\s*$/i.test(name)) classes.push('credential')
      // CU-424 (carried from #448, CU-393 02:31Z): 'Continue as <name>' is the one-tap provider sign-in ('Continue as guest' stays free).
      if (!focusesEntry && /^continue\s+as\s+(?!guest\b)\S/i.test(name.trim())) classes.push('permission')
      // Round 2: 'Login with <provider>' (one-word login) and 'Connect to / with <service>' - network and device targets stay free
      // (Wi-Fi, network, printer, Bluetooth, display, TV, speaker).
      if (!focusesEntry && (/^\s*(?:log\s*in|login|sign\s*in|sign\s*up|continue)\s+with\s+(?:google|apple|microsoft|github|gitlab|facebook|twitter|x|linkedin|slack|amazon)\b/i.test(name)
        || /^\s*connect\s+(?:to|with)\s+(?!(?:a\s+|the\s+)?(?:wi-?fi|network|printer|bluetooth|display|tv|speaker|airplay|hotspot)\b)\S/i.test(name))) classes.push('permission')
      // CU-427: running a command on this Mac asks install (code runs here).
      // Round 2 adds 'Run in shell' and 'Run this script'.
      if (!focusesEntry && /^\s*(?:run|execute)\s+(?:this\s+|the\s+)?(?:command|script|in\s+(?:terminal|shell)|shell\s+command)\b/i.test(name)) classes.push('install')
      // CU-428: 'Join / Go / Get / Unlock / Try <tier>' (Prime, Plus, Premium, Pro, Gold ...) ends the name - a paid tier.
      if (!focusesEntry && /^\s*(?:join|go|get|unlock|try)\s+(?:\S+\s+)?(?:prime|plus|premium|pro|gold|platinum|vip|elite|unlimited|max|ultra|membership)(?:\s+(?:now|today|free|for\s+\S+))?\s*$/i.test(name)) classes.push('purchase')
      // cu-coordinator 17:00Z (round 2): 'Upgrade to <any tier or noun>', 'Join the club' and 'Become a <tier> member' ask purchase.
      // cu-coordinator 17:16Z (round 3): a software upgrade ('Upgrade to the latest version', 'Upgrade to macOS <name>',
      // 'Upgrade to version <n>') asks install, not purchase; a paid tier stays purchase.
      const softwareUpgrade = /^\s*upgrade\s+to\s+(?:the\s+)?(?:latest(?:\s+version)?|newest(?:\s+version)?|new\s+version|version\b|v?\d|macos\b|ios\b|ipados\b|windows\s+\d|android\s+\d|beta\b|the\s+beta\b)/i.test(name)
      if (!focusesEntry && softwareUpgrade) classes.push('install')
      if (!focusesEntry && !softwareUpgrade && (/^\s*upgrade\s+(?:to\s+\S|now\b|plan\b|account\b|membership\b)/i.test(name) || /^\s*join\s+(?:the\s+)?club\b/i.test(name)
        || /^\s*become\s+(?:a|an)\s+(?:\S+\s+)?member\b/i.test(name))) classes.push('purchase')
      // CU-415 (cu-coordinator 13:12Z): 'Reserve seat / table' asks purchase on the name alone (a booking commits the owner; a
      // free table's over-ask is named); 'Book appointment' asks purchase with a price or deposit in its name, else submit.
      if (!focusesEntry && /^\s*reserve\s+(?:a\s+)?(?:seat|table|spot)\b/i.test(name)) classes.push('purchase')
      if (!focusesEntry && /^\s*book\s+(?:an?\s+)?appointment\b/i.test(name)) {
        classes.push(/[$\u20ac\u00a3\u00a5]\s*\d|\d\s*[$\u20ac\u00a3\u00a5]|\bdeposit\b|\b(?:usd|eur|gbp)\s*\d/i.test(name) ? 'purchase' : 'submit')
      }
      // CU-416: 'Log in as' / 'Sign in as' <someone> acts as that person ('as guest' signs in as nobody).
      if (!focusesEntry && /^\s*(?:(?:log|sign)\s+in|login|act)\s+as\b(?!\s+(?:a\s+)?guest\b)/i.test(name)) classes.push('permission')
      // CU-417: an SSH, deploy or access key hands over credentials; a 'Destroy' button destroys (a link stays free).
      // cu-coordinator 14:12Z: rotating, regenerating or resetting credentials too.
      if (!focusesEntry && /^\s*(?:(?:add|new)\s+(?:an?\s+)?(?:new\s+)?(?:ssh|deploy|gpg)\s+keys?|create\s+(?:an?\s+)?(?:new\s+)?access\s+keys?|(?:rotate|regenerate|reset)\s+(?:the\s+|your\s+|all\s+)?(?:credentials?|keys)|new\s+ssh\s+key)\b/i.test(name)) classes.push('credential')
      // 'Make <noun> public' (an object between the verb and 'public', cu-coordinator 14:34Z).
      if (!focusesEntry && /^\s*make\s+(?:the\s+|this\s+)?(?:\S+\s+){1,2}public\s*$/i.test(name)) classes.push('permission')
      if (!focusesEntry && /^\s*destroy\b/i.test(name) && !/link/i.test(String(target?.role ?? ''))) classes.push('delete')
      // CU-410: renting ('Rent', 'Rent now', 'Rent <title>'; 'Rentals' stays free), a bare 'Renew', reactivating a subscription,
      // turning auto-renew on and switching the billing period ask purchase.
      if (!focusesEntry && (/^\s*rent\b/i.test(name) || /^\s*renew\s*$/i.test(name)
        || /^\s*reactivate(?:\s+(?:my\s+|your\s+)?(?:subscription|plan|membership))?\s*$/i.test(name)
        || /^\s*(?:turn\s+on|enable)\s+auto[\s-]?renew(?:al)?\b/i.test(name)
        || /^\s*switch\s+to\s+(?:annual|yearly|monthly)\b/i.test(name))) classes.push('purchase')
      // CU-411: rotating, regenerating, generating, creating or revoking a key or token is a credential act (it asks credential,
      // not the 'api key' / 'revoke' permission words).
      // 'Transfer ownership' hands the account over (permission), not money - its 'transfer' is not a purchase.
      if (/\btransfer\s+ownership\b/i.test(name) && !namesPurchase(name.replace(/\btransfer\b/gi, ' '))) {
        for (let i = classes.length - 1; i >= 0; i -= 1) if (classes[i] === 'purchase') classes.splice(i, 1)
      }
      if (!focusesEntry && ACCOUNT_WIPE.test(name)) classes.push('delete')
      if (!focusesEntry && (KEY_TOKEN_ACT.test(name) || (RESET_PASSWORD.test(name) && !/link/i.test(String(target?.role ?? ''))))) {
        for (let i = classes.length - 1; i >= 0; i -= 1) if (classes[i] === 'permission') classes.splice(i, 1)
        classes.push('credential')
      }
      // CU-408: a bare 'Refund' issues one (exact name; 'Refund policy' stays free).
      // cu-coordinator 09:52Z (near forms): a refund or a charge with an amount, a partial or full refund, a recurring payment, and
      // 'turn autopay on' move money too.
      if (!focusesEntry && (/^\s*refund\s*$/i.test(name) || /^\s*(?:refund|charge)\s+(?:[A-Z]{3}\s*)?[$\u20ac\u00a3\u00a5]?\s*\d/i.test(name)
        || /^\s*(?:partial|full)\s+refund\b/i.test(name) || /\b(?:set\s+up|schedule|create|start)\s+(?:a\s+)?recurring\s+payment\b/i.test(name)
        || /^\s*turn\s+auto[\s-]?pay\s+on\s*$/i.test(name))) classes.push('purchase')
      // An article or an adjective before payee / recipient / beneficiary ('Add new payee', 'Add a recipient', 'Add bank recipient').
      if (!focusesEntry && /^\s*add\s+(?:[^\s]+\s+){1,2}(?:payee|recipient|beneficiary)\b/i.test(name)) classes.push('permission')
      // CU-408 (cu-coordinator 09:50Z): a bare 'Autopay' switch mirrors CU-373 - only a NATIVE checkbox read as on (the press
      // turns autopay off) is free; native off (turning it on), an ARIA-sourced, 'mixed' or missing state asks purchase.
      if (!focusesEntry && /^\s*auto[\s-]?pay\s*$/i.test(name) && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
        if (nativeToggleState(target) !== true) classes.push('purchase')
      }
      // CU-409: bare 'Long', 'Short', 'Borrow', 'Lend', 'Supply', 'Repay' ask only in asset context - an asset word or a currency
      // sign in the name, or an asset among the form's options (CU-402); a video 'Short' or a library 'Borrow 2 books' stays free.
      if (!focusesEntry && /\b(?:long|short|borrow|lend|supply|repay)\b/i.test(name) && (/[$\u20ac\u00a3\u00a5\u20bf]/.test(name) || TRADE_ASSET.test(name) || formTrade)) classes.push('purchase')
      // CU-409: 'Leverage <N>x' and 'Approve <TICKER>' (an all-caps token after Approve, e.g. 'Approve USDC') ask anywhere.
      if (!focusesEntry && (/\bleverage\s+\d+(?:\.\d+)?\s*x\b|\b\d+(?:\.\d+)?\s*x\s+leverage\b/i.test(name) || /^\s*(?:approve|Approve|APPROVE)\s+[A-Z][A-Z0-9]{1,9}\s*$/.test(String(target?.name ?? '')) || /^\s*approve\s+(?:usdc|usdt|dai|eth|weth|wbtc|btc|sol|matic)\s*$/i.test(name))) classes.push('purchase')
      // cu-coordinator 05:30Z: the form's own submit - 'Place', 'Place order', 'Confirm', 'Submit' - beside an asset option is
      // the trade too; 'Continue', 'Next' and 'Review' stay free (the review step's Confirm asks).
      if (!focusesEntry && formTrade && /\b(?:place|confirm|submit)\b/i.test(name)) classes.push('purchase')
      // cu-coordinator 04:50Z: a trading word beside a navigation noun ('Trade history', 'Swap settings', 'Staking FAQ') opens
      // a page - free, unless another purchase word is in the name.
      if (TRADE_NAV.test(name) && !namesPurchase(name.replace(TRADE_WORDS, ' '))) {
        for (let i = classes.length - 1; i >= 0; i -= 1) if (classes[i] === 'purchase') classes.splice(i, 1)
      }
      // A bare 'Garage Door' tile toggles either way (exact name); 'Close Garage Door' stays free.
      if (!focusesEntry && (namesWord(name, PHYSICAL) || namesWord(name, PHYSICAL_NEAR) || PHYSICAL_GRAMMAR.test(name) || PHYSICAL_PATTERN.test(name) || UNLOCK_PHYSICAL.test(name) || /^garage\s+door$/i.test(name.trim()))) classes.push('physical')
      // CU-418 switches (cu-coordinator 14:17Z / 14:19Z): a bare security switch ('Camera', 'Alarm', 'Security') turned OFF and a
      // heat or vehicle switch ('Oven', 'Heater', 'Stove', 'Engine') turned ON ask physical. The direction is trusted only from a
      // native read (nativeToggleState: a web checkbox input, or since helper 0.2.70 a desktop AXCheckBox outside any web
      // area); an ARIA, mixed or missing state - and a desktop switch from an older helper or inside a web area - asks in
      // both directions (named over-ask: 'Camera' on / 'Oven' off there).
      if (!focusesEntry && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
        const security = /^\s*(?:security\s+)?(?:cameras?|alarm|security)\s*$/i.test(name)
        const heat = /^\s*(?:oven|heater|stove|engine)\s*$/i.test(name)
        if (security || heat) {
          const state = nativeToggleState(target)
          const known = state !== null
          const turnsOff = state === true
          const turnsOn = state === false
          if (!known || (security && turnsOff) || (heat && turnsOn)) classes.push('physical')
        }
      }
      // CU-146: 'Trash' or 'Bin' alone deletes on a control (a toolbar button, a menu item); a sidebar row of that name
      // only opens the folder.
      if (TRASH_ROLE.test(String(target?.role ?? '')) && namesWord(name, CONTROL_DELETE)) classes.push('delete')
      // The phrase grammar may judge this press below, after every older rule (not on an entry, not on a link - a link
      // navigates, and the older rules keep their link exceptions).
      // CU-472 (High; cu-coordinator 01:36Z): a link that does not navigate (target.inertLink - no / empty / '#' / 'javascript:' href,
      // or an ARIA link with no <a>) is judged like a button; a real-URL link stays navigation (named limit).
      grammarEligible = !focusesEntry && (!/link/i.test(String(target?.role ?? '')) || target?.inertLink === true)
      // CU-467 (cu-coordinator 01:04Z): a real-URL link's money amount asks only with a commit verb ('Buy for $5'). An inert link
      // (CU-472) takes the button pattern when a generic or commit verb leads or the amount has a period (cu-coordinator 02:35Z:
      // 'Continue for $9.99', '$4.99/month'); a product tile drawn as <a href='#'> ('Blue mug, $12.99') stays free.
      if (!focusesEntry && /link/i.test(String(target?.role ?? '')) && (target?.inertLink === true ? inertLinkAmountClass(name) : amountClass(name, 'link'))) classes.push('purchase')
    }
    // CU-232 (menu-key.md): a desktop chord that is a menu item's key equivalent fires that item, so the item's name is
    // judged as a click on it would be, beside the keys - Shift-Command-D bound to Send asks submit. Every matching item
    // counts (one or a list); a menu bar the loop could not read is app-policy's to ask.
    const bound = context.boundMenuItem
    const boundNames = bound && typeof bound === 'object' ? (Array.isArray(bound.items) ? bound.items : [bound]).map((one) => one?.name).filter((n) => typeof n === 'string' && n.trim() !== '') : []
    for (const boundName of boundNames) {
      for (const cls of ['purchase', 'delete', 'permission']) {
        if ((cls === 'purchase' ? namesPurchase(boundName) : cls === 'delete' ? namesDelete(boundName) : namesWord(boundName, WORDS[cls]))) classes.push(cls)
      }
      // A bound Reply follows CU-157 on the focused window's entries, as the focused target reports them.
      if (judgesSubmit(boundName, target)) classes.push('submit')
      if (namesWord(boundName, CONTROL_DELETE)) classes.push('delete')
    }
    // CU-142 (keyboard-activation.md): a Return presses the window's default button, so its name - where the environment
    // reports it - is judged as a second name, from a single-line input or non-text focus; in a text area a Return is
    // text (the area's own name still applies above) and only Command-Return presses the default button.
    const defaultName = typeof target?.defaultButton?.name === 'string' ? target.defaultButton.name : ''
    const inTextArea = TEXT_AREA_ROLE.test(String(target?.role ?? ''))
    const commandReturn = keysOf(action).has('META') && keysOf(action).has('ENTER')
    // CU-406 (High; cu-coordinator 07:03Z): Return presses the default button, so it is judged by the CLICK's full classifier
    // on that button - its name and its formContext (cu-developer-two's driver attaches the bounded read) - instead of a
    // hand-kept subset: the trade clause, credential ('Change email'), and whatever the click rules gain later. The field's
    // textEntered rides along (an empty field's Return keeps CU-241's reading). A handoff or block on the button stands.
    // CU-412 (High; cu-coordinator 11:25Z): implicit submission past role=button controls - two or three candidates
    // (target.defaultCandidates, each shaped like defaultButton) are each judged by the click classifier and every class
    // asked (the strictest leads, fail closed); more than three (defaultCandidatesMore) asks unknown.
    const candidateList = Array.isArray(target?.defaultCandidates) ? target.defaultCandidates : []
    const candidates = candidateList.filter((one) => one && typeof one === 'object' && typeof one.name === 'string' && one.name.trim() !== '').slice(0, 3)
    // cu-researcher 11:54Z (fail closed): a candidate with no name (an icon-only control, maybe a trash glyph) is unreadable -
    // it asks unknown like more-than-three, never drops out of the list.
    const candidateUnread = target?.defaultCandidatesMore === true || candidateList.some((one) => !one || typeof one !== 'object' || typeof one.name !== 'string' || one.name.trim() === '')
    const candidateReturn = pressesEnter && (!inTextArea || commandReturn) && context.defaultButtonProbe !== true
    const classesBeforeDefault = classes.length
    // cu-coordinator 11:35Z: the UNION - candidates are judged whenever present, beside a defaultButton too (a hidden or nameless
    // default submit), and can only add asks.
    if (candidates.length > 0 && candidateReturn) {
      const { dialog: _cd, paste: _cp, dropTarget: _cdt, dragSource: _cds, ...candidateContext } = context
      for (const one of candidates) {
        const pressedOne = { ...one, role: one.role ?? 'button', ...(target?.textEntered !== undefined ? { textEntered: target.textEntered } : {}) }
        const verdictOne = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...candidateContext, target: pressedOne, defaultButtonProbe: true })
        if (verdictOne.decision === 'block' || verdictOne.decision === 'handoff') return verdictOne
        for (const cls of verdictOne.decision === 'confirm' ? (verdictOne.classes ?? [verdictOne.class]) : (verdictOne.class ? [verdictOne.class] : [])) {
          if (cls !== 'permission' || verdictOne.rule !== 'page:shortcut') classes.push(cls)
        }
      }
    }
    if (defaultName !== '' && pressesEnter && (!inTextArea || commandReturn) && context.defaultButtonProbe !== true) {
      const { dialog: _dialog, paste: _paste, dropTarget: _drop, dragSource: _source, ...probeContext } = context
      const pressed = { ...target.defaultButton, role: target.defaultButton.role ?? 'button', ...(target?.textEntered !== undefined ? { textEntered: target.textEntered } : {}) }
      const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...probeContext, target: pressed, defaultButtonProbe: true })
      if (probe.decision === 'block' || probe.decision === 'handoff') return probe
      for (const cls of probe.decision === 'confirm' ? (probe.classes ?? [probe.class]) : (probe.class ? [probe.class] : [])) {
        if (cls !== 'permission' || probe.rule !== 'page:shortcut') classes.push(cls)
      }
    }
    // More than three candidates or a nameless one: if neither the default nor the listed candidates asked, ask unknown.
    if (candidateUnread && candidateReturn && classes.length === classesBeforeDefault) {
      return { decision: 'confirm', class: 'unknown_target', classes: ['unknown_target'], rule: 'default:candidates_unread', reason: `press ${(action.keys ?? ['Return']).join('+')} in a form whose Return may submit through one of several controls the agent cannot tell apart` }
    }
    // CU-190 (keyboard-activation.md): a default button the helper could not read may well be there, so the Return asks
    // submit - focused or not; only a read with none (true) keeps the rule above. D-069: on the desktop (url app:...) no
    // read state at all asks too - the helper link refuses a helper too old to send it, so absence is never a pass. No
    // target at all is the driver's good read of nothing focused and no default button (cu-verifier): it keeps the rule.
    // CU-243: app-policy calls this with url 'desktop://' on every real desktop run; 'app:' is the tests' and the matrix's.
    const desktopUrl = /^(app|desktop):/.test(String(context.url ?? ''))
    const unreadDefault = target?.defaultButtonRead === false || (desktopUrl && target != null && target.defaultButtonRead !== true)
    if (unreadDefault && defaultName === '' && pressesEnter && (!inTextArea || commandReturn)) classes.push('submit')
    // CU-241 (keyboard-activation.md): on a web page, Command- or Control-Enter in a multi-line editable - a textarea or a
    // contenteditable - is the web's universal send (webmail, chat, comment boxes), and the page reports no default button
    // to judge, so it asks submit. Named over-ask: code editors. The desktop keeps its default-button reading (CU-142).
    const webTag = /^(app|desktop):/.test(String(context.url ?? '')) ? '' : String(target?.tag ?? '').toLowerCase()
    const multiLineWeb = target?.editable === true && webTag !== '' && webTag !== 'input'
    // CU-241 (cu-researcher, 12:47Z): an iframe-body editor (TinyMCE, CKEditor 4, many webmail composers) keeps the caret
    // in a same-origin frame's <body>, which the browser driver does not describe - the focus reads null; a cross-origin
    // frame (an iframe, frame, object, embed or fenced frame) stops the read at its host element. Either way the chord
    // lands in content the gate cannot read, and in an editor it is the send, so on a web page it asks submit too, with
    // any extra modifier. Named over-ask: the chord with nothing focused, or in a cross-origin widget frame. A focus read
    // that fails never reaches here: the loop refuses the key as target_unknown.
    const webPage = context.url != null && !desktopUrl
    const unreadWebFocus = webPage && !held && (target == null || framesHost(target))
    if ((multiLineWeb || unreadWebFocus) && keysOf(action).has('ENTER') && (keysOf(action).has('META') || keysOf(action).has('CTRL'))) classes.push('submit')
    // CU-297 (design note 0.1): a frame host's document is unread, so on a web page (1) text typed or keystroke-pasted into
    // it meets the field-name rules by the frame's own name - hosted payment and sign-in fields title each frame for its
    // field (Braintree's 'Secure Credit Card Frame - CVV', Stripe's 'Secure CVC input frame'); and (2) a Return or typed
    // line break there asks submit, CU-190's web twin: the frame's form and its submit button are unread, and a hosted
    // checkout or sign-in submits on Return. A null focus keeps today's rule (a focused body has no form). Named over-asks:
    // a vendor prefix naming every frame for the card ('... Frame - Postal Code'); a Return in a framed comments editor.
    const framedWeb = unreadWebFocus && target != null
    // Every route that puts text into the focused field reads the frame host as an entry named by it: typing, a printable
    // key (CU-301), a keystroke paste, and a menu paste whose read destination is a frame host (cu-researcher).
    const asFrameEntry = (into) => (webPage && !held && framesHost(into) ? asNamedEntry(String(into.name ?? '')) : null)
    const frameEntry = framedWeb ? asFrameEntry(target) : null
    if (framedWeb && pressesEnter) classes.push('submit')
    // CU-300 (frame-focus.md, never weaker than the frame-host rules): once the driver follows the focus into a
    // cross-origin frame, the target is the inner field and carries its host as frameHost. Every text route judges the
    // host's name too - an unnamed input inside 'Secure Credit Card Frame - CVV' still asks - and a Return there asks
    // submit unless the frame's own default button was read (defaultButtonRead true), which the rules below then judge.
    const hostEntryOf = (into) => (webPage && !held && into?.frameHost && typeof into.frameHost === 'object' ? asNamedEntry(String(into.frameHost.name ?? '')) : null)
    const hostEntry = hostEntryOf(target)
    const throughHost = (text, host) => {
      const viaHost = host === null ? null : insertedClass(text, host, context)
      if (viaHost) classes.push(viaHost)
    }
    if (hostEntry !== null && pressesEnter && target.defaultButtonRead !== true) classes.push('submit')
    // ... and Space presses whatever control is focused inside the frame - a hosted Pay or Submit button, a CAPTCHA's
    // check box (CU-263's keyboard route) - so it asks submit too until the driver follows the focus (CU-300). Named
    // over-ask: a lone Space keypress in a framed editor (typed text goes as 'type').
    if (framedWeb && keysOf(action).has('SPACE') && !['META', 'CTRL'].some((k) => keysOf(action).has(k))) classes.push('submit')
    // CU-253 (cu-researcher): a chat app sends on a plain Return from its compose field - a text area too, and with no
    // default button to read (Messages' 'iMessage', Slack, WhatsApp). So a plain Return or typed line break asks submit
    // in any text entry of a known chat app, or in an entry named as a compose field; Shift- or Option-Return types
    // a line break there and stays allowed. A browser textarea keeps its line break (the web's send is CU-241's
    // Command-Enter). Named limit: a chat app not in the list whose compose field has another name.
    // In a chat app Command- or Control-Return asks too (a send in many of them; cu-coordinator's ruling).
    const chatApp = isMessagingApp(String(context.frontmostBundleId ?? target?.origin ?? '')) && !isSearchField(target)
    const lineBreakChord = ['SHIFT', 'ALT'].some((k) => keysOf(action).has(k))
    const sendReturn = pressesEnter && !lineBreakChord && (chatApp || !['CTRL', 'META'].some((k) => keysOf(action).has(k)))
    const browserTextarea = String(target?.tag ?? '').toLowerCase() === 'textarea'
    if (sendReturn && isTextEntry(target) && (chatApp || (CHAT_COMPOSE_NAME.test(String(target?.name ?? '').trim()) && !browserTextarea))) classes.push('submit')
    // CU-153: reloading, or stepping back or forward, onto a page that was the direct answer to a form POST sends it again.
    if (typeof context.resubmits === 'string') classes.push('submit')
    // CU-151 (paste-consent.md): a paste inserts text no check saw - the owner's pasteboard on the desktop (unread), the
    // run's own clipboard text in a browser. CU-179: typed and pasted text go through the same name and value rules
    // (insertedClass), so a paste into a field named IBAN, Password or Passport asks as typing there does - also a desktop
    // paste of the run's own copy, whose text the run does not read (the name rules need none).
    if (context.paste?.fromOwner === true) classes.push('sensitive_data')
    // CU-377 paste half (cu-coordinator 21:45Z/21:47Z): on the desktop a run's paste whose copied source is a file item (a
    // filename or file URL, or a file browser's / file panel's row, cell or icon) into another app hands that file over - it
    // asks. A copy from TextEdit stays as today.
    if (context.paste && context.paste.fromOwner === false && /^(app|desktop):/.test(String(context.url ?? ''))) {
      const src = context.paste.source ?? null
      const into = (typeof target?.origin === 'string' && target.origin !== '') ? target.origin : String(context.frontmostBundleId ?? '')
      // CU-387: on the desktop a copied element's url is a file URL's leaf, so any non-empty url is a file.
      const fileSource = src && ((typeof src.filename === 'string' && src.filename !== '') || (typeof src.url === 'string' && src.url.trim() !== '')
        || ((FILE_BROWSER_APPS.has(String(src.origin ?? '')) || src.panel) && /row|cell|icon|outline|image|statictext|textfield|group/i.test(String(src.role ?? ''))))
      // An unattributed run paste (no source recorded: a copy with nothing focused) keeps today's judgement - asking on it
      // re-judged CU-219's own-copy rows; it is the named follow-up with the helper's pasteboardHasFile read.
      if (fileSource && src.origin !== into) classes.push('permission')
    }
    if (context.paste) {
      // CU-186: a menu paste is judged at the field it lands in; one that could not be read, or a menu, is unknown and asks.
      // Only a menu paste carries a destination; a keystroke paste is judged at its target as before (a null target there
      // is not 'unknown' - cu-verifier's desktop-consent S4b caught that over-ask).
      const viaMenu = Object.prototype.hasOwnProperty.call(context.paste, 'destination')
      const into = viaMenu ? (asFrameEntry(context.paste.destination) ?? context.paste.destination) : (frameEntry ?? target)
      // The driver's no-focus placeholder (role and name null) is no field either (cu-developer-two).
      if (viaMenu && (into === null || !into?.role || MENU_ROLE.test(String(into.role)))) classes.push('sensitive_data')
      else {
        const pastedText = typeof context.paste.text === 'string' && context.paste.text !== '' ? context.paste.text : null
        const inserted = insertedClass(pastedText, into, context)
        if (inserted) classes.push(inserted)
        throughHost(pastedText, viaMenu ? hostEntryOf(context.paste.destination) : hostEntry)
      }
      // CU-183 (copy-source.md): the field the run copied from - one descriptor, or several when the desktop has no
      // count to prove which copy wrote - lends its name class to the paste, whatever the destination is named.
      for (const source of [].concat(context.paste.source ?? [])) {
        const carried = sourceClass(source, context)
        if (carried) classes.push(carried)
      }
    }
    // CU-183: a drag pressed on a text entry carries that entry's class to any drop off it (an entry, a contenteditable,
    // a drop zone, a canvas can each take the text); only a drop back inside the same entry - reordering - is exempt.
    // A press that does not travel (a composed mouse_down/up at one point) moves no text, so it carries nothing.
    if (action.type === 'drag' && travels(action) && isTextEntry(target) && !sameEntry(target, context.dropTarget)) {
      const carried = insertedClass(null, target, context)
      if (carried) classes.push(carried)
    }
    // CU-195 (copy-caption rule 4): a travelling drag pressed on shown text named by its own words carries its caption's
    // class to a drop that can take text - a text entry or an editable area. Anywhere else a drag over shown text selects
    // it rather than moving it, so it carries nothing (the over-ask guard).
    if (action.type === 'drag' && travels(action) && (textNamedSource(target) || captionedShownText(target)) && isTextEntry(context.dropTarget)) {
      const carried = sourceClass(target, context)
      if (carried) classes.push(carried)
    }
    // CU-198 (drag-text.md): a drag that moves text and drops on a text entry or an editable area is judged as a paste
    // there - the dragged text's value rules and the drop target's name rules. Text moves when the browser read some (or
    // could not read: unknown asks), or - with no read, the desktop - when the press is on a text entry or shown text.
    // Any other drag (a slider, a window) adds nothing here; a drop back inside the pressed entry is a reorder.
    const read = context.dragText
    const movesText = read === undefined ? (isTextEntry(target) || textNamedSource(target)) : (typeof read === 'string' || read?.unknown === true)
    if (action.type === 'drag' && travels(action) && movesText && isTextEntry(context.dropTarget) && !sameEntry(target, context.dropTarget)) {
      if (read?.unknown === true) classes.push('sensitive_data')
      const inserted = insertedClass(typeof read === 'string' ? read : null, context.dropTarget, context)
      if (inserted) classes.push(inserted)
      throughHost(typeof read === 'string' ? read : null, hostEntryOf(context.dropTarget))
    }
    if (action.type === 'type') {
      const inserted = insertedClass(String(action.text ?? ''), frameEntry ?? target, context)
      if (inserted) classes.push(inserted)
      throughHost(String(action.text ?? ''), hostEntry)
    }
    // CU-301 (design note 0.1): a printable key pressed into a text entry puts its character there as typing does, so the
    // same rules judge it - a credential field or a password name asks credential, a D-061 name sensitive_data - else a
    // password, CVV or SSN pressed key by key goes in unasked. The whole value stays CU-267's buffer (below). Only on a text
    // entry: a letter that selects in a list, or Space on a check box, is not text.
    const keyChar = printableKeyChar(action)
    const keyInto = frameEntry ?? target
    if (keyChar !== null && (isTextEntry(keyInto) || credentialField(keyInto))) {
      const inserted = insertedClass(keyChar, keyInto, context)
      if (inserted) classes.push(inserted)
      throughHost(keyChar, hostEntry)
    }
    // CU-267: a value typed in pieces is judged whole - what this run typed into the field before (the loop's buffer) with
    // what this type, printable keypress or browser paste (the run clipboard's text) adds; the action that completes a value
    // asks. One that only extends a value already judged whole does not ask again.
    if ((action.type === 'type' || action.type === 'keypress') && context.typed && typeof context.typed.before === 'string' && typeof context.typed.next === 'string' && context.typed.next !== '') {
      const valueIn = (text) => text !== '' && Boolean(looksSensitive(withoutTaskValues(text, context.task)))
      if (!valueIn(context.typed.before) && valueIn(context.typed.before + context.typed.next)) classes.push('sensitive_data')
      // CU-340: digits typed into a field that took a desktop paste whose text this run cannot read (D-031) may complete a
      // value the paste began (a card pasted in half, typed in half) - they ask. Named over-ask: digits after any such paste.
      if (context.typed.afterUnreadPaste === true && /\d/.test(context.typed.next) && /^[\d\s-]+$/.test(context.typed.next)) classes.push('sensitive_data')
    }
    // CU-340 (design note 0.1): a page that splits one value across boxes - an SSN in 3/2/4, a card in 4x4, an expiry or a
    // phone in parts - leaves each box's buffer with only its part. The loop passes the last three other fields typed in
    // the same page or app within the last eight typed actions (typedSplit.parts, oldest first); when this field's text
    // and every joined part are short (1-6 letters or digits), the parts joined with this field's text - with no
    // separator, a dash or a space - are judged by the value rules, and the action that completes a value asks
    // sensitive_data. Named over-ask: short entries that happen to join into a value (a phone typed as area code, prefix
    // and line asks as a phone).
    if ((action.type === 'type' || action.type === 'keypress') && context.typedSplit && Array.isArray(context.typedSplit.parts)) {
      const shortPart = (t) => /^[A-Za-z0-9]{1,6}$/.test(String(t ?? '').trim())
      const before = String(context.typedSplit.before ?? '')
      const here = (before + String(context.typedSplit.next ?? '')).trim()
      if (shortPart(here)) {
        const parts = context.typedSplit.parts.map((t) => String(t ?? '').trim())
        let joinedAsks = false
        for (let k = 1; k <= Math.min(3, parts.length) && !joinedAsks; k++) {
          const used = parts.slice(-k)
          if (!used.every(shortPart)) break
          for (const sep of ['', '-', ' ']) {
            const whole = [...used, here].join(sep)
            const prior = [...used, before.trim()].filter((t) => t !== '').join(sep)
            if (looksSensitive(withoutTaskValues(whole, context.task)) && !looksSensitive(withoutTaskValues(prior, context.task))) { joinedAsks = true; break }
          }
        }
        if (joinedAsks) classes.push('sensitive_data')
      }
    }
    // CU-336 (design note 0.2): inside a cross-origin frame whose names are unread - the frame host's title and the field's
    // own name both null (an AX failure in the driver's host read, or a frame that titles nothing) - a CVV or an expiry
    // matches no name and no value rule. A short card code typed there asks sensitive_data: 3 or 4 digits alone, or an
    // expiry MM/YY, MM/YYYY, MM-YY or MM.YY, judged after removing whitespace, on the action's own text and on the field's typed
    // buffer (CU-267), so a code pressed key by key asks too. Both paths count: the iframe itself as the target (the driver
    // did not follow the focus) and an inner field with frameHost (CU-300). A frame whose origin is not read counts as
    // cross-origin (fail closed, cu-verifier); the inner field's frameUrl (#181) is read first, then its origin. Named over-ask: a short numeric entry in an unnamed third-party frame.
    // One-time codes stay CU-288's.
    const pageOrigin = (() => { try { return new URL(String(context.url ?? '')).origin } catch { return null } })()
    const crossOriginOf = (raw) => { try { return raw == null || raw === '' || new URL(String(raw)).origin !== pageOrigin } catch { return true } }
    const unnamed = (value) => String(value ?? '').trim() === ''
    const unnamedFrame = webPage && !held && target != null && (
      (framedWeb && unnamed(target.name) && crossOriginOf(target.frameUrl))
      || (target.frameHost && typeof target.frameHost === 'object' && unnamed(target.frameHost.name) && unnamed(target.name) && crossOriginOf(target.frameUrl ?? target.origin)))
    if (unnamedFrame) {
      const shortCode = (text) => /^(\d{3,4}|(0?[1-9]|1[0-2])[/.-](\d{2}|\d{4}))$/.test(String(text ?? '').replace(/\s+/g, ''))
      const added = action.type === 'type' ? String(action.text ?? '') : (keyChar ?? (typeof context.paste?.text === 'string' ? context.paste.text : ''))
      const whole = context.typed && typeof context.typed.before === 'string' && typeof context.typed.next === 'string' ? context.typed.before + context.typed.next : null
      if (added !== '' && (shortCode(added) || (whole !== null && shortCode(whole)))) classes.push('sensitive_data')
    }
    // CU-268: in the browser a control whose name has one word mixing scripts asks permission - never pre-approved, so a
    // pre-approved submit cannot wave a disguised Delete or Pay through (cu-developer-one's ruling) - where no rule found a
    // class: a folded look-alike already asks by its own ('Sеnd' asks submit). The desktop asks unknown_target in app-policy.
    // CU-436 (cu-coordinator 19:06Z): a spending-cap switch turned OFF lifts the limit on cloud spending (purchase); ON is free on a
    // native read (nativeToggleState); an ARIA, mixed or missing state asks both ways (the named toggle limit) - the inverse of
    // CU-431's.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:spending|budget|billing)\s+(?:cap|limit|alert\s+cap)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== false) classes.push('purchase')
    }
    // CU-440 (cu-coordinator 20:26Z): a child-protection switch (parental controls, content filter, SafeSearch, purchase approval,
    // Screen Time) turned OFF asks permission; ON is free on a native checkbox read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:parental\s+controls?|content\s+(?:filter|restrictions?)|safe\s*search|purchase\s+approval|ask\s+to\s+buy|screen\s+time)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== false) classes.push('permission')
    }
    // CU-442 (cu-coordinator 20:37Z): a bare 'Add time' tops up a metered session on a parking / charging page. The page title
    // never reaches the policy (a title is private), so the page is read from the URL; elsewhere it stays free (named limit).
    if (grammarEligible && classes.length === 0 && /^\s*add\s+(?:more\s+)?time\s*$/i.test(name) && /park|charg|meter/i.test(String(context?.url ?? ''))) classes.push('purchase')
    // CU-443 (cu-coordinator 20:52Z): 'Start recording' on a call page records the other party (permission); the page is read from
    // the URL (/call|voice|phone/), never the title. Elsewhere #462 keeps its own rows.
    if (grammarEligible && classes.length === 0 && /^\s*start\s+(?:call\s+)?recording\s*$/i.test(name) && /call|voice|phone/i.test(String(context?.url ?? ''))) classes.push('permission')
    // CU-444 (cu-coordinator 20:54Z): an ads / campaign SWITCH turned ON starts paid spend (purchase); OFF is free on a native
    // checkbox read; an unread state asks both ways (the CU-431 direction).
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:ads?|campaign(?:\s+status)?|ad\s+set|promotion|ad\s+delivery)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== true) classes.push('purchase')
    }
    // CU-445 (cu-coordinator 20:59Z): a camera privacy-mode / shutter switch turned OFF asks permission (ON free); an audio,
    // continuous-recording or face-recognition switch turned ON asks (OFF free); an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      const state = nativeToggleState(target)
      if (/^\s*privacy\s+(?:mode|shutter|cover)\s*$/i.test(name) && state !== false) classes.push('permission')
      if (/^\s*(?:audio\s+recording|record\s+audio|continuous\s+recording|24\/7\s+recording|face\s+recognition|facial\s+recognition|familiar\s+faces)\s*$/i.test(name)
        && state !== true) classes.push('permission')
    }
    // CU-446 (cu-coordinator 21:05Z): a domain-lock / transfer-lock switch turned OFF asks credential, a WHOIS-privacy switch turned
    // OFF asks permission; ON is free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      const turningOff = nativeToggleState(target) !== false
      if (turningOff && /^\s*(?:domain\s+lock|transfer\s+lock|registrar\s+lock)\s*$/i.test(name)) classes.push('credential')
      if (turningOff && /^\s*(?:whois\s+privacy|domain\s+privacy|privacy\s+protection)\s*$/i.test(name)) classes.push('permission')
    }
    // CU-447 (cu-coordinator 21:12Z): a block-public-access or logging switch turned OFF asks permission; ON is free on a native
    // read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:block\s+(?:all\s+)?public\s+access|audit\s+log(?:s|ging)?|logging|cloudtrail|data\s+access\s+logs?|flow\s+logs?)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== false) classes.push('permission')
    }
    // #580 round 2 (cu-coordinator 21:52Z): a bare 'Edit DNS' on a registrar page changes where the domain points (permission,
    // CU-446); the page is read from the URL.
    // CU-481 residual (06:49Z, c): 'Update DNS', '... DNS records' and (#640 round 2) '... DNS settings' join the row on its registrar
    // URL (off it, the named limit).
    if (grammarEligible && classes.length === 0 && /^\s*(?:edit|change|manage|update)\s+dns(?:\s+(?:records?|settings))?\s*$/i.test(name) && /registrar|domain|dns/i.test(String(context?.url ?? ''))) classes.push('permission')
    // CU-456 (cu-coordinator 22:56Z): a mail-protection switch turned OFF asks permission; 'Less secure app access' turned ON asks
    // credential; the safe directions are free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      const state = nativeToggleState(target)
      if (/^\s*(?:spam\s+filter(?:ing)?|safe\s+browsing|external\s+sender\s+warnings?|sign-?in\s+notifications?|security\s+alerts?)\s*$/i.test(name) && state !== false) classes.push('permission')
      if (/^\s*less\s+secure\s+app(?:s|\s+access)?\s*$/i.test(name) && state !== true) classes.push('credential')
    }
    // CU-460 (cu-coordinator 23:18Z): a Sentry Mode switch turned OFF asks permission, a PIN-to-drive switch turned OFF asks
    // credential; ON is free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      const offAsks = nativeToggleState(target) !== false
      if (offAsks && /^\s*sentry(?:\s+mode)?\s*$/i.test(name)) classes.push('permission')
      if (offAsks && /^\s*pin\s+to\s+drive\s*$/i.test(name)) classes.push('credential')
    }
    // CU-461 (cu-coordinator 23:34Z): a private-account switch turned OFF asks permission (the account goes public); ON is free on
    // a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*private\s+(?:account|profile)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== false) classes.push('permission')
    }
    // CU-464 / CU-465 (cu-coordinator 00:04Z / 00:19Z): a remote-access or agent blanket-approval switch turned ON asks permission;
    // OFF is free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:screen\s+sharing|remote\s+(?:login|desktop|apple\s+events|management|access)|file\s+sharing|internet\s+sharing|auto-?accept\s+edits|auto-?approve|yolo\s+mode|skip\s+approvals|run\s+without\s+confirmation)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== true) classes.push('permission')
    }
    // CU-466 (cu-coordinator 00:34Z): a repository protection switch turned OFF asks permission; an allow-force-push or
    // allow-deletions switch turned ON asks; the safe directions are free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      const state = nativeToggleState(target)
      if (/^\s*(?:branch\s+protection|secret\s+scanning|push\s+protection)\s*$/i.test(name) && state !== false) classes.push('permission')
      if (/^\s*allow\s+(?:force\s+pushes|deletions)\s*$/i.test(name) && state !== true) classes.push('permission')
    }
    // CU-467 (cu-coordinator 00:49Z): paid creator and dating features on a creator or dating page (purchase, CU-439's family); the
    // page is read from the URL. Older submit asks ('Send Super Chat', 'Unlock post') keep their class.
    if (grammarEligible && classes.length === 0 && /^\s*(?:cheer|boost|get\s+(?:a\s+)?boost|super\s+like|unlock\s+(?:likes?|messages?|post|this\s+post))\s*$/i.test(name)
      && /dat(?:e|ing)|match|tinder|bumble|hinge|okcupid|twitch|patreon|creator|fans|live|stream/i.test(String(context?.url ?? ''))) classes.push('purchase')
    // CU-468: an auto-lock or armed / alarm switch turned OFF asks physical; ON is free on a native read; an unread state asks both ways.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:auto-?lock|armed|alarm|alarm\s+system|alarm\s+armed|system\s+armed)\s*$/i.test(name)) {
      if (nativeToggleState(target) !== false) classes.push('physical')
    }
    // CU-483 (cu-coordinator 05:34Z): a bare 'Sell' / 'Sell all' on a trading page asks purchase - the whole http(s) URL, as #613 reads
    // it (a whole /trade, /order, /brokerage or /portfolio segment in path, query or hash - '/trade-in', '/trademark' do not count). Off a
    // trading URL a bare 'Sell' stays
    // free (marketplace tabs; named limit).
    if (grammarEligible && classes.length === 0 && /^\s*sell(?:\s+all)?\s*$/i.test(name)) {
      let tradingPage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) tradingPage = /(?:^|[/?#&=])(?:trade|trades|trading|order|orders|brokerage|portfolio)(?=$|[/?#&])/i.test(`${u.pathname}${u.search}${u.hash}`)
      } catch { tradingPage = false }
      if (tradingPage) classes.push('purchase')
    }
    // CU-474 (cu-coordinator 03:05Z): on a password vault's page (read from the URL), auto-lock off asks PERMISSION (doors keep
    // CU-468's physical). An emergency contact asks credential with no page condition (#614 round 2; the grammar row).
    if (grammarEligible && classes.length === 0 && /vault|password|1password|bitwarden|lastpass|dashlane|keeper|proton\.me\/pass/i.test(String(context?.url ?? ''))) {
      if (/^\s*(?:turn\s+off|disable|switch\s+off)\s+auto-?lock\s*$/i.test(name)) classes.push('permission')
    }
    // Consent phrase grammar (_designs_/consent-phrase-grammar 0.3.1; cu-coordinator 16:46Z) - the ONE additive hook: when no
    // older rule asked on a pressed named control, the grammar's verb-class x object-class structure may add classes. It
    // never removes or changes an older rule's class (15:08Z, D-063); its free guards stop only its own asks (F2).
    // CU-443 (cu-coordinator 21:03Z, final; lands with the browser driver's dialHref / rowContext read): a verb-less row that starts
    // a call places a call (submit) - (b) a tel:/sip:/callto: href on or near it (dialHref) on ANY page; (c) a 'Call' / 'Dial' /
    // 'Phone' hint on a /call|voice|phone|dial/ URL; (a) a bare row click on a /call|dial/ URL (fail closed on a dialer page; named
    // over-ask: opening a profile from a dialer list). A list name alone is not a signal. Booleans and short names only (D-107).
    // #576 round 2 (cu-coordinator 21:37Z): target.inRow - the hit element has no verb of its own and sits in a row-like ancestor
    // within 3 levels (a listener-only contact <li> clicked on its name span); dialHref / rowContext are then read from that row.
    if (grammarEligible && classes.length === 0 && (target?.inRow === true || /^(?:listitem|row|gridcell|option|treeitem|cell|generic|group)?$/i.test(String(target?.role ?? '')))) {
      const url = String(context?.url ?? '')
      const row = target?.rowContext && typeof target.rowContext === 'object' ? target.rowContext : {}
      const hints = Array.isArray(row.hints) ? row.hints.map((h) => String(h ?? '').slice(0, 40)) : []
      // CU-476 (High; cu-coordinator 03:05Z): the page is the WHOLE web URL - host, path, query and hash ('/#/call', '?page=call', a
      // 'call.' host) - like Add time / Start recording / Edit DNS; only an http(s) URL is a page (cu-developer-three 03:05Z: an
      // 'app:com.apple.FaceTime' context is never a dialer page).
      // The path keeps its substring test (as before); the added parts (host, query, hash) need a word edge, so 'dialogflow.example'
      // or '?callback=' is not a dialer page.
      const page = (() => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? { path: u.pathname, extra: `${u.host} ${u.search} ${u.hash}` } : { path: '', extra: '' } } catch { return { path: '', extra: '' } } })()
      const onPage = (words) => new RegExp(words, 'i').test(page.path) || new RegExp(`(?:^|[^a-z])(?:${words})(?:s|er|ing)?(?:[^a-z]|$)`, 'i').test(page.extra)
      const verbless = target?.inRow === true || /^(?:listitem|row|gridcell)$/i.test(String(target?.role ?? ''))
      if (target?.dialHref === true
        || (onPage('call|voice|phone|dial') && hints.some((h) => /^\s*(?:call|dial|phone|voice\s+call|video\s+call)\b/i.test(h)))
        || (verbless && onPage('call|dial'))) classes.push('submit')
    }
    // #575 round 2 (cu-coordinator 21:26Z): a native checkbox or switch already ON is being turned OFF - the grammar reads the
    // name as an act ('Forward calls') and must not ask for switching it off. The direction rules above decide such switches.
    const nativeOn = nativeToggleState(target) === true
    // Split particles for the OLDER lists (cu-coordinator 22:02Z, a High follow-up to #580): 'Turn location sharing on' / 'Turn
    // Find My off' / 'Switch the heater on' are judged as their canonical 'turn on X' form by every rule - one probe, only when
    // nothing has asked yet, so it can only add an ask; a native checkbox already on never probes (its direction rules decide).
    // CU-455 (cu-coordinator 22:48Z): the switch-verb synonyms too - 'switch / flip / toggle' (+ on|off, either word order) read
    // as 'turn on|off X', the form the older lists know ('Switch off firewall', 'Flip parental controls off').
    // #600 round 2 (cu-researcher 01:26Z): the confirmation wrapper comes off for the WHOLE classifier too, like #584's word order -
    // the older exact-phrase lists and the URL-bound rows then read 'Yes, join Prime' or 'OK, add time'. One probe, only when nothing
    // asked yet (adds only); the canonical form may still take the switch-verb probe below.
    // #600 round 3: the full strip (ellipsis, '!', '(recommended)', leading icons) reaches the older exact rows too ('Join Prime…'). A
    // Quick Actions menu item is judged by its exact built-in name (CU-382 - 'More…'), so it never takes the probe.
    // #609 round 2: each canonical form in turn (the unwrapped name, then its first sentence), stopping at the first that asks.
    // #617 (cu-researcher 03:58Z): a money amount in the name AS WRITTEN keeps purchase - 'Start e-visit ($25 copay)' must not lose
    // its copay to the canonical form 'Start e-visit'. Only the amount row goes first; every other row keeps the probe's order (the
    // firstLine form of a card still decides its class).
    if (grammarEligible && classes.length === 0 && !nativeOn && context.confirmProbe !== true && amountClass(name, target?.role)) classes.push('purchase')
    // CU-473 pair (cu-coordinator 02:35Z): the driver's target.firstLine (the first rendered line of a multi-line name, which
    // Chrome's accessible name flattens to spaces) is one more form, tried last - additive.
    const firstLine = typeof target?.firstLine === 'string' ? target.firstLine.trim() : ''
    const confirmForms = context.confirmProbe === true || target?.quickActions === true ? []
      : [...new Set([...canonicalForms(name), ...(firstLine !== '' && firstLine !== String(name ?? '').trim() ? [firstLine, ...canonicalForms(firstLine)] : [])])]
    for (const confirmForm of confirmForms) {
      if (!(grammarEligible && classes.length === 0 && !nativeOn)) break
      const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: confirmForm }, confirmProbe: true })
      if (probe.decision === 'block' || probe.decision === 'handoff') return probe
      if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) classes.push(cls)
    }
    // CU-481 (cu-coordinator 04:51Z): the verb-synonym forms go LAST - only when nothing above asked and the grammar on the name and its
    // own canonical forms has no row, so a synonym never outranks a row the name already matches.
    if (grammarEligible && classes.length === 0 && !nativeOn && context.confirmProbe !== true && target?.quickActions !== true && grammarClassesBase(name, target?.role).length === 0) {
      for (const synonymForm of synonymForms(name)) {
        if (classes.length > 0) break
        const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: synonymForm }, confirmProbe: true })
        if (probe.decision === 'block' || probe.decision === 'handoff') return probe
        if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) classes.push(cls)
      }
    }
    const splitMatch = /^\s*(?:turn|switch|flip|toggle)\s+(?!(?:on|off)\b)(.+?)\s+(on|off)\s*$/i.exec(name)
    const leadMatch = /^\s*(?:switch|flip|toggle)\s+(on|off)\s+(.+?)\s*$/i.exec(name)
    // CU-463 (High; cu-coordinator 00:04Z): 'enable / activate X' read as 'turn on X' and 'disable / deactivate X' as 'turn off X'
    // ('Enable location sharing', 'Activate remote management'), through the same single probe - adds only.
    // #595 round 2 (cu-researcher 00:11Z): the natural forms 'Allow X', 'Start X' and 'Opt in to X' read as 'turn on X' too.
    // 'Allow' means permit-for-me before a site's own prompt objects (ads on an ad-blocker allowlist, camera, microphone, location,
    // tracking, cookies, pop-ups, notifications): those never take the turn-on reading (cu-researcher 00:15Z).
    // #595 round 3 (cu-researcher 00:20Z): any words before the object too ('Allow acceptable ads').
    const allowForMe = /^\s*allow\s+(?:\S+\s+){0,3}(?:ads?|camera|microphone|mic|location|tracking|cookies?|pop-?ups?|notifications?)\s*$/i.test(name)
    const verbMatch = allowForMe ? null : /^\s*(enable|activate|allow|start|opt\s+in\s+to|disable|deactivate)\s+(.+?)\s*$/i.exec(name)
    const switchForm = context.splitParticleProbe === true ? null
      : splitMatch ? { particle: splitMatch[2], object: splitMatch[1] } : leadMatch ? { particle: leadMatch[1], object: leadMatch[2] }
        : verbMatch ? { particle: /^(?:disable|deactivate)$/i.test(verbMatch[1]) ? 'off' : 'on', object: verbMatch[2] } : null
    if (grammarEligible && classes.length === 0 && !nativeOn && switchForm) {
      const canonical = `turn ${switchForm.particle} ${switchForm.object}`
      const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: canonical }, splitParticleProbe: true })
      if (probe.decision === 'block' || probe.decision === 'handoff') return probe
      if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) classes.push(cls)
    }
    if (grammarEligible && classes.length === 0 && !nativeOn) for (const cls of grammarClasses(name, target?.role)) classes.push(cls)
    const mixedScript = !url.startsWith('desktop:') && classes.length === 0 && (POINTER.has(action.type) || pressesEnter || keyboard.activates) && target?.mixedScriptName === true
    if (mixedScript) classes.push('permission')
    // CU-302 (design note 0.1): a form the browser filled from saved logins or cards - a field matching :autofill, which
    // typing clears - is submitted with the owner's saved secret by a click, Space or Return on what submits it. That
    // submit asks by the filled fields' names (the credential and D-061 name rules, one source) and is never
    // pre-approved: a caller's credential pre-approval covers secrets it supplied, not the owner's saved ones. The browser
    // driver reports autofilledFields on the targets that submit a form (CU-319); a failed read (autofillRead false) asks
    // credential. No field at all (an older driver, the desktop) keeps today's judgement.
    const autofillClasses = []
    let autofillCard = false
    if (!desktopUrl && target && (POINTER.has(action.type) || pressesEnter || keyboard.activates)) {
      for (const field of Array.isArray(target.autofilledFields) ? target.autofilledFields : []) {
        if (/^cc-/i.test(String(field?.autocomplete ?? ''))) autofillCard = true
        const filled = { ...asNamedEntry(String(field?.name ?? '')), inputType: field?.inputType ?? null, autocomplete: field?.autocomplete ?? null }
        const cls = insertedClass(null, filled, context)
        if (cls) autofillClasses.push(cls)
      }
      if (target.autofillRead === false) autofillClasses.push('credential')
    }
    classes.push(...autofillClasses)
    // CU-363: the page shortcut asks only when no other rule already judges the key (a field's name, a delete key).
    // CU-365 (cu-coordinator 19:19Z): a chord is a fallback - when an earlier rule has already classed it, that rule decides
    // and the chord adds no shortcut ask (typed text and single keys still stack, CU-363).
    const shortcutActive = pageShortcut && !(chordShortcut && classes.length > 0)
    if (shortcutActive && classes.length === 0) classes.push('permission')
    // The approval a page shortcut needs: typed text keys by its characters, a key or chord by what it produces.
    const shortcutShown = action.type === 'type' ? `${[...String(action.text ?? '')].length} typed characters` : `'${shortcutKey}'`
    const shortcutApproval = shortcutActive ? `permission:page-shortcut:${action.type === 'type' ? [...new Set(shortcutKey)].sort().join('') : shortcutKey}` : null
    // CU-365 stacking (cu-researcher 18:19Z): when another class asks too, the shortcut half still needs its own approval,
    // so a yes for that class (sensitive_data for the run, say) never frees the page's handlers.
    const also = shortcutActive ? { alsoNeeds: shortcutApproval } : {}
    // ... and 'permission' is listed beside the other classes (the record), while the class that ranks first still leads.
    const stack = (list) => (shortcutActive && !list.includes('permission') ? [...list, 'permission'] : list)
    const unique = [...new Set(classes)].sort((a, b) => PRECEDENCE.indexOf(a) - PRECEDENCE.indexOf(b))
    const needed = unique.filter((cls) => !preApproved(cls, url) || NEVER_PRE_APPROVED.includes(cls) || autofillClasses.includes(cls))
    if (needed.length === 0 && shortcutActive) {
      return { decision: 'confirm', class: 'permission', classes: ['permission'], rule: 'page:shortcut', approvalKey: shortcutApproval, runOnly: true, reason: `press ${shortcutShown} on ${placeOf(url, target, context?.frontmostBundleId)}, a keyboard shortcut of the ${onDesktop ? 'app' : 'page'} - it decides what it does` }
    }
    if (needed.length === 0) {
      return { decision: 'allow', class: unique[0] ?? null, rule: unique.length > 0 ? 'pre_approved' : 'default', reason: '' }
    }
    const cls = needed[0]
    if (shortcutActive && cls === 'permission') {
      return { decision: 'confirm', class: cls, classes: needed, rule: 'page:shortcut', approvalKey: shortcutApproval, runOnly: true, reason: `press ${shortcutShown} on ${placeOf(url, target, context?.frontmostBundleId)}, a keyboard shortcut of the ${onDesktop ? 'app' : 'page'} - it decides what it does` }
    }
    if (mixedScript && cls === 'permission') {
      return { ...also, decision: 'confirm', class: cls, classes: stack(needed), rule: 'target:mixed_script', reason: `activate "${name}", whose name mixes scripts in one word (a disguised control?)` }
    }
    if (autofillClasses.includes(cls)) {
      return { ...also, decision: 'confirm', class: cls, classes: stack(needed), rule: `autofill:${cls}`, reason: `submit a form the browser filled from your saved ${autofillCard ? 'card' : cls === 'credential' ? 'login' : 'details'} on ${originPattern(url)}` }
    }
    // `class` is the one that ranks first; `classes` lists every class that applied, for the evaluator's records.
    return { ...also, ...(cls === 'physical' ? { askEachTime: true } : {}), decision: 'confirm', class: cls, classes: stack(needed), rule: `class:${cls}`, reason: `${describe(cls, action, target, url, context?.frontmostBundleId)}${shortcutActive ? `; the same keys may also trigger a keyboard shortcut of the ${onDesktop ? 'app' : 'page'}` : ''}` }
  }

  return { classify, preApprovals: granted }
}

function describe(cls, action, target, url, front) {
  const origin = placeOf(url, target, front)
  const what = action.type === 'type'
    ? `type ${action.text.length} characters into ${target?.name || 'the focused field'}`
    : `${action.type.replace('_', ' ')} ${target?.name ? `"${target.name}"` : 'here'}`
  const unread = cls === 'submit' && target?.defaultButtonRead === false && !target?.defaultButton?.name ? '; the default button could not be read' : ''
  return `${what} on ${origin} (${cls.replace('_', ' ')})${unread}`
}

/**
 * Where the action happens, for the question (CU-160): the page's host in a browser; on the desktop, where there is no
 * URL, the app the target belongs to (its bundle id - the name app-policy's own questions use), else the app in front
 * for an action with no target - never an empty place.
 */
function placeOf(url, target, front) {
  let host = ''
  try { host = new URL(url).host } catch { host = typeof url === 'string' ? url : '' }
  if (host) return host
  if (typeof target?.origin === 'string' && target.origin !== '' && target.origin !== 'null') return target.origin
  if (typeof front === 'string' && front !== '') return front
  return typeof url === 'string' && url !== '' ? url : 'this app'
}

/**
 * Task classes refused before any action (R56), as Operator and ChatGPT agent refuse them: moving money between
 * accounts, trading, and high-stakes medical or legal decisions. Matched on the task text at word boundaries.
 */
export const REFUSED_TASK_CLASSES = Object.freeze({
  money_transfer: /\b(wire|transfer|send)\s+(money|funds|\$\s?\d|\d+\s*(usd|dollars|eur|euros))|\bbank\s+transfer\b|\bwire\s+transfer\b/i,
  trading: /\b(buy|sell|short|trade)\s+(\d+\s+)?(shares?|stocks?|options|crypto|bitcoin|btc|eth)\b|\bplace\s+a\s+(trade|stock\s+order)\b/i,
  medical_decision: /\b(prescribe|change\s+(my|the)\s+(dose|dosage|medication)|stop\s+taking\s+(my\s+)?medication)\b/i,
  legal_decision: /\b(sign|file)\s+(the|a|my)\s+(lawsuit|legal\s+complaint|plea|divorce\s+papers)\b/i,
})

/** Screen a task before the first action: `{ refused: false }` or `{ refused: true, class, reason }`. */
export function screenTask(text) {
  for (const [cls, re] of Object.entries(REFUSED_TASK_CLASSES)) {
    if (re.test(String(text ?? ''))) return { refused: true, class: cls, reason: `tasks of the class ${cls.replace('_', ' ')} are refused before acting` }
  }
  return { refused: false }
}

/**
 * Approvals given at consent time, by `{ class, origin, fingerprint }` and lifetime (R31): `once` is used up by the
 * action it approved, `batch` lasts until `endBatch()`, `run` until the run ends.
 */
export function createApprovalStore() {
  const entries = []
  return {
    grant({ cls, origin, lifetime }) {
      if (lifetime === 'batch' || lifetime === 'run') entries.push({ cls, origin, lifetime })
    },
    covers(cls, origin) {
      return entries.some((e) => e.cls === cls && e.origin === origin)
    },
    endBatch() {
      for (let i = entries.length - 1; i >= 0; i -= 1) if (entries[i].lifetime === 'batch') entries.splice(i, 1)
    },
    get size() { return entries.length },
  }
}
