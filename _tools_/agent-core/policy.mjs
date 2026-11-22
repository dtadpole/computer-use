import { isMessagingApp } from './app-kinds.mjs'
import { normaliseForPolicy, normaliseText } from './normalise.mjs'
import { BIP39_ENGLISH } from './bip39-english.mjs'
import { normalizeKey } from './keys.mjs'
import { originPattern } from './sites.mjs'
import { amountClass, canonicalForms, clauseSplit, clauseVerbLed, grammarClasses, grammarClassesBase, inertLinkAmountClass, quantifierDropped, questionStripped, sectionLabelStripped, straightQuotes, synonymForms, toggleExpansion } from './phrase-grammar.mjs'

/**
 * The action policy (design: action-policy.md, consent-gate.md). `classify` runs in the dispatcher for every action,
 * inside every batch (R27), and answers `{ decision, class, rule, reason }` with `decision` one of `allow`,
 * `confirm`, `block`, `handoff`; the most restrictive rule wins. Only the caller grants pre-approvals, never the model
 * or the page; `purchase`, `delete` and `permission` always confirm at action time.
 */

export const CLASSES = Object.freeze(['submit', 'purchase', 'delete', 'permission', 'credential', 'sensitive_data', 'new_site', 'page_dialog', 'install', 'file_choice', 'launch_code', 'physical'])
// CU-494 round 3 (cu-coordinator 11:21Z (A)): install joins outright - every install row is a ruled High (CU-427, CU-431, CU-454, CU-484).
export const NEVER_PRE_APPROVED = Object.freeze(['purchase', 'delete', 'permission', 'install', 'file_choice', 'launch_code', 'physical'])
// CU-494 (High; cu-coordinator 10:51Z, 11:06Z): a credential 'always' with any origin let direct deposit, IBAN, forwarding and
// seed-phrase controls through. A credential grant now covers ONLY typing a caller-supplied secret - VALUE-BOUND: the typed text is
// the task's declared secret placeholder ({{secret:name}}, resolved after the policy) - into a secret field; never a press, never other
// text, and never into a money or identity field (IBAN, routing / account number, SWIFT, card, wallet address, forwarding address,
// recovery email / phone), which asks credential even under the grant. The desktop already never pre-approves credential (app-policy).
const MONEY_IDENTITY_FIELD = /\b(?:iban|routing\s*(?:number|no\.?|#)?|account\s*(?:number|no\.?|#)|swift(?:\s*code)?|bic|sort\s*code|card\s*(?:number|no\.?|#)|wallet\s*address|forwarding\s*address|forward\s*to|bank\s*account|payout\s*account|recovery\s*(?:e-?mail|phone|number))\b/i
// CU-494 residual r2 (cu-developer-one 11:55Z, cu-researcher 11:54Z): an unlabelled entry is read by its raw name/id attribute
// (the chrome driver's fieldAttr, '_'/'-' read as spaces), where a bare 'wallet' counts too; and a card or amount autocomplete
// token marks a money field whatever the name says.
const MONEY_FIELD_ATTR_ONLY = /\b(?:wallet|cc\s*(?:number|num|no))\b/i
const MONEY_AUTOCOMPLETE = /\bcc-(?:number|csc|exp)|\btransaction-amount\b/i
/** Whether a typing target is a money or identity field: any of its name, placeholder, layout label, raw name/id attribute or autocomplete token says so. */
export function moneyIdentityField(target, name = target?.name) {
  if (MONEY_AUTOCOMPLETE.test(String(target?.autocomplete ?? ''))) return true
  // #675 r2 (cu-coordinator 12:36Z): a UNION, not first-wins - any of the name, the placeholder (AXPlaceholderValue on the
  // desktop), the layout label (nearbyLabel, CU-361) or the raw name/id attribute marking a money or identity field makes it
  // one, so a hostile page naming an IBAN field 'Nickname' does not win.
  for (const hint of [name, target?.placeholder, target?.nearbyLabel]) {
    if (typeof hint === 'string' && hint.trim() !== '' && MONEY_IDENTITY_FIELD.test(hint)) return true
  }
  const attr = String(target?.fieldAttr ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return attr !== '' && (MONEY_IDENTITY_FIELD.test(attr) || MONEY_FIELD_ATTR_ONLY.test(attr))
}
/** CU-494 round 2/3 (cu-developer-three 11:09Z; cu-coordinator 11:21Z): whether a grant of `cls` may never cover a control named
 * `name` - every submit row but the generic ones (install is never pre-approved at all). The desktop's app-scoped pre-approval asks the same question (app-policy.mjs scopedPreApproval). */
export function neverCoveredByGrant(cls, name) {
  return cls === 'submit' && !GENERIC_SUBMIT.test(String(name ?? ''))
}
// CU-494 round 3 (cu-coordinator 11:21Z (B)): a submit grant never covers a row whose provenance is a High issue. Generated, not a
// hand list of High names: the grant covers ONLY the generic submits a task means by 'submit' - a bare form submit, send, reply, post,
// comment, save, apply, search - and every other submit row (each one added by a ruled High: parental approvals, portal consent, rate
// locks, dial rows, mass sends, compensation, returns, relists, ride cancels) asks under any submit grant.
// CU-507 (High; cu-coordinator 16:06Z): the generic final buttons of a confirm modal - judged by the modal's own title and text.
const GENERIC_CONFIRM = /^\s*(?:confirm|ok|okay|yes|yes,?\s+(?:continue|confirm|proceed|i'?m\s+sure|do\s+it)|continue|proceed|submit|done|apply|accept|agree|i\s+agree|i\s+understand|got\s+it|i'?m\s+sure|do\s+it|go\s+ahead|confirm\s+and\s+continue)\s*[.!]?\s*$/i
const GENERIC_SUBMIT = /^\s*(?:submit|send|send\s+(?:message|reply|email|comment)|reply|post|post\s+(?:comment|reply)|comment|save|save\s+changes|apply|search|go|ok|done|continue|next|report\s+spam|sign\s+up|register|create\s+account)\s*!?\s*$/i

/** Word lists matched on a target's accessible name, case-insensitively, at word boundaries; they err toward confirm. */
// CU-293 (cu-developer-one; cu-coordinator: Urgent - the owner works in Chinese): each name class in Simplified and
// Traditional Chinese. CJK has no word gaps, so a phrase matches inside a longer label ('立即购买' asks purchase); named
// over-asks: a label that merely contains one ('删除线', strikethrough). Other languages are a named limit.
const ZH_WORDS = Object.freeze({
  purchase: [
    // CU-625 r2 (cu-developer-one's twin rule): cancelling or ending a membership / plan, as English 'Cancel membership' asks.
    '取消会员', '取消會員', '取消会员资格', '取消會員資格', '取消套餐', '终止会员', '終止會員', '退出会员', '退出會員', '退订会员', '退訂會員', '退订套餐', '退订服务', '退訂服務',
    '购买', '購買', '支付', '付款', '结账', '結帳', '结算', '結算', '下单', '下單', '提交订单', '提交訂單', '订阅', '訂閱', '充值',
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
  permission: [
    // CU-634: leaving a team, as English 'Leave team' (permission).
    '退出团队', '退出團隊',
    '共享', '分享', '邀请', '邀請', '授权', '授權', '公开', '公開', '始终允许', '總是允許', '总是允许', '永遠允許', '一律允许',
    '允许访问', '允許存取', '不再询问', '不再詢問', '不再提示', '记住我的选择', '記住我的選擇', '记住此选择', '设为默认', '設為預設',
    '保存密码', '儲存密碼', '记住密码', '記住密碼', '保存通行密钥', '儲存通行密鑰', '创建通行密钥', '建立通行密鑰', '关闭两步验证',
    '關閉兩步驟驗證', '关闭双重认证', '關閉雙重認證', '打开摄像头', '開啟相機', '打开麦克风', '開啟麥克風',
    // CU-289's amended ruling in Chinese: Never Save keeps a per-site exception.
    '永不保存', '永不儲存',
    // CU-294 (cu-researcher; Firefox's own 'Remember this decision' checkbox, mozilla-l10n).
    '记住此决定', '記住此決定'],
  submit: [
    // CU-628 (cu-researcher): unsubscribing from mail, as English 'Unsubscribe' asks submit (a bare 退订 is a whole-label rule below,
    // so 退订须知 / 退订政策 pages stay free).
    '取消关注邮件', '退订邮件', '退訂郵件', '退订短信', '退訂簡訊', '我要退订', '我要退訂',
    '发送', '發送', '傳送', '发布', '發佈', '發布', '提交', '注册', '註冊', '送出', '发表', '發表', '加入会议', '加入會議', '加入通话',
    '视频通话', '視訊通話', '语音通话', '語音通話', '开始会议', '開始會議', '接受邀请', '接受邀請', '拒绝邀请', '拒絕邀請',
    '部署', '退出群聊', '退出群組',
    // CU-634 (cu-developer-one): leaving a group or channel in Chinese, as 'Leave group / channel' (submit).
    '退出群组', '退群', '退出频道', '退出頻道', '退出该群', '退出此群', '退出本群', '取消会议', '取消會議', '举报', '檢舉', '申请加入', '申請加入', '报税', '報稅',
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
    'купить', 'оплатить', 'заказать', 'оформить заказ', 'оформить покупку', 'оформить подписку',
    // CU-650 (cu-developer-one's go 04:21Z): cancel an order / membership / plan, as 'Cancel order / membership / plan'.
    'отменить заказ', 'отменить членство', 'отменить тариф', 'отменить план',
    // r2 (cu-developer-one): with a possessive or demonstrative of each gender ('Отменить мой заказ', 'Отмените ваше членство').
    ...['заказ', 'тариф', 'план'].flatMap((what) => ['мой', 'свой', 'ваш', 'твой', 'этот'].map((whose) => `отменить ${whose} ${what}`)),
    ...['моё', 'мое', 'своё', 'свое', 'ваше', 'твоё', 'твое', 'это'].map((whose) => `отменить ${whose} членство`),
    '購入', '支払', '注文を確定', '注文する', 'レジに進む', '今すぐ買う',
    '구매', '결제', '주문하기', '바로구매',
    // CU-358 (cu-researcher): Italian, Dutch, Portuguese and Turkish (Portuguese shares 'comprar' / 'pagar' above).
    'acquista', 'acquista ora', 'compra ora', 'paga', 'paga ora', 'ordina ora', 'effettua ordine', "effettua l'ordine", 'conferma ordine', 'procedi al pagamento', 'vai alla cassa',
    'kopen', 'nu kopen', 'koop nu', 'betalen', 'nu betalen', 'bestellen en betalen', 'bestellen', 'nu bestellen', 'bestelling plaatsen', 'afrekenen', 'naar de kassa',
    'comprar agora', 'pagar agora', 'finalizar pedido', 'fazer pedido', 'concluir compra', 'efetuar pagamento',
    // r2 (cu-developer-three's held-out): short imperatives and 'confirm payment' forms.
    'compra', 'compra adesso', 'acquista adesso', 'paga adesso', 'conferma _ pagamento', 'conferma _ acquisto', 'conferma _ ordine', 'effettua _ pagamento', 'effettua _ ordine',
    'koop', 'betaal', 'betaal nu', 'bestel', 'bestel nu', '_ betaling bevestigen', 'bevestig _ betaling', 'plaats _ bestelling', '_ bestelling plaatsen',
    'compre', 'compre agora', 'pague', 'pague agora', 'confirmar _ pagamento', 'confirmar _ compra', 'finalizar _ compra', 'finalizar _ pedido', 'fazer _ pedido', 'efetuar _ pagamento',
    // r5 (cu-developer-two): sending money, as English 'Send money' / 'Transfer money' / 'Wire money' (purchase).
    'invia bonifico', 'effettua _ bonifico', 'bonifico', 'trasferisci denaro', 'invia denaro', 'trasferisci',
    'geld overmaken', 'overmaken', 'geld overschrijven', 'overschrijven', 'geld sturen', 'geld versturen',
    'transferir dinheiro', 'enviar dinheiro', 'fazer _ transferência', 'transferir', 'enviar pix', 'fazer _ pix',
    'para gönder^', 'havale yap^', 'eft yap^', 'para transfer~ yap^', 'para transfer~',
    // CU-608 (cu-researcher): bank-transfer confirmations in German, French, Spanish, Dutch and Turkish, as English
    // 'Confirm transfer' / 'Transfer now' and the Italian / Portuguese ones above ask purchase; verb phrases only, so a
    // 'Transferencias' or 'Virements' tab stays free.
    'überweisen', 'jetzt überweisen', 'geld überweisen', 'überweisung bestätigen', 'überweisung ausführen', 'überweisung absenden', 'überweisung senden', 'geld senden',
    'effectuer _ virement', 'confirmer _ virement', 'valider _ virement', 'faire _ virement', "envoyer de l'argent", 'envoyer de l’argent', "transférer de l'argent", 'transférer de l’argent',
    'realizar _ transferencia', 'confirmar _ transferencia', 'hacer _ transferencia', 'enviar _ transferencia', 'enviar dinero', 'transferir dinero',
    'overboeking bevestigen', 'bevestig _ overboeking', 'overboeking uitvoeren', 'overboeking versturen',
    'transfer~ onayla^', 'havale~ onayla^', 'eft~ onayla^', 'havale~ gönder^',
    // CU-610 (cu-researcher): subscribe / upgrade / start-trial buttons in the seven locales, as English 'Subscribe now' /
    // 'Upgrade to Pro' / 'Start free trial' ask purchase. Portuguese 'assinar' alone is 'sign', so only its plan forms.
    'abonnieren', 'jetzt abonnieren', 'kostenpflichtig abonnieren', 'abo abschließen', 'abonnement abschließen', 'jetzt upgraden', 'auf premium upgraden', 'kostenlos testen', 'gratis testen', 'probeabo starten',
    "s'abonner", 's’abonner', 'abonnez-vous', 'souscrire', 'souscrire _ abonnement', 'passer à premium', 'passer à pro', 'passer à la version premium', "commencer l'essai gratuit", 'commencer l’essai gratuit', 'essayer gratuitement',
    'suscribirse', 'suscríbete', 'suscribirme', 'suscríbete ahora', 'mejorar a pro', 'mejorar a premium', 'pasar a premium', 'hazte premium', 'iniciar _ prueba gratuita', 'prueba gratis',
    'assinar agora', 'assine agora', 'assine já', 'assinar _ plano', 'fazer _ assinatura', 'fazer upgrade', 'mudar para premium', 'iniciar _ teste grátis', 'experimente grátis',
    'abbonati', 'abbonati ora', 'abbonarsi', 'sottoscrivi', 'sottoscrivi _ abbonamento', 'passa a premium', 'passa a pro', 'inizia _ prova gratuita', 'prova gratis',
    'abonneren', 'nu abonneren', 'abonnement afsluiten', 'upgraden naar pro', 'upgraden naar premium', 'gratis proberen', 'proefperiode starten',
    'abone ol^', 'abonelik~ başlat^', 'aboneliğ~ başlat^', 'premium~ geç^', "premium'a geç^", 'premium’a geç^', "pro'ya geç^", 'pro’ya geç^', 'ücretsiz dene^',
    // r2 (cu-developer-two / -three): 'auf <plan> upgraden', the Turkish upgrade verb 'yükselt', and 'start the free trial'.
    'auf pro upgraden', 'auf plus upgraden', 'upgrade auf pro', 'upgrade auf premium', "premium'a yükselt^", 'premium’a yükselt^', "pro'ya yükselt^", 'pro’ya yükselt^',
    'premium~ yükselt^', 'plan~ yükselt^', 'ücretsiz deneme~ başlat^',
    // r3 (cu-developer-three): 'upgrade your account / package / membership', as English 'Upgrade your account' asks; a bare
    // 'yükselt' stays out ('Sesi yükselt' raises the volume).
    'hesab~ yükselt^', 'hesap~ yükselt^', 'paket~ yükselt^', 'üyelik~ yükselt^', 'üyeliğ~ yükselt^',
    // r4 (cu-developer-two): the same 'upgrade <account / membership / plan / package>' family in the other six languages, as
    // English 'Upgrade account / membership' asks. 'Actualizar / Atualizar / Aggiorna' + account also mean 'update the details',
    // so those verbs take only a plan or subscription object.
    'konto upgraden', 'mitgliedschaft upgraden', 'paket upgraden', 'tarif upgraden', 'abo upgraden', 'plan upgraden', 'upgrade durchführen',
    'mettre à niveau', "passer à l'offre supérieure", 'passer à l’offre supérieure',
    'mejorar mi cuenta', 'mejorar _ cuenta', 'mejorar mi plan', 'mejorar _ plan', 'mejorar mi suscripción', 'mejorar _ suscripción', 'actualizar mi plan', 'actualizar _ plan', 'actualizar _ suscripción', 'mejorar el plan', 'actualizar el plan', 'mejorar tu cuenta', 'mejorar tu plan',
    'atualizar _ plano', 'melhorar _ plano', 'atualizar _ assinatura', 'melhorar _ conta',
    'aggiorna _ piano', 'aggiorna _ abbonamento', 'potenzia _ account', 'potenzia _ piano', 'passa al piano superiore',
    'account upgraden', 'abonnement upgraden', 'pakket upgraden', 'lidmaatschap upgraden', 'upgrade je account', 'upgrade uw account', 'upgrade je abonnement',
    // CU-613 (cu-researcher): start / begin a subscription, and 'switch to the <paid plan> version', as English 'Start
    // subscription' asks; 'Passer à la version mobile' (a layout switch) stays free, so only paid plan names follow 'version'.
    'abonnement starten', 'abo starten', 'abonnement beginnen', 'mitgliedschaft starten',
    'passer à la version pro', 'passer à la version plus', 'passer à la version payante', 'passer à la version business', "commencer l'abonnement", 'commencer l’abonnement', 'démarrer _ abonnement', 'démarrer mon abonnement',
    'empezar _ suscripción', 'empezar mi suscripción', 'iniciar _ suscripción', 'iniciar mi suscripción', 'comenzar _ suscripción', 'comenzar mi suscripción',
    'iniciar _ assinatura', 'começar _ assinatura', 'ativar _ assinatura',
    'avvia _ abbonamento', 'inizia _ abbonamento', 'attiva _ abbonamento',
    'start _ abonnement', 'begin _ abonnement', 'start je abonnement',
    // r2 (cu-developer-two): the whole family in one round - start a membership, and 'switch to the <paid plan> version' in
    // every language (a layout switch, 'version mobile / classique', stays free).
    'commencer mon abonnement', 'commencer _ abonnement', 'commencer _ adhésion', 'commencer mon adhésion',
    'mitgliedschaft beginnen', 'zur pro-version wechseln', 'auf die pro-version wechseln', 'zur premium-version wechseln', 'zur bezahlversion wechseln',
    'comenzar _ membresía', 'comenzar mi membresía', 'iniciar _ membresía', 'iniciar mi membresía', 'empezar _ membresía', 'empezar mi membresía', 'cambiar a la versión pro', 'pasar a la versión pro', 'cambiar a la versión premium', 'pasar a la versión premium',
    'iniciar _ plano', 'mudar para a versão pro', 'passar para a versão pro', 'mudar para a versão premium', 'passar para a versão premium',
    'passa alla versione pro', 'passa alla versione plus', 'passa alla versione premium', 'passa alla versione a pagamento', 'passare alla versione pro', 'passare alla versione premium',
    'lidmaatschap starten', 'overstappen naar pro', 'overstappen naar premium', 'overstappen naar de betaalde versie',
    // r3 (cu-developer-three): the short 'switch to <paid plan>' forms, without 'version'.
    'zu pro wechseln', 'auf pro wechseln', 'zu premium wechseln', 'auf premium wechseln', 'zu plus wechseln', 'auf plus wechseln', 'zum pro-tarif wechseln', 'zum pro-plan wechseln',
    'passer au forfait pro', 'passer au forfait premium', 'passer au plan pro', 'passer au plan premium', 'passer au premium', 'passer au pro',
    'cambiar a pro', 'cambiar a premium', 'cambiar al plan pro', 'cambiar al plan premium', 'pasar a pro', 'pasar al plan pro',
    'mudar para pro', 'mudar para premium', 'mudar para o plano pro', 'mudar para o plano premium', 'passar para pro', 'passar para o plano pro',
    'passa al piano pro', 'passa al piano premium', 'passare a pro', 'passare a premium',
    'overstappen op pro', 'overstappen op premium', 'wissel naar pro', 'overstappen naar het pro-abonnement',
    // r4 (cu-developer-three's r1 row; cu-developer-two's r3 twins): the offer form, the 'votre / ton' and polite forms.
    "passer à l'offre premium", 'passer à l’offre premium', "passer à l'offre pro", 'passer à l’offre pro', "passer à l'offre plus", 'passer à l’offre plus',
    'commencer votre abonnement', 'démarrer votre abonnement', 'commencer ton abonnement', 'démarrer ton abonnement',
    'wechseln sie zu pro', 'wechseln sie zu premium', 'wechseln sie zu plus', 'wechsle zu pro', 'wechsle zu premium',
    'pro sürüm~ geç^', 'premium sürüm~ geç^',
    // CU-615 (cu-researcher): the imperative / possessive twins named at #1007 r4 - 'Inicia tu suscripción', 'Premium plana geç',
    // "Passez à l'offre Premium" - and their siblings.
    'inicia _ suscripción', 'inicia tu suscripción', 'empieza _ suscripción', 'empieza tu suscripción', 'comienza _ suscripción', 'comienza tu suscripción', 'inicia tu membresía', 'empieza tu membresía',
    'inicie _ assinatura', 'inicie sua assinatura', 'comece _ assinatura', 'comece sua assinatura', 'avvia il tuo abbonamento', 'inizia il tuo abbonamento',
    // r2 (cu-developer-two): the German and Dutch imperative + possessive twins.
    'starte dein abo', 'starte dein abonnement', 'starten sie ihr abo', 'starten sie ihr abonnement', 'beginne dein abo', 'beginnen sie ihr abonnement', 'start uw abonnement', 'begin je abonnement',
    'premium plan~ geç^', 'pro plan~ geç^', 'premium paket~ geç^', 'pro paket~ geç^',
    "passez à l'offre premium", 'passez à l’offre premium', "passez à l'offre pro", 'passez à l’offre pro', "passez à l'offre plus", 'passez à l’offre plus', 'passez à la version pro', 'passez à la version premium', 'passez à premium', 'passez au forfait pro', 'passez au forfait premium',
    // r3: Turkish stems take their suffixes ('~' noun, '^' verb - see namesWord).
    'ödeme~ onayla^', 'satın alma~ onayla^', 'ödeme~ tamamla^', 'ödeme~ yap^', 'sipariş~ ver^', 'sipariş~ tamamla^', 'sipariş~ onayla^', 'alışveriş~ tamamla^',
    'satın al^', 'şimdi satın al^', 'hemen al^', 'şimdi al^', 'öde^', 'şimdi öde^', 'ödeme~ geç^',
    // CU-625 (cu-researcher): cancelling a membership or a plan asks purchase, as English 'Cancel membership' / 'Cancel my plan' do.
    'mitgliedschaft kündigen', 'kündige deine mitgliedschaft', 'kündigen sie ihre mitgliedschaft', 'tarif kündigen', 'meinen tarif kündigen',
    "résilier l'adhésion", 'résilier l’adhésion', "annuler l'adhésion", 'annuler l’adhésion', 'résilier mon adhésion', 'annuler mon adhésion', 'annulez votre adhésion', 'résiliez votre adhésion', 'résilier mon forfait', 'annuler mon forfait', 'résiliez votre forfait',
    'cancelar membresía', 'cancelar _ membresía', 'cancelar mi membresía', 'cancela tu membresía', 'cancelar mi plan', 'cancelar el plan',
    'cancelar plano', 'cancelar _ plano', 'cancelar meu plano', 'cancelar associação', 'annulla iscrizione al club', 'annulla piano', 'annulla il mio piano', 'disdici piano', 'disdici il piano',
    'lidmaatschap opzeggen', 'zeg je lidmaatschap op', 'zeg uw lidmaatschap op', 'pakket opzeggen', 'lidmaatschap annuleren', '_ lidmaatschap annuleren',
    // r2 (cu-developer-two, cu-developer-one 20:30Z): plan / pakket beside lidmaatschap, as 'Cancel plan'.
    'plan annuleren', '_ plan annuleren', 'pakket annuleren', '_ pakket annuleren', 'plan opzeggen', '_ plan opzeggen', 'üyelik~ iptal et^', 'üyelik~ iptal edin', 'üyeliğ~ iptal et^', 'üyeliğ~ iptal edin', 'plan~ iptal et^',
    // r2 (cu-developer-three): the end / terminate verb for both halves takes purchase, as English 'End subscription' / 'End
    // membership' do.
    'abo beenden', 'abonnement beenden', 'mitgliedschaft beenden', 'beende dein abo', 'beende deine mitgliedschaft', 'beenden sie ihr abonnement', 'beenden sie ihre mitgliedschaft',
    "mettre fin à l'abonnement", 'mettre fin à l’abonnement', 'mettre fin à mon abonnement', "mettre fin à l'adhésion", 'mettre fin à l’adhésion', "terminer l'abonnement", 'terminer l’abonnement',
    'finalizar suscripción', 'finalizar _ suscripción', 'terminar _ suscripción', 'finalizar membresía', 'finalizar _ membresía', 'terminar _ membresía', 'finaliza tu suscripción', 'finalice su suscripción',
    'encerrar assinatura', 'encerrar _ assinatura', 'terminar _ assinatura', 'encerrar plano', 'encerrar _ plano', 'encerre sua assinatura',
    'termina abbonamento', 'termina _ abbonamento', 'terminare _ abbonamento', 'termina il tuo abbonamento', 'termina _ piano',
    'abonnement beëindigen', 'lidmaatschap beëindigen', 'beëindig je abonnement', 'beëindig uw abonnement', 'beëindig je lidmaatschap', 'beëindig uw lidmaatschap',
    'abonnement stopzetten', 'lidmaatschap stopzetten', '_ abonnement stopzetten', '_ lidmaatschap stopzetten', 'zet je abonnement stop', 'zet uw abonnement stop', 'zet je lidmaatschap stop', 'zet uw lidmaatschap stop',
    'terminar plano', 'terminar _ plano', 'termine seu plano', 'encerre seu plano', 'termine sua assinatura',
    // CU-628 r2 (cu-developer-three): the stop verb in the seven locales, as English 'Stop subscription' (purchase).
    'abo stoppen', 'abonnement stoppen', 'mitgliedschaft stoppen', 'stoppe dein abo', 'stoppen sie ihr abonnement', 'stoppen sie ihr abo',
    "arrêter l'abonnement", 'arrêter l’abonnement', 'arrêter mon abonnement', "arrêtez l'abonnement", 'arrêtez votre abonnement', "arrêter l'adhésion", 'arrêter mon adhésion',
    'detener _ suscripción', 'detener suscripción', 'parar _ suscripción', 'detén tu suscripción', 'detenga su suscripción', 'detener _ membresía',
    'detener mi suscripción', 'detener mi membresía', 'parar mi suscripción', 'detener mi plan', 'detener el plan', 'detener tu suscripción', 'detener tu membresía', 'parar tu suscripción', 'detener su suscripción',
    'parar _ assinatura', 'parar assinatura', 'interromper _ assinatura', 'pare sua assinatura', 'interrompa sua assinatura', 'parar plano', 'parar _ plano', 'interromper _ plano', 'pare seu plano',
    'interrompi _ abbonamento', 'interrompere _ abbonamento', 'ferma _ abbonamento', 'interrompi il tuo abbonamento', 'sospendi il rinnovo', 'interrompi piano', 'interrompi _ piano', 'interrompere _ piano',
    'abonnement stoppen', 'lidmaatschap stoppen', 'stop je abonnement', 'stop uw abonnement', 'stop je lidmaatschap',
    'abonelik~ durdur^', 'aboneliğ~ durdur^', 'üyelik~ durdur^', 'üyeliğ~ durdur^',
    'abonelik~ sonlandır^', 'aboneliğ~ sonlandır^', 'üyelik~ sonlandır^', 'üyeliğ~ sonlandır^', 'abonelik~ bitir^', 'aboneliğ~ bitir^', 'üyelik~ bitir^', 'üyeliğ~ bitir^'],
  delete: ['löschen', 'entfernen', 'verwerfen', 'supprimer', 'effacer', 'eliminar', 'borrar', 'удалить', 'стереть',
    // CU-650: cancel a subscription, as 'Cancel subscription' (Russian accusative, with or without a possessive; the table's
    // imperatives read 'Отмените (свою) подписку').
    // CU-654: clear a history (Russian through the table's очисти / очистите, Turkish with its suffix markers; Japanese is a
    // whole-label rule so its past forms stay free).
    'очистить историю', 'очистить всю историю', 'очистить свою историю', 'очистить вашу историю', 'geçmiş~ temizle^',
    'отменить подписку', 'отменить мою подписку', 'отменить свою подписку', 'отменить вашу подписку', 'отменить твою подписку', 'отменить эту подписку', '削除', '消去', '삭제', '지우기',
    // CU-358: Italian, Dutch, Portuguese and Turkish.
    'elimina', 'cancella', 'rimuovi', 'elimina definitivamente', 'verwijderen', 'verwijder', 'wissen', 'definitief verwijderen',
    // r5 (cu-developer-one): Dutch 'opheffen' closes an account (only beside an account noun; 'Blokkering opheffen' lifts a block).
    'account opheffen', 'mijn account opheffen', '_ account opheffen', 'rekening opheffen',
    // r7 (cu-developer-two): closing an account, as English 'Close account' (delete).
    'chiudi _ account', 'chiudi il mio account', 'chiudi _ conto', 'encerrar _ conta', 'fechar _ conta', 'encerrar minha conta', 'fechar minha conta',
    '_ account sluiten', 'mijn account sluiten', 'sluit _ account', 'sluit mijn account', 'account sluiten',
    'excluir', 'apagar', 'remover', 'excluir permanentemente', 'sil^', 'kaldır^', 'kalıcı olarak sil^', 'hesab~ sil^', 'hesab~ kapat^',
    // r2: emptying the trash, as English 'Empty trash'.
    'svuota cestino', 'svuota il cestino', 'prullenbak legen', 'prullenbak leegmaken', 'leeg prullenbak',
    // CU-655 r4 (cu-researcher): an article or possessive between the verb and the trash noun ('Leeg de prullenbak', 'Esvaziar o lixo').
    'leeg _ prullenbak', 'esvaziar _ lixo',
    'esvaziar lixeira', 'esvaziar a lixeira', 'esvaziar lixo', 'esvaziar a reciclagem', 'çöp kutu~ boşalt^', 'çöp~ boşalt^', 'çöp kutu~ temizle^',
    // CU-625 (cu-researcher; cu-developer-one's twin-parity class rule): cancelling a subscription asks delete, as English 'Cancel
    // subscription' does; infinitive, imperative, formal and possessive forms.
    'abo kündigen', 'abonnement kündigen', 'kündige dein abo', 'kündige dein abonnement', 'kündigen sie ihr abonnement', 'kündigen sie ihr abo',
    "résilier l'abonnement", 'résilier l’abonnement', "annuler l'abonnement", 'annuler l’abonnement', 'résilier mon abonnement', 'annuler mon abonnement', 'résiliez votre abonnement', 'annulez votre abonnement',
    'cancelar suscripción', 'cancelar _ suscripción', 'cancelar mi suscripción', 'cancela tu suscripción', 'cancele su suscripción',
    'cancelar assinatura', 'cancelar _ assinatura', 'cancele sua assinatura', 'cancela a tua assinatura', 'cancelar subscrição', 'cancelar _ subscrição',
    'annulla abbonamento', 'annulla _ abbonamento', 'disdici abbonamento', 'disdici _ abbonamento', 'disdici il tuo abbonamento', 'disdire _ abbonamento', 'annulla il tuo abbonamento',
    'abonnement opzeggen', '_ abonnement opzeggen', 'zeg je abonnement op', 'zeg uw abonnement op',
    // CU-641 (twin rule): wipe an account, cancel a subscription ('Wis account', 'Annuleer abonnement'), as 'Erase account' /
    // 'Cancel subscription'; 'Wis zoekopdracht' / 'Wis filters' stay free as 'Clear search' / 'Clear filters' do.
    'account wissen', '_ account wissen', 'geschiedenis wissen', 'abonnement annuleren', '_ abonnement annuleren',
    // r2 (cu-developer-three, cu-verifier): wipe data / files / profile, as 'Erase (your) data', 'Erase all files', 'Erase profile'.
    'gegevens wissen', '_ gegevens wissen', 'bestanden wissen', '_ bestanden wissen', 'profiel wissen', '_ profiel wissen',
    'abonelik~ iptal et^', 'abonelik~ iptal edin', 'aboneliğ~ iptal et^', 'aboneliğ~ iptal edin'],
  submit: ['senden', 'absenden', 'abschicken', 'envoyer', 'soumettre', 'enviar', 'отправить', 'отписаться', '送信', '보내기', '전송', '제출',
    // CU-358: Italian, Dutch, Portuguese and Turkish.
    'invia', 'invia ora', 'verzenden', 'versturen', 'verstuur', 'bericht sturen', 'e-mail sturen', 'nu sturen', 'indienen', 'submeter', 'gönder^', 'şimdi gönder^',
    // CU-617 (cu-researcher): publish / post, as English 'Publish' / 'Post' ask submit; infinitive, imperative and formal forms.
    'veröffentlichen', 'veröffentliche', 'posten', 'poste', 'beitrag veröffentlichen', 'publier', 'publiez', 'publie', 'poster', 'publicar', 'publica', 'publique', 'postear', 'postar', 'poste agora',
    'pubblica', 'pubblicare', 'pubblicate', 'publiceren', 'publiceer', 'nu plaatsen', 'bericht plaatsen', 'yayınla^', 'gönderi~ paylaş^',
    // CU-619 (cu-researcher): calls and meeting joins, as English 'Call' / 'Video call' / 'Start call' / 'Join meeting' ask submit.
    // Turkish 'Ara' (also 'search') and Portuguese 'Ligar' (also 'switch on') only with a call noun or object, never bare.
    'anrufen', 'jetzt anrufen', 'videoanruf', 'videoanruf starten', 'anruf starten', 'meeting beitreten', 'besprechung beitreten', 'konferenz beitreten', 'jetzt beitreten',
    'appeler', 'appelez', 'appel vidéo', 'appel audio', 'démarrer _ appel', 'lancer _ appel', 'rejoindre _ réunion', 'rejoindre maintenant', 'rejoindre _ appel',
    'llamar', 'llama', 'videollamada', 'iniciar _ llamada', 'iniciar videollamada', 'unirse a la reunión', 'unirse ahora', 'únete a la reunión', 'unirse a la llamada',
    'chamada de vídeo', 'iniciar _ chamada', 'fazer _ chamada', 'ligar para', 'ligar agora', 'entrar na reunião', 'participar da reunião', 'entrar na chamada',
    'chiama', 'chiamare', 'videochiamata', 'avvia _ chiamata', 'avvia videochiamata', 'partecipa alla riunione', 'partecipa ora', 'partecipa alla chiamata',
    'bellen', 'nu bellen', 'videogesprek', 'gesprek starten', 'videogesprek starten', 'deelnemen aan vergadering', 'deelnemen aan de vergadering', 'nu deelnemen',
    'görüntülü arama', 'sesli arama', 'arama~ başlat^', 'görüntülü ara^', 'sesli ara^', 'toplantı~ katıl^', 'şimdi katıl^',
    // CU-621 (cu-researcher): leaving a group and unsubscribing, as English 'Leave group' / 'Unsubscribe' ask submit; a bare German
    // 'Abmelden' is also a plain sign-out, so it asks only with a newsletter / mailing object.
    'gruppe verlassen', 'verlasse die gruppe', 'verlassen sie die gruppe', 'chat verlassen', 'quitter le groupe', 'quittez le groupe', 'quitter la conversation', 'quitter le canal',
    'salir del grupo', 'sal del grupo', 'salga del grupo', 'abandonar el grupo', 'sair do grupo', 'saia do grupo', 'abandonar o grupo', 'abbandona il gruppo', 'abbandonare il gruppo', 'esci dal gruppo',
    'groep verlaten', 'verlaat de groep', 'verlaat groep', 'grup~ çık^', 'grup~ ayrıl^', 'sohbet~ ayrıl^',
    // cu-verifier's CU-621 named limit: the demonstrative forms ('Quitter ce groupe').
    'quitter ce groupe', 'quittez ce groupe', 'quitter cette conversation', 'diese gruppe verlassen', 'verlasse diese gruppe', 'salir de este grupo', 'sal de este grupo', 'sair deste grupo', 'saia deste grupo',
    'esci da questo gruppo', 'abbandona questo gruppo', 'deze groep verlaten', 'verlaat deze groep',
    'lascia il gruppo', 'lascia _ gruppo', 'lasciare il gruppo', 'lascia questo gruppo', 'deixar o grupo', 'deixar _ grupo', 'deixe o grupo', 'deixar este grupo',
    // CU-627 (cu-developer-two): the possessive determiners of leave-group in every language ('Quitter votre groupe').
    'quitter votre groupe', 'quittez votre groupe', 'quitter ton groupe', 'quitter mon groupe', 'deine gruppe verlassen', 'ihre gruppe verlassen', 'verlasse deine gruppe', 'verlassen sie ihre gruppe',
    'salir de tu grupo', 'salir de su grupo', 'salga de su grupo', 'sair do seu grupo', 'sair do teu grupo', 'saia do seu grupo', 'esci dal tuo gruppo', 'abbandona il tuo gruppo', 'jouw groep verlaten', 'je groep verlaten', 'verlaat je groep', 'verlaat uw groep', 'grubu~ çık^', 'grubu~ ayrıl^', 'grubun~ çık^', 'grubun~ ayrıl^',
    'abbestellen', 'newsletter abbestellen', 'vom newsletter abmelden', 'se désabonner', 'désabonner', 'désabonnez-vous', 'se désinscrire', 'désinscrivez-vous',
    'darse de baja', 'date de baja', 'dese de baja', 'descadastrar', 'cancelar inscrição', 'descadastre-se', 'annulla iscrizione', 'disiscriviti', 'cancella iscrizione',
    'uitschrijven', 'schrijf je uit', 'schrijf u uit', 'afmelden voor de nieuwsbrief', 'afmelden voor nieuwsbrief', 'afmelden voor _ nieuwsbrief', 'afmelden voor deze nieuwsbrief', 'afmelden voor onze nieuwsbrief', 'meld je af voor deze nieuwsbrief', 'afmelden voor onze e-mails', 'afmelden voor deze e-mails', 'afmelden voor _ e-mails',
    // CU-627 (cu-developer-two): the imperative 'meld je / u af voor' with any determiner, and the other languages' e-mail opt-outs.
    'meld je af voor onze e-mails', 'meld je af voor deze e-mails', 'meld u af voor onze e-mails', 'meld je af voor e-mails', 'meld u af voor de nieuwsbrief', 'meld je af voor onze nieuwsbrief',
    'von e-mails abmelden', 'von unseren e-mails abmelden', 'e-mails abbestellen', 'se désabonner des e-mails', 'se désinscrire des e-mails', 'darse de baja de los correos', 'darse de baja de nuestros correos',
    'cancelar inscrição nos e-mails', 'descadastrar e-mails', 'disiscriviti dalle e-mail', 'annulla iscrizione alle e-mail', 'e-posta~ abonelik~ çık^', 'e-postalar~ çık^', 'meld je af voor de nieuwsbrief', 'afmelden voor e-mails', 'abonelik~ çık^', 'bülten~ çık^',
    // r1 grid (cu-developer-one's go): imperative and formal forms in each language; German / Dutch separable forms below.
    'rejoignez _ réunion', 'rejoignez maintenant', 'rejoignez _ appel', 'appelle', 'únase a la reunión', 'únete ahora', 'únase ahora', 'llame', 'llame ahora', 'llámanos', 'inicie _ llamada',
    'ligue para', 'ligue agora', 'entre na reunião', 'participe da reunião', 'inicie _ chamada', 'chiami', 'chiamaci', 'partecipi alla riunione', 'partecipa adesso', 'avvii _ chiamata',
    'bel nu', 'bel ons', 'start _ gesprek', 'start videogesprek', 'neem deel aan de vergadering', 'neem nu deel',
    // r2 (cu-developer-three, cu-developer-two): the German 'teilnehmen' join forms, Turkish 'join the call', and the Turkish
    // 'ara' with an adverb ('Hemen ara', 'Şimdi ara') - read as a call; a 'search now' button over-asks, fail-closed.
    'jetzt teilnehmen', 'an der besprechung teilnehmen', 'an besprechung teilnehmen', 'am meeting teilnehmen', 'an meeting teilnehmen', 'an der konferenz teilnehmen', 'an der videokonferenz teilnehmen',
    'am anruf teilnehmen', 'am videoanruf teilnehmen', 'am telefonat teilnehmen', 'besprechung teilnehmen', 'meeting teilnehmen', 'konferenz teilnehmen',
    'arama~ katıl^', 'görüşme~ katıl^', 'hemen ara^', 'şimdi ara^'],
  // CU-616 (cu-researcher): sharing a (live) location and granting access, in the seven locales, as English 'Share my location' /
  // 'Share live location' / 'Grant access' / 'Give access' ask permission.
  permission: ['standort teilen', 'live-standort teilen', 'meinen standort teilen', 'standortfreigabe aktivieren', 'zugriff gewähren', 'zugriff erlauben', 'zugang gewähren',
    'partager ma position', 'partager _ position', 'partager la position en direct', 'partager ma localisation', "accorder l'accès", 'accorder l’accès', "autoriser l'accès", 'autoriser l’accès', 'donner accès',
    'compartir ubicación', 'compartir mi ubicación', 'compartir _ ubicación en tiempo real', 'conceder acceso', 'dar acceso', 'permitir acceso', 'permitir el acceso',
    'compartilhar localização', 'compartilhar _ localização', 'partilhar localização', 'partilhar _ localização', 'conceder acesso', 'dar acesso', 'permitir acesso', 'permitir o acesso',
    'condividi posizione', 'condividi _ posizione', 'condividi la posizione in tempo reale', 'condividi la mia posizione', 'condividi la tua posizione', 'condividi la mia posizione in tempo reale', 'concedi accesso', "concedi l'accesso", 'concedi l’accesso', 'consenti accesso', "consenti l'accesso", 'consenti l’accesso',
    'locatie delen', 'deel _ locatie', 'live locatie delen', 'toegang verlenen', 'toegang geven', 'toegang toestaan',
    'konum~ paylaş^', 'canlı konum~ paylaş^', 'erişim izni ver^', 'erişim~ izin ver^', 'erişim~ ver^',
    // r3 (cu-developer-three): the whole possessive / imperative family in every language, not one row at a time.
    'teile deinen standort', 'teile deinen live-standort', 'teilen sie ihren standort', 'deinen standort teilen', 'ihren standort teilen', 'gewähre zugriff', 'gewähren sie zugriff', 'erlaube zugriff', 'erlauben sie den zugriff',
    'partager votre position', 'partagez votre position', 'partage ta position', 'partager ta position', 'partager votre localisation', 'partagez votre localisation', "accordez l'accès", 'accordez l’accès', "autorisez l'accès", 'autorisez l’accès',
    'comparte tu ubicación', 'compartir tu ubicación', 'comparta su ubicación', 'compartir su ubicación', 'concede acceso', 'conceda acceso', 'permite el acceso', 'permita el acceso',
    'compartilhe sua localização', 'compartilhar sua localização', 'compartilhe a sua localização', 'partilhe a sua localização', 'partilhar a sua localização', 'conceda acesso', 'conceda o acesso', 'permita o acesso',
    'condividere la tua posizione', 'condividi la sua posizione', 'condividete la vostra posizione', "concedete l'accesso", 'concedete l’accesso', "consenta l'accesso", 'consenta l’accesso',
    'je locatie delen', 'uw locatie delen', 'deel je live locatie', 'verleen toegang', 'geef toegang', 'sta toegang toe',
    // CU-617 (cu-researcher): share and invite, as English 'Share' / 'Invite' ask permission; infinitive, imperative and formal forms
    // (German / Dutch separable imperatives - 'Lade ... ein', 'Nodig ... uit', 'Deel ...' - are a grammar rule below).
    'teilen', 'teilen sie', 'mit anderen teilen', 'einladen', 'partager', 'partagez', 'partage', 'inviter', 'invitez', 'compartir', 'comparte', 'comparta', 'invitar', 'invita', 'invite a',
    'compartilhar', 'compartilhe', 'partilhar', 'partilhe', 'convidar', 'convide', 'condividi', 'condividere', 'condividete', 'invitare', 'invitate', 'delen', 'uitnodigen',
    'paylaş^', 'davet et^', 'davet edin', 'davet edin^', 'nodig uit', 'nodig uit^'],
  // CU-345: a PIN, one-time code, security code or password field named in these languages.
  secret: ['passwort', 'kennwort', 'sicherheitscode', 'prüfziffer', 'mot de passe', 'code de sécurité', 'cryptogramme',
    'contraseña', 'código de seguridad', 'пароль', 'код безопасности', 'パスワード', '暗証番号', 'セキュリティコード', '認証コード',
    '비밀번호', '보안코드', '인증번호',
    // cu-researcher's red team of PR #323: PIN, one-time code, card-check and card-number names the first list missed.
    // German writes compounds: an entry led by '…' also matches as the end of a longer word (Kreditkartennummer).
    '…geheimzahl', '…bestätigungscode', '…sicherheitscode', '…prüfnummer', '…prüfziffer', '…kartennummer', '…karten nummer', '…einmalcode', 'einmal code',
    'sms code', 'bestätigungs code', 'sicherheits code', 'code de vérification', 'numéro de carte',
    'código de verificación', 'número de tarjeta', 'код подтверждения', 'номер карты', 'pin-код', '確認コード', 'カード番号',
    '인증 코드', '카드 번호', '카드번호',
    // CU-358: Italian, Dutch, Portuguese and Turkish; Dutch compounds take the '…' lead like German.
    'codice di verifica', 'codice di sicurezza', 'codice otp', 'numero della carta', 'numero di carta',
    'wachtwoord', 'pincode', '…pincode', 'verificatiecode', '…verificatiecode', 'beveiligingscode', '…beveiligingscode', 'kaartnummer', '…kaartnummer', 'eenmalige code',
    'senha', 'código de verificação', 'código de segurança', 'número do cartão',
    'şifre~', 'parola~', 'doğrulama kod~', 'güvenlik kod~', 'kart~ numara~', 'son kullanma tarih~', 'tek kullanımlık şifre~',
    // r2: the Portuguese 'de' form, and Turkish possessive forms (your / my), which change the word's ending.
    'número de cartão', 'numero do cartao', 'numero de cartao',
    // CU-600 (cu-researcher): the card's expiry as each language writes it (English 'expiry' / 'expiration date' are in
    // SECRET_NAMES), and the spelled-out card verification value / code. Bare 'vencimiento' / 'validade' / 'scadenza' stay out
    // (a bill's due date, a product's shelf life).
    'ablaufdatum', '…ablaufdatum', 'gültig bis', 'verfallsdatum', 'fecha de caducidad', 'fecha de vencimiento', 'fecha de expiración', 'data de validade',
    'validade do cartão', 'data de expiração', 'data di scadenza', 'scadenza della carta', 'scadenza carta', 'date de validité', 'date de fin de validité',
    'card verification value', 'card verification code', 'card validation code',
    // CU-604 (cu-researcher): one-time codes as each language writes them, as English 'one-time code' / 'OTP' already ask.
    '…einmalpasswort', 'einmal-passwort', 'einmalkennwort', 'code à usage unique', 'code reçu par sms', 'code envoyé par sms', 'code par sms',
    'código de un solo uso', 'código recibido por sms', 'código enviado por sms', 'código de acesso único', 'código de uso único', 'código recebido por sms',
    'codice monouso', 'codice usa e getta', 'codice ricevuto via sms', 'codice ricevuto per sms', 'codice inviato via sms',
    'tek kullanımlık kod~', 'sms kod~', 'eenmalig wachtwoord', 'sms-code', 'sms code ontvangen',
    // CU-605 (cu-researcher): security questions / answers and the mother's maiden name, as English 'security question' /
    // 'security answer' / 'maiden name' already ask - account-recovery secrets.
    '…sicherheitsfrage', 'sicherheitsantwort', 'geheimfrage', 'mädchenname der mutter', 'geburtsname der mutter',
    'question secrète', 'réponse secrète', 'question de sécurité', 'réponse de sécurité', 'nom de jeune fille',
    'pregunta de seguridad', 'respuesta de seguridad', 'pregunta secreta', 'respuesta secreta', 'apellido de soltera',
    'pergunta de segurança', 'resposta de segurança', 'pergunta secreta', 'resposta secreta', 'nome de solteira',
    'domanda di sicurezza', 'risposta di sicurezza', 'domanda segreta', 'risposta segreta', 'cognome da nubile',
    'güvenlik soru~', 'gizli soru~', 'kızlık soyad~', 'beveiligingsvraag', 'geheime vraag', 'meisjesnaam',
    // CU-606 (cu-researcher): the European Portuguese password, beside 'senha'; access codes and two-factor recovery codes
    // as each language writes them, in the class of the locale password words.
    'palavra-passe', 'palavra passe', '…zugangscode', 'zugangs-code', "code d'accès", 'code d’accès', 'código de acceso', 'clave de acceso', 'código de acesso',
    'codice di accesso', 'codice d’accesso', "codice d'accesso", 'toegangscode', '…toegangscode', 'erişim kod~',
    '…wiederherstellungscode', 'code de récupération', 'code de secours', 'código de recuperación', 'código de recuperação', 'codice di recupero', 'herstelcode', '…herstelcode', 'kurtarma kod~',
],
})
// CU-355 (design note 0.1): personal-ID field names in German, French, Spanish, Russian, Japanese and Korean - the third
// locale side beside CU-352's action names and CU-345's credential names. '…' leads a German compound ending.
const LOCALE_ID_NAMES = Object.freeze(['reisepass', '…passnummer', 'geburtsdatum', '…steuernummer', 'steuer id', 'steuer-id',
  'steueridentifikationsnummer', '…ausweisnummer', 'personalausweis', '…versicherungsnummer', '…kontonummer',
  'passeport', 'numéro de passeport', 'date de naissance', 'numéro fiscal', "numéro d'identification fiscale", 'numéro de sécurité sociale',
  'numéro de compte', "carte d'identité",
  'pasaporte', 'número de pasaporte', 'fecha de nacimiento', 'número de identificación fiscal', 'nif', 'dni', 'número de cuenta',
  'número de seguridad social',
  // CU-603 (cu-researcher): the national health-insurance numbers, as 'Health insurance number' / 'NHS number' /
  // 'Krankenversicherungsnummer' / 'Numéro de carte Vitale' already ask; 'Member ID', 'Patient ID' and 'Krankenkasse' stay out.
  'versichertennummer', '…versichertennummer', 'número de la seguridad social', 'número de afiliación', 'tarjeta sanitaria', 'número de la tarjeta sanitaria',
  'número do sns', 'número de utente', 'número de beneficiário', 'tessera sanitaria', 'codice della tessera sanitaria', 'zorgverzekeringsnummer', '…zorgverzekeringsnummer',
  'sağlık sigorta~ numara~', 'insurance member number', 'insurance member id', 'insurance id number',
  // r2 (cu-developer-two): the French insured-person number; 'Versicherten-Nr.' reads through the '-Nr.' family (CU-602).
  "numéro d'assuré", 'numéro d’assuré', "n° d'assuré", 'n° d’assuré', 'numéro assuré',
  // r2 (cu-developer-one): the Dutch card's own term, twin of 'Versichertennummer'.
  'verzekerdennummer', '…verzekerdennummer', 'verzekerdenummer',
  'паспорт', 'номер паспорта', 'дата рождения', 'инн', 'снилс', 'номер счета', 'номер счёта',
  'パスポート', '旅券番号', '生年月日', 'マイナンバー', '個人番号', '口座番号',
  '여권', '여권번호', '생년월일', '주민등록번호', '계좌번호', '사업자등록번호',
  // CU-358: Italian, Dutch, Portuguese and Turkish.
  'codice fiscale', 'passaporto', 'numero di passaporto', 'data di nascita', 'numero di conto', "carta d'identità", 'partita iva',
  'bsn', 'burgerservicenummer', 'paspoort', 'paspoortnummer', 'geboortedatum', 'rekeningnummer', '…rekeningnummer', 'identiteitskaart',
  'cpf', 'rg', 'passaporte', 'número do passaporte', 'data de nascimento', 'número da conta', 'cartão de cidadão',
  // r3: Turkish stems take their suffixes ('~', see namesWord).
  'tc kimlik', 'tc kimlik no', 'tc kimlik numara~', 'iban numara~', 'kimlik numara~', 'doğum tarih~', 'hesap numara~', 'pasaport numara~', 'vergi numara~', 'pasaport~'])
// CU-638 (cu-developer-one's design, 19 Nov 13:36Z): the plural / formal imperatives of the locale verbs. Each verb that leads (or,
// in German, ends) a purchase / delete / submit / permission entry has an explicit table of its imperative forms - FR tu / vous,
// DE du / ihr / Sie, ES tu / vosotros / usted / ustedes, IT tu / voi / Lei, PT tu / voce / voces - generated once from the entry
// list and reviewed (no suffix rules). An entry led by any form of a verb also matches every other form of it, with exactly
// the entry's own object: 'supprimer le compte' reads 'Supprimez votre compte', 'konto loeschen' reads 'Loescht euer Konto', so a
// form asks only where the infinitive asks. Turkish holds through its suffix markers. CU-641 (cu-developer-one's ruling): Dutch takes
// the jij stem and the u form, infinitive-first and infinitive-final entries alike, and a separable verb's particle moves to the end
// ('abonnement opzeggen' reads 'Zeg je abonnement op'; a 'verb|particle' form).
const IMPERATIVE_FORMS = Object.freeze({
  'supprimer': ['supprime', 'supprimez'], 'effacer': ['efface', 'effacez'], 'annuler': ['annule', 'annulez'],
  'résilier': ['résilie', 'résiliez'], 'quitter': ['quitte', 'quittez'], 'partager': ['partage', 'partagez'],
  'passer': ['passe', 'passez'], 'commencer': ['commence', 'commencez'], 'démarrer': ['démarre', 'démarrez'],
  'arrêter': ['arrête', 'arrêtez'], 'terminer': ['termine', 'terminez'], 'commander': ['commande', 'commandez'],
  'confirmer': ['confirme', 'confirmez'], 'valider': ['valide', 'validez'], 'publier': ['publie', 'publiez'],
  'poster': ['poste', 'postez'], 'lancer': ['lance', 'lancez'], 'accorder': ['accorde', 'accordez'],
  'autoriser': ['autorise', 'autorisez'], 'donner': ['donne', 'donnez'], 'inviter': ['invite', 'invitez'],
  'activer': ['active', 'activez'], 'continuer': ['continue', 'continuez'], 'retirer': ['retire', 'retirez'], 'vider': ['vide', 'videz'],
  'payer': ['paie', 'paye', 'payez'], 'envoyer': ['envoie', 'envoyez'], 'essayer': ['essaie', 'essaye', 'essayez'],
  'appeler': ['appelle', 'appelez'], 'mettre': ['mets', 'mettez'], 'soumettre': ['soumets', 'soumettez'], 'faire': ['fais', 'faites'],
  'effectuer': ['effectue', 'effectuez'], 'rejoindre': ['rejoins', 'rejoignez'], 'acheter': ['achète', 'achetez'],
  'transférer': ['transfère', 'transférez'], 'souscrire': ['souscris', 'souscrivez'],
  'cancelar': ['cancela', 'cancelad', 'cancele', 'cancelen', 'cancelem'], 'mejorar': ['mejora', 'mejorad', 'mejore', 'mejoren'],
  'iniciar': ['inicia', 'iniciad', 'inicie', 'inicien', 'iniciem'], 'cambiar': ['cambia', 'cambiad', 'cambie', 'cambien'],
  'pasar': ['pasa', 'pasad', 'pase', 'pasen'], 'comprar': ['compra', 'comprad', 'compre', 'compren', 'comprem'],
  'confirmar': ['confirma', 'confirmad', 'confirme', 'confirmen', 'confirmem'], 'tramitar': ['tramita', 'tramitad', 'tramite', 'tramiten'],
  'eliminar': ['elimina', 'eliminad', 'elimine', 'eliminen'], 'borrar': ['borra', 'borrad', 'borre', 'borren'],
  'llamar': ['llama', 'llamad', 'llame', 'llamen'], 'invitar': ['invita', 'invitad', 'invite', 'inviten'],
  'postear': ['postea', 'postead', 'postee', 'posteen'], 'abandonar': ['abandona', 'abandonad', 'abandone', 'abandonen', 'abandonem'],
  'participar': ['participa', 'participad', 'participe', 'participen', 'participem'],
  'activar': ['activa', 'activad', 'active', 'activen'], 'retirar': ['retira', 'retirad', 'retire', 'retiren', 'retirem'],
  'detener': ['detén', 'detened', 'detenga', 'detengan'], 'salir': ['sal', 'salid', 'salga', 'salgan'],
  'hacer': ['haz', 'haced', 'haga', 'hagan'], 'empezar': ['empieza', 'empezad', 'empiece', 'empiecen'],
  'comenzar': ['comienza', 'comenzad', 'comience', 'comiencen'], 'pagar': ['paga', 'pagad', 'pague', 'paguen', 'paguem'],
  'finalizar': ['finaliza', 'finalizad', 'finalice', 'finalicen'], 'actualizar': ['actualiza', 'actualizad', 'actualice', 'actualicen'],
  'realizar': ['realiza', 'realizad', 'realice', 'realicen', 'realize', 'realizem'],
  'publicar': ['publica', 'publicad', 'publique', 'publiquen', 'publiquem'],
  'enviar': ['envía', 'enviad', 'envíe', 'envíen', 'envia', 'envie', 'enviem'],
  'transferir': ['transfiere', 'transferid', 'transfiera', 'transfieran', 'transfere', 'transfira', 'transfiram'],
  'compartir': ['comparte', 'compartid', 'comparta', 'compartan'], 'permitir': ['permite', 'permitid', 'permita', 'permitan', 'permitam'],
  'conceder': ['concede', 'conceded', 'conceda', 'concedan', 'concedam'], 'dar': ['da', 'dad', 'dé', 'den', 'dá', 'dê', 'deem'],
  'vaciar': ['vacía', 'vaciad', 'vacíe', 'vacíen'], 'mudar': ['muda', 'mude', 'mudem'], 'encerrar': ['encerra', 'encerre', 'encerrem'],
  'parar': ['para', 'pare', 'parem'], 'passar': ['passa', 'passe', 'passem'], 'atualizar': ['atualiza', 'atualize', 'atualizem'],
  'melhorar': ['melhora', 'melhore', 'melhorem'], 'assinar': ['assina', 'assine', 'assinem'],
  'esvaziar': ['esvazia', 'esvazie', 'esvaziem'], 'compartilhar': ['compartilha', 'compartilhe', 'compartilhem'],
  'partilhar': ['partilha', 'partilhe', 'partilhem'], 'convidar': ['convida', 'convide', 'convidem'],
  'postar': ['posta', 'poste', 'postem'], 'entrar': ['entra', 'entre', 'entrem'], 'deixar': ['deixa', 'deixe', 'deixem'],
  'descadastrar': ['descadastra', 'descadastre', 'descadastrem'], 'terminar': ['termina', 'termine', 'terminem'],
  'fechar': ['fecha', 'feche', 'fechem'], 'ativar': ['ativa', 'ative', 'ativem'], 'fazer': ['faz', 'faça', 'façam'],
  'sair': ['sai', 'saia', 'saiam'], 'ligar': ['liga', 'ligue', 'liguem'], 'começar': ['começa', 'comece', 'comecem'],
  'excluir': ['exclui', 'exclua', 'excluam'], 'interromper': ['interrompe', 'interrompa', 'interrompam'],
  'remover': ['remove', 'remova', 'removam'], 'submeter': ['submete', 'submeta', 'submetam'], 'efetuar': ['efetua', 'efetue', 'efetuem'],
  'apagar': ['apaga', 'apague', 'apaguem'], 'elimina': ['eliminate', 'elimini'], 'cancella': ['cancellate', 'cancelli'],
  'conferma': ['confermate', 'confermi'], 'acquista': ['acquistate', 'acquisti'], 'annulla': ['annullate', 'annulli'],
  'svuota': ['svuotate', 'svuoti'], 'partecipa': ['partecipate', 'partecipi'], 'termina': ['terminate', 'termini'],
  'abbandona': ['abbandonate', 'abbandoni'], 'ordina': ['ordinate', 'ordini'], 'chiama': ['chiamate', 'chiami'],
  'invita': ['invitate', 'inviti'], 'aggiorna': ['aggiornate', 'aggiorni'], 'passa': ['passate', 'passi'],
  'effettua': ['effettuate', 'effettui'], 'ferma': ['fermate', 'fermi'], 'prova': ['provate', 'provi'], 'attiva': ['attivate', 'attivi'],
  'paga': ['pagate', 'paghi'], 'pubblica': ['pubblicate', 'pubblichi'], 'cerca': ['cercate', 'cerchi'], 'disdici': ['disdite', 'disdica'],
  'chiudi': ['chiudete', 'chiuda'], 'esci': ['uscite', 'esca'], 'condividi': ['condividete', 'condivida'],
  'concedi': ['concedete', 'conceda'], 'consenti': ['consentite', 'consenta'], 'interrompi': ['interrompete', 'interrompa'],
  'rimuovi': ['rimuovete', 'rimuova'], 'trasferisci': ['trasferite', 'trasferisca'], 'procedi': ['procedete', 'proceda'],
  'sospendi': ['sospendete', 'sospenda'], 'sottoscrivi': ['sottoscrivete', 'sottoscriva'], 'vai': ['andate', 'vada'],
  'abbonati': ['abbonatevi', 'si abboni'], 'avvia': ['avviate', 'avvii'], 'invia': ['inviate', 'invii'], 'inizia': ['iniziate', 'inizi'],
  'lascia': ['lasciate', 'lasci'], 'potenzia': ['potenziate', 'potenzi'], 'eliminare': ['elimina', 'eliminate', 'elimini'],
  'cancellare': ['cancella', 'cancellate', 'cancelli'], 'confermare': ['conferma', 'confermate', 'confermi'],
  'acquistare': ['acquista', 'acquistate', 'acquisti'], 'pagare': ['paga', 'pagate', 'paghi'], 'inviare': ['invia', 'inviate', 'invii'],
  'annullare': ['annulla', 'annullate', 'annulli'], 'condividere': ['condividi', 'condividete', 'condivida'],
  'abbandonare': ['abbandona', 'abbandonate', 'abbandoni'], 'lasciare': ['lascia', 'lasciate', 'lasci'],
  'interrompere': ['interrompi', 'interrompete', 'interrompa'], 'terminare': ['termina', 'terminate', 'termini'],
  'disdire': ['disdici', 'disdite', 'disdica'], 'pubblicare': ['pubblica', 'pubblicate', 'pubblichi'],
  'chiamare': ['chiama', 'chiamate', 'chiami'], 'invitare': ['invita', 'invitate', 'inviti'], 'uscire': ['esci', 'uscite', 'esca'],
  'concedere': ['concedi', 'concedete', 'conceda'], 'löschen': ['lösch', 'lösche', 'löscht', 'löschen sie'],
  'entfernen': ['entfern', 'entferne', 'entfernt', 'entfernen sie'], 'verwerfen': ['verwirf', 'verwerft', 'verwerfen sie'],
  'leeren': ['leere', 'leert', 'leeren sie'], 'bezahlen': ['bezahl', 'bezahle', 'bezahlt', 'bezahlen sie'],
  'zahlen': ['zahl', 'zahle', 'zahlt', 'zahlen sie'], 'kaufen': ['kauf', 'kaufe', 'kauft', 'kaufen sie'],
  'bestellen': ['bestel', 'bestelt u', 'bestell', 'bestelle', 'bestellt', 'bestellen sie'],
  'bestätigen': ['bestätig', 'bestätige', 'bestätigt', 'bestätigen sie'], 'senden': ['sende', 'sendet', 'senden sie'],
  'überweisen': ['überweis', 'überweise', 'überweist', 'überweisen sie'], 'kündigen': ['kündig', 'kündige', 'kündigt', 'kündigen sie'],
  'beenden': ['beend', 'beende', 'beendet', 'beenden sie'], 'stoppen': ['stopp', 'stoppe', 'stoppt', 'stoppen sie'],
  'starten': ['start', 'starte', 'startet', 'starten sie'], 'wechseln': ['wechsle', 'wechsel', 'wechselt', 'wechseln sie'],
  'teilen': ['teil', 'teile', 'teilt', 'teilen sie'], 'verlassen': ['verlass', 'verlasse', 'verlasst', 'verlassen sie'],
  'veröffentlichen': ['veröffentlich', 'veröffentliche', 'veröffentlicht', 'veröffentlichen sie'],
  'posten': ['post', 'poste', 'postet', 'posten sie'], 'gewähren': ['gewähr', 'gewähre', 'gewährt', 'gewähren sie'],
  'erlauben': ['erlaub', 'erlaube', 'erlaubt', 'erlauben sie'], 'aktivieren': ['aktivier', 'aktiviere', 'aktiviert', 'aktivieren sie'],
  // CU-641: Dutch - jij stem and u form; 'verb|particle' for a separable verb.
  'verzenden': ['verzend', 'verzendt u'], 'versturen': ['verstuur', 'verstuurt u'], 'sturen': ['stuur', 'stuurt u'], 'verwijderen': ['verwijder', 'verwijdert u'],
  'wissen': ['wis', 'wist u'], 'annuleren': ['annuleer', 'annuleert u'], 'bevestigen': ['bevestig', 'bevestigt u'], 'betalen': ['betaal', 'betaalt u'],
  'kopen': ['koop', 'koopt u'], 'delen': ['deel', 'deelt u'], 'verlaten': ['verlaat', 'verlaat u'], 'beëindigen': ['beëindig', 'beëindigt u'],
  'publiceren': ['publiceer', 'publiceert u'], 'plaatsen': ['plaats', 'plaatst u'], 'bellen': ['bel', 'belt u'], 'verlenen': ['verleen', 'verleent u'],
  'geven': ['geef', 'geeft u'], 'abonneren': ['abonneer', 'abonneert u'], 'proberen': ['probeer', 'probeert u'],
  'opzeggen': ['zeg|op', 'zegt u|op'], 'stopzetten': ['zet|stop', 'zet u|stop'], 'opheffen': ['hef|op', 'heft u|op'], 'afsluiten': ['sluit|af', 'sluit u|af'],
  'uitnodigen': ['nodig|uit', 'nodigt u|uit'], 'toestaan': ['sta|toe', 'staat u|toe'], 'deelnemen': ['neem|deel', 'neemt u|deel'], 'uitschrijven': ['schrijf|uit', 'schrijft u|uit'],
  'afmelden': ['meld|af', 'meldt u|af'], 'overmaken': ['maak|over', 'maakt u|over'], 'leegmaken': ['maak|leeg', 'maakt u|leeg'], 'overschrijven': ['schrijf|over', 'schrijft u|over'],
  'afrekenen': ['reken|af', 'rekent u|af'], 'uitvoeren': ['voer|uit', 'voert u|uit'], 'overstappen': ['stap|over', 'stapt u|over'],
  // CU-648 (cu-developer-one's design 03:04Z / 03:06Z): Russian perfective ty / vy imperatives; imperfective ('Удаляйте',
  // 'Покупайте') and negated forms stay out. Korean polite imperatives of the native 보내다 and of the hada table nouns; the plain
  // statement forms ('보내요', '삭제해요') stay out ('보내요' is also 'I send').
  'удалить': ['удали', 'удалите'], 'отправить': ['отправь', 'отправьте'], 'оплатить': ['оплати', 'оплатите'], 'купить': ['купи', 'купите'],
  'заказать': ['закажи', 'закажите'], 'оформить': ['оформи', 'оформите'], 'стереть': ['сотри', 'сотрите'],
  // CU-650: cancel and unsubscribe, with the objects their entries name ('Отмените подписку', 'Отпишитесь').
  'отменить': ['отмени', 'отмените'], 'отписаться': ['отпишись', 'отпишитесь'], 'очистить': ['очисти', 'очистите'],
  '보내기': ['보내세요', '보내 주세요', '보내주세요', '보내십시오', '보내줘', '보내 줘'], '지우기': ['지워', '지워줘', '지워 줘', '지우세요', '지워 주세요', '지워주세요'], '삭제': ['삭제하세요', '삭제해 주세요', '삭제해주세요', '삭제하십시오'],
  '결제': ['결제하세요', '결제해 주세요', '결제해주세요', '결제하십시오'], '구매': ['구매하세요', '구매해 주세요', '구매해주세요', '구매하십시오'],
  '전송': ['전송하세요', '전송해 주세요', '전송해주세요', '전송하십시오'],
})
// A form that is also a participle, adjective or noun is never matched alone where the entry is the bare verb ('Inviate', 'Pagate',
// 'Bezahlt' stay free); it asks only in an imperative-only context - first in the label and followed by a determiner, or by a 'now'
// adverb ('Bestellt jetzt', 'Pagate subito') ('Eliminate il
// vostro account', 'Inviate il messaggio') - or with an entry's object. 'para' (PT 'parar') is the preposition 'for', never generated.
const IMPERATIVE_BARE_COLLISIONS = new Set(['kauf', 'kauft', 'bezahlt', 'bestellt', 'entfernt', 'veröffentlicht', 'post', 'posta', 'poste', 'teil', 'teile', 'teilt',
  'paye', 'commande', 'partage', 'partilha', 'compra', 'paga', 'acquistate', 'eliminate', 'cancellate', 'inviate', 'pubblicate', 'chiamate', 'invitate',
  'trasferite', 'pagate', 'andate', 'esca',
  // German e-less du stems lead hyphenated compounds ('Bestell-Nr.', 'Zahl-Art', 'Lösch-Datum'), so they never stand alone either.
  'lösch', 'entfern', 'bezahl', 'zahl', 'bestell', 'bestätig', 'überweis', 'kündig', 'beend', 'stopp', 'start', 'veröffentlich', 'gewähr', 'erlaub',
  'aktivier', 'verlass', 'wechsel', 'verwirf', 'leer',
  // CU-641: Dutch stems that are also nouns or adjectives ('Deel' part, 'Bel' bell, 'Plaats' place).
  'deel', 'bel', 'plaats'])
// CU-641 (cu-developer-one, point 4): 'Stuur' (also the steering wheel) and 'Wis' ('Wis zoekopdracht', 'Wis filters' stay free) ask
// only with an entry's object - never alone, never in the determiner context.
const IMPERATIVE_OBJECT_ONLY = new Set(['stuur', 'wis'])
// CU-654: clear verbs that ask only before a history noun (FR / ES / PT / IT / DE; Russian, Japanese and Turkish are entries).
const LOCALE_HISTORY_CLEAR = Object.freeze([
  /^(?:vider|videz|vide)\s+(?:\S+\s+){0,4}?(?:l['’]\s*)?historique\b/i,
  /^(?:limpiar|limpia|limpie|limpiad|limpien|vaciar|vacía|vacíe|vaciad|vacíen)\s+(?:\S+\s+){0,4}?historial\b/i,
  /^(?:limpar|limpa|limpe|limpem)\s+(?:\S+\s+){0,4}?hist[oó]rico\b/i,
  /^(?:svuota|svuotare|svuotate|svuoti|pulisci|pulire|pulite)\s+(?:\S+\s+){0,4}?(?:l['’]\s*)?cronologia\b/i,
  // r2 (cu-developer-three, cu-developer-one 12:50Z): in the verb-final locales words may stand between the noun and the verb -
  // 'Verlauf jetzt / vollständig / beim Beenden leeren', '履歴をすべてクリア', 'Arama geçmişini şimdi temizle'.
  /^(?:\S+\s+){0,4}?\S*verlauf(?:\s+\S+){0,4}?\s+(?:leeren|bereinigen)\s*[.!]?$/i,
  // r3 (cu-developer-three, cu-developer-one 14:15Z): past and passive forms stay free, as 'History cleared' does ('履歴をクリアしま
  // した', '履歴がクリアされました', 'Geçmiş temizlendi').
  /履歴.{0,10}?クリア(?!し(?:ました|た)|され|済|完了|中)/u,
  /(?:^|\s)\S*geçmiş\S*(?:\s+\S+){0,4}?\s+temizle(?:yin(?:iz)?|sin)?\s*[.!]?$/iu,
  /^(?:leere|leert|leeren\s+sie|bereinige|bereinigt|bereinigen\s+sie)\s+(?:\S+\s+){0,4}?\S*verlauf\b/i,
])
// CU-655 (cu-developer-one's design): emptying the trash asks delete in FR / ES / DE / RU / JA / KO, as 'Empty trash' and the
// IT / NL / PT / TR entries do - the verb with the trash noun only, up to four words between them, in either order where the
// language puts the verb last; negation follows 'Don't empty trash' (asks). Past and status forms stay free, as the locale bare
// nouns do ('Corbeille vidée', 'Papierkorb geleert', 'Корзина очищена', 'ゴミ箱を空にしました', '휴지통을 비웠습니다'); the same
// verbs with any other object stay free ('Vider le panier', 'Warenkorb leeren', '장바구니 비우기'). Russian 'корзина' is also a
// shopping cart: it asks (the trash deletes for good, a cart empties reversibly) unless the cart is named ('корзину покупок').
const LOCALE_TRASH_EMPTY = Object.freeze([
  /^(?:ne\s+pas\s+)?(?:vider|videz|vide)\s+(?:\S+\s+){0,4}?corbeille(?=\s|$|[.!])/i,
  /^ne\s+(?:videz|vide)\s+pas\s+(?:\S+\s+){0,4}?corbeille(?=\s|$|[.!])/i,
  /^(?:no\s+)?(?:vaciar|vacía|vacia|vacíe|vacie|vaciad|vacíen|vacien|vacíes|vacies)\s+(?:\S+\s+){0,4}?papelera(?=\s|$|[.!])/i,
  /^(?:\S+\s+){0,4}?papierkorb(?:\s+\S+){0,4}?\s+(?:leeren|entleeren)\s*[.!]?$/i,
  /^(?:leere|leert|leeren\s+sie|entleere|entleert|entleeren\s+sie)\s+(?:\S+\s+){0,4}?papierkorb(?=\s|$|[.!])/i,
  /ゴミ箱.{0,10}?空に(?!し(?:ました|た)|され|済|完了|中)/u,
  /휴지통\S*\s*(?:\S+\s+){0,4}?(?:비우(?:기|세요|십시오|시겠습니까)?|비워(?:\s?줘|\s?주세요|요)?)(?=\s|$|[.!?])/u,
  // CU-657 (cu-developer-one's 17:00Z row): the nominal form takes the object particle before 실행 / 하기 ('휴지통 비우기를 실행',
  // '휴지통 비우기를 하기'), as '휴지통 비우기 실행' asks; a past or status verb after the particle stays free ('휴지통 비우기를 완료했습니다').
  // CU-660 (cu-developer-one's go, 19:06Z): 시작 / 진행 (start / proceed) after the particle ask too ('휴지통 비우기를 시작'), with the
  // imperative endings (r2, cu-researcher: '휴지통 비우기를 시작하세요', '…진행해 주세요', '…시작하십시오'; r3, cu-developer-three: the
  // casual '…진행해줘', as CU-654's '지워줘'), and up to two words between the particle and the verb ('휴지통 비우기를 지금 시작',
  // cu-developer-one's r3 ruling); 'in progress' (진행 중) and the past forms stay free.
  /휴지통\S*\s*(?:\S+\s+){0,4}?비우기[을를]\s*(?:\S+\s+){0,2}?(?:실행|하기|시작|진행)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해)?(?!\s*중)(?=\s|$|[.!?])/u,
  // CU-657 (cu-developer-one's design, 20 Nov 16:47Z): IT / NL / PT / TR with the same slots - up to four words before the noun
  // ('Svuota tutto il cestino', 'Esvaziar sua lixeira'), words between the noun and a final verb in NL and TR ('Prullenbak nu
  // legen', 'Çöp kutusunu şimdi boşalt'), a trailing adverb ('Svuotare il cestino ora'); negation follows its twin ('Non svuotare
  // il cestino', 'Prullenbak niet legen', 'Não esvaziar a lixeira', 'Çöp kutusunu boşaltma'). Past forms ('Cestino svuotato',
  // 'Prullenbak geleegd', 'Lixeira esvaziada', 'Çöp kutusu boşaltıldı'), other objects ('Svuota il carrello', 'Winkelwagen
  // legen', 'Esvaziar o carrinho', 'Sepeti boşalt') and the bare nouns stay free.
  /^(?:non\s+)?(?:svuota|svuotare|svuotate|svuoti)\s+(?:\S+\s+){0,4}?cestino(?=\s|$|[.!])/i,
  /^(?:niet\s+)?(?:leeg|leegt|legen|leegmaken)\s+(?:\S+\s+){0,4}?prullenbak(?=\s|$|[.!])/i,
  /^maak\s+(?:\S+\s+){0,4}?prullenbak(?:\s+\S+){0,3}?\s+leeg(?=\s|$|[.!])/i,
  /^(?:\S+\s+){0,4}?prullenbak(?:\s+\S+){0,4}?\s+(?:legen|leegmaken|leeg\s+maken)\s*[.!]?$/i,
  /^(?:não\s+|nao\s+)?(?:esvaziar|esvazie|esvazia|esvaziem)\s+(?:\S+\s+){0,4}?(?:lixeira|lixo|reciclagem)(?=\s|$|[.!])/i,
  // CU-660: the noun takes its case ending ('Çöpü tamamen boşalt'), as 'Çöp kutusunu' does.
  /^(?:\S+\s+){0,4}?çöp\S*(?:\s+kutu\S*)?(?:\s+\S+){0,4}?\s+(?:boşalt|boşaltın|boşaltınız|temizle|temizleyin|temizleyiniz)\s*[.!]?$/iu,
  // The negative imperative needs the accusative object ('Çöp kutusunu boşaltma'): 'boşaltma' after a bare noun is the verbal noun
  // of a setting's name ('Otomatik çöp kutusu boşaltma', automatic trash emptying), which stays free.
  /^(?:\S+\s+){0,4}?(?:çöp\s+kutusunu|çöpü)(?:\s+\S+){0,4}?\s+(?:boşaltma|boşaltmayın|temizleme|temizlemeyin)\s*[.!]?$/iu,
])
// CU-663 (cu-developer-one's design, 20 Nov 23:11Z): the locale twins of CU-659 - emptying a folder (or a localized Deleted
// Items / Junk folder) asks delete as 'Empty folder' does, with CU-655's axes: up to four slot words in either order, a trailing
// adverb, negation as its twin, the formal / casual endings; and CU-661's rule - a preposition in the slot names a place (free)
// unless the slot starts with a quantifier or 'the contents' (asks). Past / status forms, carts, open / new folder and the bare
// names stay free. 'Clear storage' twins (pt / ru / tr) ask as 'Clear data'. CU-665 (cu-developer-one's go 04:09Z): a plural content noun
// first (with its article and one adjective) counts as a quantifier in each locale, as CU-661's English rule does ('Vider les messages
// du dossier Spam', 'Die Nachrichten im Ordner leeren', 'Очистить письма в папке').
const folderSlot = (preps, quants) => `(?:(?:${quants})(?:\\s+\\S+){0,4}?\\s+|(?:(?!(?:${preps})(?:\\s|$))\\S+\\s+){0,4}?)`
const folderVerbFirst = (neg, verbs, preps, quants, nouns) => new RegExp(`^(?:${neg})?(?:${verbs})\\s+${folderSlot(preps, quants)}(?:${nouns})(?=\\s|$|[.!?])`, 'iu')
const folderVerbLast = (preps, quants, nouns, verbs) => new RegExp(`^${folderSlot(preps, quants)}(?:${nouns})(?:\\s+\\S+){0,4}?\\s+(?:${verbs})\\s*[.!]?$`, 'iu')
const LOCALE_FOLDER_EMPTY = Object.freeze([
  folderVerbFirst('ne\\s+pas\\s+', 'vider|videz|vide', 'dans|de|du|des|pour|depuis|en|sur|à|au|aux', 'tout|tous|toutes|le\\s+contenu|tout\\s+le\\s+contenu|(?:(?:les|des|vos|tes|mes)\\s+)?(?:\\S+\\s+)?(?:messages|éléments|fichiers|e-mails|courriels|conversations|documents|photos)', 'dossier|éléments\\s+supprimés|courrier\\s+indésirable|spam'),
  /^ne\s+(?:videz|vide)\s+pas\s+(?:\S+\s+){0,4}?(?:dossier|éléments\s+supprimés|courrier\s+indésirable)(?=\s|$|[.!?])/iu,
  folderVerbFirst('no\\s+', 'vaciar|vacía|vacia|vacíe|vacie|vaciad|vacíen|vacien|vacíes|vacies', 'en|de|del|para|desde', 'todo|todos|todas|el\\s+contenido|todo\\s+el\\s+contenido|(?:(?:los|las|tus|sus|mis)\\s+)?(?:\\S+\\s+)?(?:mensajes|elementos|archivos|correos|conversaciones|documentos|fotos)', 'carpeta|elementos\\s+eliminados|correo\\s+no\\s+deseado|spam'),
  folderVerbFirst('(?:não|nao)\\s+', 'esvaziar|esvazie|esvazia|esvaziem|limpar|limpe|limpa|limpem', 'em|no|na|nos|nas|de|do|da|dos|das|para', 'tudo|todo|toda|todos|todas|o\\s+conteúdo|todo\\s+o\\s+conteúdo|(?:(?:os|as|seus|suas|meus|minhas)\\s+)?(?:\\S+\\s+)?(?:mensagens|itens|arquivos|e-mails|conversas|documentos|fotos)', 'pasta|itens\\s+excluídos|lixo\\s+eletrônico|spam'),
  folderVerbFirst('non\\s+', 'svuota|svuotare|svuotate|svuoti', 'in|nel|nella|di|del|della|dal|dalla|per|da', 'tutto|tutti|tutte|il\\s+contenuto|tutto\\s+il\\s+contenuto|(?:(?:i|gli|le|tuoi|miei)\\s+)?(?:\\S+\\s+)?(?:messaggi|elementi|email|conversazioni|documenti)', 'cartella|posta\\s+eliminata|posta\\s+indesiderata|spam'),
  folderVerbLast('in|im|aus|vom|von|für', 'alle|alles|den\\s+gesamten|den\\s+ganzen|den\\s+inhalt|gesamten|ganzen|(?:(?:die|ihre|deine|meine)\\s+)?(?:\\S+\\s+)?(?:nachrichten|elemente|dateien|e-mails|mails|unterhaltungen|dokumente|fotos)', '\\S*ordner|gelöschte\\s+elemente|junk-e-mail|spam', 'leeren|entleeren'),
  folderVerbFirst('nicht\\s+', 'leere|leert|leeren\\s+sie|entleere|entleert|entleeren\\s+sie', 'in|im|aus|vom|von|für', 'alle|alles|den\\s+gesamten|den\\s+ganzen|den\\s+inhalt|(?:(?:die|ihre|deine|meine)\\s+)?(?:\\S+\\s+)?(?:nachrichten|elemente|dateien|e-mails|mails|unterhaltungen|dokumente|fotos)', '\\S*ordner|gelöschte\\s+elemente|junk-e-mail|spam'),
  folderVerbFirst('niet\\s+', 'leeg|leegt|legen|leegmaken', 'in|uit|van|voor', 'alle|alles|de\\s+hele|de\\s+inhoud|hele|(?:(?:de|je|uw|mijn)\\s+)?(?:\\S+\\s+)?(?:berichten|items|bestanden|e-mails|gesprekken|documenten)', 'map|verwijderde\\s+items|ongewenste\\s+e-mail|spam'),
  /^maak\s+(?:\S+\s+){0,4}?(?:map|verwijderde\s+items|ongewenste\s+e-mail)(?:\s+\S+){0,3}?\s+leeg(?=\s|$|[.!])/iu,
  folderVerbLast('in|uit|van|voor', 'alle|alles|de\\s+hele|de\\s+inhoud|hele|(?:(?:de|je|uw|mijn)\\s+)?(?:\\S+\\s+)?(?:berichten|items|bestanden|e-mails|gesprekken|documenten)', 'map|verwijderde\\s+items|ongewenste\\s+e-mail|spam', 'legen|leegmaken|leeg\\s+maken'),
  /(?:フォルダー?|削除済みアイテム|迷惑メール).{0,10}?空に(?!し(?:ました|た)|され|済|完了|中|なって|なりました)/u,
  /(?:폴더|지운\s?편지함|정크\s?메일)\S*\s*(?:\S+\s+){0,4}?(?:비우(?:기|세요|십시오)?|비워(?:\s?줘|\s?주세요|요)?|비우지\s?마(?:세요|십시오)?)(?=\s|$|[.!?])/u,
  /(?:폴더|지운\s?편지함|정크\s?메일)\S*\s*(?:\S+\s+){0,4}?비우기[을를]\s*(?:\S+\s+){0,2}?(?:실행|하기|시작|진행)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해)?(?!\s*중)(?=\s|$|[.!?])/u,
  folderVerbLast('içinde|için|içindeki', 'tüm|bütün|tamamını|hepsini', 'klasör\\S*|silinmiş\\s+öğeler\\S*|gereksiz\\s+e-posta\\S*', 'boşalt|boşaltın|boşaltınız|temizle|temizleyin|temizleyiniz'),
  /^(?:\S+\s+){0,4}?(?:klasörü|silinmiş\s+öğeleri|gereksiz\s+e-postayı)(?:\s+\S+){0,4}?\s+(?:boşaltma|boşaltmayın|temizleme|temizlemeyin)\s*[.!]?$/iu,
  /^(?:não\s+|nao\s+)?(?:limpar|limpe|limpa|limpem)\s+(?:\S+\s+){0,2}?armazenamento(?=\s|$|[.!])/iu,
  /^(?:\S+\s+){0,2}?depolama\S*(?:\s+\S+){0,2}?\s+(?:temizle|temizleyin|temizleyiniz)\s*[.!]?$/iu,
])
// CU-663: the Russian folder / storage twins, folded on first use as namesRuTrashEmpty's words are ('Очистить папку', 'Очистите
// папку «Удалённые»', 'Очистить хранилище'); a preposition (в / из / для / с) in the slot names a place unless a quantifier leads.
let ruFolderEmptyRegex = null
function namesRuFolderEmpty(name) {
  if (!ruFolderEmptyRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['очистить', 'очисти', 'очистите', 'очищать', 'очищай', 'очищайте'])
    const noun = `(?:${any(['папку', 'папке', 'удалённые', 'удаленные', 'хранилище'])}|${any(['нежелательную'])}\\s+${any(['почту'])})`
    const prep = any(['в', 'из', 'для', 'с', 'во', 'со'])
    const quant = any(['все', 'всё', 'всю', 'весь', 'содержимое', 'письма', 'сообщения', 'файлы', 'элементы', 'документы'])
    const slot = `(?:${quant}(?:\\s+\\S+){0,4}?\\s+|(?:(?!${prep}(?:\\s|$))\\S+\\s+){0,4}?)`
    ruFolderEmptyRegex = new RegExp(`^(?:${any(['не'])}\\s+)?(?:${verb}\\s+${slot}${noun}(?=\\s|$|[.!?«»"])|${noun}\\s+(?:\\S+\\s+){0,4}?${verb}(?=\\s|$|[.!]))`, 'iu')
  }
  return ruFolderEmptyRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-668 (cu-developer-one's design, 21 Nov 06:47Z): clearing browsing or site data asks delete in the locales whose clear verb
// does not ask by itself, as 'Clear browsing data' does - verb-first and verb-final, up to two slot words ('Vider toutes les données
// de navigation'), negation as its twin, ja / ko politeness. Bare nouns, show / settings labels, past forms, caches ('Vider le
// cache', CU-659) and the verbs' other objects stay free.
const dataSlot = '(?:\\S+\\s+){0,2}?'
const LOCALE_DATA_CLEAR = Object.freeze([
  new RegExp(`^(?:ne\\s+pas\\s+)?(?:vider|videz|vide)\\s+${dataSlot}données\\s+(?:de\\s+navigation|du\\s+site|des\\s+sites|de\\s+site)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^ne\\s+(?:videz|vide)\\s+pas\\s+${dataSlot}données\\s+(?:de\\s+navigation|du\\s+site|des\\s+sites)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^(?:no\\s+)?(?:limpiar|limpia|limpie|limpiad|limpien|vaciar|vacía|vacia|vacíe|vaciad|vacíen)\\s+${dataSlot}datos\\s+(?:de\\s+navegación|del\\s+sitio|de\\s+sitios?|de\\s+los\\s+sitios)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^(?:não\\s+|nao\\s+)?(?:limpar|limpe|limpa|limpem)\\s+${dataSlot}dados\\s+(?:de\\s+navegação|do\\s+site|dos\\s+sites)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^(?:non\\s+)?(?:svuota|svuotare|svuotate|svuoti|cancella|cancellare|cancellate)\\s+${dataSlot}dati\\s+(?:di\\s+navigazione|del\\s+sito|dei\\s+siti)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^${dataSlot}(?:\\S*(?:browser|website|web|seiten)daten|daten\\s+(?:des\\s+browsers|der\\s+website))(?:\\s+\\S+){0,2}?\\s+(?:leeren|bereinigen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:leere|leert|leeren\\s+sie|bereinige|bereinigt|bereinigen\\s+sie)\\s+${dataSlot}(?:\\S*(?:browser|website|web|seiten)daten)(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^${dataSlot}\\S*(?:browse|site|website)gegevens(?:\\s+\\S+){0,2}?\\s+(?:legen|leegmaken|leeg\\s+maken|wissen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:niet\\s+)?(?:wis|leeg|leegt|legen|leegmaken)\\s+${dataSlot}\\S*(?:browse|site|website)gegevens(?=\\s|$|[.!?])`, 'iu'),
  new RegExp(`^${dataSlot}(?:tarama|site|gezinme)\\s+veriler\\S*(?:\\s+\\S+){0,2}?\\s+(?:temizle|temizleyin|temizleyiniz)\\s*[.!]?$`, 'iu'),
  /(?:閲覧データ|サイトデータ|ブラウジングデータ|ブラウザー?の?データ).{0,8}?(?:クリア|空に)(?!し(?:ました|た)|され|済|完了|中)/u,
  /(?:사이트\s?데이터|인터넷\s?사용\s?기록|검색\s?데이터|브라우저\s?데이터)\S*\s*(?:\S+\s+){0,2}?(?:비우(?:기|세요|십시오)?|비워(?:\s?줘|\s?주세요|요)?)(?=\s|$|[.!?])/u,
])
let ruDataClearRegex = null
function namesRuDataClear(name) {
  if (!ruDataClearRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['очистить', 'очисти', 'очистите', 'очищать', 'очищай', 'очищайте'])
    const data = `${any(['данные'])}\\s+${any(['браузера', 'сайта', 'сайтов', 'просмотра'])}`
    ruDataClearRegex = new RegExp(`^(?:${any(['не'])}\\s+)?(?:${verb}\\s+(?:\\S+\\s+){0,2}?${data}(?=\\s|$|[.!?])|${data}\\s+(?:\\S+\\s+){0,2}?${verb}(?=\\s|$|[.!]))`, 'iu')
  }
  return ruDataClearRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-670 (cu-developer-one's design 08:01Z, strict parity 08:03Z): the locale twins of 'Reset settings' and 'Factory reset' ask
// delete exactly where English does - the reset verb before the settings noun, with determiner / quantifier slot words only
// ('Réinitialiser tous les paramètres'), verb-final in de / nl / ja / ko / tr; the factory-reset twins. Free as in English: negation
// ("Don't reset settings" is free), other or qualified objects ('Reset preferences', 'Reset network settings', 'Réinitialiser le
// zoom'), 'Restore defaults' twins ('恢复默认设置', 'Ripristina predefiniti'), past / status forms and bare nouns.
const LOCALE_RESET_SETTINGS = Object.freeze([
  /^(?:réinitialiser|réinitialisez|réinitialise)\s+(?:(?:tous|toutes)\s+)?(?:les|vos|tes|mes)\s+(?:paramètres|réglages)(?:\s+(?:maintenant|tout\s+de\s+suite))?\s*[.!]?$/iu,
  /^(?:restablecer|restablece|restablezca|restableced|restablezcan)\s+(?:(?:toda|todas|todos)\s+)?(?:la|las|los|tu|tus|su|sus)?\s*(?:configuración|ajustes|configuraciones)(?:\s+(?:ahora|ya))?\s*[.!]?$/iu,
  /^(?:redefinir|redefina|redefine|redefinam)\s+(?:(?:todas|todos)\s+)?(?:as|os|suas|seus|tuas|teus)?\s*(?:configurações|definições)(?:\s+(?:agora|já))?\s*[.!]?$/iu,
  /^(?:ripristina|ripristinare|ripristinate|reimposta|reimpostare|reimpostate)\s+(?:tutte\s+)?(?:le\s+|tue\s+|sue\s+)?impostazioni(?:\s+(?:ora|adesso|subito))?\s*[.!]?$/iu,
  /^(?:(?:die|alle|ihre|deine|meine)\s+){0,2}einstellungen(?:\s+(?:jetzt|sofort))?\s+zurücksetzen\s*[.!]?$/iu,
  /^(?:setze|setzt|setzen\s+sie)\s+(?:(?:die|alle|ihre|deine|meine)\s+){0,2}einstellungen(?:\s+(?:jetzt|sofort))?\s+zurück\s*[.!]?$/iu,
  /^(?:(?:de|alle|je|uw|mijn)\s+){0,2}instellingen(?:\s+(?:nu|direct))?\s+(?:resetten|opnieuw\s+instellen|terugzetten)\s*[.!]?$/iu,
  /^(?:reset|zet)\s+(?:(?:de|alle|je|uw|mijn)\s+){0,2}instellingen(?:\s+terug)?\s*[.!]?$/iu,
  /^(?:今すぐ)?(?:すべての|全ての)?設定を?(?:今すぐ)?(?:リセット|初期化)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:지금\s+)?(?:모든\s+)?설정\S{0,1}\s*(?:지금\s+)?(?:초기화|리셋)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해)?\s*[.!]?$/u,
  /^(?:立即|现在)?(?:重置|重设)(?:所有|全部)?设置\s*[.!。]?$/u,
  /^(?:(?:tüm|bütün)\s+)?ayarlar\S*(?:\s+(?:şimdi|hemen))?\s+(?:sıfırla|sıfırlayın|sıfırlayınız)\s*[.!]?$/iu,
  // r2 (cu-developer-two, cu-developer-one 08:21Z): the 'Reset to defaults' twins - a reset verb (not a restore verb) before 'defaults'
  /^(?:réinitialiser|réinitialisez|réinitialise)\s+(?:(?:aux?|les)\s+)?(?:(?:valeurs|paramètres|réglages)\s+)?par\s+défaut\s*[.!]?$/iu,
  /^(?:restablecer|restablece|restablezca|restableced|restablezcan)\s+(?:a\s+)?(?:los\s+)?(?:valores\s+)?(?:predeterminados|por\s+defecto)\s*[.!]?$/iu,
  /^(?:redefinir|redefina|redefine|redefinam)\s+(?:para\s+)?(?:os?\s+)?(?:valores\s+)?(?:padrão|padrões|predefinidos)\s*[.!]?$/iu,
  /^(?:reimposta|reimpostare|reimpostate)\s+(?:ai\s+|i\s+)?(?:valori\s+)?predefiniti\s*[.!]?$/iu,
  /^(?:(?:\S*einstellungen|alles)\s+)?auf\s+(?:die\s+)?(?:standard|standardwerte|standardeinstellungen|voreinstellungen)\s+zurücksetzen\s*[.!]?$/iu,
  /^(?:(?:instellingen|alles)\s+)?(?:terugzetten|resetten)\s+(?:naar|op)\s+(?:de\s+)?standaard(?:waarden|instellingen)?\s*[.!]?$/iu,
  /^(?:デフォルト|既定値|既定の設定)に(?:リセット)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^기본값으로\s?(?:초기화|재설정)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해)?\s*[.!]?$/u,
  /^重置为默认(?:值|设置)?\s*[.!。]?$/u,
  /^varsayılan(?:a|lara|\s+ayarlara)\s+(?:sıfırla|sıfırlayın|sıfırlayınız)\s*[.!]?$/iu,
  // the factory-reset twins ('Factory reset', 'Reset to factory settings', 'Restore factory settings' ask in English)
  /^(?:réinitialis\S*|rétablir|rétablissez|restaurer|restaurez)\b.*\busine\b|^réinitialisation\s+d['’]usine\s*[.!]?$/iu,
  /^(?:restablec\S*|restaurar|restaure)\b.*\bfábrica\b|^restablecimiento\s+de\s+fábrica\s*[.!]?$/iu,
  /^(?:redefin\S*|restaurar|restaure)\b.*\bfábrica\b|^redefinição\s+de\s+fábrica\s*[.!]?$/iu,
  /^(?:ripristin\S*|reimpost\S*)\b.*\bfabbrica\b/iu,
  /^(?:\S+\s+){0,3}?(?:op\s+)?fabrieksinstellingen\s+(?:herstellen|terugzetten|resetten)\s*[.!]?$|^(?:herstel|zet|reset)\b.*\bfabrieksinstellingen\b/iu,
  /工場出荷.{0,8}?(?:リセット|初期化|戻す|戻して)(?!し(?:ました|た)|され|済|完了|中)/u,
  /^공장\s?(?:초기화|설정\s?복원)(?:하기|하세요|해\s?주세요|하십시오)?\s*[.!]?$/u,
  /^(?:恢复|重置为?|还原)出厂设置\s*[.!。]?$/u,
  /^fabrika\s+ayarlar\S*\s+(?:sıfırla|sıfırlayın|dön|geri\s+dön|geri\s+yükle)\s*[.!]?$/iu,
])
let ruResetSettingsRegex = null
function namesRuResetSettings(name) {
  if (!ruResetSettingsRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['сбросить', 'сбросьте', 'сбрось'])
    const slot = `(?:${any(['все', 'свои', 'ваши', 'мои'])}\\s+)?`
    ruResetSettingsRegex = new RegExp(`^(?:${verb}\\s+${slot}${any(['настройки'])}(?:\\s+${any(['сейчас'])})?|${verb}\\s+(?:${any(['настройки'])}\\s+)?(?:${any(['до', 'к'])}\\s+${any(['значений', 'значениям'])}\\s+)?${any(['по'])}\\s+${any(['умолчанию'])}|${verb}\\s+(?:\\S+\\s+){0,2}?${any(['заводских'])}\\s+${any(['настроек'])}|${any(['сброс'])}\\s+(?:\\S+\\s+){0,2}?${any(['заводских'])}\\s+${any(['настроек'])})\\s*[.!]?$`, 'iu')
  }
  return ruResetSettingsRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-672 (cu-developer-one's go 08:59Z, strict English parity; the English facts are on the issue): deactivating or disabling the
// account asks delete in the locales as 'Deactivate account' / 'Disable my account' do - the verb with the account noun, its
// determiners, up to two slot words ('Désactiver mon compte Facebook'), the time adverbs and both orders. Negation, past / status
// forms, the bare verb and the verb with other objects stay free: each locale verb means both 'deactivate' and 'disable', and English
// frees 'Disable' and 'Disable notifications'. r2 (cu-developer-two, cu-developer-one 10:24Z): the Italian elided article joins the
// noun ('Disattivare l'account'). CU-680: the plural account nouns and ja / ko 'all' ask, as 'Deactivate (all) accounts' does.
const acctAdverb = '(?:\\s+(?:maintenant|définitivement|temporairement|ahora|definitivamente|temporalmente|agora|temporariamente|ora|definitivamente|temporaneamente|jetzt|dauerhaft|vorübergehend|nu|tijdelijk|permanent))?'
const acctLead = '(?:(?:temporairement|définitivement|temporalmente|definitivamente|temporariamente|temporaneamente)\\s+)?'
const LOCALE_ACCOUNT_DEACTIVATE = Object.freeze([
  new RegExp(`^${acctLead}(?:désactiver|désactivez|désactive)\\s+(?:\\S+\\s+){0,2}?comptes?(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^${acctLead}(?:desactivar|desactiva|desactive|desactivad|desactiven|deshabilitar|deshabilita|deshabilite|inhabilitar)\\s+(?:\\S+\\s+){0,2}?cuentas?(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^${acctLead}(?:desativar|desative|desativa|desativem|desabilitar|desabilite)\\s+(?:\\S+\\s+){0,2}?contas?(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^${acctLead}(?:disattiva|disattivare|disattivate|disabilita|disabilitare|disabilitate)\\s+(?:\\S+\\s+){0,2}?(?:l['’]\\s*)?account(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,2}?(?:\\S*kont(?:o|en)|accounts?)${acctAdverb}\\s+deaktivieren\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:deaktiviere|deaktiviert|deaktivieren\\s+sie)\\s+(?:\\S+\\s+){0,2}?(?:\\S*kont(?:o|en)|accounts?)(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,2}?accounts?${acctAdverb}\\s+(?:deactiveren|uitschakelen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:deactiveer|schakel)\\s+(?:\\S+\\s+){0,2}?accounts?(?:\\s+uit)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  /^(?:この|私の|あなたの|すべての|全ての)?アカウントを?(?:一時的に|今すぐ)?(?:無効にする|無効にして(?:ください)?|無効化(?:する|して(?:ください)?)?|停止(?:する|して(?:ください)?)?)\s*[.!。]?$/u,
  /^(?:내\s+|이\s+|모든\s+)?계정(?:들)?\s*(?:을|를)?\s*(?:지금\s+|일시적으로\s+)?(?:비활성화|일시\s?중지)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해)?\s*[.!]?$/u,
  /^(?:停用|禁用|冻结|凍結)(?:我的|此|该|這個|这个)?(?:账户|帐户|账号|帐号|帳戶|帳號)\s*[.!。]?$/u,
  /^(?:\S+\s+){0,2}?hesa[bp]\S*(?:\s+(?:şimdi|geçici\s+olarak|kalıcı\s+olarak))?\s+devre\s+dışı\s+(?:bırak|bırakın|bırakınız)\s*[.!]?$/iu,
])
// CU-676 (strict English parity; the English facts are on the issue): closing the account asks delete in fr / es / de / ru / ja / ko
// as 'Close account' does - the close verb with the account noun, its determiners, up to two slot words ('Fermer mon compte PayPal'),
// the time adverbs and both orders; German kündigen only with Konto / Account (cu-developer-one 13:35Z; not Abo / Vertrag); negation,
// past / status forms, the bare verb and other objects ('Fermer la fenêtre', 'Cerrar sesión') stay free.
const LOCALE_ACCOUNT_CLOSE = Object.freeze([
  new RegExp(`^${acctLead}(?:fermer|fermez|ferme|clôturer|clôturez|clôture|résilier|résiliez|résilie)\\s+(?:\\S+\\s+){0,2}?comptes?(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^${acctLead}(?:cerrar|cierra|cierre|cerrad|cierren|dar\\s+de\\s+baja|da\\s+de\\s+baja|dé\\s+de\\s+baja|den\\s+de\\s+baja)\\s+(?:\\S+\\s+){0,2}?cuentas?(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,2}?(?:\\S*kont(?:o|en)|accounts?)${acctAdverb}\\s+(?:schließen|kündigen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:schließe|schließt|schließen\\s+sie|kündige|kündigt|kündigen\\s+sie)\\s+(?:\\S+\\s+){0,2}?(?:\\S*kont(?:o|en)|accounts?)(?:\\s+\\S+)?${acctAdverb}\\s*[.!]?$`, 'iu'),
  /^(?:この|私の|あなたの|すべての|全ての)?アカウントを?(?:今すぐ|完全に)?(?:閉鎖(?:する|して(?:ください)?|します)?|解約(?:する|して(?:ください)?|します)?|閉じる|閉じて(?:ください)?|閉じます)\s*[.!。]?$/u,
  /^(?:내\s+|이\s+|모든\s+)?계정(?:들)?\s*(?:을|를)?\s*(?:(?:지금|즉시|영구적으로)\s+)?(?:(?:해지|폐쇄)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해|합니다)?|닫기|닫으세요|닫아\s?주세요|닫아\s?줘|닫으십시오|닫아요|닫아|닫습니다)\s*[.!]?$/u,
])
// CU-678 r2 (cu-developer-two, cu-developer-three 19:12Z): the Russian twin, folded - передать / передайте + право / права
// владения / собственности / владельца, or владение / собственность.
let ruTransferOwnershipRegex = null
function namesRuTransferOwnership(name) {
  if (!ruTransferOwnershipRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['передать', 'передайте', 'передай'])
    const noun = `(?:${any(['право', 'права'])}\\s+${any(['владения', 'собственности', 'владельца'])}|${any(['владение', 'собственность'])})`
    ruTransferOwnershipRegex = new RegExp(`^(?:${any(['сейчас'])}\\s+)?${verb}\\s+(?:\\S+\\s+){0,2}?${noun}(?:\\s+\\S+){0,3}?\\s*[.!]?$`, 'iu')
  }
  return ruTransferOwnershipRegex.test(normaliseName(String(name ?? '')).trim())
}
let ruAccountCloseRegex = null
function namesRuAccountClose(name) {
  if (!ruAccountCloseRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['закрыть', 'закройте', 'закрой'])
    const noun = `(?:${any(['аккаунт', 'аккаунты', 'счёт', 'счет', 'счета'])}|${any(['учётную', 'учетную'])}\\s+${any(['запись'])}|${any(['учётные', 'учетные'])}\\s+${any(['записи'])})`
    const adv = `(?:\\s+${any(['сейчас', 'навсегда'])})?`
    ruAccountCloseRegex = new RegExp(`^(?:${any(['навсегда'])}\\s+)?(?:${verb}\\s+(?:\\S+\\s+){0,2}?${noun}(?:\\s+\\S+)?${adv}|${noun}\\s+(?:\\S+\\s+){0,1}?${verb})\\s*[.!]?$`, 'iu')
  }
  return ruAccountCloseRegex.test(normaliseName(String(name ?? '')).trim())
}
let ruAccountDeactivateRegex = null
function namesRuAccountDeactivate(name) {
  if (!ruAccountDeactivateRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['деактивировать', 'деактивируйте', 'деактивируй', 'отключить', 'отключите', 'отключи'])
    const noun = `(?:${any(['аккаунт', 'аккаунты'])}|${any(['учётную', 'учетную'])}\\s+${any(['запись'])}|${any(['учётные', 'учетные'])}\\s+${any(['записи'])})`
    const adv = `(?:\\s+${any(['сейчас', 'навсегда', 'временно'])})?`
    ruAccountDeactivateRegex = new RegExp(`^(?:${any(['временно', 'навсегда'])}\\s+)?(?:${verb}\\s+(?:\\S+\\s+){0,2}?${noun}(?:\\s+\\S+)?${adv}|${noun}\\s+(?:\\S+\\s+){0,1}?${verb})\\s*[.!]?$`, 'iu')
  }
  return ruAccountDeactivateRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-673 (cu-developer-one's go 11:28Z, strict parity with the English set posted on the issue): signing out of all or other devices
// or sessions asks permission in ja / ko / zh as 'Log out of all devices' does, with the polite forms and a 'now'; the bare verb, past
// forms, negation and the single-device form stay free.
const cjkJaAll = '(?:すべての|全ての|全|他の|ほかの|その他の)(?:他の|ほかの|すべての|全ての)?'
const cjkKoAll = '(?:모든|다른)\\s?(?:모든|다른)?\\s?'
const cjkZhAll = '(?:所有|全部|其他|其它)(?:其他|其它|所有)?(?:的)?'
const cjkZhDevice = '(?:设备|裝置|設備|装置|会话|會話|工作階段)'
const cjkZhVerb = '(?:退出(?:登录|登錄)?|登出|注销|註銷)'
const CJK_SIGNOUT_ALL = Object.freeze([
  new RegExp(`^(?:今すぐ)?${cjkJaAll}(?:デバイス|端末|機器|セッション)(?:から|で)(?:今すぐ)?(?:ログアウト|サインアウト)(?:する|して(?:ください)?|します)?\\s*[.!。]?$`, 'u'),
  // r2 (cu-developer-three, cu-developer-one 11:44Z): the Korean noun-phrase form without 에서 ('모든 기기 로그아웃', as 'Log out all devices')
  new RegExp(`^(?:(?:지금|즉시)\\s+)?${cjkKoAll}(?:기기|디바이스|장치|세션)(?:에서)?\\s?(?:(?:지금|즉시)\\s+)?(?:로그아웃|로그\\s아웃)(?:하기|하세요|해\\s?주세요|해\\s?줘|하십시오|해요|해|합니다)?\\s*[.!]?$`, 'u'),
  new RegExp(`^(?:立即|现在|立刻|马上|馬上)?(?:从|從|在)?${cjkZhAll}${cjkZhDevice}(?:上|中)?${cjkZhVerb}\\s*[.!。]?$`, 'u'),
  // r2 (cu-developer-one, cu-developer-two 11:42Z): zh verb-first ('退出所有设备', '登出所有裝置', '注销其他设备'); '注销账号' stays out
  new RegExp(`^(?:立即|现在|立刻|马上|馬上)?${cjkZhVerb}${cjkZhAll}${cjkZhDevice}\\s*[.!。]?$`, 'u'),
  // CU-675 (cu-developer-one's go 12:04Z): 'Sign out everywhere' - the sign-out verb with 'everywhere' - and 'Revoke (all) sessions' -
  // the revoke / cancel verb only with the session noun (取り消す / 취소 / 撤销 also mean cancel, which English frees elsewhere)
  /^(?:今すぐ)?(?:すべての場所|全ての場所|どこでも|あらゆる場所)(?:で|から)?(?:今すぐ)?(?:ログアウト|サインアウト)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:모든\s?곳|어디서나)(?:에서)?\s?(?:(?:지금|즉시)\s+)?(?:로그아웃|로그\s아웃)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해|합니다)?\s*[.!]?$/u,
  /^(?:立即|现在|立刻|马上|馬上)?(?:在|從|从)?(?:所有地方|所有位置|任何地方|各处|各處)(?:都)?(?:退出(?:登录|登錄)?|登出|注销|註銷)\s*[.!。]?$/u,
  /^(?:今すぐ)?(?:すべての|全ての|他の|ほかの|この)?セッションを?(?:今すぐ)?(?:取り消す|取り消して(?:ください)?|取り消し|取消|失効させて(?:ください)?|失効させる|失効|無効にする|無効化)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:모든\s|다른\s|이\s)?세션\s?(?:을|를)?\s?(?:(?:지금|즉시)\s+)?(?:취소|해지|철회|무효화)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해|합니다)?\s*[.!]?$/u,
  /^(?:立即|现在|立刻|马上|馬上)?(?:撤销|撤銷|吊销|吊銷)(?:所有|全部|其他|其它|此|这个|這個)?(?:的)?(?:会话|會話|工作階段)\s*[.!。]?$/u,
])
// CU-677 (strict English parity; the English facts are on the issue): making something public asks permission in the locales as
// 'Make public' / 'Make this repository public' / 'Change visibility to public' do - the make / set verb with up to two slot words
// before 'public', or visibility changed to public, both orders, a 'now'; bare negation asks too, as "Don't make public" does in English.
// Past / status forms, the bare adjective and the make-private twins stay free.
const pubNow = '(?:\\s+(?:maintenant|ahora|agora|ora|adesso|jetzt|nu|şimdi))?'
const LOCALE_MAKE_PUBLIC = Object.freeze([
  new RegExp(`^(?:rendre|rendez|rends)\\s+(?:\\S+\\s+){0,2}?(?:public|publique|publics|publiques)(?:\\s+\\S+){0,3}?${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:définir|définissez|passer|passez|changer|changez)\\s+(?:\\S+\\s+){0,3}?(?:comme|en|à)\\s+(?:public|publique)${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:hacer|haz|haga|hagan)\\s+(?:\\S+\\s+){0,2}?(?:público|pública|públicos|públicas)(?:\\s+\\S+){0,3}?${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:establecer|establece|cambiar|cambia|cambie|configurar)\\s+(?:\\S+\\s+){0,3}?(?:como|a|en)\\s+(?:público|pública)${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:tornar|torne|torna|tornem)\\s+(?:\\S+\\s+){0,2}?(?:público|pública|públicos|públicas)(?:\\s+\\S+){0,3}?${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:definir|defina|alterar|altere|mudar|mude)\\s+(?:\\S+\\s+){0,3}?(?:como|para)\\s+(?:público|pública)${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:rendi|rendere|rendete|renda)\\s+(?:\\S+\\s+){0,2}?(?:pubblico|pubblica|pubblici|pubbliche)(?:\\s+\\S+){0,3}?${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:imposta|impostare|cambia|cambiare)\\s+(?:\\S+\\s+){0,3}?(?:come|a|su|in)\\s+(?:pubblico|pubblica)${pubNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?!nicht\\s)\\S+\\s+){0,2}?(?:jetzt\\s+)?öffentlich\\s+machen\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:mache|macht|machen\\s+sie)\\s+(?:\\S+\\s+){0,2}?öffentlich\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,2}?auf\\s+öffentlich\\s+(?:setzen|stellen|ändern|umstellen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?!niet\\s)\\S+\\s+){0,2}?(?:nu\\s+)?openbaar\\s+maken\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:maak|maakt)\\s+(?:\\S+\\s+){0,2}?openbaar\\s*[.!]?$`, 'iu'),
  /^(?:\S+\s+){0,1}?공개로\s?(?:전환|설정|변경)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|해|합니다)?\s*[.!]?$/u,
  // r2 (cu-developer-three, cu-developer-one 15:48Z): 공개하다 is the literal 'make public' (Korean 'publish' is 게시 / 발행), so its verb
  // forms ask with or without an object; 비공개 / 공개됨 / 공개 중 and past forms stay free
  /^(?:지금\s+)?(?:\S+\s+){0,2}?(?:\S+(?:을|를)\s+)?공개(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)\s*[.!]?$/u,
  new RegExp(`^(?:\\S+\\s+){0,2}?herkese\\s+açık\\s+(?:yap|yapın|yapınız|hale\\s+getir|olarak\\s+ayarla)\\s*[.!]?$`, 'iu'),
  // r3 (cu-developer-two, cu-developer-one 16:04Z, final): negation asks only bare, as English asks "Don't make public" and frees
  // "Don't make this repository public"; a negated label with an object stays free in every locale
  /^(?:ne\s+pas\s+(?:rendre|rendez|rends)|ne\s+(?:rendez|rends)\s+pas)\s+(?:public|publique)\s*[.!]?$/iu,
  /^no\s+(?:hacer|haga|hagas)\s+(?:público|pública)\s*[.!]?$/iu,
  /^(?:não|nao)\s+(?:tornar|torne|torna)\s+(?:público|pública)\s*[.!]?$/iu,
  /^non\s+(?:rendere|rendi|renda)\s+(?:pubblico|pubblica)\s*[.!]?$/iu,
  /^nicht\s+öffentlich\s+machen\s*[.!]?$/iu,
  /^niet\s+openbaar\s+maken\s*[.!]?$/iu,
  /^(?:공개|공개로\s?(?:전환|설정|변경))하지\s?마(?:세요|십시오)?\s*[.!]?$/u,
  /^herkese\s+açık\s+(?:yapma|yapmayın|yapmayınız)\s*[.!]?$/iu,
])
let ruMakePublicRegex = null
function namesRuMakePublic(name) {
  if (!ruMakePublicRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['сделать', 'сделайте', 'сделай'])
    const adj = any(['общедоступным', 'общедоступной', 'общедоступными', 'публичным', 'публичной', 'публичными'])
    ruMakePublicRegex = new RegExp(`^(?:${verb}\\s+(?:\\S+\\s+){0,2}?${adj}(?:\\s+${any(['сейчас'])})?|${any(['не'])}\\s+${any(['делать', 'делайте', 'сделать'])}\\s+${adj})\\s*[.!]?$`, 'iu')
  }
  return ruMakePublicRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-684 (strict English parity; the English facts are on the issue): leaving a workspace / organization / team / server asks
// permission in the locales as 'Leave workspace' / 'Leave organization' do - the leave verb with that noun, its determiner, one name slot
// and a 'now' (design 21:17Z: it uscire da / area di lavoro, de austreten aus / Workspace, ja 離れる). Team and server ask as 'Leave team' /
// 'Leave server' do in English. 'Project' stays free as in English; negation, past / status, the bare verb and other objects stay free.
const leaveNow = '(?:\\s+(?:maintenant|ahora|agora|ora|adesso|jetzt|nu|şimdi))?'
const LOCALE_LEAVE_WORKSPACE = Object.freeze([
  new RegExp(`^(?:quitter|quittez|quitte)\\s+(?:l['’]|le\\s+|la\\s+|cet(?:te)?\\s+|ce\\s+|mon\\s+|ma\\s+|votre\\s+)?(?:\\S+\\s+)?(?:espace\\s+de\\s+travail|organisation|équipe|serveur)(?:\\s+\\S+)?${leaveNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:salir|sal|salga|abandonar|abandona|abandone)(?:\\s+(?:de|del))?\\s+(?:el\\s+|la\\s+|este\\s+|esta\\s+|mi\\s+|su\\s+)?(?:\\S+\\s+)?(?:espacio\\s+de\\s+trabajo|organización|equipo|servidor)(?:\\s+\\S+)?${leaveNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:sair|saia|deixar|deixe)(?:\\s+(?:de|do|da))?\\s+(?:o\\s+|a\\s+|este\\s+|esta\\s+|meu\\s+|minha\\s+)?(?:\\S+\\s+)?(?:espaço\\s+de\\s+trabalho|organização|equipe|equipa|servidor)(?:\\s+\\S+)?${leaveNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:lascia|lasciare|abbandona|abbandonare|(?:esci|uscire|uscite)\\s+da(?:llo|lla|l|ll['’]\\s*)?)\\s*(?:lo\\s+|la\\s+|il\\s+|l['’]|questo\\s+|questa\\s+)?(?:\\S+\\s+)?(?:spazio\\s+di\\s+lavoro|area\\s+di\\s+lavoro|organizzazione|team|server)(?:\\s+\\S+)?${leaveNow}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?:den|die|das|diesen|diese|dieses|meinen|meine|mein)\\s+)?(?:\\S+\\s+)?(?:\\S*arbeitsbereich|workspace|organisation|team|server)(?:\\s+jetzt)?\\s+verlassen\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:jetzt\\s+)?aus\\s+(?:der|dem|diesem|dieser|meinem|meiner)?\\s*(?:\\S+\\s+)?(?:\\S*arbeitsbereich|workspace|organisation|team)\\s+austreten\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:treten\\s+sie|trete|tritt)\\s+aus\\s+(?:der|dem|diesem|dieser)?\\s*(?:\\S+\\s+)?(?:\\S*arbeitsbereich|workspace|organisation|team)\\s+aus\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:verlasse|verlassen\\s+sie)\\s+(?:den\\s+|die\\s+|das\\s+|diesen\\s+|diese\\s+|dieses\\s+)?(?:\\S+\\s+)?(?:\\S*arbeitsbereich|workspace|organisation|team|server)(?:\\s+\\S+)?\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?:de|het|deze|dit|mijn)\\s+)?(?:\\S+\\s+)?(?:werkruimte|organisatie|team|server)(?:\\s+nu)?\\s+verlaten\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:verlaat)\\s+(?:de\\s+|het\\s+|deze\\s+|dit\\s+)?(?:\\S+\\s+)?(?:werkruimte|organisatie|team|server)\\s*[.!]?$`, 'iu'),
  /^(?:今すぐ)?(?:この)?(?:\S+の)?(?:ワークスペース|組織|チーム|サーバー)(?:から|を)?(?:今すぐ)?(?:(?:退出|脱退|離脱)(?:する|して(?:ください)?|します)?|離れる|離れて(?:ください)?|離れます)\s*[.!。]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:이\s+)?(?:\S+\s+)?(?:작업\s?공간|워크스페이스|조직|팀|서버)(?:에서|을|를)?\s?(?:나가기|나가세요|나가|탈퇴(?:하기|하세요|해\s?주세요|해|합니다)?)\s*[.!]?$/u,
  /^(?:立即|马上|現在|现在)?(?:退出|离开|離開)(?:此|该|這個|这个)?(?:\S{0,8}的)?(?:工作区|工作區|组织|組織|团队|團隊|服务器|伺服器)\s*[.!。]?$/u,
  new RegExp(`^(?:bu\\s+)?(?:\\S+\\s+)?(?:çalışma\\s+alanından|kuruluştan|organizasyondan|ekipten|takımdan|sunucudan)\\s+(?:şimdi\\s+)?(?:ayrıl|ayrılın|çık|çıkın)\\s*[.!]?$`, 'iu'),
])
let ruLeaveWorkspaceRegex = null
function namesRuLeaveWorkspace(name) {
  if (!ruLeaveWorkspaceRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verbAcc = any(['покинуть', 'покиньте'])
    const verbFrom = `${any(['выйти', 'выйдите', 'выйди'])}\\s+${any(['из'])}`
    const nounAcc = `(?:${any(['рабочее'])}\\s+${any(['пространство'])}|${any(['организацию', 'команду', 'сервер'])})`
    const nounGen = `(?:${any(['рабочего'])}\\s+${any(['пространства'])}|${any(['организации', 'команды', 'сервера'])})`
    ruLeaveWorkspaceRegex = new RegExp(`^(?:${verbAcc}\\s+(?:\\S+\\s+)?${nounAcc}|${verbFrom}\\s+(?:\\S+\\s+)?${nounGen})(?:\\s+\\S+)?(?:\\s+${any(['сейчас'])})?\\s*[.!]?$`, 'iu')
  }
  return ruLeaveWorkspaceRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-678 (cu-developer-one's design 16:57Z, strict English parity): transferring ownership asks permission - English 'Transfer <slot>
// ownership' ('Transfer repository / team ownership', which asked purchase only) and the locale twins: the transfer verb with the
// ownership noun, up to two slot words before it, an object or recipient after it ('… to X', '… of this repository'). The es / pt / it
// purchase from the 'transfer' word stays (removing it is CU-609's rule-1). Negation, past / status forms and the bare noun stay free.
const ownTail = '(?:\\s+\\S+){0,4}?'
const TRANSFER_OWNERSHIP = Object.freeze([
  new RegExp(`^transfer\\s+(?:\\S+\\s+){1,2}?ownership${ownTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:transférer|transférez|transfère)\\s+(?:\\S+\\s+){0,2}?propriété${ownTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:transferir|transfiere|transfiera|transfira|transfere)\\s+(?:\\S+\\s+){0,2}?(?:propiedad|propriedade|titularidad)${ownTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:trasferisci|trasferire|trasferite|trasferisca)\\s+(?:\\S+\\s+){0,2}?proprietà${ownTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,4}?\\S*(?:eigentümerschaft|inhaberschaft|eigentum|besitzrechte)(?:\\s+(?!(?:wurde|wurden|ist|sind|wird|werden|nicht|kein|keine)(?:\\s|$))\\S+){0,3}?\\s+übertragen\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:übertrage|überträgt|übertragen\\s+sie)\\s+(?:\\S+\\s+){0,2}?\\S*(?:eigentümerschaft|inhaberschaft|eigentum)${ownTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:\\S+\\s+){0,4}?eigendom(?:\\s+(?!(?:is|werd|wordt|niet|geen)(?:\\s|$))\\S+){0,3}?\\s+overdragen\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:draag|draagt)\\s+(?:\\S+\\s+){0,2}?eigendom(?:\\s+\\S+){0,3}?\\s+over\\s*[.!]?$`, 'iu'),
  /^(?:\S+\s*){0,3}?所有権を?(?:\S+\s*){0,2}?(?:譲渡|移転|移管)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:\S+\s+){0,2}?소유권\s*(?:을|를)?\s*(?:\S+\s+){0,2}?(?:이전|양도)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:立即|马上|馬上|现在)?(?:转移|转让|轉移|轉讓)(?:\S{0,8}?)(?:的)?所有权\S{0,10}$/u,
  /^(?:\S+\s*){0,4}?所有权(?:转移|转让)(?:给\S{1,10})?\s*[.!。]?$/u,
  new RegExp(`^(?:\\S+\\s+){0,3}?sahipli[gğ]\\S*(?:\\s+\\S+){0,2}?\\s+(?:devret|devredin|devredil?iniz|devrediniz)\\s*[.!]?$`, 'iu'),
])
// CU-686 (strict English parity; the English facts are on the issue): removing a member asks delete in fr / ko as 'Remove member' does -
// fr retirer + the member / user noun or '… de l'équipe / du groupe', ko 제거 with the member / user noun or '팀 / 그룹에서'; fr 'Exclure
// le membre' asks permission as 'Kick member' does; the bare remove verbs ask as bare 'Remove' does (corrected go 23:45Z);
// negation, past / status forms and the bare nouns stay free.
const LOCALE_REMOVE_MEMBER = Object.freeze([
  // corrected go (cu-developer-one 23:45Z): English bare 'Remove' asks delete, so the bare remove verbs ask too (the fr withdraw-money
  // homograph is consent-sensitive anyway)
  /^(?:retirer|retirez|retire|quitar|quita|quite)\s*[.!]?$/iu,
  // r2 (cu-developer-three, cu-developer-one 00:19Z): es quitar + the member noun, as English 'Remove member'; fr bare 'Retire' and es bare
  // 'Quitar' join the bare remove verbs
  /^(?:quitar|quita|quite|quiten)\s+(?:a\s+|al\s+|a\s+los\s+|a\s+las\s+)?(?:\S+\s+){0,2}?(?:miembros?|usuarios?|usuarias?|participantes?|colaboradore?s?)(?:\s+\S+){0,3}?\s*[.!]?$/iu,
  /^(?:quitar|quita|quite)\s+(?:\S+\s+){0,2}?(?:del|de\s+la|de\s+los)\s+(?:equipo|grupo|espacio(?:\s+de\s+trabajo)?|organización|proyecto|canal|servidor)(?:\s+\S+)?\s*[.!]?$/iu,
  /^(?:제거|삭제)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:retirer|retirez|retire)\s+(?:\S+\s+){0,2}?(?:l['’]\s*)?(?:membres?|utilisateurs?|utilisatrices?|participants?|participantes?|collaborateurs?|collaboratrices?)(?:\s+\S+){0,3}?\s*[.!]?$/iu,
  /^(?:retirer|retirez|retire)\s+(?:\S+\s+){0,2}?(?:de\s+l['’]\s*|du\s+|de\s+la\s+|des\s+)(?:équipe|groupe|espace(?:\s+de\s+travail)?|organisation|projet|canal|serveur)(?:\s+\S+)?\s*[.!]?$/iu,
  /^(?:(?:지금|즉시)\s+)?(?:이\s+|모든\s+)?(?:\S+\s+)?(?:구성원|멤버|사용자|참가자|회원)(?:들)?\s*(?:을|를)?\s*(?:(?:지금|즉시)\s+)?제거(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:\S+\s+)?(?:팀|그룹|작업\s?공간|조직|채널|서버|프로젝트)에서\s+(?:\S+\s+)?제거(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
])
const LOCALE_KICK_MEMBER = Object.freeze([
  /^(?:exclure|excluez|exclus)\s+(?:\S+\s+){0,2}?(?:l['’]\s*)?(?:membres?|utilisateurs?|participants?)(?:\s+\S+){0,3}?\s*[.!]?$/iu,
])
// CU-683 (strict English parity; the English facts are on the issue): revoking access asks permission in the locales as 'Revoke access'
// / 'Revoke permissions' do - the revoke verb with the access or permission noun, both orders, a 'for X' / possessive slot, 'all' and a
// 'now'. Cancel-sense verbs (取り消す / 취소 / 撤销) count only with the noun, as in CU-675; remove-sense verbs (retirer, 削除, kaldır) are
// left out, since English 'Remove access' asks delete, not permission. Negation, past / status and bare nouns stay free.
const revokeTail = '(?:\\s+\\S+){0,3}?'
const LOCALE_REVOKE_ACCESS = Object.freeze([
  new RegExp(`^(?:révoquer|révoquez|révoque)\\s+(?:\\S+\\s+){0,2}?(?:l['’]\\s*)?(?:accès|autorisations?|permissions?)${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:révoquer|révoquez|révoque)\\s+(?:l['’])(?:accès)${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:revocar|revoca|revoque|revoquen)\\s+(?:\\S+\\s+){0,2}?(?:acceso|accesos|permisos?|autorizaci[oó]n(?:es)?)${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:revogar|revogue|revoga)\\s+(?:\\S+\\s+){0,2}?(?:acesso|acessos|permiss[aã]o|permiss[oõ]es|autoriza[cç][aã]o)${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:revoca|revocare|revocate)\\s+(?:\\S+\\s+){0,2}?(?:l['’]\\s*)?(?:accesso|accessi|autorizzazion[ei]|permess[oi])${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?:den|die|alle|ihren|seinen|meinen)\\s+)?(?:\\S+\\s+)?(?:\\S*zugriff|\\S*zugang|\\S*berechtigung(?:en)?|zugriffsrechte)(?:\\s+(?!(?:wurde|wurden|ist|sind|wird|nicht)(?:\\s|$))\\S+){0,2}?\\s+(?:widerrufen|entziehen|zurückziehen)\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:widerrufen\\s+sie|widerrufe|entziehen\\s+sie|entziehe)\\s+(?:\\S+\\s+){0,2}?(?:\\S*zugriff|\\S*zugang|\\S*berechtigung(?:en)?)${revokeTail}\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:(?:de|alle|zijn|haar|mijn)\\s+)?(?:\\S+\\s+)?(?:toegang|machtigingen?|rechten|toestemming)(?:\\s+(?!(?:is|werd|wordt|niet)(?:\\s|$))\\S+){0,2}?\\s+intrekken\\s*[.!]?$`, 'iu'),
  new RegExp(`^(?:trek)\\s+(?:\\S+\\s+){0,2}?(?:toegang|machtigingen?|rechten)(?:\\s+\\S+){0,2}?\\s+in\\s*[.!]?$`, 'iu'),
  /^(?:今すぐ)?(?:すべての|全ての)?(?:\S+の)?(?:アクセス(?:権(?:限)?)?|権限)を?(?:今すぐ)?(?:取り消す|取り消して(?:ください)?|取り消し|取消|無効にする|無効化|剥奪|はく奪)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:모든\s+)?(?:\S+\s+)?(?:액세스|접근|액세스\s?권한|접근\s?권한|권한)\s*(?:을|를)?\s*(?:(?:지금|즉시)\s+)?(?:취소|철회|해제|회수|박탈)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:立即|马上|馬上|现在)?(?:撤销|撤銷|吊销|吊銷|收回|取消)(?:\S{0,8}?的)?(?:所有|全部)?(?:访问权限|訪問權限|访问权|存取權(?:限)?|访问|权限|權限|授权|授權)\s*[.!。]?$/u,
  // go (cu-developer-one 22:32Z): English bare 'Revoke' asks, so the unambiguous bare revoke verbs ask too; the cancel-sense verbs
  // (取り消す / 취소 / 撤销 / iptal et) stay noun-bound
  new RegExp(`^(?:révoquer|révoquez|revocar|revoque|revogar|revogue|revocare|revoca|widerrufen|intrekken)${pubNow}\\s*[.!]?$`, 'iu'),
  // r2 (cu-developer-two, cu-developer-one 22:58Z): /iu does not fold the Turkish dotted capital İ, so it is listed here and the
  // wiring below also tests the name with İ folded to i (all-caps Turkish, 'TÜM İZİNLERİ GERİ AL')
  new RegExp(`^(?:tüm\\s+|bütün\\s+)?(?:\\S+\\s+)?(?:erişimi|erişimini|[iİ]zinleri|[iİ]zinlerini|yetkiyi|yetkileri)\\s+(?:şimdi\\s+)?(?:[iİ]ptal\\s+et|[iİ]ptal\\s+edin|geri\\s+al|geri\\s+alın)\\s*[.!]?$`, 'iu'),
])
let ruRevokeAccessRegex = null
function namesRuRevokeAccess(name) {
  if (!ruRevokeAccessRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['отозвать', 'отзовите', 'отзови'])
    const noun = any(['доступ', 'разрешения', 'разрешение', 'права', 'полномочия'])
    ruRevokeAccessRegex = new RegExp(`^(?:${any(['сейчас'])}\\s+)?${verb}(?:\\s+(?:\\S+\\s+){0,2}?${noun}(?:\\s+\\S+){0,3}?)?\\s*[.!]?$`, 'iu')
  }
  return ruRevokeAccessRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-687 (strict English parity; the English facts are on the issue): granting access, sharing with everyone and inviting ask permission
// in ja / ko (and zh grant) as 'Grant access', 'Share with everyone' and 'Invite member' do - grant only with the access / permission noun
// (bare 'Grant' is free in English); share with 'everyone' / a link and invite with a person noun. Past / status forms stay free.
const CJK_GRANT_SHARE_INVITE = Object.freeze([
  // go (cu-developer-one 02:33Z): English bare 'Share' / 'Invite' ask, so the bare ja / ko share and invite forms ask; invite negation
  // asks ("Don't invite member" asks); share negation and bare grant stay free
  /^(?:共有|シェア|招待)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:공유|초대)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:\S+\s*)?(?:(?:メンバー|ユーザー|友達|友だち|人)を?)?招待(?:しない(?:で(?:ください)?)?|しないでください)\s*[.!。]?$/u,
  /^(?:\S+\s+)?(?:(?:멤버|구성원|사용자|친구|팀원|사람)(?:들)?\s*(?:을|를)?\s*)?초대(?:하지\s?마(?:세요|십시오)?|하지\s?않기)\s*[.!]?$/u,
  /^(?:今すぐ)?(?:\S+に)?(?:アクセス(?:権(?:限)?)?|権限)を?(?:許可|付与)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:(?:지금|즉시)\s+)?(?:\S+에게\s+)?(?:(?:액세스|접근)\s?(?:권한)?|권한)\s*(?:을|를)?\s*(?:부여|허용)(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:立即)?(?:授予|授权|授權|给予)(?:\S{0,8})?(?:访问权限|訪問權限|访问权|存取權(?:限)?|权限|權限)\s*[.!。]?$/u,
  /^(?:全員|すべてのユーザー|みんな)と(?:共有|シェア)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:リンクを)(?:共有|シェア)(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:모든\s?사용자|모두|전체)(?:와|과|에게)\s?공유(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^링크\s?(?:를\s?)?공유(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
  /^(?:\S+\s*)?(?:メンバー|ユーザー|友達|友だち|人)(?:を)?招待(?:する|して(?:ください)?|します)?\s*[.!。]?$/u,
  /^(?:\S+\s+)?(?:멤버|구성원|사용자|친구|팀원|사람)(?:들)?\s*(?:을|를)?\s*초대(?:하기|하세요|해\s?주세요|해\s?줘|하십시오|해요|합니다)?\s*[.!]?$/u,
])
let ruGrantShareInviteRegex = null
function namesRuGrantShareInvite(name) {
  if (!ruGrantShareInviteRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const grant = `${any(['предоставить', 'предоставьте', 'дать', 'дайте', 'выдать'])}\\s+(?:\\S+\\s+){0,2}?${any(['доступ', 'разрешение', 'разрешения', 'права'])}(?:\\s+\\S+){0,2}?`
    const share = `${any(['поделиться', 'поделитесь', 'поделись'])}(?:\\s+(?:${any(['со'])}\\s+${any(['всеми'])}|${any(['ссылкой'])}))?`
    const invite = `(?:${any(['пригласить', 'пригласите', 'пригласи'])}|${any(['не'])}\\s+${any(['приглашать', 'приглашайте'])})(?:\\s+(?:\\S+\\s+)?${any(['участника', 'участников', 'друга', 'друзей', 'пользователя', 'пользователей', 'людей'])})?`
    ruGrantShareInviteRegex = new RegExp(`^(?:${grant}|${share}|${invite})\\s*[.!]?$`, 'iu')
  }
  return ruGrantShareInviteRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-655: the Russian twin ('Очистить корзину', 'Очистите корзину', 'Корзину очистить', with 'не' as negation) is built from folded
// words on first use: a judged name has passed normaliseText, which folds Cyrillic homoglyphs to Latin case by case, so each word
// is folded as written, capitalised and in capitals, as namesWord does for its Cyrillic entries.
let ruTrashEmptyRegex = null
function namesRuTrashEmpty(name) {
  if (!ruTrashEmptyRegex) {
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))].map(escapeRegExp)
    const any = (words) => `(?:${words.flatMap(folds).join('|')})`
    const verb = any(['очистить', 'очисти', 'очистите', 'очищать', 'очищай', 'очищайте'])
    const noun = any(['корзину'])
    // r2 (cu-developer-three): the cart's noun in the singular too ('корзину заказа').
    const cart = any(['покупок', 'покупки', 'товаров', 'товара', 'заказов', 'заказа', 'магазина'])
    // r3 (cu-developer-three): the named-cart exclusion sits right after the noun in both orders ('Корзину покупок очистить').
    ruTrashEmptyRegex = new RegExp(`^(?:${any(['не'])}\\s+)?(?:${verb}\\s+(?:\\S+\\s+){0,4}?${noun}(?!\\s+${cart})(?=\\s|$|[.!])|${noun}(?!\\s+${cart})\\s+(?:\\S+\\s+){0,4}?${verb}(?=\\s|$|[.!]))`, 'iu')
  }
  // The name is compared after normaliseName too, as namesTrashFolded compares it.
  return ruTrashEmptyRegex.test(normaliseName(String(name ?? '')).trim())
}
// CU-641 r3: the objects 'Wis' clears without deleting, as English 'Clear ...' stays free for them.
const WIS_CLEAR_OBJECTS = new Set(['zoekopdracht', 'zoekopdrachten', 'zoekveld', 'zoektermen', 'zoekterm', 'filter', 'filters', 'selectie', 'formulier', 'invoer',
  'veld', 'velden', 'tekst', 'cache', 'melding', 'meldingen', 'notificaties', 'opmaak', 'markering', 'markeringen', 'zoekbalk'])
const IMPERATIVE_NEVER = new Set(['para'])
// The determiners an imperative may take instead of the entry's own ('le compte' / 'votre compte' / 'ton compte'), FR / ES / PT
// / IT / DE; optional, at most two ('il vostro'), at the entry's determiner positions and right after the verb.
const IMPERATIVE_DETERMINERS = ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'votre', 'vos', 'ton', 'ta', 'tes', 'mon', 'ma', 'mes', 'notre', 'nos', 'leur',
  'leurs', 'ce', 'cet', 'cette', 'ces', 'el', 'los', 'las', 'unos', 'unas', 'tu', 'tus', 'su', 'sus', 'mi', 'mis', 'vuestra', 'vuestro', 'vuestras', 'vuestros',
  'nuestra', 'nuestro', 'nuestras', 'nuestros', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'o', 'a', 'os', 'as', 'um', 'uma', 'seu', 'sua', 'seus', 'suas',
  'teu', 'tua', 'meu', 'minha', 'vosso', 'vossa', 'nosso', 'nossa', 'esse', 'essa', 'il', 'lo', 'i', 'gli', 'uno', 'tuo', 'tuoi', 'tue', 'suo', 'mio', 'mia',
  'vostro', 'vostra', 'nostro', 'nostra', 'questo', 'questa', 'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'dein', 'deine', 'deinen', 'euer',
  'eure', 'euren', 'ihr', 'ihre', 'ihren', 'unser', 'unsere', 'unseren', 'mein', 'meine', 'meinen', 'diese', 'dieses', 'diesen',
  // CU-641: Dutch, with the reflexive je / u of a separable verb ('Meld je af', 'Schrijf u uit').
  'de', 'het', 'een', 'je', 'jouw', 'uw', 'mijn', 'onze', 'ons', 'deze', 'dit', 'jullie', 'hun', 'u', 'zich', 'alle',
  // CU-648: Russian possessives and demonstratives ('Удалите свой аккаунт', 'Оформите ваш заказ').
  'свой', 'свою', 'своё', 'свое', 'свои', 'ваш', 'вашу', 'ваше', 'ваши', 'мой', 'мою', 'моё', 'мое', 'мои', 'твой', 'твою', 'этот', 'эту', 'это', 'эти']
const GERMAN_INFINITIVES = new Set(Object.keys(IMPERATIVE_FORMS).filter((verb) => /n$/.test(verb) && IMPERATIVE_FORMS[verb].some((form) => form.endsWith(' sie') || / u(\|\S+)?$/.test(form) || form.includes('|'))))
/** Every form a verb token may take (its own lemma or lemmas, and their forms), or null when it is no table verb. */
function imperativeFamily(token) {
  const family = new Set()
  for (const [lemma, forms] of Object.entries(IMPERATIVE_FORMS)) if (lemma === token || forms.includes(token)) [lemma, ...forms].forEach((form) => family.add(form))
  return family.size ? family : null
}
/** The imperative variants of one entry, as token lists ('¦' an optional determiner slot); [] when its verb has no table. */
function imperativeVariants(entry) {
  if (/[~^\u2026]/.test(entry)) return []
  const tokens = []
  for (const raw of entry.toLowerCase().replace(/\u2019/g, "'").split(/\s+/)) {
    if (raw === '_' || IMPERATIVE_DETERMINERS.includes(raw)) tokens.push('¦')
    else if (/^l'./.test(raw)) tokens.push('¦', raw.slice(2))
    else tokens.push(raw)
  }
  const variants = []
  // A 'verb|particle' form (Dutch separable) puts its particle after the object, or before an infinitive-first entry's complement.
  const split = (form) => form.includes('|') ? form.split('|') : [form, null]
  const lead = imperativeFamily(tokens[0])
  const last = tokens[tokens.length - 1]
  if (tokens.length === 1) {
    for (const form of lead || []) {
      if (form === tokens[0] || IMPERATIVE_NEVER.has(form)) continue
      const [verb, particle] = split(form)
      if (IMPERATIVE_OBJECT_ONLY.has(verb)) continue
      if (IMPERATIVE_BARE_COLLISIONS.has(verb)) variants.push(['^', verb, '¦!'])
      else variants.push(particle ? [verb, '¦', particle] : [verb])
    }
  } else if (lead) {
    const rest = tokens.slice(1)
    for (const form of lead) {
      if (form === tokens[0] || IMPERATIVE_NEVER.has(form)) continue
      const [verb, particle] = split(form)
      variants.push([verb, ...(rest[0] === '¦' ? [] : ['¦']), ...(particle ? [particle] : []), ...rest])
    }
  } else if (GERMAN_INFINITIVES.has(last)) {
    const object = tokens.slice(0, -1)
    for (const form of IMPERATIVE_FORMS[last]) {
      if (IMPERATIVE_NEVER.has(form)) continue
      const [verb, particle] = split(form)
      variants.push([verb, ...(object[0] === '¦' ? [] : ['¦']), ...object, ...(particle ? [particle] : [])])
    }
  }
  return variants
}
/** One compiled pattern per class over every entry's variants, built on first use (normaliseName is defined further down). */
class ImperativePattern {
  constructor(entries) { this.entries = entries }
  get regex() {
    if (this.compiled) return this.compiled
    // CU-648: a judged name has passed normaliseText, which folds homoglyphs case by case ('Удалите' -> 'Yдaлитe', 'УДАЛИТЕ' ->
    // 'YДAЛИTE'), so each word is folded as written, capitalised and in capitals, as namesWord does for its Cyrillic entries.
    const folds = (word) => [...new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form))))]
    const alternatives = (word) => { const forms = folds(word).map((form) => form.split(' ').map(escapeRegExp).join('[\\s-]+')); return forms.length > 1 ? `(?:${forms.join('|')})` : forms[0] }
    const dets = [...new Set(IMPERATIVE_DETERMINERS.flatMap(folds))].map(escapeRegExp).join('|')
    const slot = `(?:(?:${dets})[\\s-]+|l'\\s*){0,2}`
    const sources = new Set()
    const anchored = new Set()
    this.leads = new Set()
    const NOW = ['jetzt', 'sofort', 'gleich', 'ora', 'subito', 'adesso', 'ahora', 'ya', 'agora', 'já', 'maintenant', 'immédiatement']
    const determiner = `(?:(?:${dets})[\\s-]+\\p{L}|l'\\s*\\p{L}|(?:${NOW.map(escapeRegExp).join('|')})(?:[^\\p{L}]|$))`
    for (const entry of this.entries) {
      for (const variant of imperativeVariants(entry)) {
        // '^' form '¦!': a bare collision, first in the label and followed by a determiner or a 'now' adverb (the imperative-only context).
        for (const form of folds(variant[0] === '^' ? variant[1] : variant[0])) this.leads.add(form.split(' ')[0])
        if (variant[0] === '^') { anchored.add(`${alternatives(variant[1])}[\\s-]+${determiner}`); continue }
        let source = ''
        variant.forEach((token, index) => {
          if (token === '¦') { if (index < variant.length - 1) source += slot; return }
          source += alternatives(token)
          if (index < variant.length - 1) source += '[\\s-]+'
        })
        sources.add(source)
      }
    }
    this.anchored = anchored.size ? new RegExp(`^(?:${[...anchored].join('|')})`, 'u') : /(?!)/
    this.compiled = sources.size ? new RegExp(`(^|[^\\p{L}])(?:${[...sources].join('|')})([^\\p{L}]|$)`, 'u') : /(?!)/
    return this.compiled
  }
  // Most names hold no table verb form: a word lookup first keeps the big pattern off them.
  test(text) {
    const regex = this.regex
    if (!text.split(/[^\p{L}]+/u).some((word) => this.leads.has(word))) return false
    return regex.test(text) || this.anchored.test(text)
  }
}
const IMPERATIVES = Object.freeze(Object.fromEntries(['purchase', 'delete', 'submit', 'permission'].map((cls) => [cls, new ImperativePattern(LOCALE_WORDS[cls])])))
/** For the CU-638 parity test: each class's entries with one plain label per variant (the slots left empty). */
export function imperativeParityRows() {
  return Object.entries(IMPERATIVES).flatMap(([cls, pattern]) => pattern.entries.flatMap((entry) => imperativeVariants(entry).map((variant) => variant[0] === '^'
    ? { cls, entry, label: `${variant[1]} ${/^(?:pag|acquist|trasfer)/.test(variant[1]) ? 'il conto' : 'il messaggio'}`, collision: variant[1] }
    : { cls, entry, label: variant.filter((token) => token !== '¦').join(' ') })))
}

const WORDS = Object.freeze({
  // CU-498 (High; cu-coordinator 12:21Z): a direct debit mandate pulls money from the account (purchase), anywhere.
  // (a separate line so the purchase list below stays as it was)
  purchase: ['set up direct debit', 'set up a direct debit', 'authorize direct debit', 'authorise direct debit', 'authorize a direct debit', 'authorise a direct debit', 'buy', 'pay', 'order', 'place order', 'checkout', 'check out', 'subscribe', 'donate', 'purchase', 'transfer', 'withdraw', 'wire', 'send money',
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
    // CU-628 (cu-researcher): terminate / stop a subscription, membership or plan, as 'End subscription' / 'End membership' ask.
    'terminate subscription', 'terminate my subscription', 'terminate membership', 'terminate my membership', 'terminate plan', 'terminate my plan',
    'stop subscription', 'stop my subscription', 'stop membership', 'stop my membership', 'stop my plan', 'stop plan',
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
    'renew plan', ...ZH_WORDS.purchase, ...LOCALE_WORDS.purchase, IMPERATIVES.purchase],
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
    'revert to saved', 'revert all changes', ...ZH_WORDS.delete, ...LOCALE_WORDS.delete, IMPERATIVES.delete],
  permission: ['share', 'invite', 'permission', 'permissions', 'api key', 'grant access', 'make public', 'security', 'revoke',
    // CU-496 (High; cu-coordinator 11:21Z): approving an access request lets another person in (raises the older submit 'approve').
    'approve access request', 'approve access', 'approve the access request',
    // #669 round 2 (cu-researcher 11:33Z): an emergency-access request too.
    'approve emergency access request', 'approve emergency access', 'grant emergency access',
    // #661 round 2 (prepared; cu-developer-three 10:38Z): approving a sign-in grants an outside session access - permission, which is never
    // pre-approved, so an MFA-fatigue push cannot ride an earlier submit 'always' (raises the older submit row; D-108 allows a raise).
    'approve sign-in', 'approve sign in', 'approve signin', 'approve login', 'approve log in', 'approve log-in', 'approve this sign-in', 'approve this login',
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
    // CU-396 (cu-researcher; supersedes #462 with cu-developer-one's go; cu-coordinator's 03:58Z class): presenting,
    // broadcasting, streaming, recording others and calling back reach other people like 'Share screen' and 'Call'. A bare
    // 'Present' (slide apps), 'Presenter view', 'Stop recording' and 'Live captions' stay free.
    'present now', 'present a tab', 'present a window', 'present your screen', 'present entire screen', 'present to everyone',
    'go live', 'go live now', 'start broadcast', 'start broadcasting', 'start streaming', 'start stream', 'start livestream',
    'start live stream', 'start live', 'start recording', 'record meeting', 'record this meeting', 'call back', 'call them back',
    // r2 (cu-developer-two / -three): Meet's and Teams' 'Start presenting', screen recording, and the 'return call' twin of
    // 'call back'. Slide apps' 'Start slideshow' / 'Play slideshow' stay free.
    'start presenting', 'start screen recording', 'start screen share', 'start sharing screen', 'record screen', 'return call',
    'return the call', 'return their call', 'call back now',
    // CU-389 (cu-researcher): widening who can reach a document or space - general access and join settings.
    'anyone can edit', 'anyone can view', 'anyone can comment', 'everyone can edit', 'everyone can view',
    'anyone with the link', 'anyone on the web', 'anyone on the internet', 'public on the web',
    'make editor', 'make an editor', 'make collaborator', 'allow anyone to join', 'allow everyone to join', 'allow guests to join', 'let anyone join',
    // CU-408: adding a payee widens who can be paid.
    'add payee', 'add a payee', 'add recipient', 'add beneficiary',
    // CU-401: leaving a shared space or unlinking an account.
    'leave workspace', 'leave organization', 'leave organisation', 'leave org', 'leave team', 'leave server', 'unlink account',
    // CU-399 (cu-coordinator 05:02Z, 10 Nov; rebuilt from #469 on 17 Nov): Mail's Apply Rules runs rules that may delete,
    // forward or run a script.
    'apply rules', 'apply rules now', 'run rules', 'run rules now', 'run all rules', // r3 (cu-developer-two 03:06Z): Outlook's 'Run rules now'
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
      'less secure apps', 'less secure app access'].map((what) => `${verb} ${what}`)), ...ZH_WORDS.permission, ...LOCALE_WORDS.permission, IMPERATIVES.permission],
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
    // CU-635 (cu-developer-two): opting out of / stopping / turning off e-mails, as 'Unsubscribe (from our emails)'; a bare 'Opt
    // out' stays free (cu-developer-one's ruling).
    'opt out of emails', 'opt out of _ emails', 'opt out of marketing emails', 'opt out of email', 'opt-out of emails', 'opt out of newsletters',
    'stop emails', 'stop all emails', 'stop marketing emails', 'stop _ emails', 'turn off emails', 'turn off marketing emails', 'turn off all emails',
    // cu-researcher on #98: a cancellation goes to every attendee.
    'cancel meeting', 'cancel event', 'cancel invitation', 'send cancellation',
    // CU-286 (cu-researcher's real-app wordings): a request to join a meeting, and Slack's huddle (a call to the channel).
    'ask to join', 'start huddle', 'start a huddle', 'join huddle',
    // CU-288: a tax filing goes to the authority.
    'file return', 'file tax return', 'file your return', 'file my return', 'e-file', 'efile', 'submit return', 'submit tax return',
    // CU-432: the English phrases below lived in ZH_WORDS.submit until 17 Nov; moved here unchanged (no behaviour change -
    // ZH_WORDS.submit is spread into this same list, and namesWord picks each entry's boundary by its own letters).
    // CU-421: running a script.
    'run script', 'run the script',
    // CU-422: civic, legal and employment acts in the owner's name.
    'cast ballot', 'cast your ballot', 'cast vote', 'sign petition', 'sign the petition', 'quit job', 'quit my job', 'decline offer',
    'accept offer', 'apply now', 'enroll now', 'submit vote',
    // CU-430: accepting an airline's new itinerary or schedule change binds the trip.
    'accept new itinerary', 'accept the new itinerary', 'accept schedule change', 'accept the schedule change', 'accept itinerary change',
    // CU-428: listing or relisting an item and accepting a return bind a sale.
    'list now', 'list it now', 'relist', 'relist item', 'accept return', 'accept the return',
    ...ZH_WORDS.submit, ...LOCALE_WORDS.submit, IMPERATIVES.submit],
})
// CU-377 follow-up: the file browsers whose rows are files (the same set as app-policy's FILE_BROWSERS).
const FILE_BROWSER_APPS = new Set(['com.apple.finder', 'com.cocoatech.PathFinder', 'com.binarynights.ForkLift-3', 'com.binarynights.ForkLift', 'com.eltima.cmd1', 'com.mrrsoftware.marta', 'org.yanex.marta'])
const SHARE_DESTINATION = /\b(?:airdrop|shared(?:\s+(?:folder|with\s+me|with\s+you))?|drop\s+box|dropbox|public\s+folder|server|network|(?:smb|afp|nfs|webdav):)/i
// CU-385: shared / public spaces as a drop target's whole name (an unread or item count may follow).
// CU-593 (cu-researcher): 'Public' + a container noun ('Public Files', 'Public share', 'Public uploads'; r2 cu-developer-two: 'Public
// Docs', 'Public Assets', media / resources / photos / images / videos / content) and 'Shared with <group>'
// beyond me / everyone ('Shared with partners / clients / external users / the team'); 'Public relations' (no container) stays free.
const DROP_SHARE_NAME = /^\s*(?:public(?:\s+(?:folders?|files|shares?|uploads?|documents|docs|assets|media|resources|photos|pictures|images|videos|content|drives?|library|libraries|items))?|shared(?:\s+(?:folders?|drives?|documents|files|items|libraries|library|with\s+(?:me|everyone|you|all|others|anyone|partners|clients|customers|guests|vendors|suppliers|contractors|externals?|external\s+(?:users|people|partners)|(?:the\s+|my\s+|our\s+)?(?:team|company|organi[sz]ation|org))))?|team\s+drives?|shared\s+drives?|everyone)(?:\s*\(\d+\))?\s*$/i
// CU-385 r3 (cu-researcher 22:02Z): an owner's shared space, 1-3 words then 'shared' (+ folder / drive) ending the name -
// 'Company Shared', 'Team shared folder', 'Team Public folder' (r4); a name with 'not' / 'never' / 'un' before it stays free.
const DROP_SHARE_TRAILING = /^\s*(?![^]*\b(?:not|never|un)\s)(?:[\p{L}\d&'.-]+\s+){1,3}(?:shared|public)(?:\s+(?:folders?|drives?))?(?:\s*\(\d+\))?\s*$/iu
const ACCOUNT_SECURITY = /\b(?:(?:generate|create|new|add)\s+(?:an?\s+)?app[\s-]?(?:specific[\s-]?)?passwords?|app[\s-]?(?:specific[\s-]?)?passwords?|(?:enable|disable|turn\s+(?:on|off)|set\s+up|add\s+(?:a\s+)?)?\s*(?:auto[\s-]?forward(?:ing)?|automatic(?:ally)?\s+forward(?:ing)?|forwarding(?:\s+address)?|forward\s+(?:a\s+copy|incoming|all|to|(?:my|all|incoming|every|new)\s+(?:e-?mails?|mail|messages)\s+to)\b)|two[\s-]?(?:factor|step)(?:\s+(?:authentication|verification|login))?|2[\s-]?step\s+verification|create\s+(?:a\s+|new\s+)?filter|2fa|multi[\s-]?factor(?:\s+authentication)?|(?:change|update|edit)\s+(?:your\s+)?e-?mail(?:\s+address)?(?!\s+(?:notifications?|preferences|settings))|(?:change|update|edit)\s+(?:your\s+)?phone(?:\s+number)?|recovery\s+(?:e-?mail|phone|codes?))\b/i
// CU-375 (cu-researcher): the German names of an app password and of mail forwarding reach a credential as their English
// twins do; turning forwarding off stays free, as in English.
const ACCOUNT_SECURITY_DE = /(?:^|[^\p{L}])(?:app[\s-]?passw(?:ort|örter)|anwendungsspezifische[sn]?\s+passw(?:ort|örter)|(?:automatische\s+)?weiterleitung(?:sadresse)?)(?:$|[^\p{L}])/iu
const FORWARDING_OFF_DE = /\b(?:deaktivieren|ausschalten|beenden|stoppen)\b/i
// CU-375 (cu-researcher): switching on IMAP, POP or SMTP access opens the mailbox to any client holding the password, as
// 'Allow less secure apps' does - permission. 'Enable pop-ups' and bare 'IMAP settings' stay free.
const MAIL_ACCESS_ON = /\b(?:enable|turn\s+on|allow|activate)\s+(?:imap|pop3?|smtp)\b(?![\s-]*ups?\b)/i
// German puts the verb last ('IMAP aktivieren', 'POP-Zugriff aktivieren', 'IMAP-Zugriff einschalten') - cu-developer-three's #907 review.
const MAIL_ACCESS_ON_DE = /\b(?:imap|pop3?|smtp)(?:[\s/-]*(?:imap|pop3?))?(?:[\s-]*(?:zugriff|zugang|abruf))?\s+(?:aktivieren|einschalten|zulassen|erlauben)\b/i
// A switch named only by its protocol ('IMAP access', 'POP-Zugriff'): its verb is its state - a native switch that is off
// turns access ON (asks); any of these switches that is on turns access OFF, the safe direction (free).
const MAIL_ACCESS_SWITCH = /^\s*(?:imap|pop3?|smtp)(?:\s*\/\s*(?:imap|pop3?))?(?:[\s-]*(?:access|download|zugriff|zugang|abruf))?\s*$/i
// CU-393 (cu-researcher; supersedes #448 with cu-developer-one's go): an OAuth / OpenID consent page, by URL - an authorize or
// consent path with a client_id or response_type query. On it the provider's bare grant button ('Allow', 'Continue', 'Accept')
// hands the account's data or identity to another service.
export function isOAuthConsentPage(url) {
  try {
    const u = new URL(String(url ?? ''))
    if (!/^https?:$/.test(u.protocol)) return false
    const oauthPath = /(?:^|\/)(?:oauth2?|o\/oauth2|authori[sz]e|consent|connect\/authori[sz]e|login\/oauth\/authori[sz]e|adfs\/oauth2)(?:\/|$)/i.test(u.pathname)
    const oauthQuery = u.searchParams.has('client_id') || u.searchParams.has('response_type')
    // r2 (cu-developer-three): after the first redirect a provider's own consent screen keeps only its own tokens in the query
    // (accounts.google.com/signin/oauth/consent?authuser=0&part=...), so a path naming both OAuth and the consent step counts alone.
    // r3 (cu-developer-three): end-anchored, so /consent and /v2/consentsummary count and /consent/help does not.
    const consentStep = /\/(?:signin\/)?oauth2?\/(?:v2\/)?consent(?:summary)?\/?$/i.test(u.pathname)
    return (oauthPath && oauthQuery) || consentStep
  } catch { return false }
}
const OAUTH_BARE_GRANT = /^\s*(?:allow|accept|continue|authori[sz]e|approve|grant|confirm|yes,?\s+allow|allow\s+access|i\s+agree|agree)\s*$/i
// A consent dialog says so in its title or description ('... wants to access your Google Account', '... is requesting permission').
// r2 (cu-developer-two / -three): the question form 'Allow <app> to access your ...?', 'Grant (<app>) access to your ...', and the
// data-scope verbs ('wants to view / read / manage your contacts'). 'Allow pasting into this document?' names no access and stays free.
const OAUTH_DIALOG_TEXT = /\b(?:wants?\s+to\s+(?:access|view|read|see|manage|use)\s+your|would\s+like\s+(?:to\s+)?(?:access|permission)|would\s+like\s+to\s+(?:view|read|see|manage|use)\s+your|(?:wants?|would\s+like)\s+to\s+(?:connect|link)\s+(?:to|with)\s+your|let\s+\S+(?:\s+\S+){0,3}\s+(?:access|view|read|see|manage|use)\s+your|is\s+requesting\s+(?:access|permission)|requests?\s+access\s+to\s+your|authori[sz]e\s+\S+(?:\s+\S+)?\s+to\s+access|allow\s+\S+(?:\s+\S+){0,3}\s+to\s+(?:access|view|read|see|manage|use)\s+your|grant\s+(?:\S+\s+){0,3}access\s+to\s+your)\b/i
// CU-513 (cu-researcher; cu-coordinator: Medium): an extension / add-on / plug-in store DETAIL page, by host and path. On it a
// bare 'Install' / 'Get' / 'Add' is the store's install button (the browser's own 'Add extension?' confirm is outside the page).
export function isExtensionStoreDetail(url) {
  try {
    const u = new URL(String(url ?? ''))
    if (!/^https?:$/.test(u.protocol)) return false
    const host = u.hostname.toLowerCase(); const path = u.pathname
    if (host === 'chromewebstore.google.com' && /^\/detail\//.test(path)) return true
    if (host === 'chrome.google.com' && /^\/webstore\/detail\//.test(path)) return true
    if ((host === 'addons.mozilla.org' || host === 'addons.thunderbird.net') && /\/addon\//.test(path)) return true
    if (host === 'microsoftedge.microsoft.com' && /^\/addons\/detail\//.test(path)) return true
    if (host === 'addons.opera.com' && /\/extensions\/details\//.test(path)) return true
    if (host === 'marketplace.visualstudio.com' && /^\/items/.test(path)) return true
    // r2 (cu-developer-three): the IDE extension registries - Open VSX (VSCodium, Cursor, Gitpod, Theia) and JetBrains Marketplace.
    if (host === 'open-vsx.org' && /^\/extension\/[^/]+\/[^/]+/.test(path)) return true
    if (host === 'plugins.jetbrains.com' && /^\/plugin\/\d+/.test(path)) return true
    return /\/wp-admin\/(?:plugin|theme)-install\.php$/.test(path)
  } catch { return false }
}
const STORE_BARE_INSTALL = /^\s*(?:install|get|add|install\s+now|get\s+it(?:\s+now)?|add\s+extension|install\s+(?:extension|plugin|plug-in|theme|add-on))\s*$/i
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
// CU-385 (cu-researcher's probe): the trash and junk folders by their own names - Outlook's 'Deleted Items', the localized
// trash names (Papierkorb, Corbeille, Papelera, Cestino, Prullenbak, Lixeira, Kosz, Çöp Kutusu, 垃圾箱 / 废纸篓, ゴミ箱, 휴지통),
// 'Recently Deleted', Outlook's localized 'Deleted Items' folders (Gelöschte Elemente, Éléments supprimés, Elementos eliminados,
// Posta eliminata, Verwijderde items, Itens excluídos, Elementy usunięte, Törölt elemek, Silinmiş Öğeler, 削除済みアイテム ...),
// and the junk folders (also as 'X and spam' / 'X e spam' / 'X en spam'; Russian names go through namesTrashFolded below), (Spam, Junk, Bulk Mail, Correo no deseado, Unerwünscht ...) - as the folder's WHOLE name
// (a ' folder' word, an account suffix ' - Work' and an unread count may follow), so 'Spam Filter Settings' or 'Bin Liner Orders' stay free (cu-developer-two 18:40Z).
// A drop there removes the item from where it was; shared-folder drops stay with the driver's networkVolume / dropDestination.
const DROP_TRASH_NAME = /^\s*(?:(?:folder|ordner|dossier|carpeta|cartella|map|pasta|mappe|mapp|kansio|klasör)\s+(?:(?:de|di|du|des|del|da|do|van|voor|för|for|of)\s+)?)?(?:(?:spam|junk)\s+(?:and|e|en|et|und|y|i|og|och|ve)\s+)?(?:spam(?:map|ordner|mappe|mapp|kansio)|junk(?:map|ordner|mappe)|eliminati|gelöscht|supprimés|eliminados|borrados|verwijderd|excluídos|usunięte|törölt|silinmiş|borttaget|slettet|(?:recently\s+)?deleted(?:\s+(?:items|messages|mail|files))?|trash|recycle\s+bin|bin|papierkorb|corbeille|papelera(?:\s+de\s+reciclaje)?|elementos\s+borrados|correo\s+basura|cestino|prullenbak|lixeira|lixo|kosz|çöp(?:\s+kutusu)?|koš|roskakori|papperskorg|papirkurv|spam|junk(?:[\s-]+(?:e-?mail|mail|folder))?|bulk(?:\s+mail)?|correo\s+no\s+deseado|unerwünscht|courrier\s+indésirable|posta\s+indesiderata|ongewenste\s+e-?mail|lixo\s+eletr[oô]nico|gelöschte\s+(?:elemente|objekte|nachrichten|e-?mails)|(?:éléments|messages|courriers)\s+supprimés|(?:elementos|mensajes|correos)\s+eliminados|posta\s+eliminata|(?:elementi|messaggi)\s+eliminati|verwijderde\s+(?:items|berichten|e-?mail|objecten)|itens\s+(?:excluídos|eliminados)|mensagens\s+(?:excluídas|apagadas|eliminadas)|(?:elementy|wiadomości)\s+usunięte|usunięte\s+(?:elementy|wiadomości)|törölt\s+(?:elemek|üzenetek)|silinmiş\s+(?:öğeler|iletiler|mesajlar|postalar)|odstraněn[áé]\s+(?:pošta|položky|zprávy)|borttagna\s+(?:objekt|meddelanden)|slettet\s+post|slettede\s+(?:elementer|meddelelser|meldinger)|poistetut(?:\s+(?:kohteet|viestit))?|削除済み(?:アイテム|メッセージ)|已删除(?:邮件|项目|消息)|지운\s*편지함|垃圾箱|废纸篓|回收站|垃圾邮件|ゴミ箱|迷惑メール|휴지통|스팸)(?:\s+(?:and|e|en|et|und|y|i|og|och|ve)\s+(?:spam|junk))?(?:[\s-]+(?:folder|ordner|dossier|carpeta|cartella|map|pasta|mappe|mapp|kansio|klasör(?:ü)?))?(?:(?:\s+[-–—]\s+|\s*[|:]\s*)[^-–—|:\n]{1,40})?(?:\s*\(\d+\))?\s*$/iu
// CU-385 follow-up: a drop target's name has passed normaliseText, which folds Cyrillic homoglyphs to Latin, so the Russian
// trash / junk names are compared as WHOLE names after the same fold (as namesWord folds its entries).
// CU-594 (cu-researcher): the Ukrainian names - 'Кошик' (Trash / Bin; macOS says 'Смітник'), 'Видалені' (+ елементи / повідомлення / листи / об'єкти),
// 'Нещодавно видалені' (Recently Deleted), 'Небажана пошта' (Junk Email), 'Спам-папка' - and the Russian 'Недавно удаленные'.
const DROP_TRASH_FOLDED = ['удаленные', 'удалённые', 'удаленные письма', 'удалённые письма', 'удаленные объекты', 'удаленные элементы', 'удалённые элементы', 'удалённые объекты', 'корзина', 'спам', 'нежелательная почта',
  'недавно удаленные', 'недавно удалённые', 'кошик', 'видалені', 'видалені елементи', 'видалені повідомлення', 'видалені листи', "видалені об'єкти", 'видалені об’єкти',
  'нещодавно видалені', 'небажана пошта', 'спам-папка', 'папка спам',
  // r2 (cu-developer-three, cu-developer-two): macOS's own Ukrainian Trash 'Смітник', the 'Вилучені' wording, the bare 'Небажані'.
  'смітник', 'вилучені', 'вилучені елементи', 'вилучені повідомлення', 'нещодавно вилучені', 'небажані']
function namesTrashFolded(name) {
  const text = normaliseName(String(name ?? '')).trim().replace(/\s*\(\d+\)$/, '')
  return DROP_TRASH_FOLDED.some((word) => new Set([word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()].map((form) => normaliseName(normaliseText(form)))).has(text))
}
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
  // CU-364 (design note 0.1; rebuilt from #360 on 17 Nov): the focus may be the sheet or dialog itself, reported by its
  // role (AXSheet) or subrole (AXDialog, AXSystemDialog) without the sheet flag - its Don't Save still takes Command-D.
  const sheetUp = target?.sheet === true || context.afterClose === true || target?.role === 'AXSheet' || ['AXDialog', 'AXSystemDialog'].includes(target?.subrole)
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
// CU-621: (all-devices phrase, sign-out verb) pairs per language.
const SIGN_OUT_ALL_PAIRS = [
  [/allen?\s+geräten?|überall/iu, /abmeld|ausloggen|ausgeloggt|melde\s+dich|melden\s+sie\s+sich/iu],
  [/tous\s+les\s+appareils|partout/iu, /déconnect/iu],
  [/todos\s+los\s+dispositivos/iu, /cerrar\s+sesión|cierra\s+sesión|cierre\s+sesión|desconectar/iu],
  [/todos\s+os\s+dispositivos/iu, /\bsair\b|\bsaia\b|terminar\s+sessão|encerrar\s+sessão|desconectar/iu],
  [/tutti\s+i\s+dispositivi|ovunque/iu, /\besci\b|disconnett|uscire/iu],
  [/alle\s+apparaten|overal/iu, /afmeld|uitlog|log\s+uit|meld\s+af/iu],
  [/tüm\s+cihaz|tüm\s+oturum/iu, /çıkış|kapat/iu],
]
// CU-620: (factory word, reset verb) pairs per language for the factory-reset rule. CU-622 (cu-developer-three) adds the English
// return / revert / load verbs; CU-623 (cu-developer-two) the 'factory data' words ('Fabrika verilerine sıfırla', 'Fabrieksgegevens
// herstellen', 'Werksdaten zurücksetzen').
const FACTORY_RESET_PAIRS = [
  [/\bfactory\b/i, /\b(?:reset|restore|wipe|erase)\b/i],
  [/\bfactory\s+(?:settings|defaults?|default\s+settings|state|data|configuration)\b/i, /\b(?:return|revert|load|go\s+back)\b/i],
  [/出厂|出廠|原厂|原廠/u, /恢复|恢復|重置|还原|還原|返回|回到|载入|載入|加载|加載/u],
  // r3 (cu-developer-three): one-word factory resets ('Werksreset', 'Fabrieksreset'), as bare English 'Factory reset' asks.
  [/werks-?reset|fabrieks-?reset/iu, /\p{L}/u],
  [/werkseinstellung|werkszustand|werksdaten|auslieferungszustand/iu, /zurücksetz|zurück(?![\p{L}])|wiederherstell|laden|lade\b|zurückkehr|zurückgeh|kehre|kehren/iu],
  [/d['’]\s*usine/iu, /réinitialis|rétabli|restaur|revenir|revenez|reviens|retour|retourner|charger|chargez/iu],
  [/de\s+fábrica/iu, /restablec|restablez|restaur|reinici|reset|redefin|repor|reponha|reinicializ|reposiç|volver|vuelve|vuelva|regresar|regresa|cargar|carga|voltar|volte|retornar|retorne|carregar|carregue/iu],
  [/di\s+fabbrica/iu, /ripristin|reimpost|resett|torna|tornare|ritorna|ritornare|carica|caricare/iu],
  [/fabrieksinstelling|fabrieksstaat|fabrieksgegevens|fabrieksdata/iu, /herstel|terugzet|terug(?![\p{L}])|reset|laden|laad\b|keer\s+terug|terugkeren|terugkeer|teruggaan|ga\s+terug/iu],
  [/fabrika\s+(?:ayar|veri|durum|sıfırla)/iu, /sıfırla|geri\s+yükle|döndür|dön\b|dönün|geri\s+dön|yükle/iu],
]
// CU-629: the subscription-family nouns, and the one adverb that may sit inside such a label.
const SUBSCRIPTION_NOUN = /(?:^|[^\p{L}])(?:abo|abonnement|mitgliedschaft|tarif|lidmaatschap|pakket|adhésion|forfait|suscripción|membresía|assinatura|subscrição|plano|abbonamento|piano|subscription|membership|plan)(?![\p{L}])|abonelik|aboneliğ|üyelik|üyeliğ/iu
const ONE_ADVERB = /\s+(?:jetzt|sofort|direkt|gleich|direct|nu|meteen|onmiddellijk|hemen|şimdi|maintenant|immédiatement|ahora|ya|agora|já|ora|subito|adesso|now|immediately)(?=\s)/iu
// CU-633: the same closed list as the label's last word ('Cancel my subscription now').
const TRAILING_ADVERB = /\s+(?:jetzt|sofort|direkt|gleich|direct|nu|meteen|onmiddellijk|hemen|şimdi|maintenant|immédiatement|ahora|ya|agora|já|ora|subito|adesso|now|immediately)\s*[.!]?\s*$/iu
// CU-633 (cu-developer-one's ruling 23:21Z): a bare 'Cancel now' and its locale twins - delete on a billing / subscription /
// membership page only (the page test below); elsewhere they keep main's class until the rule-1 ruling.
const BARE_CANCEL_NOW = /^\s*(?:cancel\s+now|jetzt\s+kündigen|annuler\s+maintenant|cancelar\s+ahora|annulla\s+ora|cancelar\s+agora|nu\s+opzeggen|şimdi\s+iptal\s+et|立即取消)\s*[.!]?\s*$/iu
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
// CU-358 (with cu-developer-one's #343): Turkish casing - 'İ' lower-cases to 'i' plus a combining dot and 'I' to 'i', not 'ı' -
// so the dot is dropped and a dotless 'ı' read as 'i', on names and entries alike ('SİL', 'SATIN AL' match 'sil', 'satın al').
const normaliseName = (text) => String(text ?? '').toLowerCase().replace(/\u0307/g, '').replace(/\u0131/g, 'i').replace(/[\u2018\u2019]/g, "'").replace(/licence/g, 'license')
  .replace(/#/g, ' number ').replace(/\./g, '').replace(/\s+/g, ' ').trim()
// CU-352: an entry with an accented Latin or a Cyrillic letter is bounded by any letter, so 'удалить' does not match inside
// a longer word; ASCII entries keep the a-z boundary they always had.
const LETTER_BOUNDED = /[\u00c0-\u024f\u0400-\u04ff]/
// CU-358 r3 (cu-developer-three's D-109 point): Turkish adds suffixes to a stem, so a Turkish entry marks where they may
// follow - '~' after a noun stem takes a possessive (my / your / his / our / their) and then a case ending ('şifre~' reads
// 'şifreniz', 'şifrenizi', 'şifresi'; 'kart numara~' reads 'kart numaranız', 'kart numarası'; CU-591: 'kart~ numara~' also reads the genitive 'Kartınızın numarası'), '^' after a verb stem takes the
// polite or passive -(y)In (and its plural -(y)Iniz), then a third-person imperative -sIn or the future -(y)AcAk ('sil^' reads
// 'silin', 'silinsin', 'silinecek'; 'gönder^' reads 'gönderin'). A bounded set, after normaliseName's folding (ı reads as i),
// so 'Şifreleme' (encryption), 'Silinenler' (the Deleted folder), 'Silindir' and 'Silgi' stay free. r4 (cu-developer-three).
const TR_NOUN_SUFFIX = '(?:(?:[iuü]?m|[iuü]?n|s?[iuü]|[iuü]?m[iuü]z|[iuü]?n[iuü]z|l[ae]ri?)?(?:y?[iuü]|n[iuü]|y?[ae]|n[ae]|[dt][ae]n?|n?[iuü]n)?)'
// CU-591 (cu-researcher): the future takes the copula -tIr as written in notices and confirmations ('silinecektir'); r2
// (cu-developer-three, cu-developer-two): and the plural -lAr before or after it ('silinecekler', 'silinecektirler'), and the
// passive is -Il as well as -(y)In ('kaldırılacak', 'kaldırılacaktır', 'kaldırılsın').
const TR_VERB_SUFFIX = '(?:(?:y?[iuü]n|[iuü]l)?(?:s[iuü]n|[iuü]z|y?[ae]c[ae]k(?:l[ae]r)?(?:t[iuü]r)?(?:l[ae]r)?)?)'
const turkishPattern = (word) => normaliseName(normaliseText(word)).split(/([~^])/).map((part) => part === '~' ? TR_NOUN_SUFFIX
  : part === '^' ? TR_VERB_SUFFIX : escapeRegExp(part).replace(/ /g, '[\\s-]+')).join('')
// CU-358 r5 (cu-developer-one): ' _ ' in an Italian, Portuguese or Dutch entry is an optional article slot ('conferma _
// pagamento' reads 'Conferma pagamento' and 'Conferma il pagamento'); the list is closed - articles, and from r7 the possessive
// determiners ('il mio', 'a minha', 'je', 'mijn', 'uw').
const ARTICLE_SLOT = "[\\s-]+(?:(?:il|lo|la|i|gli|le)[\\s-]+(?:mio|tuo|suo|vostro)[\\s-]+|(?:a|o|os|as)[\\s-]+(?:minha|meu|sua|seu|tua|teu)[\\s-]+|(?:il|lo|la|i|gli|le|un|una|uno|o|a|os|as|um|uma|de|het|een|mijn|je|jouw|uw|minha|meu|sua|seu|tua|teu|mio|tuo|suo)[\\s-]+|l'\\s*)?"
const articlePattern = (word) => normaliseName(normaliseText(word)).split(' _ ').map((part) => escapeRegExp(part).replace(/ /g, '[\\s-]+')).join(ARTICLE_SLOT)
function namesWord(name, words) {
  const text = normaliseName(name)
  return words.some((word) => {
    // CU-638: a class's compiled imperative pattern rides in its word list.
    if (typeof word !== 'string') return word.test(text)
    if (word.includes(' _ ')) return new RegExp(`(^|[^\\p{L}])${articlePattern(word)}([^\\p{L}]|$)`, 'u').test(text)
    if (/[~^]/.test(word)) return new RegExp(`(^|[^\\p{L}])${turkishPattern(word)}([^\\p{L}]|$)`, 'u').test(text)
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
// CU-399 (Low; cu-coordinator 04:39Z, 10 Nov): Mail's 'Bounce' sends a reply to the sender - by exact name ('Bounce rate'
// stays free); r2 (cu-researcher 02:19Z): 'Bounce Message' and Mail's 'Redirect', the same act (sends the original on).
const SUBMIT_WHOLE_NAMES = new Set(['bounce', 'bounce to sender', 'bounce message', 'bounce this message', 'redirect',
  'redirect message', 'redirect this message', 'call', 'answer', 'merge', '呼叫', '接听', '接聽', '合并', '合併'])
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
  '银行账号', '銀行帳號', '银行账户', '銀行帳戶', '开户行', '開戶行', '税号', '稅號', '纳税人识别号', '納稅人識別號', '统一社会信用代码',
  // CU-601 (cu-researcher): national bank routing codes beside 'routing number' / 'sort code' / 'bsb' - Germany, the US ABA
  // name, Switzerland / Sweden, Canada, France - as phrases; the short ones (BLZ, ABI, CAB, RIB, agência) as a whole label below.
  'bankleitzahl', 'aba number', 'aba routing', 'clearing number', 'clearingnummer', 'bank clearing', 'transit number', 'institution number',
  'code banque', 'code guichet', 'clé rib', 'cle rib', 'relevé d\'identité bancaire', 'código de agencia', 'código de agência', 'número de agencia', 'número da agência'])
// CU-601: the short national codes only as a field's whole label ('Cab' alone is a taxi elsewhere), and the account number
// in its 'of' form ('Number of your account'), as CU-599 reads the card number.
const BANK_CODE_WHOLE = /^\s*(?:blz|aba|abi|cab|rib|ag[êe]ncia|clearing)\s*(?:\(.{0,12}\))?\s*[:*]?\s*$/iu
// r2 (cu-developer-two / -three): both orders, as CU-599 reads the card - "Your account's number", 'Number on your account'.
const ACCOUNT_NUMBER_OF = /\baccount['’]?s\s+number\b|\bnumber\s+(?:of|on|for)\s+(?:(?:your|the|this|my)\s+)?(?:bank\s+|checking\s+|savings\s+)?account\b/i
function bankOrTaxField(target) {
  return entryNamesOf(target).some((name) => namesWord(name, BANK_OR_TAX_FIELD) || BANK_CODE_WHOLE.test(String(name ?? '')) || ACCOUNT_NUMBER_OF.test(String(name ?? '')))
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
  // CU-606 (cu-researcher): an access code, in the class of its twin 'passcode'.
  'access code',
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
  // CU-606 (cu-researcher): a two-factor recovery code, in the class of its twin 'backup code'.
  'recovery code', 'recovery codes',
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
// CU-599 (cu-researcher): the card number with a possessive or 'of', in either order - 'Your card's number', 'Number of / on your
// card', 'Numéro de votre carte', 'Nummer Ihrer Karte', 'Número de su tarjeta', 'Número do seu cartão', 'Numero della tua carta' -
// reads like the compound 'card number' each language already lists.
const CARD_NUMBER_PHRASE = /\bcard['’]?s\s+number\b|\bnumber\s+(?:of|on|for)\s+(?:(?:your|the|this|my)\s+)?(?:credit\s+|debit\s+|payment\s+)?card\b|\bnum[ée]ro\s+de\s+(?:(?:votre|ta|la|cette|sa)\s+)?carte\b|\bnummer\s+(?:ihrer|deiner|der|ihre|seiner)\s+(?:kredit|debit|bank)?karte\b|\bn[úu]mero\s+de\s+(?:su|tu|la|esta)\s+tarjeta\b|\bn[úu]mero\s+d[oa]\s+(?:seu|teu|sua|tua)\s+cart[ãa]o\b|\bnumero\s+della\s+(?:tua|sua|vostra)\s+carta\b/iu
// CU-600 r2 (cu-developer-two): the bare expiry word as the field's WHOLE label, with or without a date-format hint, reads like
// English 'Expiry (MM/YY)' - 'Scadenza', 'Vencimiento', 'Validade (MM/AA)', 'Caducidad', 'Gültig bis MM/JJ'; a longer phrase
// ('Vencimiento de la factura', 'Validade do produto') stays free.
const CARD_EXPIRY_BARE = /^\s*(?:scadenza|vencimiento|validade|caducidad|validit[ée]|ablauf|vence|v[aá]lid[oa]\s+(?:hasta|at[ée])|gültig\s+bis)\s*(?:\(?\s*mm\s*[\/-]\s*(?:aa|yy|jj|aaaa|yyyy|jjjj)\s*\)?)?\s*[:*]?\s*$/iu
// CU-602 (cu-researcher): German ID fields in the genitive or hyphenated - 'Nummer Ihres / des (Reise)passes', 'Nummer des
// (Personal)ausweises', 'Steuer-Identifikationsnummer', 'Sozialversicherungs-Nr.', 'Nummer Ihrer Kranken- / Sozialversicherung' -
// and English 'Number of your ID card', as their compounds and 'Number of your passport' already ask; r2 (cu-developer-three):
// the '-Nr.' abbreviation after any of those nouns ('Ausweis-Nr.', 'Pass-Nr.', 'Ausweisnr.'); CU-603 r3 (cu-developer-two): with
// the Kranken- / Pflege- / Renten- compound in front ('Krankenversicherten-Nr.').
const ID_FIELD_PHRASE = /\bnummer\s+(?:ihres|deines|des|seines|ihrer|der)\s+(?:(?:reise|kinder)?pass(?:es)?|(?:personal)?ausweis(?:es)?|f[üu]hrerscheins?|aufenthaltstitels?)\b|\bsteuer-?\s*identifikations-?\s*nummer\b|\b(?:(?:reise|kinder)?pass|(?:personal)?ausweis|f[üu]hrerschein|steuer|(?:kranken|pflege|renten|sozial)?versicherungs|(?:kranken|pflege|renten)?versicherten|aufenthaltstitel)-?\s*nr\.?(?=\s|$|[:*)])|\bsozialversicherungs-?\s*nummer\b|\bnummer\s+(?:ihrer|deiner|der)\s+(?:kranken|sozial|renten)versicherung\b|\bnumber\s+(?:of|on)\s+(?:(?:your|the|my|this)\s+)?(?:national\s+)?id(?:entity)?\s+card\b/iu
// CU-604 (cu-researcher): the German bank TAN family as a field's whole label ('TAN', 'mTAN', 'SMS-TAN', 'pushTAN', 'chipTAN',
// 'photoTAN', 'TAN-Nummer', 'TAN eingeben') - a bare 'tan' inside a word (a colour, 'Tango') stays free.
const TAN_FIELD = /^\s*(?:tan\s+eingeben|(?:m|sms[\s-]?|push|chip|photo|smart|app[\s-]?|i)?tan(?:[\s-]?(?:nummer|nr\.?|code))?)\s*[:*]?\s*$/iu
const secretNamedEntry = (target) => isTextEntry(target) && entryNamesOf(target).some((name) => namesWord(name, SECRET_NAMES) || namesAcronym(name) || CARD_NUMBER_PHRASE.test(String(name ?? '')) || CARD_EXPIRY_BARE.test(String(name ?? '')) || ID_FIELD_PHRASE.test(String(name ?? '')) || TAN_FIELD.test(String(name ?? '')))

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

// CU-520 (High; cu-coordinator 19:51Z, folded into #729 r2): ONE home-security page test for CU-491's and CU-519's rows - CU-491's
// path segments (/security, /alarm, /cameras, /home-security) or a home-security vendor / device token in the host or path (ring, arlo,
// simplisafe, adt, nest, wyze, blink, eufy, august, schlage, yale, vivint, alarm, camera(s), cam(s), lock(s), smartlock, doorbell,
// home-security, security-system). Exact tokens between separators ('ringcentral' never matches 'ring'); never 'alarms' (a clock's page).
export function isHomeSecurityPage(url) {
  try {
    const u = new URL(String(url ?? ''))
    if (!/^https?:$/.test(u.protocol)) return false
    if (/(?:^|\/)(?:security|alarm|cameras|home-security)(?=$|[/?#])/i.test(u.pathname)) return true
    return /(?:^|[\s./-])(?:ring|simplisafe|adt|arlo|nest|wyze|blink|eufy|august|schlage|yale|vivint|alarm|cameras?|cams?|locks?|smartlock|doorbell|home-?security|security-?system)(?:[\s./-]|$)/i.test(`${u.hostname} ${u.pathname}`)
  } catch { return false }
}

/**
 * Create the policy. `sitePolicy` is the run's site filter; `preApprovals` are `[{ class, origin }]` from the caller,
 * with `origin` an origin pattern such as `http://127.0.0.1:43117` (default: any origin the site filter allows).
 */
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
    // #721 round 3 (cu-coordinator 18:51Z): curly apostrophes / quotes read as straight before any rule.
    const name = typeof target?.name === 'string' ? straightQuotes(target.name) : (target?.name ?? '')
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
    // CU-429 (cu-coordinator 09:34Z; D-108 rule 1 - older asks lowered only by this ruling): a press on a named button or link,
    // outside a held page dialog and never on a toggle (its label names a state, so a press can do the opposite - cu-developer-three
    // 09:35Z), is free for (A) pane names, help links and views, (C) 'Edit post', (E) 'Raise a ticket', (G) 'Require multi-factor
    // authentication', an 'Unsubscribe' LINK (a button keeps submit), and (D) a refusal: don't / do not / never / no, don't / I don't
    // want to + a ruled risky verb phrase that itself asks, or keep + a protection whose turning off asks. Never for a safeguard
    // suppressor ('Don't ask again', 'Don't show this again', 'Don't warn me', 'Don't notify me', 'Don't confirm'), and never with a
    // second clause ('Do not cancel - pay now', 'No thanks, remove 2FA', 'No, remove it' still ask).
    // cu-coordinator 13:04Z: an exchange's 'Order book' (a view; the older 'order' purchase) is lowered here too.
    // Round 2 (17:21Z) adds the named list below; KEPT as ruled: 'Sign up', 'Remove recovery contact', 'Remove location from posts',
    // 'Remove address', 'Quit all apps', 'Close on all devices', Mail's compose 'Sign' toggle and Preview's 'Sign' tool.
    if (!held && context.confirmProbe !== true && name !== '' && classes.length === 0 && target && !isTextEntry(target)) {
      const presses = POINTER.has(action.type) || keysOf(action).has('ENTER') || keyboardActivation(action, target, context).activates
      const role = String(target.role ?? '') + ' ' + String(target.subrole ?? '')
      const toggle = /switch|checkbox|toggle|radio/i.test(role) || /^(checkbox|radio)$/i.test(String(target.inputType ?? '')) || typeof target.checked === 'boolean'
      if (presses && !toggle) {
        const plain = name.trim().replace(/\s+/g, ' ')
        const link = /\b(link|AXLink)\b/.test(role)
        const exact = /^(?:security|privacy & security|uninstall instructions|pay history|pay stub preview|view pay rate|edit post|raise (?:a )?ticket|require multi-factor authentication|order book)$/i.test(plain)
          // CU-429 round 2 (cu-coordinator 17:21Z): navigation, labels and views, exactly these names.
          || /^(?:go to your account|back to this project|open in this window|view api docs|clear all filters|(?:note:\s*)?rent is due|find and replace(?:\u2026|\.\.\.)?|search and replace|unmute all|open all windows|privacy and security|uninstall guide|edit draft post|pay slip preview|raise a support ticket)$/i.test(plain)
          // CU-429 round 3 (cu-coordinator 21:36Z): 'View order', 'Security checkup' and 'Call forwarding' as a button / link (the switch
          // keeps its direction rule - toggles never reach here), and 'Add member(s) to group' in a chat app (a desktop messaging app, or a
          // chat page by host / path), exactly these.
          || /^(?:view order|security checkup|call forwarding)$/i.test(plain)
          // Round 4 (cu-coordinator 03:36Z; CU-547): 'Revoke allowance', 'View pay stub' and 'Security settings' as a button / link, exactly
          // these; 'Roll back deploy' KEEPS submit (it changes what runs in production).
          || /^(?:revoke allowance|view pay stub|security settings)$/i.test(plain)
          // Round 5 (cu-coordinator 06:21Z; CU-556): the labels 'Port forwarding', 'Two-factor authentication' (a button / link - its switch
          // keeps its direction rule; toggles never reach here), 'Deploy keys', 'Permissions' and 'Pay stubs', exactly these; 'Wire transfer'
          // KEEPS asking (fail-closed).
          || /^(?:port forwarding|two-factor authentication|deploy keys|permissions|pay stubs)$/i.test(plain)
          || (/^add members? to (?:the )?group$/i.test(plain) && (isMessagingApp(String(context.frontmostBundleId ?? target?.origin ?? '')) || (() => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) && /(?:^|[./-])(?:chat|slack|discord|teams|messenger|whatsapp|telegram|signal|messages)(?:[./-]|$)/i.test(`${u.hostname} ${u.pathname}`) } catch { return false } })()))
          || (link && /^unsubscribe(?: link)?$/i.test(plain))
        let refusal = false
        if (!exact && !/\s[-\u2013\u2014]\s|[,;:](?!\s*$)|\b(?:and|then|but)\b/i.test(plain.replace(/^\s*no,\s*/i, ''))) {
          const neg = plain.match(/^(?:no,?\s+)?(?:don'?t|do\s+not|never|i\s+(?:don'?t|do\s+not)\s+want\s+to)\s+(.+)$/i)
          const keep = plain.match(/^(?:no,?\s+)?keep\s+(.+?)(?:\s+(?:on|enabled|turned\s+on|active))?$/i)
          const risky = /^(?:turn\s+off|switch\s+off|disable|remove|delete|deactivate|revoke|reset|cancel|unlink|disconnect|erase|close|sign\s+out|log\s+out|turn\s+on|enable|share|send|pay|buy|purchase|install|allow|grant|transfer|unsubscribe|leave|stop)\b/i
          const suppressor = /^(?:ask|show|warn|notify|confirm|remind|prompt)\b/i
          const asks = (probeName) => classify(action, { ...context, target: { ...target, name: probeName }, confirmProbe: true }).decision === 'confirm'
          if (neg && !suppressor.test(neg[1]) && risky.test(neg[1]) && asks(neg[1])) refusal = true
          else if (keep && !/^(?:sharing|me\b|my\s+location|location)/i.test(keep[1]) && asks(`Turn off ${keep[1]}`)) refusal = true
        }
        if (exact || refusal) return { decision: 'allow', class: null, rule: 'cu429:lowered', reason: '' }
      }
    }
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
    if (action.type === 'drag' && context.dropTarget && (namesWord(String(context.dropTarget.name ?? ''), DROP_DELETE) || DROP_TRASH_NAME.test(String(context.dropTarget.name ?? '')) || namesTrashFolded(context.dropTarget.name))) classes.push('delete')
    // CU-385 (cu-verifier 21:42Z live): on the web route there is no driver dropDestination, so a drag onto a folder whose
    // WHOLE name is a shared or public space asks permission, as a share (the filing's fix text; additions only). Web pages
    // only: on the desktop a move into the local Shared folder stays an ordinary move (S6) and the driver fields decide.
    if (action.type === 'drag' && context.dropTarget && /^https?:/i.test(String(context.url ?? '')) && (DROP_SHARE_NAME.test(String(context.dropTarget.name ?? '')) || DROP_SHARE_TRAILING.test(String(context.dropTarget.name ?? '')))) classes.push('permission')
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
      const isForwarding = /forward|weiterleitung/i.test(name)
      // The explicit protection list (CU-270's two-factor and recovery names), never 'every security name but a few'.
      const isProtection = /two[\s-]?(?:factor|step)|2[\s-]?step|\b2fa\b|multi[\s-]?factor|recovery\s+(?:e-?mail|phone|codes?)/i.test(name)
      const safeToggle = (isProtection && nativeOff) || (isForwarding && nativeOn)
      const forwardingOffDe = FORWARDING_OFF_DE.test(name) && /weiterleitung/i.test(name)
      if (!focusesEntry && (ACCOUNT_SECURITY.test(name) || ACCOUNT_SECURITY_DE.test(name)) && !protectionOn && !forwardingOff && !forwardingOffDe && !safeToggle) classes.push('credential')
      // CU-375 r2 (cu-developer-three): a native switch already on (checked true) turns mail access OFF - free; a protocol-named
      // switch that is off turns it ON - asks.
      // CU-389 (cu-researcher): 'Anyone in <org> can edit' widens access like 'Anyone can edit'; and inside a share / invite /
      // access dialog a bare role option ('Can edit', 'Editor', 'Owner') grants that role - permission. A bare 'Can edit'
      // elsewhere, and narrowing options ('Can view', 'Viewer', 'Restricted', 'Only me'), stay free.
      if (!focusesEntry && /\banyone\s+(?:at|in|from)\s+[\w .&'-]{1,40}?\s+can\s+(?:view|edit|comment|join)\b/i.test(name)) classes.push('permission')
      // r2 (cu-developer-one / -two / -three): the same widening said other ways - a role change upward ('Change to Editor', 'Set as
      // owner'), 'Allow anyone / everyone / guests to view / edit / comment / access ...', 'Open to everyone / the public', and link
      // sharing turned on ('Turn on link sharing', 'Link sharing on'). Turning it off, and roles downward, stay free.
      if (!focusesEntry && (/\b(?:change|switch|set|upgrade|promote)\s+(?:(?:the\s+)?role\s+)?(?:to|as)\s+(?:an?\s+)?(?:editor|owner|co-?owner|admin(?:istrator)?|commenter|collaborator|manager)\b/i.test(name)
        || /\ballow\s+(?:anyone|everyone|all\s+users|the\s+public|guests|people\s+outside\s+\S+)\s+to\s+(?:view|edit|comment|access|see|join|download|copy|share)\b/i.test(name)
        || /\bopen\s+to\s+(?:everyone|anyone|the\s+public|all)\b/i.test(name)
        || /\b(?:turn\s+on|enable|allow|activate)\s+(?:public\s+)?link\s+sharing\b|^\s*link\s+sharing\s*:?\s*on\s*$/i.test(name))) classes.push('permission')
      const shareDialog = /\b(?:share|sharing|invite|permissions?|general\s+access|manage\s+access)\b/i.test(`${target?.dialogName ?? ''} ${target?.dialogDescription ?? ''}`)
      if (!focusesEntry && POINTER.has(action.type) && shareDialog && /^\s*(?:can\s+(?:edit|comment|manage|organi[sz]e)|editor|commenter|owner|co-?owner|full\s+access|admin)\s*$/i.test(name)) classes.push('permission')
      const mailSwitchState = nativeToggleState(target)
      if (!focusesEntry && mailSwitchState !== true && (MAIL_ACCESS_ON.test(name) || MAIL_ACCESS_ON_DE.test(name) || (mailSwitchState === false && MAIL_ACCESS_SWITCH.test(name)))) classes.push('permission')
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
      // CU-396 r3 (cu-developer-three): presenting a surface, as a product - '(Start) present(ing) a / your / this / the / my / an
      // + tab / window / screen / entire screen / desktop / display / app' - not one phrase per pair. Slide apps' bare 'Present' stays free.
      if (!focusesEntry && /^\s*(?:start\s+)?present(?:ing)?\s+(?:a|an|your|this|the|my|entire|whole)\s+(?:(?:entire|whole|full)\s+)?(?:tab|window|screen|desktop|display|app|application|monitor)\b/i.test(name)) classes.push('permission')
      // CU-407 (cu-researcher; supersedes #501): an app's updater installs new code - 'Update Now', 'Update and Restart / Relaunch',
      // 'Download and Install', 'Update All (extensions / plug-ins)' - on the DESKTOP route only (a native AX control outside a web
      // area); on a web page 'Update now' usually saves a form. 'Later', 'Skip This Version' and a bare 'Update' stay free.
      const nativeControl = /^AX/.test(String(target?.role ?? '')) && target?.inWebArea !== true
      if (!focusesEntry && nativeControl && /^\s*(?:update\s+now|update\s+(?:and|&)\s+(?:restart|relaunch|reopen)|download\s+(?:and|&)\s+install(?:\s+now)?|update\s+all(?:\s+(?:extensions|plug-?ins|add-?ons|packages|apps))?)\s*$/i.test(name)) classes.push('install')
      // CU-404 (cu-researcher; supersedes #478 with cu-developer-one's go): a paid boost buys reach, as a product - (boost / promote /
      // sponsor / advertise) + (this / your / the / my)? + (post / tweet / video / listing / page / reel / story / ad / event / pin /
      // update / article / content), or '... now' (LinkedIn's 'Sponsor now' / 'Sponsor update', r3 cu-developer-three). The label leads with the verb, so 'Boosted posts', 'Boost insights' and 'Promotion settings' stay free.
      if (!focusesEntry && /^\s*(?:boost|promote|sponsor|advertise)\s+(?:(?:this|your|the|my)\s+)?(?:post|tweet|video|listing|page|reel|story|ad|event|pin|thread|status|update|article|content)\b|^\s*(?:boost|promote|sponsor|advertise)\s+now\b/i.test(name)) classes.push('purchase')
      // CU-425 (cu-researcher; supersedes #547): widening what others may do with a file - moving it into a shared drive, letting
      // viewers download / print / copy, letting others edit - asks permission. A bare 'Allow editing' asks only inside a share /
      // access dialog; narrowing ('Disable downloads', 'Restrict downloads') keeps main's judgement.
      // r2 (cu-developer-three): Drive's own declarative checkbox ('Viewers and commenters can see the option to download, print, and
      // copy') asks when it turns the option ON (a native box already checked turns it off - free); Dropbox's 'team folder' and
      // the older 'Team Drive' are shared drives too.
      const shareToggle = nativeToggleState(target)
      if (!focusesEntry && shareToggle !== true && /\b(?:viewers|commenters|everyone|anyone|people|recipients)\b(?:\s+(?:and|&)\s+(?:viewers|commenters))?\s+can\s+(?:see\s+the\s+option\s+to\s+)?(?:download|print|copy)\b/i.test(name)) classes.push('permission')
      if (!focusesEntry && (/^\s*move\s+(?:it\s+|this\s+|the\s+file\s+)?(?:in)?to\s+(?:a\s+|the\s+)?(?:shared\s+(?:drive|folder|library)|team\s+(?:folder|drive))\b/i.test(name)
        || (shareToggle !== true && /^\s*(?:allow|enable|let)\s+(?:(?:viewers|commenters|others|everyone|anyone|people|recipients)(?:\s+(?:and|&)\s+(?:viewers|commenters))?\s+(?:to\s+)?(?:see\s+the\s+option\s+to\s+)?)?(?:download(?:s|ing)?|print(?:ing)?(?:\s+(?:and|&)\s+copy(?:ing)?)?|copy(?:ing)?)\b/i.test(name))
        || /^\s*(?:let\s+(?:others|everyone|anyone|people)\s+edit|enable\s+editing\s+for\s+(?:others|everyone|anyone))\b/i.test(name)
        || (/^\s*allow\s+editing\s*$/i.test(name) && /\b(?:share|sharing|permissions?|general\s+access|manage\s+access|link\s+settings)\b/i.test(`${target?.dialogName ?? ''} ${target?.dialogDescription ?? ''}`)))) classes.push('permission')
      // CU-397 (cu-researcher; supersedes #462; cu-coordinator's 03:58Z class): a message to an event's guests is sent at once -
      // the label LEADS with the verb, so a refusal ('Don't notify guests', 'Do not send') stays free.
      if (!focusesEntry && /^\s*(?:(?:e-?mail|notify|message)\s+(?:all\s+)?(?:the\s+)?(?:guests|invitees|attendees|participants)|forward\s+(?:the\s+|this\s+)?(?:invitation|invite|event)|(?:propose|suggest)\s+(?:a\s+)?(?:new|another|different|other)\s+time|send\s+updates?(?:\s+to\s+(?:all\s+)?(?:guests|invitees|attendees))?)\b/i.test(name)) classes.push('submit')
      // CU-393: a bare grant on an OAuth consent page, or in a dialog that asks for access to the account, asks permission.
      if (!focusesEntry && OAUTH_BARE_GRANT.test(name) && (isOAuthConsentPage(context.url) || OAUTH_DIALOG_TEXT.test(`${target?.dialogName ?? ''} ${target?.dialogDescription ?? ''}`))) classes.push('permission')
      // CU-513: a bare install word on an extension / add-on / plug-in store detail page installs code into the browser or site.
      if (!focusesEntry && STORE_BARE_INSTALL.test(name) && isExtensionStoreDetail(context.url)) classes.push('install')
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
    // CU-535 (cu-coordinator 00:51Z; #773 r2, cu-developer-three 01:03Z): a VPN kill-switch SWITCH turned OFF asks permission, like the
    // two-factor switch - on -> off and an unread state ask (nativeToggleState: a web ARIA state is untrusted), off -> on is free.
    // CU-543 (#786 r2, cu-developer-three 02:39Z): a kids profile's 'Profile lock / PIN / passcode' switch takes the same direction rule.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:vpn\s+)?kill\s*switch\s*$|^\s*profile\s+(?:lock|pin|passcode)\s*$/i.test(name) && nativeToggleState(target) !== false) classes.push('permission')
    // CU-548 (High; cu-coordinator 04:06Z), table PR 46: a life-safety SWITCH - smoke / CO detector, leak sensor, water shutoff - turned
    // OFF asks PHYSICAL (the safeguard direction rule: on -> off and an unread state ask; off -> on is free). #798 r3 (cu-developer-three
    // 04:15Z): the 'Water / Flood detector' switches too.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:smoke|co|carbon\s+monoxide|fire|smoke\s+(?:and|&|\/)\s+co)\s+(?:alarm|detector|sensor)s?\s*$|^\s*(?:water\s+leak|leak|water|flood)\s+(?:sensor|detector|detection)s?\s*$|^\s*(?:automatic\s+|auto\s+)?(?:water\s+)?shut-?off(?:\s+valve)?\s*$/i.test(name) && nativeToggleState(target) !== false) classes.push('physical')
    // CU-549 (#805 r2, cu-developer-three 05:05Z): a router's 'Client isolation' switch is a safeguard - on -> off and unread ask permission,
    // off -> on free; its 'WPS' switch is an exposure - off -> on and unread ask permission, on -> off free (like 'Guest access').
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      if (/^\s*(?:client|ap|wireless)\s+isolation\s*$/i.test(name) && nativeToggleState(target) !== false) classes.push('permission')
      else if (/^\s*wps(?:\s+(?:push\s+button|pin))?\s*$|^\s*wi-?fi\s+protected\s+setup\s*$/i.test(name) && nativeToggleState(target) !== true) classes.push('permission')
    }
    // CU-555 (High; cu-coordinator 06:21Z), folded into table PR 50: a connected car's safeguard SWITCH - speed limit (mode) / limiter,
    // curfew, driver monitoring, teen (driver) mode, valet mode, geofence - turned OFF (on -> off and unread) asks PERMISSION; off -> on free.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:speed\s+limit(?:\s+mode)?|speed\s+limiter|max(?:imum)?\s+speed\s+limit|curfew|driver\s+monitoring|driver\s+attention\s+monitoring|teen\s+(?:driver\s+)?mode|valet\s+mode|geofenc(?:e|ing)|driving\s+restrictions?)\s*$/i.test(name) && nativeToggleState(target) !== false) classes.push('permission')
    // CU-554 (High; cu-coordinator 06:06Z), table PR 50: a 'Maintenance mode' switch turned ON (off -> on and unread) asks SUBMIT, on -> off
    // free; a 'Site published / online / live' switch turned OFF (on -> off and unread) asks SUBMIT, off -> on free.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))) {
      if (/^\s*(?:site\s+|store\s+)?maintenance(?:\s+mode)?\s*$/i.test(name) && nativeToggleState(target) !== true) classes.push('submit')
      else if (/^\s*(?:site|website|store|shop|blog)\s+(?:published|online|live|visible|enabled)\s*$|^\s*(?:publish|enable)\s+(?:site|website|store|shop|blog)\s*$/i.test(name) && nativeToggleState(target) !== false) classes.push('submit')
    }
    // CU-558 (#821 r2, cu-developer-three 07:30Z): a 'Location on posts' / 'Location tagging' / 'Add location to posts' switch is an
    // exposure - off -> on and unread ask PERMISSION, on -> off free (like 'Guest access').
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*(?:(?:show\s+|add\s+)?(?:my\s+)?location\s+(?:on|in|to)\s+(?:my\s+|new\s+)?(?:posts|photos|stories)|location\s+tagging|tag\s+my\s+location)\s*$/i.test(name) && nativeToggleState(target) !== true) classes.push('permission')
    // CU-558 (#821 r4, cu-researcher 07:47Z), URL-bound (D-106): a bare 'Show (my) location' / 'Add (my) (current) location / city' asks
    // PERMISSION on a social / post page only (a social / facebook / instagram / twitter / x / threads / tiktok / linkedin / snapchat /
    // mastodon / bluesky host label, or a post(s) / compose / status / profile / stories / feed / share path segment).
    if (grammarEligible && classes.length === 0 && /^\s*(?:show\s+(?:my\s+)?location|add\s+(?:my\s+)?(?:current\s+)?(?:location|city))\s*$/i.test(String(name ?? ''))) {
      let socialPage = false
      try {
        const u = new URL(url)
        socialPage = /^https?:$/.test(u.protocol) && (/(?:^|\.)(?:social|facebook|instagram|twitter|x|threads|tiktok|linkedin|snapchat|mastodon|bsky|bluesky)(?:\.|$)/i.test(u.hostname) || /(?:^|\/)(?:posts?|compose|status|profile|stories|feed|share)(?=$|[/?#])/i.test(u.pathname))
      } catch { socialPage = false }
      if (socialPage) classes.push('permission')
    }
    // CU-559 (#825 r2, cu-researcher 08:12Z), URL-bound (D-106): a bare 'Roll over' / 'Rollover' / 'Start (a) rollover' asks PURCHASE on a
    // retirement page only (a retire / retirement / 401k / 403b / ira / pension / benefits / plan(s) segment or host label).
    if (grammarEligible && classes.length === 0 && /^\s*(?:roll\s+over|rollover|start\s+(?:a\s+)?rollover)\s*$/i.test(String(name ?? ''))) {
      let retirePage = false
      try { const u = new URL(url); retirePage = /^https?:$/.test(u.protocol) && /(?:^|[./-])(?:retire|retirement|401k|403b|ira|pension|benefits|plans?)(?=$|[./?#-])/i.test(`${u.hostname}${u.pathname}`) } catch { retirePage = false }
      if (retirePage) classes.push('purchase')
    }
    // CU-560 (#825 r4, cu-verifier 08:27Z): an options-level form an older 'upgrade to' row gives purchase keeps purchase and adds PERMISSION
    // (a union, like 'Enable options trading').
    if (grammarEligible && classes.length > 0 && !classes.includes('permission') && /^\s*(?:upgrade|move|switch)\s+to\s+(?:options\s+)?(?:level|tier)\s+\d(?:\s+options)?\s*$|^\s*(?:upgrade|increase|raise|change|request|apply\s+for|get)\s+(?:my\s+|the\s+|your\s+|an?\s+)?options\s+(?:trading\s+)?(?:level|tier|approval)(?:\s+\d)?\s*$/i.test(String(name ?? ''))) classes.push('permission')
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
    // CU-496 (High; cu-coordinator 11:21Z): on a password vault's page (the CU-474 URL test) a 'Download backup' takes the vault's
    // secrets out (credential); turning ON 'Autofill on page load' lets any page take a filled secret (permission) - a native switch asks
    // only when the press turns it on; a button asks when it says turn on / enable.
    if (grammarEligible && classes.length === 0 && /^\s*(?:download|export|save)\s+(?:a\s+|the\s+)?(?:vault\s+)?backup\s*$/i.test(name) && /vault|password|1password|bitwarden|lastpass|dashlane|keeper|proton\.me\/pass/i.test(String(context?.url ?? ''))) classes.push('credential')
    if (grammarEligible && classes.length === 0) {
      const autofill = /^\s*(?:(turn\s+on|enable|switch\s+on|allow|let)(?:\s+(?:this\s+|the\s+|these\s+|all\s+)?(?:items?|logins?|passwords?|entry|entries|accounts?))?(?:\s+to)?\s+)?auto-?fill\s+on\s+page\s+load(?:\s+for\s+all\s+(?:items|logins|sites|websites))?\s*$/i.exec(name)
      // #669 round 3 (cu-verifier 11:50Z): an object and 'to' between the verb and 'autofill' - the issue title's 'Allow item to autofill on page load'.
      if (autofill) {
        // #669 round 2 (cu-developer-three 11:32Z): direction only from the NATIVE read (CU-373: a web <input type=checkbox> with a
        // boolean checked); an ARIA, missing or mixed state - or a desktop switch with no read - fails closed and asks.
        // Helper 0.2.70: the native read is nativeToggleState's, so a desktop AXSwitch with a real AXValue gives the direction too.
        const nativeState = nativeToggleState(target)
        const toggleRole = /switch|checkbox|toggle/i.test(String(target?.role ?? '') + ' ' + String(target?.subrole ?? ''))
        if (nativeState !== null ? nativeState === false : (Boolean(autofill[1]) || toggleRole)) classes.push('permission')
      }
    }
    // CU-495 (High; cu-coordinator 11:06Z): on an e-signature page - a whole /sign, /signing, /envelope or /esign segment of an http(s)
    // URL - a bare 'Finish', 'Complete' or 'Confirm' completes the signing (permission). Off that URL they keep their own rows.
    if (grammarEligible && classes.length === 0 && /^\s*(?:finish|complete|confirm)\s*!?\s*$/i.test(name)) {
      let signingPage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) signingPage = /(?:^|\/)(?:sign|signing|envelope|envelopes|esign)(?=$|[/?#])/i.test(u.pathname)
      } catch { signingPage = false }
      if (signingPage) classes.push('permission')
    }
    // CU-498 (High; cu-coordinator 12:21Z): on a government or tax page - a .gov / gov.<cc> / gouv / gc.ca host, or a whole /tax, /taxes,
    // /benefits, /unemployment, /voter, /elections or /return(s) segment of an http(s) URL - amending a return, reporting income,
    // certifying for benefits and changing a voter registration ask in the class of 'File return' (submit). 'View return' stays free.
    // CU-499 (High; cu-coordinator 12:21Z): on a car or smart-lock page - a whole /vehicle(s), /car(s), /lock(s), /smart-lock, /door(s)
    // or /garage segment - a bare 'Unlock' asks PHYSICAL like 'Unlock car', and adding a driver or sharing a key asks PERMISSION.
    // 'Lock' and 'Vehicle status' stay free. Named limits: a native tax or car app (no URL).
    if (grammarEligible && classes.length === 0) {
      let govPage = false
      let carPage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) {
          govPage = /(?:^|\.)gov(?:\.[a-z]{2})?$|(?:^|\.)gouv\.[a-z]{2}$|(?:^|\.)gc\.ca$/i.test(u.hostname) || /(?:^|\/)(?:tax|taxes|benefits|unemployment|voter|elections|returns?)(?=$|[/?#])/i.test(u.pathname)
          carPage = /(?:^|\/)(?:vehicles?|cars?|locks?|smart-lock|doors?|garage)(?=$|[/?#])/i.test(u.pathname)
        }
      } catch { govPage = false; carPage = false }
      // #677 round 2 (cu-researcher 12:42Z): the ruled acts as families - certify (for) benefits / eligibility / a (weekly) claim;
      // report income / earnings / hours (worked) / wages; change / update a voter registration.
      if (govPage && /^\s*(?:amend\s+(?:my\s+|your\s+|the\s+)?(?:tax\s+)?return|report\s+(?:my\s+|your\s+)?(?:income|earnings|wages|hours(?:\s+worked)?)|certify\s+(?:for\s+)?(?:(?:my|your|weekly)\s+)*(?:benefits|unemployment|eligibility|(?:weekly\s+)?claim)|(?:change|update)\s+(?:my\s+|your\s+|the\s+)?voter\s+registration)\s*$/i.test(name)) classes.push('submit')
      if (carPage && /^\s*unlock(?:\s+now)?\s*!?\s*$/i.test(name)) classes.push('physical')
      if (carPage && /^\s*(?:add|invite)\s+(?:a\s+|an\s+|another\s+)?(?:secondary\s+|guest\s+|additional\s+|new\s+)?driver\s*$|^\s*share\s+(?:a\s+|my\s+|the\s+)?(?:digital\s+)?key\s*$/i.test(name)) classes.push('permission')
    }
    // #677 round 2 (cu-researcher 12:42Z): the direct-debit act in other words - a debit mandate or automatic / recurring withdrawals
    // set up, authorised or created - asks purchase anywhere, like 'Set up direct debit'.
    // #677 round 3 (cu-developer-three 12:47Z): allow / enable / turn on / activate too.
    // An older 'authorize' permission stays beside it (D-108: never lower).
    // CU-403 (cu-verifier 23:42Z live): an IDE's 'Sync Changes' pushes local commits like 'Push' does, so it asks submit as Push
    // does - 'Sync changes', 'Sync commits', 'Sync branch' as the control's name, with an optional count / arrow suffix
    // ('Sync Changes 1↓ 2↑'); r2 (cu-developer-two 23:50Z, cu-researcher 23:51Z): 'Commit & Sync', 'Synchronize Changes',
    // 'Push and pull', 'Sync with remote'; r3 (cu-researcher 23:58Z): 'Sync to remote', 'Pull and push', 'Commit, Push'; follow-up (cu-researcher 00:15Z, cu-developer-two 00:05Z): 'Pull, then push', 'Sync branch to
    // remote', 'Push commits' (a gap older than CU-403); r2 (cu-developer-two 00:58Z): 'Pull then push', 'Push branch'; r2 (cu-researcher 01:00Z): 'Push tags',
    // 'Push branch to remote', and the git-verb sequence family below; r3 (cu-researcher 01:05Z): 'Squash and push',
    // 'Push to all remotes'; r4 (cu-researcher 01:14Z): 'Cherry-pick and push', 'Revert and push', 'Fixup, then push'. A bare 'Sync', 'Settings Sync' or 'Synchronize panels' stays as it was.
    if (grammarEligible && !classes.includes('submit') && /^\s*(?:commit\s*(?:&|and|,)\s*(?:sync|push)|push\s*(?:&|and|,)\s*pull|pull\s*(?:(?:&|and|,)\s*(?:then\s+)?|then\s+)push|push\s+(?:the\s+)?(?:\d+\s+)?(?:local\s+)?(?:commits?|changes|branch(?:es)?|tags?|all)|push\s+to\s+(?:all\s+)?(?:the\s+)?(?:remotes?|origin|upstream)|sync(?:hroni[sz]e)?\s+(?:changes|commits?|branch|repository|repo|(?:with|to)\s+(?:the\s+)?(?:remote|origin|upstream))(?:\s+(?:with|to)\s+(?:the\s+)?(?:remote|origin|upstream))?)(?:\s+to\s+(?:the\s+)?(?:remote|origin|upstream))?(?:\s+[\d\s↑↓]+)?\s*$/iu.test(name)) classes.push('submit')
    // CU-403 follow-up r2 (cu-researcher 01:00Z): a sequence of git verbs joined by ',', 'then', 'and' or '&' asks submit
    // when any step pushes or syncs ('Fetch, then push', 'Pull, rebase and push', 'Commit, then sync'); a sequence with no
    // push / sync step ('Pull, then rebase', 'Fetch, then merge') stays as it was.
    if (grammarEligible && !classes.includes('submit')) {
      const gitVerb = '(?:pull|fetch|rebase|commit|stage|merge|stash|amend|squash|cherry[-\\s]?pick|revert|fixup|push|sync)'
      const gitSequence = new RegExp(`^\\s*${gitVerb}(?:\\s*(?:,\\s*(?:and\\s+|then\\s+)?|&\\s*|and\\s+(?:then\\s+)?|then\\s+)${gitVerb})+\\s*$`, 'i')
      if (gitSequence.test(name) && /\b(?:push|sync)\b/i.test(name)) classes.push('submit')
      // CU-597 (cu-researcher; cu-developer-one's go 02:20Z): the leading steps need not be listed git verbs - a sequence whose
      // LAST step is push ('Reword, then push', 'Stage all, commit and push', 'Bump version and push') asks submit, and a last
      // step 'sync' asks when it names a git object ('..., then sync changes / to remote'). A bare last 'sync' after another step
      // stays free ('Save and sync', 'Sign in and sync' sync the user's own data), as does a label with no push / sync step.
      const step = '[\\p{L}][\\p{L}\'-]*(?:\\s+[\\p{L}][\\p{L}\'-]*){0,2}'
      const join = '(?:\\s*,\\s*(?:and\\s+|then\\s+)?|\\s*&\\s*|\\s+and\\s+(?:then\\s+)?|\\s+then\\s+)'
      const lastPush = new RegExp(`^\\s*${step}(?:${join}${step}){0,3}${join}(?:push(?:\\s+(?:to\\s+)?(?:the\\s+)?(?:remotes?|origin|upstream|changes|commits?|branch(?:es)?|tags?))?|sync\\s+(?:(?:to|with)\\s+(?:the\\s+)?)?(?:remote|origin|upstream|changes|commits?|branch))\\s*$`, 'iu')
      if (!classes.includes('submit') && lastPush.test(name)) classes.push('submit')
    }
    // CU-619 (cu-researcher): German / Dutch separable call / join forms - 'Rufen Sie uns an', 'Ruf Anna an', 'Treten Sie dem Meeting
    // bei', 'Tritt jetzt bei', 'Neem deel', 'Bel Anna' - ask submit; a bare 'Bel' stays free (it is also a bell label).
    if (grammarEligible && !classes.includes('submit') && (/^\s*(?:ruf|rufe|rufen\s+sie)\s+(?:\p{L}+\s+){0,3}an\s*[.!]?\s*$/iu.test(name) || /^\s*(?:tritt|treten\s+sie)\s+(?:\p{L}+\s+){0,3}bei\s*[.!]?\s*$/iu.test(name) || /^\s*neem\s+(?:\p{L}+\s+){0,3}deel\s*[.!]?\s*$/iu.test(name) || /^\s*(?:nimm|nehmen\s+sie)\s+(?:\p{L}+\s+){0,4}teil\s*[.!]?\s*$/iu.test(name) || /^\s*bel\s+\p{L}+(?:\s+\p{L}+)?\s*[.!]?\s*$/iu.test(name))) classes.push('submit')
    // CU-621 (cu-researcher): sign out of all devices in the seven locales asks permission, as English does - an all-devices phrase
    // and a sign-out verb of one language in one short label ('Von allen Geräten abmelden', 'Cerrar sesión en todos los dispositivos').
    if (grammarEligible && !classes.includes('permission') && name.length <= 90 && SIGN_OUT_ALL_PAIRS.some(([all, verb]) => all.test(name) && verb.test(name))) classes.push('permission')
    // CU-617 (cu-researcher): German / Dutch separable and short imperatives of share / invite - 'Lade Freunde ein', 'Laden Sie
    // Kollegen ein', 'Nodig je team uit', 'Teile das Dokument', 'Deel de link' - ask permission; 'Deel 2' (a part number) stays free.
    if (grammarEligible && !classes.includes('permission') && (/^\s*(?:lade|laden\s+sie)\s+(?:\p{L}+\s+){1,3}ein\s*[.!]?\s*$/iu.test(name) || /^\s*nodig\s+(?:\p{L}+\s+){1,3}uit\s*[.!]?\s*$/iu.test(name) || /^\s*(?:teile|deel)\s+(?:\p{L}+\s*){1,3}[.!]?\s*$/iu.test(name) || /^\s*deel\s*[.!]?\s*$/iu.test(name))) classes.push('permission')
    // CU-615 r3 (cu-developer-three): the German / Dutch imperative family as one rule - start / begin (+ one adverb) + your
    // subscription / membership ('Starte jetzt dein Abo', 'Beginne deine Mitgliedschaft', 'Start nu je lidmaatschap'), and
    // switch (+ one adverb) to pro / premium / plus ('Wechsle jetzt zu Premium').
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:starte|beginne|starten\s+sie|beginnen\s+sie|start|begin)\s+(?:(?:jetzt|gleich|sofort|bitte|nu)\s+)?(?:deine?|ihre?|je|uw)\s+(?:abo|abonnement|mitgliedschaft|lidmaatschap)\s*[.!]?\s*$/iu.test(name)) classes.push('purchase')
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:wechsle|wechseln\s+sie|stap|stapt)\s+(?:(?:jetzt|gleich|sofort|bitte|nu)\s+)?(?:zu|auf|over\s+naar|over\s+op)\s+(?:pro|premium|plus)\s*[.!]?\s*$/iu.test(name)) classes.push('purchase')
    // CU-613 (cu-researcher): the ':' / '-' label form of 'start a subscription' - 'Suscripción mensual: empezar', 'Abo - starten'.
    // r3 (cu-developer-one): with one adverb between instead of the ':' ('Abo jetzt starten', 'Suscripción ahora iniciar').
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:suscripci[oó]n|abonnement|abo|abbonamento|assinatura|subscription|mitgliedschaft|membres[ií]a)(?:\s+\p{L}+)?(?:\s*[:\-–]\s*|\s+(?:jetzt|sofort|bitte|maintenant|ahora|agora|ora|adesso|nu|şimdi|now|please)\s+)(?:empezar|iniciar|comenzar|starten|beginnen|commencer|démarrer|avvia(?:re)?|inizia(?:re)?|começar|start|begin)\s*[.!]?\s*$/iu.test(name)) classes.push('purchase')
    // r3 (cu-developer-three's bar, accepted by cu-developer-one as owner): 'switch / change / move / upgrade to <paid plan>' -
    // pro, premium, plus, paid, annual, family - and 'business / team' only with plan / tier ('Switch to business account' is
    // a profile switch and stays free).
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:switch|change|move|upgrade|go)\s+to\s+(?:the\s+|a\s+)?(?:(?:pro|premium|plus|paid|annual|yearly|family)(?:\s+(?:plan|version|tier|edition|subscription|membership))?|(?:business|team|enterprise)\s+(?:plan|tier|subscription))\s*[.!]?\s*$/i.test(name)) classes.push('purchase')
    // CU-628 r2 (cu-developer-one): a bare 退订 / 退訂 (or with 全部 / 所有) is an unsubscribe and asks submit; 退订须知 / 退订政策 stay free.
    // CU-629: one modifier before it (立即 / 马上 / 现在 / 一键 / 确认) keeps submit; 退订邮件 / 短信 and 退订会员 / 套餐 / 服务 keep their
    // classes through the substring entries whatever modifier precedes them.
    if (grammarEligible && !classes.includes('submit') && /^\s*(?:我想|我要)?(?:立即|马上|馬上|現在|现在|一键|一鍵|确认|確認)?(?:退订|退訂)(?:全部|所有)?\s*$/u.test(name)) classes.push('submit')
    // CU-635 (cu-developer-two): opting out of / stopping / turning off e-mails with any determiner or kind; CU-634: leaving a
    // group or channel in Chinese with a modifier or demonstrative - submit, as 'Unsubscribe' / 'Leave group'. A bare 'Opt out' stays free.
    if (grammarEligible && !classes.includes('submit') && (/^\s*(?:opt[-\s]?out\s+of|opt\s+me\s+out\s+of|stop(?:\s+(?:sending(?:\s+(?:me|us))?|receiving|getting))?|turn\s+off|unsubscribe\s+from)\s+(?:all\s+)?(?:(?:our|my|these|the|marketing|promotional|newsletter|future)\s+){0,2}(?:e-?mails?|newsletters?|email\s+marketing|marketing\s+e-?mails?)\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:我要|我想)?(?:立即|马上)?(?:退出|离开|離開)(?:这个|這個|那个|那個|该|該|此|本|我的|我们的|我們的|你的|您的|你们的|你們的|他的|她的|他们的|他們的)?(?:群组|群組|群聊|群|频道|頻道)\s*$/u.test(name))) classes.push('submit')
    // CU-634 r2 (cu-developer-two / -three): leaving a team in Chinese with a modifier, demonstrative or possessive asks permission, as
    // 'Leave (this) team'.
    if (grammarEligible && !classes.includes('permission') && /^\s*(?:我要|我想)?(?:立即|马上)?(?:退出|离开|離開)(?:这个|這個|那个|那個|该|該|此|本|我的|我们的|我們的|你的|您的|你们的|你們的|他的|她的|他们的|他們的)?(?:团队|團隊)\s*$/u.test(name)) classes.push('permission')
    // CU-641 r3 (cu-developer-three): Dutch 'Wis' (wipe / clear) + an object asks delete, as 'Erase <object>' does for any object -
    // except the objects English clears without asking ('Clear search / filters / selection / form / cache / notifications'), so
    // 'Wis zoekopdracht', 'Wis de filters', 'Wis selectie' stay free (the wider clear-verb family is CU-642).
    if (grammarEligible && !classes.includes('delete')) {
      const wipe = String(name ?? '').trim().toLowerCase().match(/^(?:wis|wist\s+u)\s+(?:(?:de|het|je|jouw|uw|mijn|onze|alle|al|deze|dit|die)\s+){0,2}(\p{L}[\p{L}'’-]*)(?:\s+\p{L}[\p{L}'’-]*)?\s*[.!]?$/u)
      if (wipe && !WIS_CLEAR_OBJECTS.has(wipe[1])) classes.push('delete')
    }
    // CU-650 (cu-developer-one's go 04:21Z): Korean cancel / terminate (취소 / 해지) + subscription asks delete, + order / membership /
    // plan asks purchase, as 'Cancel subscription' / 'Cancel order / membership / plan' - both orders, with or without a space, with
    // the 하기 / 하세요 / 해 주세요 / 하십시오 endings. Bare 취소, the nouns and state or past forms ('구독 취소됨', '취소했어요') stay free.
    if (grammarEligible) {
      // r2 (cu-developer-one, -two, -three): the object particle 을 / 를 and a possessive (내 / 제 / 나의 / 저의) - '구독을 취소하세요',
      // '제 멤버십을 해지해 주세요'.
      const cancelKo = String(name ?? '').trim().match(/^(?:(?:내|제|나의|저의)\s*)?(?:(구독|주문|멤버십|요금제|플랜)(?:\s*(?:을|를))?\s*(?:취소|해지)|(?:취소|해지)\s*(구독|주문|멤버십|요금제|플랜))(?:하기|하세요|해\s?주세요|하십시오)?\s*[.!]?$/u)
      if (cancelKo) { const cls = (cancelKo[1] ?? cancelKo[2]) === '구독' ? 'delete' : 'purchase'; if (!classes.includes(cls)) classes.push(cls) }
    }
    // CU-644 (cu-developer-one's go 07:00Z): clearing a history deletes it, as 'Clear history' does - clear / erase / wipe, then up to
    // two words (your / my / all / the, or a qualifier: search, browsing, chat, call, watch, viewing, location, order, recent,
    // purchase, download), then 'history': 'Clear search history', 'Clear your browsing history', 'Clear all chat history'. A label
    // that only names, opens, pauses or toggles a history stays free ('Search history', 'View history', 'Pause watch history').
    // r2 (cu-developer-two's hold; cu-developer-one's settled bar 07:56Z): ANY one to four words between the verb and 'history' -
    // 'Clear entire / old / previous / YouTube / 30-day history', 'Clear your entire search history', 'Clear download history'
    // (a noun compound); five or more words stay out, and so does any label that does not start with clear / erase / wipe.
    if (grammarEligible && !classes.includes('delete') && /^(?:clear|erase|wipe)(?:\s+\S+){0,4}\s+history\s*[.!]?$/i.test(String(name ?? '').trim())) classes.push('delete')
    // CU-654 (cu-developer-one's go 12:05Z): the locale twins of CU-644 - a clear verb that does not ask by itself (vider /
    // limpiar / limpar / svuotare / leeren) asks delete with a history noun after up to four words ('Vider tout l'historique',
    // 'Limpiar el historial de búsqueda', 'Browserverlauf leeren'); with any other object it stays free ('Vider le panier').
    if (grammarEligible && !classes.includes('delete') && LOCALE_HISTORY_CLEAR.some((re) => re.test(String(name ?? '').trim()))) classes.push('delete')
    // CU-655 (cu-developer-one's design): the locale twins of 'Empty trash' (LOCALE_TRASH_EMPTY above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_TRASH_EMPTY.some((re) => re.test(String(name ?? '').trim())) || namesRuTrashEmpty(name))) classes.push('delete')
    // CU-686: fr / ko remove-member twins (delete) and fr 'Exclure le membre' (permission, as 'Kick member').
    if (grammarEligible && !classes.includes('delete') && LOCALE_REMOVE_MEMBER.some((re) => re.test(String(name ?? '').trim()))) classes.push('delete')
    if (grammarEligible && !classes.includes('permission') && LOCALE_KICK_MEMBER.some((re) => re.test(String(name ?? '').trim()))) classes.push('permission')
    // CU-683: locale revoke-access twins (LOCALE_REVOKE_ACCESS above).
    if (grammarEligible && !classes.includes('permission') && (LOCALE_REVOKE_ACCESS.some((re) => re.test(String(name ?? '').trim().replace(/İ/g, 'i'))) || namesRuRevokeAccess(name))) classes.push('permission')
    // CU-687: ja / ko / zh grant-access, share-with-everyone and invite twins and the ru builder (CJK_GRANT_SHARE_INVITE above).
    if (grammarEligible && !classes.includes('permission') && (CJK_GRANT_SHARE_INVITE.some((re) => re.test(String(name ?? '').trim())) || namesRuGrantShareInvite(name))) classes.push('permission')
    // CU-684: locale leave-workspace twins (LOCALE_LEAVE_WORKSPACE above).
    if (grammarEligible && !classes.includes('permission') && (LOCALE_LEAVE_WORKSPACE.some((re) => re.test(String(name ?? '').trim())) || namesRuLeaveWorkspace(name))) classes.push('permission')
    // CU-678: transfer-ownership twins (TRANSFER_OWNERSHIP above).
    if (grammarEligible && !classes.includes('permission') && (TRANSFER_OWNERSHIP.some((re) => re.test(String(name ?? '').trim())) || namesRuTransferOwnership(name))) classes.push('permission')
    // CU-677: locale make-public twins (LOCALE_MAKE_PUBLIC above).
    if (grammarEligible && !classes.includes('permission') && (LOCALE_MAKE_PUBLIC.some((re) => re.test(String(name ?? '').trim())) || namesRuMakePublic(name))) classes.push('permission')
    // CU-673: ja / ko / zh sign-out-everywhere twins (CJK_SIGNOUT_ALL above).
    if (grammarEligible && !classes.includes('permission') && CJK_SIGNOUT_ALL.some((re) => re.test(String(name ?? '').trim()))) classes.push('permission')
    // CU-676: locale close-account twins (LOCALE_ACCOUNT_CLOSE above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_ACCOUNT_CLOSE.some((re) => re.test(String(name ?? '').trim())) || namesRuAccountClose(name))) classes.push('delete')
    // CU-672: locale account-deactivation twins (LOCALE_ACCOUNT_DEACTIVATE above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_ACCOUNT_DEACTIVATE.some((re) => re.test(String(name ?? '').trim())) || namesRuAccountDeactivate(name))) classes.push('delete')
    // CU-670: locale 'Reset settings' / factory-reset twins (LOCALE_RESET_SETTINGS above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_RESET_SETTINGS.some((re) => re.test(String(name ?? '').trim())) || namesRuResetSettings(name))) classes.push('delete')
    // CU-668: locale clear-data twins (LOCALE_DATA_CLEAR above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_DATA_CLEAR.some((re) => re.test(String(name ?? '').trim())) || namesRuDataClear(name))) classes.push('delete')
    // CU-663: the locale twins of CU-659 (LOCALE_FOLDER_EMPTY above).
    if (grammarEligible && !classes.includes('delete') && (LOCALE_FOLDER_EMPTY.some((re) => re.test(String(name ?? '').trim())) || namesRuFolderEmpty(name))) classes.push('delete')
    // CU-659 (cu-developer-one's go 17:13Z): emptying a mail or file folder deletes its items, as 'Empty trash' does - 'Empty Deleted
    // Items', 'Empty the Junk Email folder', 'Empty your inbox', 'Empty this folder', a bare 'Empty folder' button; and 'Clear
    // storage' wipes an app's data as 'Clear app data' does. Status and past forms, carts, caches and bare nouns stay free.
    // r2 (cu-developer-two, -three; cu-developer-one's list 18:42Z): the design's open slot of up to four words ('Empty the entire
    // inbox', 'Empty Clutter folder'), Outbox, one or two words before 'storage' ('Clear site storage'), and negation as its twin
    // ("Don't empty this folder" asks as "Don't empty trash" does).
    // Follow-up (cu-developer-three's finding, cu-developer-one 19:50Z): a preposition or a verb in the slot makes the folder a place,
    // not the object - 'Empty message in Drafts', 'Empty state for inbox', 'Empty items stay in Inbox' stay free. r2 (cu-developer-three):
    // quantified contents (all / any / every / each / everything / the whole / the entire, cu-developer-one) before in / from / of keep
    // asking, as 'Empty everything in the trash' does ('Empty all items in Deleted Items', 'Empty all of my drafts'), with any words after
    // the quantifier (r3, cu-developer-three: 'Empty all old items in Deleted Items', 'Empty all unread messages in Inbox'); a plural content noun
    // first counts as a quantifier (cu-developer-one 23:37Z: 'Empty items from Deleted Items', 'Empty messages in Junk Email') unless a
    // verb follows it ('Empty items stay in Inbox' stays free); CU-664 (cu-developer-one's design 01:31Z): up to two adjectives may
    // lead the plural noun ('Empty old documents from this folder', 'Empty unread messages in Inbox'), and Spam is a folder noun ('Empty all
    // messages in Spam'); 'of' after
    // anything else names a place ('Empty copy of Inbox').
    if (grammarEligible && !classes.includes('delete') && (/^(?:(?:don['’]t|do\s+not)\s+)?empty(?:\s+(?!(?:in|into|inside|within|for|from|of|to|on|at|under|is|are|was|were|will|be|been|stays?|remains?|appears?|shows?|shown|moves?|goes|saved|sent|found)\b)\S+){0,4}?\s+(?:deleted\s+items|junk(?:\s+e-?mail)?|inbox|drafts|sent(?:\s+items|\s+mail)?|archive|outbox|spam|folders?|mailbox)(?:\s+folders?)?(?:\s+(?:now|permanently|completely))?\s*[.!]?$/i.test(String(name ?? '').trim())
      || /^(?:(?:don['’]t|do\s+not)\s+)?empty\s+(?:(?:all|any|every|each|everything|the\s+whole|the\s+entire|the\s+contents)(?:\s+\S+){0,3}?|(?:(?!(?:in|into|inside|within|for|from|of|to|on|at|under|is|are|was|were|will|be|been|stays?|remains?|appears?|shows?|shown|moves?|goes|saved|sent|found)\b)\S+\s+){0,2}?(?:items|messages|e-?mails|mail|files|contents|attachments|conversations|threads|chats|notes|documents|photos)(?:\s+(?!(?:is|are|was|were|will|be|been|stays?|remains?|appears?|shows?|shown|moves?|goes|saved|sent|found)\b)\S+){0,3}?)\s+(?:in|inside|from|of)\s+(?:(?:the|your|my|this)\s+)?(?:deleted\s+items|junk(?:\s+e-?mail)?|inbox|drafts|sent(?:\s+items|\s+mail)?|archive|outbox|spam|folders?|mailbox)(?:\s+folders?)?(?:\s+(?:now|permanently|completely))?\s*[.!]?$/i.test(String(name ?? '').trim())
      || /^clear(?:\s+\S+){0,2}?\s+storage(?:\s+now)?\s*[.!]?$/i.test(String(name ?? '').trim()))) classes.push('delete')
    // CU-627 r2 (cu-developer-two): leaving a group with any article / demonstrative / possessive, and the German separable e-mail
    // opt-out, as whole-label rules in each language - submit, as English 'Leave group' / 'Unsubscribe'.
    if (grammarEligible && !classes.includes('submit') && (/^\s*(?:quitter|quittez|quitte|quittons)\s+(?:le|ce|cet|votre|ton|mon|notre|leur)\s+groupe\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:(?:salir|sal|salga|salgan|salid)\s+de(?:l|\s+(?:este|ese|aquel|tu|su|mi|nuestro|vuestro))|(?:abandonar|abandona|abandone|abandonen|abandonad)\s+(?:el|este|ese|tu|su|mi|nuestro|vuestro))\s+grupo\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:(?:sair|sai|saia|saiam|saiamos)\s+d(?:o|este|esse)|(?:deixar|deixa|deixe|deixem|abandonar|abandona|abandone|abandonem)\s+(?:o|este|esse))(?:\s+(?:seu|teu|meu|nosso|vosso))?\s+grupo\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:(?:esci|uscite|esca|uscire)\s+da(?:l|\s+questo)?|(?:abbandona|abbandonate|abbandoni|abbandonare|lascia|lasciate|lasci|lasciare)\s+(?:il|questo))(?:\s+(?:tuo|suo|mio|nostro|vostro|loro))?\s+gruppo\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:(?:verlaat|verlaten)\s+(?:de|deze|die|je|jouw|uw|onze|mijn|jullie|hun)\s+groep|(?:(?:de|deze|die|je|jouw|uw|onze|mijn|jullie|hun)\s+)?groep\s+verlaten)\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:(?:verlasse|verlass|verlasst|verlassen\s+sie)\s+(?:die|diese|deine|ihre|unsere|meine|eure)\s+gruppe|(?:(?:die|diese|deine|ihre|unsere|meine|eure)\s+)?gruppe\s+verlassen)\s*[.!]?\s*$/iu.test(name)
      || /^\s*(?:melde\s+dich|melden\s+sie\s+sich)\s+(?:vom|von)\s+(?:\p{L}+\s+){0,2}(?:newsletter|e-mails?|emails?|mails?)\s+ab\s*[.!]?\s*$/iu.test(name))) classes.push('submit')
    // CU-629 (cu-researcher): one adverb inside a subscription-family label ('Abonnement direct opzeggen', 'Abo jetzt kündigen',
    // 'Annuler maintenant l'abonnement') keeps the twin class - the label is read again with that one adverb dropped.
    const subscriptionLabels = [name]
    if (SUBSCRIPTION_NOUN.test(name) && ONE_ADVERB.test(name)) subscriptionLabels.push(name.replace(ONE_ADVERB, ''))
    // CU-633 (cu-developer-two): or that adverb as the last word ('Cancel my subscription now', '... immediately').
    else if (SUBSCRIPTION_NOUN.test(name) && TRAILING_ADVERB.test(name)) subscriptionLabels.push(name.replace(TRAILING_ADVERB, ''))
    for (const label of subscriptionLabels) {
      // CU-633: English cancel + a determiner + subscription reads as 'Cancel subscription' (delete).
      if (grammarEligible && !classes.includes('delete') && /^\s*cancel\s+(?:my|your|the|this|our)\s+subscription\s*[.!]?\s*$/i.test(label)) classes.push('delete')
      // CU-625 r3 (cu-developer-two): the French and German cancel / end families as whole-label rules, each form in its English
      // twin's class - cancel + subscription -> delete; end + subscription, and any verb + membership / plan -> purchase.
      if (grammarEligible && !classes.includes('delete') && (/^\s*(?:annuler|annulez|annule|résilier|résiliez|résilie)\s+(?:l['’]\s*|mon\s+|votre\s+|ton\s+)abonnement\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:(?:kündige|kündigen\s+sie)\s+(?:(?:dein|ihr|das)\s+)?(?:abo|abonnement)|(?:(?:dein|ihr|das|mein)\s+)?(?:abo|abonnement)\s+kündigen)\s*[.!]?\s*$/iu.test(label))) classes.push('delete')
      if (grammarEligible && !classes.includes('purchase') && (/^\s*(?:(?:mettre|mettez|mets)\s+fin\s+(?:à|a)\s+|terminer\s+|terminez\s+|termine\s+)(?:l['’]\s*|mon\s+|votre\s+|ton\s+)(?:abonnement|adhésion|forfait)\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:(?:mettre|mettez|mets)\s+fin\s+au\s+|(?:terminer|terminez|termine|annuler|annulez|annule|résilier|résiliez|résilie)\s+le\s+)forfait\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:annuler|annulez|annule|résilier|résiliez|résilie)\s+(?:l['’]\s*|mon\s+|votre\s+|ton\s+)(?:adhésion|forfait)\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:(?:beende|beenden\s+sie)\s+(?:(?:dein|ihr|das)\s+)?(?:abo|abonnement)|(?:(?:dein|ihr|das|mein)\s+)?(?:abo|abonnement)\s+beenden)\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:kündige|kündigen\s+sie|beende|beenden\s+sie)\s+(?:(?:deine|ihre|die|deinen|ihren|den)\s+)?(?:mitgliedschaft|tarif)\s*[.!]?\s*$/iu.test(label)
        || /^\s*(?:(?:deine|ihre|die|meine|deinen|ihren|den|meinen)\s+)?(?:mitgliedschaft|tarif)\s+(?:kündigen|beenden)\s*[.!]?\s*$/iu.test(label))) classes.push('purchase')
    }
    if (subscriptionLabels.length > 1 && grammarEligible) {
      if (!classes.includes('delete') && namesDelete(subscriptionLabels[1])) classes.push('delete')
      if (!classes.includes('purchase') && namesPurchase(subscriptionLabels[1])) classes.push('purchase')
    }
    // CU-633: a bare 'Cancel now' (or a locale twin) on a billing / subscription / membership page cancels the plan - delete, as
    // 'Cancel subscription' asks. The page is a billing / subscription(s) / membership(s) path segment or a billing /
    // subscriptions host label (CU-537's page test). Before the phrase grammar, whose '<cancel> now' reads purchase.
    if (grammarEligible && classes.length === 0 && BARE_CANCEL_NOW.test(name)) {
      let billingPage = false
      try {
        const u = new URL(url)
        billingPage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:billing|subscriptions?|memberships?)(?=$|[/?#])/i.test(u.pathname) || /(?:^|\.)(?:billing|subscriptions?)(?:\.|$)/i.test(u.hostname))
      } catch { billingPage = false }
      if (billingPage) classes.push('delete')
    }
    // CU-620 (cu-researcher): a factory reset in any word order and language asks delete, as 'Factory reset' / 'Reset all
    // settings' / 'Erase all content and settings' do - a factory word and a reset verb in one short label ('Reset to factory
    // settings', 'Restore factory defaults', '恢复出厂设置', 'Auf Werkseinstellungen zurücksetzen', 'Fabrika ayarlarına sıfırla').
    if (grammarEligible && !classes.includes('delete') && name.length <= 90 && FACTORY_RESET_PAIRS.some(([factory, verb]) => factory.test(name) && verb.test(name))) classes.push('delete')
    // CU-413: money moved out to a bank or card, as 'Withdraw to bank' already asks - send / transfer / move / pay out / cash out
    // (an optional amount or money noun) to (my / the) bank, bank account, checking, savings or debit card.
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:send|transfer|move|pay\s*out|cash\s*out|withdraw)\s+(?:(?:money|funds|cash|balance|earnings|payout|it|[$€£]?\s*[\d.,]+(?:\s*(?:usd|eur|gbp|dollars?|euros?))?)\s+)?(?:to|into)\s+(?:my\s+|your\s+|the\s+|a\s+)?(?:bank(?:\s+account)?|checking(?:\s+account)?|savings(?:\s+account)?|debit\s+card|current\s+account)\b/i.test(name)) classes.push('purchase')
    // CU-611 (cu-researcher; cu-developer-one's go 13:22Z): a transfer noun, then its confirming verb, with one adverb or a ':' /
    // '-' between - 'Überweisung jetzt ausführen', 'Virement : confirmer', 'Transferencia: confirmar', 'Overboeking: bevestigen' -
    // asks purchase as the contiguous forms (#995) do. The whole label must be the noun and the verb. CU-615: 'bitte' counts
    // as the adverb too (cu-verifier's CU-611 named limit, 'Überweisung bitte bestätigen').
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:überweisung|virement|transferencia|transferência|overboeking|transfer(?:i|ı)?|havale(?:yi)?|bonifico)\s*(?:[:\-–]\s*|\s+(?:jetzt|sofort|bitte|maintenant|ahora|agora|ora|adesso|nu|şimdi)\s+)(?:jetzt\s+|sofort\s+|bitte\s+)?(?:ausführen|bestätigen|absenden|senden|confirmer|valider|effectuer|envoyer|confirmar|realizar|enviar|bevestigen|uitvoeren|versturen|verzenden|onayla(?:yın)?|gönder(?:in)?|conferma(?:re)?|esegui|invia)\s*[.!]?\s*$/iu.test(name)) classes.push('purchase')
    if (grammarEligible && !classes.includes('purchase') && /^\s*(?:set\s+up|authori[sz]e|create|start|allow|enable|turn\s+on|activate)\s+(?:an?\s+|the\s+)?(?:direct\s+debit|debit\s+mandate|automatic\s+(?:withdrawals?|debits?)|recurring\s+(?:withdrawals?|debits?))\s*$/i.test(name)) classes.push('purchase')
    // #680 round 3 (cu-researcher 13:02Z): on an exchange's wallet page - a whole /withdraw, /withdrawal(s), /wallet(s), /addresses or
    // /address-book segment of an http(s) URL - a bare 'Add to allowlist / whitelist' is the money redirect and asks credential; on a
    // mail or ad-block page it stays free. Named limit: a native exchange app (no URL) keeps the bare form free.
    if (grammarEligible && classes.length === 0 && /^\s*add\s+to\s+(?:the\s+)?(?:whitelist|allowlist|white\s+list|allow\s+list)\s*$/i.test(name)) {
      let walletPage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) walletPage = /(?:^|\/)(?:withdraw|withdrawals?|wallets?|addresses|address-book)(?=$|[/?#])/i.test(u.pathname)
      } catch { walletPage = false }
      if (walletPage) classes.push('credential')
    }
    // #693 round 2 (cu-researcher 14:53Z): a bare 'Add rule' on a mail page - a mail host or a whole /mail, /inbox, /rules, /filters
    // segment of an http(s) URL - is a mail rule (credential, like 'Create rule'); elsewhere it stays free (CU-492: a cloud console's
    // form opener).
    if (grammarEligible && classes.length === 0 && /^\s*add\s+(?:a\s+|new\s+|a\s+new\s+)?rule\s*$/i.test(name)) {
      let mailPage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) mailPage = /(?:^|\.)(?:mail|outlook|inbox)\./i.test(u.hostname) || /(?:^|\/)(?:mail|inbox|rules|filters)(?=$|[/?#])/i.test(u.pathname)
      } catch { mailPage = false }
      // #693 round 3 (cu-developer-three 14:56Z): a native mail client is a mail page too - Apple Mail's Rules pane titles its button
      // exactly 'Add Rule'.
      // #693 round 4 (cu-developer-three 15:02Z): on the real desktop route the url is a bare 'desktop://' - the app is read the way
      // the policy reads it elsewhere, from target.origin, else context.frontmostBundleId (and from an 'app:' url, the tests' shape).
      const mailClients = /^(?:com\.apple\.mail|com\.microsoft\.outlook|com\.readdle\.smartemail-mac|com\.readdle\.spark|it\.bloop\.airmail2|com\.mimestream\.mimestream|org\.mozilla\.thunderbird|com\.superhuman\.electron)$/i
      const appBundle = (typeof target?.origin === 'string' && target.origin !== '' && !/^https?:/i.test(target.origin)) ? target.origin : String(context?.frontmostBundleId ?? '')
      const urlBundle = (/^(?:app:|desktop:\/\/)([\w.-]+)/i.exec(String(context?.url ?? '')) ?? [])[1] ?? ''
      if (!mailPage) mailPage = mailClients.test(appBundle) || mailClients.test(urlBundle)
      if (mailPage) classes.push('credential')
    }
    // CU-491 (High; cu-coordinator 10:19Z): on a home-security page - a whole /security, /alarm, /cameras or /home-security
    // segment of an http(s) URL - silencing, muting, snoozing an alarm or siren and pausing / stopping a recording ask PHYSICAL, like
    // 'Turn off alarm'. Off that URL a meeting's 'Stop recording' stays free (#462). Named limit: a native security app (no URL).
    // #659 round 2 (cu-researcher 10:26Z): the segments exactly as ruled (a phone clock's /alarms is not /alarm); a trailing
    // on / for / from phrase ('on all cameras', 'for 1 hour') keeps the row.
    if (grammarEligible && classes.length === 0 && /^\s*(?:silence|mute|snooze|hush)\s+(?:the\s+)?(?:alarms?|sirens?|chimes?)(?:\s+(?:on|for|from)\s+[\w\s-]{1,40})?\s*$|^\s*(?:pause|stop)\s+(?:the\s+)?(?:recording|camera\s+recording|cameras?)(?:\s+(?:on|for|from)\s+[\w\s-]{1,40})?\s*$/i.test(name)) {
      // CU-520 (19:51Z): the shared home-security page test (vendor / camera hosts too).
      if (isHomeSecurityPage(context?.url)) classes.push('physical')
    }
    // CU-490 (High; cu-coordinator 09:51Z): a ride-share or delivery booking commit asks purchase - 'Confirm pickup', 'Confirm <product>'
    // and 'Request <product>' (one or two words: 'Request UberX', 'Confirm Comfort') on a ride / delivery page, a whole /ride, /rides,
    // /trip, /book or /request segment of an http(s) URL; 'Confirm ride', 'Book ride' and 'Request ride' ask anywhere (the grammar row).
    if (grammarEligible && classes.length === 0 && /^\s*(?:confirm|request)\s+\S+(?:\s+\S+)?\s*$/i.test(name) && !/^\s*(?:confirm|request)\s+(?:password|email|e-mail|code|changes?|details|access|refund|a\s+refund|help|support|demo|quote|callback|info|information)\b/i.test(name)) {
      let ridePage = false
      try {
        const u = new URL(String(context?.url ?? ''))
        if (/^https?:$/.test(u.protocol)) ridePage = /(?:^|\/)(?:ride|rides|trip|trips|book|request)(?=$|[/?#])/i.test(u.pathname)
      } catch { ridePage = false }
      if (ridePage) classes.push('purchase')
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
    // CU-488 (prepared; cu-researcher 07:44Z): a verb-only control beside its setting's label ('Two-factor authentication [Turn off]')
    // - the driver's target.caption completes it ('Turn off Two-factor authentication'), one more form, tried last (adds only).
    // #643 round 2 (cu-researcher 07:56Z): a table caption joins the column header and the row's text with ' · ' ('Action · Remote
    // management') - the row's own text, the last part, is the setting.
    const captionText = typeof target?.caption === 'string' ? (target.caption.split(/\s+[\u00b7|]\s+/).pop() ?? '').trim() : ''
    const verbOnly = /^\s*(?:turn\s+(?:on|off)|switch\s+(?:on|off)|enable|disable|activate|deactivate|show|reveal|view|remove|delete|revoke|reset|unlock|change|edit|update|manage|export|download|add)\s*$/i.test(name)
    const captionForm = verbOnly && captionText !== '' && captionText.length <= 80 ? `${String(name).trim()} ${captionText}` : ''
    const confirmForms = context.confirmProbe === true || target?.quickActions === true ? []
      : [...new Set([...canonicalForms(name), ...(firstLine !== '' && firstLine !== String(name ?? '').trim() ? [firstLine, ...canonicalForms(firstLine)] : []), ...(captionForm !== '' ? [captionForm, ...canonicalForms(captionForm)] : [])])]
    for (const confirmForm of confirmForms) {
      if (!(grammarEligible && classes.length === 0 && !nativeOn)) break
      const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: confirmForm }, confirmProbe: true })
      if (probe.decision === 'block' || probe.decision === 'handoff') return probe
      if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) classes.push(cls)
    }
    // CU-528 (High; cu-coordinator 22:21Z + 22:22Z): a trailing '?' / '.' / '!' or a question lead-in ('Are you sure you want to
    // <row>?', 'Really <row>?', 'Do you (really) want to <row>?') never frees a row or drops its class off a union row - the whole
    // classify runs once more on the stripped form and its classes are UNIONED in (adds only, never lowers; one level, no re-probe).
    // A Quick Actions menu item is judged by its exact built-in name (CU-382), so it never takes the probe.
    const questionForm = context.questionProbe === true || target?.quickActions === true ? '' : questionStripped(name)
    if (grammarEligible && !nativeOn && questionForm !== '') {
      const probe = classify(action, { ...context, target: { ...target, name: questionForm }, questionProbe: true })
      if (probe.decision === 'block' || probe.decision === 'handoff') return probe
      if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) classes.push(cls)
    }
    // #653 round 2 (cu-developer-three 09:10Z): a switch named by a bare acronym ('RDP', 'MFA', '2SV') is judged as the setting it stands
    // for - re-run with the expanded name, so the switch rules give it direction (also when a native switch reads on).
    const toggleTarget = /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? '')) || /^checkbox$/i.test(String(target?.inputType ?? ''))
    const toggleName = toggleTarget && classes.length === 0 && context.confirmProbe !== true ? toggleExpansion(name) : ''
    if (toggleName !== '') {
      const probe = classify(action, { ...context, target: { ...target, name: toggleName }, confirmProbe: true })
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
    // #841 r3 (cu-developer-three 01:35Z; the older class leads): the people-list row returns permission first, which dropped the older
    // submit 'Upload user list' asked on main - keep it beside permission (a union, like 'Upgrade to options level 2').
    if (grammarEligible && classes.includes('permission') && !classes.includes('submit') && /^\s*upload\s+(?:all\s+|my\s+|your\s+|the\s+|a\s+)?users?\s+lists?\s*$/i.test(String(name ?? ''))) classes.push('submit')
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
    // CU-501 (High; cu-coordinator 13:21Z), as verb families with object synonyms: at a registrar, pushing a domain to another account or
    // changing its registrant hands the domain over (the class of 'Transfer out', purchase); changing MX records or nameservers, turning
    // off DNSSEC and unlocking the domain redirect or expose it (permission). Only where nothing asked yet: the rows CU-446 ruled
    // ('Push domain', 'Change registrant', 'Unlock domain', 'Turn off domain lock' credential; 'Transfer ownership' permission) keep
    // their class exactly (D-108; reclass 0). 'DNS records' stays free.
    if (grammarEligible) {
      // #688 round 2 (cu-researcher 14:21Z): object synonyms - 'Push to another account' (no object), 'Change domain owner (account)',
      // 'Update mail servers / exchangers'.
      const domainHandover = /^\s*(?:push|move|transfer)\s+(?:the\s+|this\s+|my\s+)?(?:domains?\s+(?:names?\s+)?)?to\s+(?:another|a\s+different|a\s+new|other|an\s+external)\s+(?:account|registrar|user|owner|customer)\s*$|^\s*change\s+(?:the\s+)?domain\s+owner(?:\s+account)?\s*$|^\s*(?:push|move|give|hand\s+over)\s+(?:the\s+|this\s+|my\s+)?domains?(?:\s+(?:name|names))?(?:\s+to\s+(?:another|a\s+different|a\s+new|other|an\s+external)\s+(?:account|registrar|user|owner|customer))?\s*$|^\s*(?:change|update|edit|transfer)\s+(?:the\s+|domain\s+)?(?:registrant|domain\s+owner|ownership)(?:\s+(?:contact|details|name|information|info))?\s*$/i
      const domainExposure = /^\s*(?:change|edit|update|modify|set|replace|use\s+custom)\s+(?:the\s+|custom\s+|your\s+)?(?:mx\s+records?|mail\s+(?:exchange|server)\s+records?|mail\s+servers?|mail\s+exchangers?|name\s*servers?|dns\s+servers?)\s*$|^\s*(?:disable|turn\s+off|deactivate|remove|switch\s+off)\s+(?:the\s+)?(?:dnssec|domain\s+(?:lock|protection)|registrar\s+lock|transfer\s+lock)\s*$|^\s*unlock\s+(?:the\s+|this\s+|my\s+)?domains?(?:\s+for\s+transfer)?\s*$/i
      if (classes.length === 0 && domainHandover.test(name)) classes.push('purchase')
      else if (classes.length === 0 && domainExposure.test(name)) classes.push('permission')
    }
    // #683 round 2 (cu-coordinator 13:36Z): a quantified (or, #694 r2, labelled) name that already asks takes the full class set of its row
    // too ('Approve each sign-in' asks permission beside the older submit, like 'Approve sign-in') - adds only.
    if (grammarEligible && classes.length > 0 && context.confirmProbe !== true && String(name ?? '').length <= 200) {
      // #694 round 2 (cu-researcher 15:05Z; the 13:36Z union): the section-label rest too - 'Pay settings: Change direct deposit'
      // keeps the older purchase from 'pay' and takes credential from its rest.
      for (const form of [...quantifierDropped(String(name ?? '').trim()), ...sectionLabelStripped(name)]) {
        const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: form }, confirmProbe: true })
        if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) if (!classes.includes(cls)) classes.push(cls)
      }
    }
    // CU-507 (High; cu-coordinator 16:06Z): a generic confirm control inside an in-page modal (role=dialog / alertdialog / <dialog>;
    // on the desktop an AXSheet / AXDialog) asks the classes the modal's title and description get as a name - never fewer than the
    // button alone; a modal whose text gets no class stays free. The driver reports target.dialogName / target.dialogDescription.
    {
      // One shape on both routes (cu-developer-two 16:12Z, option a): the web driver and the desktop helper fill
      // target.dialogName / target.dialogDescription.
      const pick = (value) => (typeof value === 'string' ? value.trim().slice(0, 300) : '')
      const dialogName = pick(target?.dialogName)
      const dialogDescription = pick(target?.dialogDescription)
      const presses = POINTER.has(action.type) || keysOf(action).has('ENTER') || keysOf(action).has('SPACE')
      // CU-507 follow-up (cu-coordinator 18:21Z): a 'Continue to <rest>' / 'Proceed to <rest>' control inside a dialog asks the union of
      // its own rest (judged as a name) and the dialog title's class; the page-level navigation ruling for 'Continue to' stays.
      const continueTo = /^\s*(?:continue|proceed|go\s+on|move\s+on)\s+to\s+(\S.*)$/i.exec(String(name ?? ''))
      if (context.confirmProbe !== true && presses && (dialogName !== '' || dialogDescription !== '') && continueTo) {
        const restProbe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { role: 'button', name: continueTo[1].trim(), ...(target?.origin ? { origin: target.origin } : {}) } })
        if (restProbe.decision === 'confirm') for (const cls of restProbe.classes ?? [restProbe.class]) if (!classes.includes(cls)) classes.push(cls)
      }
      if (context.confirmProbe !== true && presses && (dialogName !== '' || dialogDescription !== '') && (GENERIC_CONFIRM.test(String(name ?? '')) || continueTo)) {
        // cu-researcher 16:09Z: a title is a question more often than a row - 'Are you sure you want to <row>?', 'Really <row>?',
        // '<row>?' - so a title canonical step strips the question frame before the title is judged as a name.
        // #702 round 2 (cu-researcher 16:24Z): descriptions lead with 'This will / This action will / You are about to / Doing this will'.
        const titleRow = (text) => text.replace(/[?!.:\s]+$/, '').replace(/^\s*(?:(?:are\s+you\s+(?:sure|certain)|you\s+are\s+about|you're\s+about)(?:\s+(?:that\s+)?you\s+(?:want|wish))?\s+to|do\s+you\s+(?:really\s+)?(?:want|wish)\s+to|(?:would|do)\s+you\s+like\s+to|(?:this|this\s+action|doing\s+this|that|it)(?:\s+cannot\s+be\s+undone\s+and)?\s+will(?:\s+permanently)?|really|confirm(?:\s+that\s+you\s+want\s+to)?|permanently)\s+/i, '').trim()
        // #702 round 3 (cu-developer-three 16:35Z): a sentence about what happens if the person does NOT confirm ('Your changes will be
        // lost if you don't save them', '... unless you ...') describes the other button, so it is not judged for the confirm.
        const consequenceOfNot = /\b(?:if\s+you\s+(?:don'?t|do\s+not|choose\s+not\s+to|cancel|leave|close)|unless\s+you|otherwise)\b/i
        const kept = dialogDescription.split(/(?<=[.!?])\s+/).filter((sentence) => !consequenceOfNot.test(sentence))
        const firstSentence = kept[0] ?? ''
        const keptDescription = kept.join(' ')
        const texts = [...new Set([dialogName, titleRow(dialogName), firstSentence, titleRow(firstSentence), `${titleRow(dialogName)} ${keptDescription}`.trim()].filter((t) => t !== ''))]
        for (const text of texts) {
          // #702 round 2: the title is judged with the FULL canonical form (synonym, quantifier, label and clause steps run only
          // outside a confirm probe), so no confirmProbe flag here; the probe target carries no dialog fields, so it cannot recurse.
          const probe = classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { role: 'button', name: text, ...(target?.origin ? { origin: target.origin } : {}) } })
          if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) if (!classes.includes(cls)) classes.push(cls)
        }
      }
    }
    // CU-506 (compound sweep): a name of verb-led clauses ('Review and confirm withdrawal') asks the union of its clauses - tried last,
    // adds only, whether or not the whole name already asked.
    // A name that is itself a ruled table row ('Sign and file', CU-459: submit) keeps its ruled class set (D-108: reclass 0).
    if (grammarEligible && context.confirmProbe !== true && grammarClassesBase(name).length === 0) {
      const clauses = clauseSplit(name)
      const probes = clauses.map((clause) => classify({ type: 'click', x: 0, y: 0, button: 'left' }, { ...context, target: { ...target, name: clause }, confirmProbe: true }))
      // #699 round 2 (cu-researcher 15:43Z): every clause must be verb-led - a listed UI verb, or a clause that asks on its own.
      if (clauses.length > 0 && clauses.every((clause, i) => clauseVerbLed(clause) || probes[i].decision === 'confirm')) {
        for (const probe of probes) if (probe.decision === 'confirm') for (const cls of probe.classes ?? [probe.class]) if (!classes.includes(cls)) classes.push(cls)
      }
    }
    // CU-542 (High; cu-coordinator 02:21Z), table PR 41: on a RIDE page (D-109: a ride / rides / ride-request / trip-request path segment, or
    // a ride-hailing host label - uber, lyft, bolt, grab, didi, cabify, ola, taxi), 'Add (a) stop', 'Change (the) destination' and 'Split
    // (the) fare' ask PURCHASE (the fare changes); in a maps app or a maps page they stay free. #784 r2 (cu-researcher 02:28Z): a ride /
    // rides host label; the names take a tail ('Add another stop on the way', 'Split fare with friends'); 'Update / Edit destination'.
    // #784 r3 (cu-coordinator 02:36Z): a trip / trips path segment binds too (a travel booking's destination change costs money; fail-closed).
    if (grammarEligible && !classes.includes('purchase') && /^(?:add\s+(?:a\s+|another\s+)?stop|(?:change|update|edit)\s+(?:the\s+|my\s+)?destination|split\s+(?:the\s+)?fare)(?:\s+\S.{0,40})?$/i.test(String(name ?? '').trim())) {
      let ridePage = false
      try {
        const u = new URL(url)
        ridePage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:ride|rides|ride-request|trip-request|request-ride|trip|trips)(?=$|[/?#])/i.test(u.pathname) || /(?:^|\.)(?:uber|lyft|bolt|grab|didi|cabify|ola|taxi|ride|rides)(?:\.|$)/i.test(u.hostname))
      } catch { ridePage = false }
      if (ridePage) classes.push('purchase')
    }
    // CU-550 (#805 r3, cu-coordinator 05:21Z): 'Change / Switch / Move / Upgrade / Downgrade to <plan name>' without the word 'plan' asks
    // PURCHASE on a carrier plan page only (D-106: a plan(s) / my-plan / change-plan / rate-plan / wireless path segment, or a carrier /
    // wireless / mobile host label); elsewhere ('Change to dark mode') it stays free.
    // #805 r5 (cu-researcher 05:34Z): any case, any plan name ('CHANGE TO UNLIMITED PLUS', 'switch to basic') - only a setting target
    // ('dark mode', 'Dark theme', 'list view', a language) stays free on a plan page (cu-verifier's r3 expectation; cu-coordinator's call).
    const planTarget = String(name ?? '').trim().match(/^(?:change|switch|move|upgrade|downgrade)\s+to\s+(?:the\s+|a\s+)?([\w+&.-]+(?:\s+[\w+&.-]+){0,3})$/i)
    if (grammarEligible && !classes.includes('purchase') && planTarget && !/\b(?:mode|theme|view|layout|language|format|units?|font|size|color|colour|english|spanish|french|german|metric|imperial)\s*$/i.test(planTarget[1])) {
      let planPage = false
      try {
        const u = new URL(url)
        planPage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:plans?|my-plan|change-plan|rate-plans?|wireless|mobile-plans?)(?=$|[/?#])/i.test(u.pathname) || /(?:^|\.)(?:carrier|wireless|mobile)(?:\.|$)/i.test(u.hostname))
      } catch { planPage = false }
      if (planPage) classes.push('purchase')
    }
    // #813 r5 (cu-coordinator 06:36Z, 'Email / Send my lab results' = permission): a union - 'Send (my) lab / test results' keeps the
    // older submit and adds permission.
    // r5 family (06:51Z): every 'send / email' of the health-record family keeps an older submit and adds permission.
    if (grammarEligible && classes.includes('submit') && !classes.includes('permission') && /^\s*(?:send|email|e-mail)\s+(?:a\s+cop(?:y|ies)\s+of\s+)?(?:all\s+)?(?:of\s+)?(?:my\s+|your\s+|the\s+)?(?:full\s+|complete\s+)?(?:lab\s+results|test\s+results|(?:medical|health|patient|clinical)\s+(?:records?|chart|history|summary|data|file|information)|visit\s+notes|(?:after[-\s]?)?visit\s+summar(?:y|ies)|discharge\s+summary|immunization\s+records?|(?:visit|appointment)\s+history)(?:\s+as\s+(?:a\s+)?(?:pdf|file|document|zip))?(?:\s+to\s+(?:my\s+)?(?:email|phone|device|computer|inbox))?\s*$/i.test(String(name ?? ''))) classes.push('permission')
    // CU-552 / CU-553 (High; cu-coordinator 05:21Z), table PR 49, URL-bound (D-106): a bare 'Download / Export all records' asks PERMISSION on
    // a patient-portal page (a health / patient / medical / mychart / clinic / hospital / ehr / records path segment or host label); a bare
    // 'Let go' / 'Dismiss' asks DELETE on an HR page (an hr / employees / people / staff / workforce / personnel / team-members segment).
    if (grammarEligible && classes.length === 0) {
      const label = String(name ?? '').trim()
      let u = null
      try { u = new URL(url) } catch { u = null }
      const web = u && /^https?:$/.test(u.protocol)
      if (web && /^(?:download|export|save|print|email|e-mail|send)\s+(?:all\s+)?(?:of\s+)?(?:my\s+)?records(?:\s+as\s+(?:a\s+)?(?:pdf|file|document))?(?:\s+to\s+(?:my\s+)?(?:email|phone|device|computer))?$/i.test(label) && /(?:^|[./-])(?:health|patient|patients|medical|mychart|clinic|hospital|ehr|records)(?=$|[./?#-])/i.test(`${u.hostname}${u.pathname}`)) classes.push('permission')
      else if (web && /^(?:let\s+go|dismiss|lay\s+off)$/i.test(label) && /(?:^|\/)(?:hr|employees?|people|staff|workforce|personnel|team-members)(?=$|[/?#])/i.test(u.pathname)) classes.push('delete')
    }
    // CU-539 (High; cu-coordinator 01:36Z), table PR 39: on a CI / actions page (D-109: an actions / workflows / runners / pipelines / ci
    // path segment), adding a self-hosted runner and disabling a workflow ask PERMISSION; elsewhere they stay free.
    if (grammarEligible && !classes.includes('permission') && /^(?:add|register|new)\s+(?:a\s+|new\s+)?self[-\s]hosted\s+runner$|^(?:disable|turn\s+off|pause)\s+(?:this\s+|the\s+)?workflow$/i.test(String(name ?? '').trim())) {
      let ciPage = false
      try {
        const u = new URL(url)
        ciPage = /^https?:$/.test(u.protocol) && /(?:^|\/)(?:actions|workflows|runners|pipelines|ci|ci-cd)(?=$|[/?#])/i.test(u.pathname)
      } catch { ciPage = false }
      if (ciPage) classes.push('permission')
    }
    // CU-537 (High; cu-coordinator 01:06Z), table PR 38: the generic 'Add / Edit / Save record' asks PERMISSION on a DNS page only (D-109:
    // a dns / zone(s) / nameserver(s) / records path segment or a dns host label); a CRM's 'Add record' stays free.
    if (grammarEligible && !classes.includes('permission') && /^(?:add|edit|save|create|new|change|update|modify)\s+(?:a\s+|the\s+|new\s+|this\s+)?(?:dns\s+)?record$/i.test(String(name ?? '').trim())) {
      let dnsPage = false
      try {
        const u = new URL(url)
        dnsPage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:dns|zones?|nameservers?|dns-records|dns-management|records)(?=$|[/?#])/i.test(u.pathname) || /(?:^|\.)dns(?:\.|$)/i.test(u.hostname))
      } catch { dnsPage = false }
      if (dnsPage) classes.push('permission')
    }
    // #774 r2 (cu-researcher 01:16Z): 'automatic renewal' and 'Change / Update record' too.
    // CU-537: turning a DOMAIN's auto-renew off risks losing the domain - permission on a domain / registrar page only (a domains / domain /
    // registrar / dns path segment or a registrar / domains host label); a subscription's 'Turn off auto-renew' stays free (CU-410 pin).
    if (grammarEligible && !classes.includes('permission') && /^(?:disable|turn\s+off|switch\s+off|cancel|stop)\s+(?:the\s+)?(?:domain\s+)?(?:auto[-\s]?renew(?:al)?|automatic\s+renewal)$/i.test(String(name ?? '').trim())) {
      let domainPage = false
      try {
        const u = new URL(url)
        domainPage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:domains?|registrar|dns|domain-management)(?=$|[/?#])/i.test(u.pathname) || /(?:^|\.)(?:registrar|domains)(?:\.|$)/i.test(u.hostname))
      } catch { domainPage = false }
      if (domainPage) classes.push('permission')
    }
    // CU-524 (High; cu-coordinator 21:06Z; #741 r2 adds '... for verification' and '(another) email (address)'): a bare 'Add phone number' on an account-security page (D-109: host or path, never a
    // title) adds a recovery / sign-in channel - credential; a checkout or contact form's 'Add phone number' stays free.
    if (grammarEligible && !classes.includes('credential') && /^add\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?(?:(?:phone|mobile)(?:\s+number)?|e-?mail(?:\s+address)?)(?:\s+for\s+(?:verification|sign[-\s]?in|signing\s+in|2-?step(?:\s+verification)?|two[-\s]step(?:\s+verification)?|recovery|security|account\s+recovery))?$/i.test(String(name ?? '').trim())) {
      let securityPage = false
      try {
        const u = new URL(url)
        securityPage = /^https?:$/.test(u.protocol) && (/(?:^|\/)(?:security|account-security|signin|sign-in|signin-options|login|login-security|recovery|two-step|two-factor|2fa|mfa|authentication|privacy-security)(?=$|[/?#-])/i.test(u.pathname) || /^(?:myaccount|accounts?|id|login|signin)\./i.test(u.hostname))
      } catch { securityPage = false }
      if (securityPage) classes.push('credential')
    }
    // CU-523 (High; cu-coordinator 20:36Z): on an identity-provider / admin-console page (D-109: host or path, never a title) adding a
    // user to a group / the admins asks PERMISSION; a chat app's 'Add to group' stays free. IdP pages: a vendor host token (okta, auth0,
    // onelogin, jumpcloud, keycloak, pingone, pingidentity, entra, duo) or an admin / iam / directory / identity / idp / sso path segment
    // or host label (admin.example, /admin/users).
    if (grammarEligible && !classes.includes('permission') && /^(?:add|assign)\s+(?:the\s+|this\s+|selected\s+)?(?:users?\s+|members?\s+)?to\s+(?:a\s+|the\s+)?(?:groups?|admins?|administrators?|admin\s+group)$/i.test(String(name ?? '').trim())) {
      let idpPage = false
      try {
        const u = new URL(url)
        idpPage = /^https?:$/.test(u.protocol) && (/(?:^|\.)(?:okta|auth0|onelogin|jumpcloud|keycloak|pingone|pingidentity|entra|duo|admin|iam|idp|sso|directory)(?:\.|$)/i.test(u.hostname) || /(?:^|\/)(?:admin|iam|directory|identity|idp|sso)(?=$|[/?#])/i.test(u.pathname))
      } catch { idpPage = false }
      if (idpPage) classes.push('permission')
    }
    // CU-544 (High; cu-coordinator 03:06Z), table PR 43: enabling / allowing guest access asks PERMISSION, unioned onto any older class
    // ('Enable guest access' keeps its older physical and adds permission).
    if (grammarEligible && !classes.includes('permission') && /^(?:allow|enable|turn\s+on|permit)\s+guest\s+(?:access|accounts?|users?)$/i.test(String(name ?? '').trim())) classes.push('permission')
    // #789 r2 (cu-developer-three 03:10Z): a 'Guest access' SWITCH asks on the dangerous direction, like 'Remote Login' / 'Screen Sharing' -
    // off -> on and an unread state ask permission (nativeToggleState: a web ARIA state is untrusted), on -> off is free.
    if (grammarEligible && classes.length === 0 && /switch|checkbox|toggle/i.test(String(target?.role ?? '') + String(target?.subrole ?? ''))
      && /^\s*guest\s+(?:access|accounts?|users?)\s*$/i.test(name) && nativeToggleState(target) !== true) classes.push('permission')
    // CU-539 (#778 r2): skipping deployment protection asks PERMISSION + SUBMIT; the '... and deploy' forms reach an older submit rule
    // first, so permission is unioned onto it here (the 'Merge anyway' pattern).
    if (grammarEligible && !classes.includes('permission') && /^(?:skip|bypass|ignore|override)\s+(?:the\s+)?(?:deployment\s+protection(?:\s+rules?)?|(?:branch\s+|environment\s+)?protection\s+rules?)(?:\s+and\s+deploy(?:\s+now)?)?$/i.test(String(name ?? '').trim())) {
      classes.push('permission')
      if (!classes.includes('submit')) classes.push('submit')
    }
    // CU-521 (cu-coordinator 20:06Z): 'Merge anyway' keeps its older submit and unions permission (a merge past the requirements).
    if (grammarEligible && classes.length > 0 && !classes.includes('permission') && /^(?:merge\s+anyway|force[-\s]?merge)$/i.test(String(name ?? '').trim())) classes.push('permission')
    // #729 round 2 (cu-coordinator 19:51Z, the 18:06Z precedent): 'Reset account PIN' keeps the older reset row's delete and unions
    // CU-518's credential.
    if (grammarEligible && classes.length > 0 && !classes.includes('credential') && /^reset\s+(?:the\s+|my\s+|your\s+)?(?:account|port[-\s]?out|transfer|number\s+transfer)\s+(?:pin|passcode)$/i.test(String(name ?? '').trim())) classes.push('credential')
    // CU-519 (High; cu-coordinator 19:36Z), table PR 28, bound on the page URL (host or path, D-109; never a title): on a home-security,
    // lock or camera page, generating / creating / sharing a guest or access PIN / code asks PHYSICAL (someone gets in), and disabling /
    // stopping recording, turning off a camera and disarming ask PERMISSION. The ruled class is UNIONED onto any older one ('Create guest
    // code' keeps permission and adds physical; 'Turn off camera' / 'Disarm' keep physical and add permission). Meeting pages stay free;
    // CU-468's 'Create access code' row is untouched (only guest / temporary / one-time / visitor codes, and sharing an access code).
    if (grammarEligible) {
      const homeSecurity = isHomeSecurityPage(url)
      const label = String(name ?? '').trim()
      if (homeSecurity) {
        if (/^(?:generate|create|add|make|share|send)\s+(?:a\s+|an\s+|new\s+)?(?:guest|temporary|temp|one[-\s]time|visitor)\s+(?:pin|code|passcode|key|access\s+code)$|^share\s+(?:the\s+|an\s+)?access\s+code$/i.test(label) && !classes.includes('physical')) classes.push('physical')
        if (/^(?:disable|stop|turn\s+off|end)\s+(?:the\s+)?recording$|^(?:turn\s+off|disable|switch\s+off)\s+(?:the\s+|all\s+)?cameras?$|^disarm(?:\s+(?:the\s+)?(?:system|alarm|home|security(?:\s+system)?))?$/i.test(label) && !classes.includes('permission')) classes.push('permission')
        // CU-536 (High; cu-coordinator 01:06Z, folded into #773 r2), on isHomeSecurityPage only (an alarm clock's 'Silence alarm' stays
        // free): silencing / muting the siren, motion detection off, pausing / stopping recording and cancelling monitoring ask PERMISSION;
        // adding a user / a PIN code asks PHYSICAL (someone gets in). Unioned onto any older class.
        if (/^(?:silence|mute|stop|turn\s+off|dismiss)\s+(?:the\s+)?(?:siren|alarm\s+siren|sirens)$|^(?:turn\s+off|disable|pause|stop)\s+(?:the\s+)?motion\s+(?:detection|alerts?|sensors?)$|^(?:pause|stop)\s+(?:the\s+)?(?:recording|video\s+recording|camera\s+recording)$|^(?:cancel|stop|end|pause|turn\s+off|disable)\s+(?:the\s+)?(?:professional\s+)?monitoring(?:\s+(?:service|plan|subscription))?$/i.test(label) && !classes.includes('permission')) classes.push('permission')
        if (/^add\s+(?:a\s+|an\s+|new\s+)?(?:user|member|household\s+member|pin(?:\s+code)?|user\s+code|keypad\s+code|passcode)$/i.test(label) && !classes.includes('physical')) classes.push('physical')
      }
    }
    // #721 round 3 (cu-coordinator 18:51Z; CU-515's desktop gap, cu-developer-three 18:37Z): in a native authenticator app the
    // control beside a TOTP is just 'Copy' / 'Copy code' / 'Show code' - it puts the second factor on the clipboard, so it asks
    // credential there, bound on the app (target.origin, else frontmostBundleId; never an 'app:' url). The apps are matched by a
    // bundle-id segment (authy*, *authenticator*, otp*, *totp*, steptwo / step-two, raivo*, 2fas*), not by guessed exact ids;
    // elsewhere a bare 'Copy' stays free, and password managers stay BLOCKED by the app policy, unchanged.
    if (grammarEligible && classes.length === 0) {
      const appId = (typeof target?.origin === 'string' && target.origin !== '' && !/^https?:/i.test(target.origin)) ? target.origin : String(context?.frontmostBundleId ?? '')
      const authenticator = appId.split('.').some((segment) => /^(?:authy[\w-]*|[\w-]*authenticator[\w-]*|otp[\w-]*|[\w-]*totp[\w-]*|step-?two[\w-]*|raivo[\w-]*|2fas[\w-]*)$/i.test(segment))
      if (authenticator && /^(?:copy|show|reveal|view)(?:\s+(?:the\s+)?(?:code|otp|totp|token|password))?$/i.test(String(name ?? '').trim())) classes.push('credential')
    }
    // CU-512 (High; cu-coordinator 17:51Z), table PR 25, as verb families with object synonyms - an MDM console's device controls.
    // CREDENTIAL: clearing / bypassing Activation Lock or a passcode, dropping the passcode requirement. PERMISSION: turning off Lost
    // Mode, unenrolling / retiring a device, pushing / installing / deploying a profile. Older classes lead (13:36Z): these fire only
    // where nothing asked yet ('Install profile' keeps install, 'Deploy profile' submit, 'Remove passcode' delete).
    // #716 round 2 (cu-coordinator 18:06Z, explicit raises): the two older-delete forms union credential, and 'Deploy profile' unions
    // permission onto its older submit - the older class stays, the ruled class is added.
    if (grammarEligible) {
      const raised = String(name ?? '').trim()
      if (/^(?:remove|clear)\s+(?:the\s+)?(?:activation\s+lock|device\s+passcode)$/i.test(raised) && !classes.includes('credential') && classes.length > 0) classes.push('credential')
      if (/^deploy\s+(?:the\s+|a\s+|this\s+)?(?:configuration\s+|config\s+|mdm\s+|management\s+)?profiles?$/i.test(raised) && !classes.includes('permission') && classes.length > 0) classes.push('permission')
    }
    if (grammarEligible && classes.length === 0) {
      const mdm = String(name ?? '').trim()
      if (/^(?:clear|bypass|remove|disable|turn\s+off|reset|skip)\s+(?:the\s+)?activation\s+lock(?:\s+bypass\s+code)?$|^(?:clear|reset|bypass)\s+(?:the\s+|device\s+)?passcode$|^(?:disable|turn\s+off|remove|drop)\s+(?:the\s+)?passcode\s+(?:requirement|policy)$|^(?:don'?t|do\s+not)\s+require\s+(?:a\s+)?passcode$/i.test(mdm)) classes.push('credential')
      else if (/^(?:turn\s+off|disable|exit|end|stop|leave)\s+lost\s+mode$|^(?:unenroll|un-enroll|retire|deregister|unmanage|release)\s+(?:the\s+|this\s+|selected\s+)?devices?$|^remove\s+(?:the\s+|this\s+)?devices?\s+from\s+management$|^(?:push|install|deploy|send|assign)\s+(?:the\s+|a\s+|this\s+)?(?:configuration\s+|config\s+|mdm\s+|management\s+)?profiles?$/i.test(mdm)) classes.push('permission')
    }
    const unique = [...new Set(classes)].sort((a, b) => PRECEDENCE.indexOf(a) - PRECEDENCE.indexOf(b))
    // CU-494 residual (cu-coordinator 11:36Z): moneyIdentityField also reads an unlabelled entry's raw name/id attribute.
    const moneyField = moneyIdentityField(target, name)
    const typesSecret = action.type === 'type' && /^\s*(?:\{\{secret:[a-z0-9_-]+\}\}\s*)+$/i.test(String(action.text ?? '')) && !moneyField
    const needed = unique.filter((cls) => !preApproved(cls, url) || NEVER_PRE_APPROVED.includes(cls) || autofillClasses.includes(cls) || neverCoveredByGrant(cls, name) || (cls === 'credential' && !typesSecret))
    // CU-494 (11:06Z): typing into a money or identity field is never carried by a grant - it asks credential at the typing step
    // (an attacker IBAN typed under a credential or sensitive_data grant, then a bare 'Save', must not pass).
    // #664 round 3 (cu-researcher 11:11Z): also when no class asked at all ('SWIFT code', 'Wallet address' typed with or without a grant).
    if (needed.length === 0 && action.type === 'type' && target && isTextEntry(target) && moneyField) { needed.push('credential'); if (!unique.includes('credential')) unique.push('credential') }
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
