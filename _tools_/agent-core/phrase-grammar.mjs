// Consent phrase grammar (_designs_/consent-phrase-grammar/INDEX.md 0.3.1; cu-coordinator 16:46Z: build now, a separate
// module behind one additive hook in policy.mjs). A control's name is judged by structure - a verb class followed, within
// a small window, by an object class gives an ask class - so the next near form of a ruled phrase is caught without a new
// phrase. The grammar only fills gaps: policy.mjs asks it only when no older rule asked, so it never lowers or changes an
// older rule's class (15:08Z, D-063). The free guards below suppress only what the grammar itself would add (F2).
//
// The tables are data; the matcher is one linear pass over at most MAX_TOKENS tokens, with no backtracking regex (F3,
// CU-272's budget).

export const MAX_TOKENS = 12

// Normalisation (rules 1-5): case, punctuation and hyphens fold; articles and possessives drop; plurals fold to the
// singular (never on -ss or -us); amounts and counts fold to '<n>'; parenthesised text drops.
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'our', 'their', 'this', 'these', 'that', 'his', 'her', 'its'])
// Tokens that may stand between a verb and its object without breaking the window (rule 6, two at most).
const FILLER = new Set(['<n>', 'all', 'new', 'now', 'it', 'them', 'everyone', 'again', 'here', 'to', 'for', 'of', 'and', 'with',
  'from', 'on', 'in', 'as', 'out', 'up', 'off', 'down', 'back'])

const US_WORDS = new Set(['antivirus', 'virus', 'status', 'bonus', 'campus', 'focus', 'census', 'corpus', 'plus', 'minus', 'surplus', 'genius', 'radius', 'nexus', 'menus', 'bus'])

// #580 round 4 (cu-coordinator 22:44Z): the switch verbs read beside 'turn' - 'Switch / Flip / Toggle X on|off'.
const SWITCH_VERBS = new Set(['turn', 'switch', 'flip', 'toggle'])

// Words whose final -s is not a plural (CU-438: 'Add alias').
const NOT_PLURAL = new Set(['alias', 'whois', 'canvas', 'atlas', 'bias', 'gas', 'lens', 'news', 'series', 'species', 'chassis', 'axis', 'basis', 'analysis', 'thesis', 'crisis', 'diagnosis'])

function singular(token) {
  if (NOT_PLURAL.has(token) || token.endsWith('ous')) return token
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(?:ss|sh|ch|x)es$/.test(token)) return token.slice(0, -2)
  // -us stays only on its Latin / short words (antivirus, status, bonus ...); an acronym plural folds ('GPUs' = 'gpu', cu-coordinator 19:22Z).
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') && !(token.endsWith('us') && US_WORDS.has(token))) return token.slice(0, -1)
  return token
}

export function tokens(name) {
  let text = String(name ?? '').slice(0, 400).toLowerCase().replace(/&/g, ' and ').replace(/\u2019/g, "'")
  text = text.replace(/\([^)]*\)/g, ' ')
  text = text.replace(/[$\u20ac\u00a3\u00a5]?\d[\d.,]*\s*(?:usd|eur|x)?/g, ' <n> ')
  text = text.replace(/-/g, ' ').replace(/[^a-z0-9<>' ]+/g, ' ')
  const out = []
  for (const raw of text.split(/\s+/)) {
    if (raw === '' || DETERMINERS.has(raw)) continue
    out.push(singular(raw.replace(/'s$/, '')))
    if (out.length >= MAX_TOKENS) break
  }
  return out
}

// Verb classes. Multi-word verbs match first (longest first); each verb lists the classes it can lead.
const MULTI_VERBS = [
  [['adopt', 'and', 'sign'], ['sign']], [['sign', 'and', 'submit'], ['sign', 'send']], [['restart', 'to', 'update'], ['install']],
  [['install', 'and', 'relaunch'], ['install']], [['log', 'in', 'as'], ['actas']], [['sign', 'in', 'as'], ['actas']],
  [['factory', 'reset'], ['destroy']], [['force', 'push'], ['destroy']], [['spin', 'up'], ['cost']], [['scale', 'up'], ['cost']],
  [['cash', 'out'], ['pay']], [['top', 'up'], ['pay']], [['turn', 'on'], ['enable', 'phys_on']], [['turn', 'off'], ['unguard', 'phys_off']],
  [['login', 'as'], ['actas']], [['act', 'as'], ['actas']], [['view', 'as'], ['actas']], [['set', 'up'], ['pay']], [['move', 'to'], ['destroy']],
  [['switch', 'to'], ['pay']], [['let', 'in'], ['grant']], [['remote', 'start'], ['phys_on']], [['buzz', 'in'], ['phys_on']],
  [['e', 'sign'], ['sign']], [['i', 'consent'], ['consent']], [['give', 'consent'], ['consent']],
  // cu-researcher's F5 (fresh corpus): 'back up' is a phrasal verb (a backup), never the pay verb 'back'.
  [['back', 'up'], []],
]
const VERBS = new Map(Object.entries({
  delete: ['destroy'], remove: ['destroy', 'unguard', 'pay'], drop: ['destroy'], truncate: ['destroy'], terminate: ['destroy'],
  destroy: ['destroy'], wipe: ['destroy'], erase: ['destroy'], purge: ['destroy'], deactivate: ['destroy'], close: ['destroy', 'pay'],
  cancel: ['destroy', 'pay'], clear: ['destroy'], reset: ['destroy', 'cred'], offboard: ['destroy'], kick: ['destroy'],
  launch: ['cost'], create: ['cost', 'cred'], provision: ['cost'],
  pay: ['pay'], buy: ['pay'], purchase: ['pay'], order: ['pay'], book: ['pay'], reserve: ['pay'], rent: ['pay'], redeem: ['pay'],
  refund: ['pay'], reimburse: ['pay'], release: ['pay', 'share'], send: ['pay', 'send'], transfer: ['pay', 'grant'], withdraw: ['pay'],
  tip: ['pay'], give: ['pay'], donate: ['pay'], pledge: ['pay'], renew: ['pay'], run: ['pay', 'exec'], process: ['pay'], issue: ['pay'],
  raise: ['pay'], increase: ['pay'], approve: ['pay', 'send'], confirm: ['pay', 'send'], complete: ['pay'], enable: ['enable', 'grant', 'pay'],
  // CU-436 (High; cu-coordinator 19:06Z): activating a paid account and committing to a term start cloud spending.
  activate: ['pay'], commit: ['pay'],
  add: ['pay', 'grant', 'cred'], swap: ['pay'], trade: ['pay'], stake: ['pay'], bid: ['pay'], rebid: ['pay'],
  subscribe: ['pay'], upgrade: ['pay'], checkout: ['pay'], charge: ['pay'], grant: ['grant'], make: ['grant', 'pay'], invite: ['grant'],
  assign: ['grant'], promote: ['grant', 'pay'], share: ['share'], admit: ['grant'], let: ['grant', 'phys_on'], allow: ['grant'],
  trust: ['grant'], remember: ['grant'], authorize: ['share', 'grant', 'pay'], authorise: ['share', 'grant'], accept: ['agree', 'send', 'pay'],
  sign: ['sign'], esign: ['sign'], impersonate: ['actas'], disable: ['unguard', 'phys_off', 'destroy'], pause: ['unguard', 'phys_off'],
  unprotect: ['unguard'], disarm: ['phys_off'], new: ['cred'], generate: ['cred'], regenerate: ['cred'], rotate: ['cred'], revoke: ['cred'],
  export: ['cred'], reveal: ['cred'], show: ['cred'], view: ['cred'], copy: ['cred'], get: ['cred', 'pay'], download: ['cred', 'install'],
  print: ['cred'], link: ['cred'], connect: ['cred'], change: ['cred'], update: ['cred', 'install'], edit: ['cred'],
  // F5 cluster 1: 'open' leads pay only for trading objects; its install sense is only '... anyway'.
  // CU-434 (High; cu-coordinator 18:44Z): unlock / start lead pay too, for the ride and rental objects below.
  unlock: ['phys_on', 'pay'], open: ['phys_on', 'pay'], start: ['phys_on', 'send', 'pay'], preheat: ['phys_on'], light: ['phys_on'],
  reorder: ['pay'],
  install: ['install'], keep: ['install'],
  vote: ['send'], cast: ['send'], resign: ['send'], quit: ['send'], decline: ['send'], apply: ['send'], enroll: ['send', 'pay'],
  file: ['send'], submit: ['send', 'pay'], post: ['send'], publish: ['send'], broadcast: ['send'], message: ['send'], email: ['send'],
  notify: ['send'], text: ['send'], deploy: ['send'], end: ['send', 'pay'], rate: ['send'], leave: ['send', 'grant'], repost: ['send'],
  retweet: ['send'], reblog: ['send'], report: ['send'], endorse: ['send'], push: ['send'], sync: ['send'], schedule: ['send', 'pay'],
  join: ['send'], answer: ['send'], call: ['send'], execute: ['exec'], unsend: ['destroy'], exit: ['send'], dismiss: [],
  // Context verbs stay out (Sell, Convert, Deposit, Leverage, Bet, Long, Short: CU-400 / CU-409's asset context decides).
  capture: ['pay'], gift: ['pay'], reactivate: ['pay'], resume: ['pay'], market: ['pay'], relaunch: ['install'],
  place: ['pay', 'send'], mint: ['pay'], bridge: ['pay'], back: ['pay'], request: ['pay'],
  unstake: ['pay'], downgrade: ['pay'], unlink: ['grant'], distribute: ['send'], upload: ['send'], go: ['grant'], boost: ['pay'],
  fund: ['pay'], lend: ['pay'], borrow: ['pay'], repay: ['pay'], list: ['pay'], use: ['pay'], bind: ['pay'],
}))

const PERSON = new Set(['driver', 'plumber', 'contractor', 'friend', 'seller', 'vendor', 'merchant', 'host', 'creator', 'streamer',
  'waiter', 'courier', 'him', 'her'])
const PERSON_PAY_VERBS = new Set(['pay', 'tip', 'send', 'give', 'transfer'])

// Object classes. F5 cluster 4 removed 'change' and 'all' from the send objects, and 'all' leaves the money and access
// classes too (cookie banners' 'Allow all', mail's 'Get all new mail').
const OBJECTS = {
  data: new Set(['backup', 'snapshot', 'archive', 'phone', 'laptop', 'mac', 'ipad', 'iphone', 'computer', 'download', 'trash', 'file',
    'account', 'data', 'database', 'table', 'schema', 'collection', 'instance', 'server', 'cluster', 'vm', 'stack', 'environment', 'disk',
    'repository', 'branch', 'booking', 'reservation', 'trip', 'appointment', 'user', 'employee', 'participant', 'device', 'history',
    'workspace', 'chat', 'conversation']),
  cost: new Set(['instance', 'cluster', 'vm', 'server']),
  money: new Set(['payment', 'payroll', 'refund', 'invoice', 'card', 'limit', 'ticket', 'flight', 'hotel', 'room', 'car', 'trip', 'seat',
    'table', 'spot', 'credit', 'license', 'click', '1', 'autopay', 'bank', 'point', 'reward', 'gift', 'order', 'booking', 'reservation',
    'customer', 'vendor', 'subscription', 'plan', 'membership', 'liquidity', 'position', 'loan', 'nft', 'item', 'offer', 'bid', 'usdc',
    'eth', 'weth', 'sol', 'btc', 'usdt', 'dai', 'wbtc', 'matic', 'transaction', 'trade', 'leverage', 'sale', 'payee', 'fund', 'money',
    'project', 'bet', 'swap', 'trial', 'collateral', 'allowance', 'spending', 'cap', 'long', 'short', 'annual', 'monthly', 'yearly',
    'tip', 'recurring', 'bag', 'baggage', 'insurance', 'mile', 'domain',
    // CU-434: a paid ride, delivery or rental.
    'ride', 'delivery', 'scooter', 'bike', 'ebike', 'moped', 'taxi', 'cab',
    // cu-coordinator 18:55Z: lodging (reserve x lodging).
    'cabin', 'lodge', 'villa', 'campsite', 'suite', 'apartment',
    // CU-436: cloud billing objects.
    'billing', 'quota', 'gpu', 'tpu', 'commitment', 'paid']),
  access: new Set(['organization', 'team', 'workspace', 'server', 'people', 'account', 'owner', 'coowner', 'co', 'admin', 'host',
    'cohost', 'collaborator', 'member', 'access', 'guest', 'visitor', 'device', 'public', 'ownership', 'payee', 'recipient',
    'beneficiary', 'everyone',
    // cu-coordinator 18:55Z: admitting attendees (CU-414 family), granting edit rights (CU-423 family).
    'attendee', 'participant', 'right']),
  agree: new Set(['term', 'agreement', 'contract', 'condition']),
  signable: new Set(['document', 'agreement', 'contract', 'form', 'consent', 'lease', 'waiver', 'nda']),
  records: new Set(['record', 'release', 'medical']),
  secret: new Set(['key', 'token', 'credential', 'password', 'keychain', 'vault', 'secret', 'code', 'bank', 'card', 'paypal', 'method',
    'email', 'phone', 'api']),
  guard: new Set(['accessibility', 'protection', 'firewall', 'antivirus', 'defender', 'filevault', 'sip', 'integrity', '2fa', 'factor',
    'verification', 'alert', 'notification']),
  phys: new Set(['door', 'garage', 'gate', 'alarm', 'camera', 'security', 'car', 'engine', 'vehicle', 'oven', 'stove', 'heater',
    'burner', 'fireplace', 'guest', 'visitor', 'grill', 'smoker']),
  physGuard: new Set(['alarm', 'camera', 'security']),
  install: new Set(['package', 'theme', 'extension', 'plugin', 'update', 'profile', 'helper', 'configuration', 'chrome']),
  sendObject: new Set(['app', 'store', 'ballot', 'vote', 'petition', 'application', 'job', 'offer', 'tax', 'return', 'review', 'star',
    'campaign', 'production', 'prod', 'everyone', 'origin', 'post', 'user', 'payment', 'run', 'request', 'resignation']),
  script: new Set(['script', 'query', 'migration']),
}

// A bare verb (or '<verb> now') that is itself the act, as a button.
const STANDALONE = new Map(Object.entries({
  destroy: 'delete', wipe: 'delete', broadcast: 'submit', vote: 'submit', resign: 'submit', pledge: 'purchase', swap: 'purchase',
  trade: 'purchase', stake: 'purchase', bid: 'purchase', rebid: 'purchase', rent: 'purchase', donate: 'purchase',
  preheat: 'physical', admit: 'permission', impersonate: 'permission', kick: 'delete', offboard: 'delete', reimburse: 'purchase',
  push: 'submit', repost: 'submit', mint: 'purchase', bridge: 'purchase', unstake: 'purchase', downgrade: 'purchase',
  promote: 'purchase', 'top up': 'purchase', 'cash out': 'purchase', 'factory reset': 'delete',
  'buzz in': 'physical', 'remote start': 'physical', 'let in': 'permission', refund: 'purchase', renew: 'purchase', book: 'purchase',
  // A bare Install / Update / Get is CU-254's (the App Store rule keeps its own record).
  enroll: 'submit', reactivate: 'purchase', pay: 'purchase', 'restart to update': 'install', reorder: 'purchase', unsend: 'delete',
  'install and relaunch': 'install', buy: 'purchase', retweet: 'submit', reblog: 'submit', endorse: 'submit', esign: 'permission',
  give: 'purchase',
}))

// Free guards (checked first; F2: they stop only the grammar's own asks).
const FREE_TAIL = new Set(['notification', 'preference', 'setting', 'history', 'control', 'faq', 'policy', 'rate', 'balance', 'detail',
  'tool', 'note', 'option', 'date'])
// F1: a trailing UI noun makes 'table' (and friends) a view, not data.
const UI_TAIL = new Set(['view', 'layout', 'column', 'row', 'filter', 'sort', 'style', 'format'])
const APPLY_SETTINGS = new Set(['filter', 'change', 'coupon', 'promo', 'discount', 'all', 'theme', 'format'])
// F1 sense table: strong credential verbs act on a bare key / token / code; weak ones need a qualifier.
const STRONG_CRED = new Set(['rotate', 'regenerate', 'revoke', 'generate'])
const KEY_QUALIFIER = new Set(['api', 'ssh', 'gpg', 'access', 'deploy', 'security', 'secret', 'recovery', 'backup', 'verification',
  'personal', 'private', 'signing', 'number', 'cvv', 'credit', 'debit', 'master'])
const EMAIL_VERBS = new Set(['change', 'edit', 'update', 'remove', 'reset'])
// F5 cluster 3: these objects are money only after a pay verb, never after add / make.
const ADD_MAKE_NOT_MONEY = new Set(['item', 'point', 'credit', 'license', 'room', 'table', 'position', 'cap', 'card', 'project', 'post',
  'customer', 'vendor', 'payee', 'order', 'bank'])
// F1 / F5: 'limit' is money only beside credit or spending; 'open' pays only for trading objects; 'cancel' pays only for a plan.
const LIMIT_QUALIFIER = new Set(['credit', 'spending', 'card', 'trading', 'borrow', 'withdrawal', 'transfer'])
const TRADING_OBJECTS = new Set(['position', 'long', 'short', 'trade'])
const CANCEL_PAY = new Set(['subscription', 'plan', 'membership', 'trial'])
const POST_OBJECTS = new Set(['comment', 'reply', 'update', 'photo', 'story', 'message', 'review', 'it', 'now', 'publicly'])

function verbOf(list) {
  for (const [words, classes] of MULTI_VERBS) {
    if (words.every((w, i) => list[i] === w)) return { verb: words.join(' '), rest: list.slice(words.length), classes: new Set(classes) }
  }
  const classes = VERBS.get(list[0])
  return classes ? { verb: list[0], rest: list.slice(1), classes: new Set(classes) } : null
}

const pushOnce = (out, cls) => { if (!out.includes(cls)) out.push(cls) }

// cu-coordinator 17:18Z (cu-researcher's (a)): a priced choice cell - a currency amount AND a seat / option / legroom / bag
// noun AND a choice role - selects a paid option by name with no verb. Links never (named limit). The desktop's AX roles
// are listed beside the browser's ARIA roles (D-099, cu-developer-three 17:19Z).
const PRICED_ROLES = new Set(['gridcell', 'option', 'radio', 'checkbox', 'button', 'axcell', 'axrow', 'axradiobutton', 'axcheckbox',
  'axbutton', 'axmenuitem'])
const PRICED_NOUNS = new Set(['seat', 'option', 'legroom', 'bag', 'baggage'])
// #602 round 2 (cu-researcher 01:31Z): a symbol after the number with a comma decimal too ('Weiter f\u00fcr 4,99 \u20ac').
const AMOUNT = /(?:[$\u20ac\u00a3\u00a5\u20b9]\s?(\d[\d,]*(?:\.\d+)?))|(?:\b(\d[\d,]*(?:\.\d+)?)\s?(?:usd|eur|gbp|jpy|cad|aud|inr|chf)\b)|(?:\b(?:usd|eur|gbp|jpy|cad|aud|inr|chf)\s?(\d[\d,]*(?:\.\d+)?))|(?:\b(\d[\d.]*(?:,\d{1,2})?)\s?[\u20ac$\u00a3\u00a5\u20b9])/gi
// A price filter or range commits nothing ('Under $25', '$10 - $20', 'Over EUR 100', 'Up to $50'; cu-researcher 00:51Z).
const PRICE_FILTER = /^\s*(?:under|over|below|above|less\s+than|more\s+than|up\s+to|from|max(?:imum)?|min(?:imum)?)\b|\d\s*(?:-|\u2013|\u2014|to)\s*[$\u20ac\u00a3\u00a5\u20b9]?\s*\d|\b(?:and\s+(?:up|above|under|below)|or\s+(?:less|more))\s*$/i
// Links and list items stay out of the plain pattern (17:18Z; cu-coordinator 01:04Z): a priced link navigates to the item.
// cu-developer-three 01:39Z (D-099): a desktop pull-down AXMenuButton asks; a closed AXPopUpButton only opens its menu (its chosen
// AXMenuItem asks), so it stays out; desktop list rows AXRow / AXCell take the commit-verb form like links.
const AMOUNT_ROLES = new Set(['button', 'menuitem', 'axbutton', 'axmenuitem', 'axmenubutton', 'alertdialog', 'dialog'])
const COMMIT_LINK_ROLES = new Set(['link', 'listitem', 'axlink', 'option', 'axrow', 'axcell'])
const PRICE_LABEL = /^\s*(?:price|was|now|from|save|sale|regular|list\s+price|msrp)\b|\boff\s*$|\bdiscount\b/i
const AMOUNT_COMMIT = /^\s*(?:buy|pay|purchase|subscribe|order|donate|tip|rent|upgrade|renew|checkout|check\s+out|charge|get\s+(?:it|premium|pro|plus))\b/i
/** CU-467 (cu-coordinator 00:49Z, 01:04Z): 'purchase' when a pressed control names a money amount - any button, menu item or dialog
 * control; a link or list item only with a commit verb ('Buy for $5', not a 'Blue mug, $12.99' tile); price filters and ranges never. */
export function amountClass(name, role = '') {
  const raw = String(name ?? '')
  if (!namesAmount(raw) || PRICE_FILTER.test(raw)) return null
  // #602 round 2 (A): a price label or discount badge is not a commit ('Price: $35', 'Sale - $35 off', 'Was $50', 'Save $10') - unless a
  // commit verb leads.
  if (PRICE_LABEL.test(raw) && !AMOUNT_COMMIT.test(raw)) return null
  const r = String(role ?? '').toLowerCase()
  if (AMOUNT_ROLES.has(r)) return 'purchase'
  if (COMMIT_LINK_ROLES.has(r) && AMOUNT_COMMIT.test(raw)) return 'purchase'
  return null
}
// cu-coordinator 02:35Z (cu-researcher's recommendation): an INERT link (CU-472) takes the button amount pattern when its name leads
// with a generic or commit verb, or carries an amount with a period; a product tile drawn as an inert link stays free.
// #602 round 4 (cu-researcher 02:36Z): 'add' (the ruled list) and the EU continue / buy words ('Weiter f\u00fcr 4,99 \u20ac').
const GENERIC_AMOUNT_VERB = /^\s*(?:continue|confirm|yes|ok|okay|next|proceed|submit|complete|place|start|try|join|unlock|get|add|upgrade|renew|subscribe|pay|buy|purchase|order|donate|tip|checkout|check\s+out|charge|weiter|jetzt|kaufen|bezahlen|continuer|payer|acheter|continuar|pagar|comprar)\b/i
const AMOUNT_PERIOD = /(?:\/\s*(?:mo|month|yr|year|wk|week|day)|\b(?:per|a|an|each)\s+(?:month|year|week|day)|\b(?:monthly|yearly|annually|weekly))\b/i
export function inertLinkAmountClass(name) {
  const raw = String(name ?? '')
  if (!namesAmount(raw) || PRICE_FILTER.test(raw)) return null
  if (PRICE_LABEL.test(raw) && !AMOUNT_COMMIT.test(raw)) return null
  return GENERIC_AMOUNT_VERB.test(raw) || AMOUNT_PERIOD.test(raw) || /^\s*[$\u20ac\u00a3\u00a5\u20b9]?\s*\d[\d.,]*\s*(?:[$\u20ac\u00a3\u00a5\u20b9]|usd|eur|gbp)?\s*$/i.test(raw) ? 'purchase' : null
}
/** CU-467: whether a name carries a positive money amount (a currency symbol or ISO code beside a number). */
export function namesAmount(name) {
  const amounts = [...String(name ?? '').matchAll(AMOUNT)].map((m) => {
    const text = String(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
    // '4,99' (a comma decimal) reads as 4.99; '1,000' (a thousands comma) as 1000.
    return Number(/^\d+,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, ''))
  })
  return amounts.some((n) => Number.isFinite(n) && n > 0)
}
const CURRENCY = /[$\u20ac\u00a3\u00a5]\s?\d|\d\s?(?:usd|eur|gbp)\b/i

// CU-435's insurance rows: verb x object -> class, within the usual two-token window.
const INSURANCE_ROWS = [
  [['bind', 'buy', 'purchase', 'renew'], ['policy', 'coverage'], 'purchase'], [['increase', 'add', 'extend', 'raise'], ['coverage'], 'purchase'],
  [['lower', 'reduce', 'decrease'], ['deductible'], 'purchase'], [['accept'], ['quote'], 'purchase'], [['cancel'], ['policy'], 'delete'],
  [['accept'], ['settlement', 'offer'], 'submit'], [['file', 'submit'], ['claim'], 'submit'],
]
function insuranceClass(list) {
  if (list.length < 2 || list.length > 5) return null
  const window = list.slice(1).filter((t) => !FILLER.has(t)).slice(0, 3)
  const objectIndex = (objects) => window.findIndex((t) => objects.includes(t))
  for (const [verbs, objects, cls] of INSURANCE_ROWS) {
    if (!verbs.includes(list[0])) continue
    const i = objectIndex(objects)
    // The object ends the name (optionally one trailing token like 'now'), so 'Renew policy settings' stays a guard case.
    if (i >= 0 && i >= window.length - 1) return cls
  }
  return null
}

// CU-438's admin rows (verb x object -> class); 'Remove admin' keeps the older 'remove' delete, which leads by precedence (named).
const PEOPLE = new Set(['user', 'member', 'employee', 'account', 'student', 'guest', 'teammate'])
function adminClass(list) {
  if (list.length < 2 || list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if ((verb === 'suspend' || verb === 'unsuspend' || verb === 'disable' || verb === 'lock') && core.length <= 2 && PEOPLE.has(last)) return 'permission'
  if (['change', 'edit', 'update', 'set'].includes(verb) && core.length <= 3 && last === 'role' && (core.length === 1 || core.some((t) => PEOPLE.has(t)))) return 'permission'
  if ((verb === 'sign' || verb === 'log') && rest[0] === 'out' && (rest.includes('session') || rest.includes('device') || rest.includes('everywhere'))) return 'permission'
  if (verb === 'reset' && rest.includes('sign') && rest.includes('cooky')) return 'permission'
  if (verb === 'reset' && rest.includes('cookie')) return 'permission'
  if (verb === 'add' && core.length <= 2 && last === 'alias') return 'permission'
  if (verb === 'assign' && core.length <= 2 && last === 'license') return 'purchase'
  // #575 round 2 (21:26Z): 'Add 5 licenses' / 'Buy 10 seats' - an amount of licences.
  if ((verb === 'add' || verb === 'buy') && rest.includes('<n>') && core.length <= 2 && (last === 'license' || last === 'seat')) return 'purchase'
  return null
}

const GAME_CURRENCY = new Set(['gem', 'coin', 'diamond', 'crystal', 'robux', 'buck', 'credit', 'gold', 'point', 'ruby', 'jewel'])
const PASS_TIERS = new Set(['battle', 'premium', 'season', 'vip', 'elite', 'gold', 'plus'])
const CURRENCY_VERBS = new Set(['get', 'buy', 'unlock', 'gift', 'spend', 'continue', 'revive', 'use', 'pay', 'claim', 'purchase', 'redeem', 'skip'])
function currencyAct(list) {
  if (list.length > 6) return false
  const [verb, ...rest] = list
  if (list.length === 2 && verb === 'super' && rest[0] === 'like') return true
  if (list.length === 1 && verb === 'superlike') return true
  if (!CURRENCY_VERBS.has(verb) && verb !== 'boost') return false
  // An amount of currency ('Continue for 100 gems', 'Spend 50 coins', 'Unlock with 200 gems', 'Get 500 gems').
  if (rest.includes('<n>') && rest.some((t) => GAME_CURRENCY.has(t))) return true
  // Currency bought outright ('Buy gems', 'Get diamonds') - not 'Get points' (rewards) or 'Use credit' (a card).
  if ((verb === 'buy' || verb === 'get' || verb === 'purchase') && rest.length <= 2 && ['gem', 'coin', 'diamond', 'crystal', 'robux', 'buck', 'jewel', 'ruby'].includes(rest[rest.length - 1])) return true
  // A paid pass ('Unlock battle pass', 'Get premium pass') - a bare 'Battle pass' or 'Pass' stays free.
  if (rest[rest.length - 1] === 'pass' && rest.some((t) => PASS_TIERS.has(t))) return true
  // Paid reach on a dating or social app ('Get more likes', 'Boost profile') and cosmetics ('Gift skin').
  if (verb === 'get' && (rest[0] === 'more' || rest[0] === 'unlimited' || rest[0] === 'extra') && ['like', 'view', 'follower', 'match', 'swipe', 'life', 'rewind'].includes(rest[1])) return true
  if (verb === 'boost' && rest.length <= 2 && ['profile', 'post', 'listing', 'me'].includes(rest[rest.length - 1])) return true
  if ((verb === 'gift' || verb === 'buy' || verb === 'unlock') && rest.length <= 2 && ['skin', 'emote', 'outfit', 'bundle', 'lootbox', 'crate'].includes(rest[rest.length - 1])) return true
  return false
}

const PROTECTIONS = [['parental', 'control'], ['screen', 'time'], ['content', 'filter'], ['safesearch'], ['safe', 'search'], ['family', 'filter'],
  ['content', 'restriction'], ['restriction'], ['kid', 'mode'], ['purchase', 'approval'], ['ask', 'to', 'buy']]
function endsWithSeq(rest, seq) { return rest.length >= seq.length && seq.every((t, i) => rest[rest.length - seq.length + i] === t) }
function childProtectionOff(list) {
  if (list.length > 7) return false
  // 'turn off' / 'switch off' arrive as two tokens here (the multi-word verbs are folded later).
  const twoWord = SWITCH_VERBS.has(list[0]) && list[1] === 'off'
  const verb = twoWord ? 'turn off' : list[0]
  const rest = list.slice(twoWord ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  if (['turn off', 'disable', 'pause', 'remove', 'deactivate'].includes(verb) && PROTECTIONS.some((seq) => endsWithSeq(core, seq))) return true
  if (verb === 'allow' && core[core.length - 1] === 'content' && core.some((t) => t === 'explicit' || t === 'mature' || t === 'adult')) return true
  if (verb === 'allow' && core[core.length - 1] === 'purchase' && core.length <= 3) return true
  // #575 round 2 (21:26Z): 'Allow purchases without approval', 'Allow in-app buying'.
  if (verb === 'allow' && core.length <= 4 && (core[0] === 'purchase' || core.includes('buying')) && (core.includes('approval') || core.includes('buying'))) return true
  if (verb === 'extend' && core.length <= 2 && core[core.length - 1] === 'time' && (core.length === 1 || core[0] === 'screen')) return true
  if (verb === 'extend' && core.length === 1 && core[0] === 'screen') return true
  // CU-481 residual (06:49Z, d): 'Grant <n> more minutes' joins the CU-440 'Give <n> more minutes' row.
  if (['give', 'grant'].includes(verb) && rest.includes('<n>') && core.length <= 2 && ['minute', 'hour'].includes(core[core.length - 1]) && (core.includes('more') || core.length === 1)) return true
  if (verb === 'add' && core[core.length - 1] === 'time' && core.length <= 3 && (core.includes('more') || core.includes('screen') || core.includes('<n>'))) return true
  return false
}

const MEDS = new Set(['prescription', 'medication', 'medicine', 'rx', 'refill', 'prescriptions'])
function medicalClass(list) {
  if (list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (verb === 'refill' && core.length <= 2 && (core.length === 0 || MEDS.has(last))) return core.length === 0 ? null : 'submit'
  if (verb === 'request' && core.length <= 2 && (MEDS.has(last) || last === 'appointment' || last === 'visit')) return 'submit'
  if (verb === 'consent' && rest[0] === 'to' && ['treatment', 'procedure', 'surgery', 'care', 'vaccination', 'telehealth'].includes(last)) return 'submit'
  if (verb === 'cancel' && core.length <= 2 && MEDS.has(last)) return 'delete'
  if (verb === 'join' && core.length <= 2 && (last === 'visit' || last === 'telehealth' || last === 'consultation')) return 'permission'
  if (verb === 'add' && core.length <= 2 && (last === 'proxy' || last === 'caregiver')) return 'permission'
  return null
}

const METERED = new Set(['charging', 'charger', 'charge', 'parking', 'meter'])
function meteredClass(list) {
  if (list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const hasObject = core.some((t) => METERED.has(t))
  if (['start', 'unlock', 'reserve', 'book', 'extend', 'pay', 'begin', 'renew'].includes(verb) && hasObject && core.length <= 3 && !core.includes('history')) return 'purchase'
  // '<n>' is filler in core, so the amount is read from rest ('Add 30 minutes').
  if (verb === 'add' && rest.length === 2 && rest[0] === '<n>' && ['minute', 'hour', 'min', 'hr'].includes(rest[1])) return 'purchase'
  if ((verb === 'stop' || verb === 'end' || verb === 'finish') && hasObject && core.length <= 3) return 'submit'
  return null
}

// 'Call' as a noun inside a longer name stays free (CU-261: 'Call Stack'), as do a call's own settings and lists.
const CALL_FREE = new Set(['history', 'log', 'setting', 'forwarding', 'waiting', 'center', 'recording', 'list', 'detail', 'back', 'id', 'screening', 'quality',
  'duration', 'summary', 'stack', 'tree', 'graph', 'chain', 'site', 'frame', 'hierarchy', 'out', 'action', 'option', 'function', 'type', 'volume'])
function phoneClass(list) {
  if (list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if ((verb === 'port' || verb === 'transfer') && core.length <= 2 && last === 'number') return 'credential'
  if ((verb === 'get' || verb === 'request' || verb === 'generate' || verb === 'show') && rest.includes('port') && last === 'pin') return 'credential'
  if (verb === 'forward' && core.length <= 2 && (['call', 'text', 'sms'].includes(last) || (last === 'message' && (core[0] === 'text' || core[0] === 'sms')))) return 'credential'
  if ((verb === 'release' || verb === 'cancel' || verb === 'delete') && core.length <= 2 && (last === 'number' || last === 'line') && !core.includes('account')) return 'delete'
  // The free words are read on rest, not core ('back' is filler; 'Call back' stays with #462); a bare 'Call' stays free.
  if (verb === 'call' && rest.length >= 1 && core.length <= 2 && !rest.some((t) => CALL_FREE.has(t))) return 'submit'
  if (verb === 'record' && core.length === 1 && (last === 'call' || last === 'meeting')) return 'permission'
  return null
}

const AD_OBJECTS = new Set(['campaign', 'ad', 'ads', 'promotion', 'advert', 'advertisement'])
function adSpend(list) {
  if (list.length > 7) return false
  // #580 round 3 (cu-verifier 22:41Z): 'switch on' as well as 'turn on' ('Switch ads on' after the split-particle normaliser).
  const twoWord = SWITCH_VERBS.has(list[0]) && list[1] === 'on'
  const verb = twoWord ? 'turn on' : list[0]
  const rest = list.slice(twoWord ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (['launch', 'publish', 'resume', 'start', 'run', 'activate', 'enable', 'turn on', 'unpause', 'restart'].includes(verb) && core.length <= 3 && (AD_OBJECTS.has(last) || (last === 'set' && core.includes('ad')))) return true
  if (['increase', 'raise', 'up', 'double', 'boost'].includes(verb) && core.length <= 3 && ['budget', 'bid', 'spend'].includes(last)) return true
  if ((verb === 'set' || verb === 'change' || verb === 'update') && core.includes('budget') && rest.includes('<n>')) return true
  return false
}

function cameraPrivacyOff(list) {
  if (list.length > 7) return false
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  if (['turn off', 'disable', 'deactivate', 'pause'].includes(verb) && core[0] === 'privacy' && core.length <= 2) return true
  if (verb === 'open' && core.length <= 2 && (core[core.length - 1] === 'shutter' || (core[0] === 'privacy' && core[1] === 'cover'))) return true
  if (['enable', 'turn on', 'start', 'activate'].includes(verb) && core.length <= 3) {
    const tail = core.join(' ')
    if (/(?:^|\s)(?:audio|sound|continuous|nonstop)\s+recording$/.test(tail) || /^recording$/.test(tail) && rest.includes('<n>')) return true
    if (/^(?:face|facial|person|people)\s+recognition$|^familiar\s+face$|^face\s+detection$/.test(tail)) return true
    // #580 round 2: 'Enable microphone' on a camera opens its audio (CU-445).
    if (/^(?:microphone|mic)$/.test(tail)) return true
  }
  return false
}

function domainClass(list) {
  if (list.length > 7) return null
  const two = SWITCH_VERBS.has(list[0]) && list[1] === 'off'
  const verb = two ? 'turn off' : list[0]
  const rest = list.slice(two ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (verb === 'unlock' && core.length <= 2 && last === 'domain') return 'credential'
  if (['turn off', 'disable', 'remove'].includes(verb) && core.length <= 3 && last === 'lock' && (core.includes('domain') || core.includes('transfer') || core.includes('registrar'))) return 'credential'
  if (['get', 'show', 'view', 'copy', 'reveal', 'send', 'request'].includes(verb) && last === 'code' && core.some((t) => ['auth', 'epp', 'authorization', 'transfer'].includes(t))) return 'credential'
  if (['change', 'update', 'edit', 'transfer'].includes(verb) && core.length <= 3 && (last === 'registrant' || (last === 'owner' && core.some((t) => t === 'account' || t === 'domain')))) return 'credential'
  if (verb === 'push' && core.length <= 2 && last === 'domain') return 'credential'
  if (['change', 'use', 'set', 'edit', 'update'].includes(verb) && core.length <= 3 && last === 'nameserver') return 'permission'
  if (['edit', 'change', 'update', 'delete', 'add'].includes(verb) && core.length <= 3 && last === 'record' && core.includes('dns')) return 'permission'
  if (['turn off', 'disable', 'remove'].includes(verb) && core.length <= 3 && last === 'privacy' && (core.includes('whois') || core.includes('domain'))) return 'permission'
  return null
}

const AUDIT_OBJECTS = [['cloudtrail'], ['audit', 'log'], ['audit', 'logging'], ['logging'], ['guardduty'], ['flow', 'log'], ['security', 'hub'], ['defender'], ['activity', 'log']]
function cloudExposureClass(list, lower) {
  if (list.length > 8) return null
  const two = SWITCH_VERBS.has(list[0]) && list[1] === 'off'
  const verb = two ? 'turn off' : list[0]
  const rest = list.slice(two ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  const offVerb = ['turn off', 'disable', 'remove', 'stop', 'pause', 'deactivate', 'delete'].includes(verb)
  if (offVerb && endsWithSeq(core, ['block', 'public', 'access'])) return 'permission'
  if (offVerb && core.length <= 3 && AUDIT_OBJECTS.some((seq) => endsWithSeq(core, seq))) return 'permission'
  if (verb === 'open' && core.length <= 2 && ['internet', 'world', 'public'].includes(core[core.length - 1])) return 'permission'
  if (verb === 'allow' && (/(?:^|\s)(?:0\.0\.0\.0\/0|::\/0)(?:\s|$)/.test(lower) || (rest.includes('all') && ['traffic', 'inbound', 'ip', 'port', 'source'].includes(core[core.length - 1])))) return 'permission'
  if (verb === 'create' && core[core.length - 1] === 'key' && core.length <= 3 && (core.includes('service') || core.includes('access') || core.includes('api'))) return 'credential'
  if (verb === 'download' && core.length <= 2 && core[core.length - 1] === 'key') return 'credential'
  return null
}

const TITLES = new Set(['movie', 'film', 'show', 'episode', 'season', 'series', 'title', 'documentary', 'subscription'])
function streamingPurchase(list) {
  if (list.length > 6) return false
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (verb === 'add' && core.length >= 1 && core.length <= 3 && last === 'channel' && !rest.includes('to')) return true
  // 'on' is filler, so the add-on is read from rest ('Add premium add-on').
  if (verb === 'add' && rest.length <= 4 && rest.slice(-2).join(' ') === 'add on') return true
  if (verb === 'unlock' && core.length <= 2 && ['episode', 'season', 'chapter', 'series'].includes(last)) return true
  if ((verb === 'gift' || verb === 'rent') && core.length <= 2 && TITLES.has(last)) return true
  return false
}

const DEAL_PARTIES = new Set(['agent', 'realtor', 'seller', 'landlord', 'recruiter', 'broker', 'lender', 'host', 'owner'])
function dealSubmit(list) {
  if (list.length > 6) return false
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (list.length === 2 && verb === 'easy' && rest[0] === 'apply') return true
  if (verb === 'lock' && core.length <= 3 && last === 'rate') return true
  if ((verb === 'get' || verb === 'start' || verb === 'begin') && core[0] === 'pre' && ['approved', 'approval', 'qualified', 'qualification'].includes(core[1]) && core.length === 2) return true
  // #590 round 2: the one-word forms ('Get prequalified').
  if ((verb === 'get' || verb === 'start' || verb === 'begin') && core.length === 1 && ['preapproved', 'preapproval', 'prequalified', 'prequalification'].includes(core[0])) return true
  if (['schedule', 'request', 'book'].includes(verb) && core.length <= 3 && ['tour', 'showing', 'viewing'].includes(last)) return true
  if (['contact', 'message', 'email'].includes(verb) && core.length <= 2 && DEAL_PARTIES.has(last)) return true
  return false
}

function walletClass(list) {
  if (list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const tail = core.join(' ')
  if (['show', 'reveal', 'view', 'copy', 'export', 'display'].includes(verb) && /^(?:(?:seed|recovery|secret|mnemonic)\s+phrase|private\s+key|secret\s+key|seed)$/.test(tail)) return 'credential'
  if (['import', 'restore', 'recover'].includes(verb) && core.length <= 2 && core[core.length - 1] === 'wallet') return 'credential'
  // #590 round 2: 'Restore from seed phrase' - typing a seed phrase in.
  if (['import', 'restore', 'recover'].includes(verb) && /(?:seed|recovery|secret|mnemonic)\s+phrase$|private\s+key$/.test(tail)) return 'credential'
  if (verb === 'set' && core[0] === 'approval' && rest.includes('all')) return 'purchase'
  if (verb === 'approve' && core.length <= 2 && ['spending', 'unlimited', 'token', 'allowance', 'spend'].includes(core[core.length - 1])) return 'purchase'
  if (verb === 'connect' && core.length <= 2 && core[core.length - 1] === 'wallet') return 'permission'
  if (verb === 'claim' && core.length <= 2 && ['airdrop', 'token', 'drop'].includes(core[core.length - 1])) return 'submit'
  return null
}

function identityClass(list) {
  if (list.length > 6) return null
  // 'Temporarily lift freeze': an adverb before the verb is dropped.
  const words = list[0] === 'temporarily' || list[0] === 'permanently' ? list.slice(1) : list
  const [verb, ...rest] = words
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (['change', 'update', 'edit'].includes(verb) && core.length <= 2 && (last === 'address' && (core.length === 1 || ['mailing', 'home', 'billing', 'postal', 'shipping'].includes(core[0])))) return 'credential'
  if (['change', 'update', 'edit'].includes(verb) && core.length <= 3 && core.join(' ').match(/^contact\s+(?:info|information|detail)$/)) return 'credential'
  if (verb === 'forward' && core.length <= 2 && last === 'mail' && !core.includes('e')) return 'credential'
  if (verb === 'unfreeze' && core.length <= 2 && (last === 'credit' || last === 'report' || core.length === 0)) return 'credential'
  if ((verb === 'lift' || verb === 'remove' || verb === 'thaw') && core.length <= 2 && last === 'freeze') return 'credential'
  if (verb === 'certify' && core.length <= 3 && last === 'claim') return 'submit'
  return null
}

const APP_OBJECTS = new Set(['app', 'integration', 'bot', 'plugin', 'connector', 'extension'])
function workspaceClass(list) {
  if (list.length > 6) return null
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (verb === 'convert' && core.includes('public') && core.length <= 3) return 'permission'
  if (['allow', 'approve', 'authorize', 'authorise'].includes(verb) && core.length <= 2 && APP_OBJECTS.has(last)) return 'permission'
  // #590 round 2: kick and ban only - blocking is the safe direction (CU-404's 'Block user' stays free).
  if (['kick', 'ban'].includes(verb) && core.length <= 2 && ['member', 'user', 'participant', 'guest'].includes(last)) return 'permission'
  // #590 round 2: 'Kick from channel', 'Add app to Slack'.
  if (['kick', 'ban'].includes(verb) && rest[0] === 'from' && core.length <= 2) return 'permission'
  if (verb === 'add' && APP_OBJECTS.has(core[0]) && rest.includes('to') && core.length <= 3) return 'install'
  if (verb === 'install' && core.length <= 2 && APP_OBJECTS.has(last)) return 'install'
  return null
}

const MAIL_PROTECTIONS = [['spam', 'filter'], ['safe', 'browsing'], ['external', 'sender', 'warning'], ['sign', 'in', 'notification'], ['security', 'alert'],
  ['phishing', 'protection'], ['login', 'alert'], ['sign', 'in', 'alert'], ['junk', 'filter'], ['phishing', 'warning']]
function mailProtectionClass(list, lower = '') {
  if (list.length > 8) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  if (['turn off', 'disable', 'deactivate', 'pause'].includes(verb) && rest.length <= 4 && MAIL_PROTECTIONS.some((seq) => endsWithSeq(rest, seq))) return 'permission'
  if (verb === 'allow' && rest.length === 2 && rest[0] === 'all' && rest[1] === 'sender') return 'permission'
  // #590 round 2: 'Allow mail from all senders'; 'Turn on access for less secure apps'.
  if (verb === 'allow' && endsWithSeq(rest, ['all', 'sender']) && rest.length <= 5) return 'permission'
  if (['turn on', 'enable', 'allow'].includes(verb) && endsWithSeq(rest, ['less', 'secure', 'app']) && rest.length <= 6) return 'credential'
  if (verb === 'add' && rest.includes('domain') && endsWithSeq(rest, ['safe', 'sender'])) return 'permission'
  // #602 round 2 (cu-coordinator 01:36Z): a concrete domain ('Add example.com to safe senders', 'Add @example.com ...') - not one
  // sender's address ('alice@example.com').
  if (/^\s*add\s+(?:@[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?<![\w@])[a-z0-9-]+(?:\.[a-z0-9-]+)+)\s+to\s+(?:the\s+)?safe\s+senders?(?:\s+list)?\s*$/i.test(lower)) return 'permission'
  if (['turn on', 'enable', 'allow'].includes(verb) && rest.slice(0, 3).join(' ') === 'less secure app') return 'credential'
  return null
}

function taxFiling(list) {
  if (list.length > 6) return false
  const [verb, ...rest] = list
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  if (verb === 'sign' && rest[0] === 'and' && rest[1] === 'file' && rest.length <= 3) return true
  if ((verb === 'transmit' || verb === 'submit') && core.length <= 3 && last === 'return') return true
  if (verb === 'e' && core[0] === 'file') return true
  if (['file', 'request', 'submit'].includes(verb) && core.length <= 2 && last === 'extension') return true
  if (verb === 'file' && core.length <= 3 && last === 'return') return true
  return false
}

function vehicleClass(list) {
  if (list.length > 6) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  const last = core[core.length - 1]
  const tail = core.join(' ')
  if ((list.length === 1 && list[0] === 'summon') || (list.length === 2 && list[0] === 'smart' && list[1] === 'summon')) return 'physical'
  // #590 round 2: 'Summon car', 'Start Summon'.
  if ((list[0] === 'summon' && list.length <= 3 && ['car', 'vehicle'].includes(list[list.length - 1])) || (['start', 'use'].includes(list[0]) && list.length <= 3 && list[list.length - 1] === 'summon')) return 'physical'
  if (list.length === 1 && list[0] === 'honk') return 'physical'
  if (verb === 'open' && core.length <= 2 && ['trunk', 'frunk', 'tailgate', 'liftgate'].includes(last)) return 'physical'
  // #590 round 2 (cu-researcher 23:26Z): a car's windows, never a browser window ('Open link in new window', 'Open in new window').
  if (verb === 'open' && last === 'window' && !rest.includes('new') && !rest.includes('link') && !rest.includes('tab') && (core.length === 1 || (core.length === 2 && ['car', 'rear', 'front', 'all', 'driver', 'passenger'].includes(core[0])))) return 'physical'
  if (verb === 'vent' && core.length <= 2 && last === 'window') return 'physical'
  if (verb === 'start' && core.length <= 2 && ['climate', 'preconditioning', 'defrost'].includes(last)) return 'physical'
  if ((verb === 'flash' && core.length <= 1 && last === 'light') || (verb === 'honk' && core.length <= 1 && last === 'horn')) return 'physical'
  if (['turn off', 'disable', 'deactivate'].includes(verb) && /^sentry(?:\s+mode)?$/.test(tail)) return 'permission'
  if (['turn off', 'disable', 'remove'].includes(verb) && rest.join(' ') === 'pin to drive') return 'credential'
  if (verb === 'add' && core.length <= 2 && last === 'key' && (core.length === 1 || ['phone', 'digital', 'car'].includes(core[0]))) return 'credential'
  return null
}

const CONTACT_DETAILS = [['phone', 'number'], ['email'], ['email', 'address'], ['address'], ['birthday'], ['phone']]
function exposureClass(list, lower = '') {
  if (list.length > 7) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  const core = rest.filter((t) => !FILLER.has(t))
  if (verb === 'make' && core.length <= 2 && core[core.length - 1] === 'private' && (core.length === 1 || ['account', 'profile'].includes(core[0]))) return 'free'
  if ((verb === 'switch' || verb === 'change' || verb === 'set') && rest[0] === 'to' && core.length <= 2 && core[0] === 'public') return 'permission'
  // #592 round 2 (cu-researcher 23:44Z): 'Set posts to Public'.
  if ((verb === 'set' || verb === 'change' || verb === 'make') && rest.length <= 3 && ['post', 'profile', 'account', 'story', 'photo'].includes(rest[0]) && rest[rest.length - 1] === 'public' && (rest.length === 2 || rest[1] === 'to')) return 'permission'
  // 'everyone' / 'anyone' are filler words, so the audience is read on rest ('Change audience to Everyone').
  if ((verb === 'change' || verb === 'set') && rest[0] === 'audience' && rest.length <= 3 && ['public', 'everyone', 'anyone'].includes(rest[rest.length - 1])) return 'permission'
  if (verb === 'turn off' && core.length <= 2 && core[0] === 'private' && (core.length === 1 || ['account', 'profile', 'mode'].includes(core[1]))) return 'permission'
  // 'my' marks a profile field shown to others ('Show my email'); a bare 'Show email' opens a message (F1/F5 stays free).
  if (['show', 'display', 'reveal'].includes(verb) && /\bmy\b/.test(lower) && core.length <= 2 && CONTACT_DETAILS.some((seq) => seq.length === core.length && seq.every((w, i) => core[i] === w))) return 'permission'
  // #592 round 2: a detail shown on the profile or to everyone ('Show my phone number on profile', 'Show phone number to everyone').
  const detail = rest.filter((t) => !['on', 'to', 'profile', 'everyone', 'anyone', 'public'].includes(t) && !FILLER.has(t))
  const audience = (rest.includes('everyone') || rest.includes('anyone') || rest.includes('public')) || (/\bmy\b/.test(lower) && rest.includes('profile'))
  if (['show', 'display', 'reveal'].includes(verb) && audience && detail.length <= 2 && CONTACT_DETAILS.some((seq) => seq.length === detail.length && seq.every((w, i) => detail[i] === w))) return 'permission'
  if (verb === 'allow' && (rest[0] === 'anyone' || rest[0] === 'everyone') && ['message', 'contact', 'call', 'find', 'dm'].some((w) => rest.includes(w)) && rest.length <= 5) return 'permission'
  if (verb === 'allow' && ['message', 'call', 'request'].includes(rest[0]) && rest[1] === 'from' && ['anyone', 'everyone'].includes(rest[2]) && rest.length === 3) return 'permission'
  return null
}

const REMOTE_ACCESS = [['screen', 'sharing'], ['remote', 'login'], ['remote', 'desktop'], ['remote', 'connection'], ['file', 'sharing'], ['internet', 'sharing'],
  ['remote', 'apple', 'event'], ['remote', 'control'], ['smb'], ['remote', 'desktop', 'connection'], ['file', 'sharing', 'service'], ['smb', 'service']]
function remoteAccess(list) {
  if (list.length > 6) return false
  const two = SWITCH_VERBS.has(list[0]) && list[1] === 'on'
  const verb = two ? 'turn on' : list[0]
  const rest = list.slice(two ? 2 : 1).filter((t) => !FILLER.has(t))
  return ['turn on', 'enable', 'allow', 'start', 'activate'].includes(verb) && rest.length <= 4 && REMOTE_ACCESS.some((seq) => endsWithSeq(rest, seq))
}
function portalClass(list) {
  if (list.length > 7) return null
  const [verb, ...rest] = list
  // #617 round 2 (cu-researcher 03:38Z): 'Give someone access to my account', 'Give access to my chart', 'Join research program',
  // 'Schedule follow-up'.
  if (verb === 'give' && rest.includes('access') && rest.length <= 5 && ['account', 'chart', 'record', 'portal'].includes(rest[rest.length - 1])) return 'credential'
  // 'Sign waiver' keeps the grammar's existing permission on main (cu-developer-three 04:15Z) - only the ruled authorization / release.
  if (verb === 'sign' && rest.length <= 3 && ['authorization', 'release'].includes(rest[rest.length - 1])) return 'submit'
  if (['schedule', 'request'].includes(verb) && rest.length <= 3 && (['appointment', 'visit'].includes(rest[rest.length - 1]) || (rest.includes('follow') && rest[rest.length - 1] === 'up'))) return 'submit'
  if (verb === 'start' && rest.length <= 3 && rest.includes('visit') && (rest.includes('e') || rest.includes('video') || rest.includes('virtual'))) return 'submit'
  if (verb === 'opt' && rest[0] === 'in' && rest.length <= 4 && ['research', 'study', 'trial'].includes(rest[rest.length - 1])) return 'permission'
  // cu-coordinator 03:51Z: checking in for a visit is submit ('Check in', 'eCheck-in', 'Check in for appointment', 'Check in online').
  if ((verb === 'check' || verb === 'echeck') && rest[0] === 'in' && rest.length <= 3 && (rest.length === 1 || ['appointment', 'visit', 'online'].includes(rest[rest.length - 1]))) return 'submit'
  if (['join', 'enroll', 'enrol'].includes(verb) && rest.length <= 3 && (rest.includes('research') || rest.includes('study') || rest.includes('trial'))) return 'permission'
  return null
}
function vaultClass(list) {
  if (list.length > 7) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  // #614 round 2 (cu-researcher 03:18Z): plaintext for unencrypted; reprompt without 'master password'; a timeout to never without
  // 'vault' (not a screen timeout); vault auto-lock off by word order; an emergency contact with no page condition.
  if (['download', 'export', 'save'].includes(verb) && (rest.includes('unencrypted') || rest.includes('plaintext')) && rest.length <= 4) return 'credential'
  if (verb === 'add' && rest.length <= 3 && rest.includes('emergency') && ['contact', 'access'].includes(rest[rest.length - 1])) return 'credential'
  if (['turn off', 'disable'].includes(verb) && rest.includes('reprompt') && rest.length <= 4) return 'permission'
  if (verb === 'never' && rest[0] === 'lock' && rest.length <= 3) return 'permission'
  if (verb === 'set' && rest.includes('timeout') && rest[rest.length - 1] === 'never' && rest.length <= 5 && !rest.includes('screen') && !rest.includes('display')) return 'permission'
  if (['turn off', 'disable'].includes(verb) && rest[0] === 'vault' && rest.includes('lock') && rest.length <= 4) return 'permission'
  return null
}
function merchantClass(list) {
  if (list.length > 8) return null
  const [verb, ...rest] = list
  // #614 round 2: 'instant payout' anywhere in a short name; accept all (open) disputes / chargebacks; set all / every price to an
  // amount; apply a discount to all (products); risk rules too.
  if (list.length <= 5 && list.some((t, i) => t === 'instant' && list[i + 1] === 'payout')) return 'purchase'
  if (verb === 'accept' && rest[0] === 'all' && rest.length <= 3 && ['dispute', 'chargeback'].includes(rest[rest.length - 1])) return 'purchase'
  if (verb === 'set' && ['all', 'every'].includes(rest[0]) && rest[1] === 'price' && rest[2] === 'to' && rest.length <= 4) return 'purchase'
  if (verb === 'apply' && rest.includes('discount') && rest.includes('all') && rest.length <= 6) return 'purchase'
  if (verb === 'issue' && rest[0] === 'refund' && rest[rest.length - 1] === 'all' && rest.length <= 4) return 'purchase'
  if (['disable', 'remove', 'delete'].includes(verb) && rest.length <= 3 && ['fraud', 'risk', 'radar'].includes(rest[0]) && ['filter', 'rule', 'protection', 'check'].includes(rest[rest.length - 1])) return 'permission'
  if (verb === 'turn' && rest[0] === 'off' && rest.length <= 3 && (rest.includes('radar') || rest.includes('fraud')) && ['rule', 'filter', 'protection'].includes(rest[rest.length - 1])) return 'permission'
  if (verb === 'close' && rest.length === 1 && ['store', 'shop'].includes(rest[0])) return 'delete'
  // #614 round 2 (cu-coordinator 03:19Z): pausing the store and changing the payout schedule (permission).
  if (verb === 'pause' && rest.length === 1 && ['store', 'shop'].includes(rest[0])) return 'permission'
  if (['change', 'edit', 'update', 'set'].includes(verb) && rest.length <= 3 && rest.includes('payout') && rest[rest.length - 1] === 'schedule') return 'permission'
  return null
}
const TENANT_PROTECTIONS = ['conditional', 'dlp', 'security', 'mfa', 'retention', 'compliance', 'audit', 'sign', 'session', 'data']
function tenantClass(list) {
  if (list.length > 7) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  const last = rest[rest.length - 1]
  if (['disable', 'turn off', 'deactivate', 'delete', 'remove'].includes(verb) && rest.length <= 4 && ['policy', 'default'].includes(last) && TENANT_PROTECTIONS.includes(rest[0])) return 'permission'
  // #606 round 2: 'Turn off conditional access' (no 'policy'), 'Exclude from conditional access', 'Allow basic authentication',
  // 'Make Global Administrator'.
  if (['disable', 'turn off', 'deactivate'].includes(verb) && rest.length === 2 && rest[0] === 'conditional' && rest[1] === 'access') return 'permission'
  if (verb === 'exclude' && rest[0] === 'from' && rest.length <= 4 && (rest.includes('conditional') || rest.includes('mfa') || rest.includes('policy'))) return 'permission'
  if (verb === 'make' && rest.length <= 3 && rest.includes('global') && (rest.includes('administrator') || rest.includes('admin'))) return 'permission'
  if (verb === 'exclude' && ['user', 'group', 'account', 'member'].includes(rest[0]) && rest.includes('from') && rest.length <= 5) return 'permission'
  if (verb === 'allow' && (rest[0] === 'legacy' || rest[0] === 'basic') && ['authentication', 'auth', 'protocol'].includes(rest[1]) && rest.length === 2) return 'permission'
  if (verb === 'assign' && rest.length <= 3 && (rest.includes('administrator') || rest.includes('admin'))) return 'permission'
  if (verb === 'add' && rest.length === 2 && rest[0] === 'role' && rest[1] === 'assignment') return 'permission'
  if (verb === 'reset' && rest.length <= 2 && ['mfa', '2fa', 'authenticator', 'authentication', 'security'].includes(rest[0])) return 'credential'
  return null
}
function simSwap(list) {
  if (list.length > 7) return false
  const [verb, ...rest] = list
  const last = rest[rest.length - 1]
  if (verb === 'port' && rest.length === 1 && rest[0] === 'out') return true
  if (['get', 'download', 'show', 'view', 'scan'].includes(verb) && rest[0] === 'esim' && rest.length <= 3) return true
  if (verb === 'convert' && rest.length <= 4 && last === 'esim') return true
  // #602 round 2: 'Transfer number to another phone', 'Move my line to a new phone', 'Change my SIM card'.
  if ((verb === 'transfer' || verb === 'move' || verb === 'port') && ['number', 'line'].includes(rest[0]) && rest.includes('to') && ['phone', 'device', 'carrier'].includes(last) && rest.length <= 5) return true
  if (['change', 'replace', 'swap'].includes(verb) && rest.length <= 2 && rest[0] === 'sim' && last === 'card') return true
  if (['activate', 'add', 'set'].includes(verb) && rest.length <= 2 && (last === 'sim' || last === 'esim')) return true
  if (verb === 'move' && rest[0] === 'number' && rest.includes('device') && rest.length <= 4) return true
  if ((verb === 'change' || verb === 'replace' || verb === 'swap' || verb === 'transfer') && rest.length <= 2 && (last === 'sim' || last === 'esim')) return true
  return false
}
function lockClass(list) {
  if (list.length > 7) return null
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  if (['turn off', 'disable', 'deactivate', 'pause'].includes(verb) && rest.length === 2 && rest[0] === 'auto' && rest[1] === 'lock') return 'physical'
  if (verb === 'set' && rest[0] === 'to' && rest.length === 2 && ['disarmed', 'disarm', 'off'].includes(rest[1])) return 'physical'
  // #602 round 2: 'Set system to Disarmed', 'Set mode to Off', 'Turn off Auto-Lock timer'.
  if (verb === 'set' && rest.length === 3 && ['system', 'mode', 'alarm', 'security'].includes(rest[0]) && rest[1] === 'to' && ['disarmed', 'disarm', 'off'].includes(rest[2])) return 'physical'
  if (['turn off', 'disable', 'deactivate', 'pause'].includes(verb) && rest.length === 3 && rest[0] === 'auto' && rest[1] === 'lock' && rest[2] === 'timer') return 'physical'
  if (verb === 'bypass' && rest.length <= 2 && ['zone', 'sensor'].includes(rest[rest.length - 1])) return 'physical'
  if (verb === 'grant' && rest.length === 1 && rest[0] === 'entry') return 'physical'
  if (verb === 'unlock' && rest[0] === 'for' && rest.includes('<n>') && ['minute', 'hour', 'second'].includes(rest[rest.length - 1]) && rest.length <= 3) return 'physical'
  if (verb === 'add' && rest.length <= 4 && ['user', 'guest', 'person', 'member'].includes(rest[0]) && rest.includes('to') && ['lock', 'door'].includes(rest[rest.length - 1])) return 'credential'
  return null
}
function repoProtectionOff(list) {
  if (list.length > 7) return false
  // #597 round 2: the two-word switch verbs too ('Turn off secret scanning').
  const two = SWITCH_VERBS.has(list[0]) && (list[1] === 'off' || list[1] === 'on')
  const verb = two ? `turn ${list[1]}` : list[0]
  const rest = list.slice(two ? 2 : 1)
  if (verb === 'allow' && rest.length <= 2 && ['force', 'deletion'].includes(rest[0]) && (rest.length === 1 || rest[1] === 'push')) return true
  if (verb === 'allow' && rest.length === 2 && rest[0] === 'branch' && rest[1] === 'deletion') return true
  if (['disable', 'remove', 'turn off', 'skip'].includes(verb) && rest[0] === 'required' && ['review', 'status', 'check', 'approval'].includes(rest[1]) && rest.length <= 3) return true
  if (verb === 'allow' && rest[0] === 'all' && rest[1] === 'action' && rest.length <= 5) return true
  if (['disable', 'remove', 'turn off'].includes(verb) && rest.length <= 2 && endsWithSeq(rest, ['scanning']) && rest[0] === 'secret') return true
  if ((verb === 'add' || verb === 'create') && rest.length === 1 && rest[0] === 'webhook') return true
  return false
}
function agentBlanket(list) {
  if (list.length > 6) return false
  const [verb, ...rest] = list
  // #597 round 2: 'Allow all tool calls', 'Allow all terminal commands', 'Execute without approval', 'Switch to YOLO mode', 'Trust this project'.
  if (verb === 'allow' && rest[0] === 'all' && ['tool', 'command', 'terminal'].includes(rest[1]) && rest.length <= 3) return true
  if ((verb === 'run' || verb === 'execute') && rest[0] === 'without' && ['confirmation', 'approval', 'asking'].includes(rest[1]) && rest.length === 2) return true
  if (verb === 'switch' && rest[0] === 'to' && endsWithSeq(rest, ['yolo', 'mode']) && rest.length <= 3) return true
  if (verb === 'trust' && rest.length === 1 && ['project', 'folder', 'repository', 'repo', 'directory'].includes(rest[0])) return true
  if (verb === 'run' && endsWithSeq(rest, ['yolo', 'mode']) && rest.length <= 3) return true
  if (verb === 'auto' && ['accept', 'approve', 'run'].includes(rest[0]) && rest.length <= 2) return true
  if (verb === 'skip' && ['approval', 'confirmation', 'permission'].includes(rest[rest.length - 1]) && rest.length <= 2) return true
  return false
}

const DIVERSION_VERBS = new Set(['change', 'update', 'edit', 'add', 'set', 'replace', 'switch'])
const DIVERSION_OBJECTS = [['direct', 'deposit'], ['bank', 'detail'], ['deposit', 'account'], ['routing', 'number'], ['account', 'number'],
  ['payout', 'account'], ['payout', 'method'], ['bank', 'account'], ['payout', 'detail']]
function payDiversion(list) {
  if (list.length < 3 || list.length > 6 || !DIVERSION_VERBS.has(list[0])) return false
  const rest = list.slice(1).filter((t) => !FILLER.has(t))
  return DIVERSION_OBJECTS.some(([a, b]) => rest.length <= 3 && rest[rest.length - 2] === a && rest[rest.length - 1] === b)
}

// The classes the grammar asks for a control's name (and its role, for the priced cell); [] when it asks nothing.
// CU-469 (High; cu-coordinator 01:19Z): a confirmation prefix ('Yes,', 'OK,', 'Sure,', 'Confirm:') and trailing words or glyphs
// ('now', '...', arrows, icons) wrap a ruled row in a dialog. The table rows read from the first word, so the wrapper is taken off
// and the row judged again - only when the name as written gets no class, so it adds only.
// #600 round 2 (cu-researcher 01:26Z): 'Yes please,' / 'Yes, please' and a trailing 'right now' too.
// #600 round 3 (cu-researcher 01:33Z): a leading icon alone, and a trailing '!' or '(recommended)' too.
// CU-504 (glyph sweep): a leading arrow, bullet, check or other symbol character ('→ Edit DNS', '• Delete', '✓ Download W-2s') is
// stripped like an emoji - symbols (\p{S}) and list punctuation (bullets, dashes, '>' and '»'), never letters or digits.
const LEADING_ICONS = /^\s*(?:[\p{Extended_Pictographic}\uFE0F\p{S}\u2022\u2023\u2043\u2219\u25aa\u25ab\u25cf\u25e6\u00b7\u203a\u00bb>*\-\u2013\u2014]\s*)+/u
// CU-503 (wrapper sweep): the acknowledgement on a dangerous dialog's final button - 'I understand, <row>', 'I understand the
// consequences, <row>', 'I acknowledge the risk, <row>', 'Understood, <row>' - is stripped like 'Yes, <row>', so the row decides.
// #685 round 2 (cu-researcher 13:54Z): the connector form - 'I understand (the risks) and (still) want / wish / choose to <row>'.
const ACK_CONNECTOR = /^\s*i\s+(?:understand|acknowledge|accept|agree)(?:\s+(?:the|all|these)\s+(?:consequences|risks?|terms|warnings?))?\s*,?\s+and\s+(?:still\s+)?(?:want|wish|choose|would\s+like|intend|agree)\s+to\s+/i
const CONFIRM_PREFIX = /^\s*(?:(?:yes(?:\s+please)?|ok|okay|sure|confirm|continue|got\s+it|please|understood|i\s+(?:understand|acknowledge|accept|agree)(?:\s+(?:the|all|these)\s+(?:consequences|risks?|terms|warnings?))?|i(?:'ve|\s+have)\s+read\s+and\s+understand(?:\s+(?:the|this|these)\s+\w+)?)\s*[,:!.\u2013\u2014-]+\s*)+/iu
// CU-482 (proposed High; cu-researcher 04:58Z): a call-to-action lead-in before a ruled row - 'please', 'click (here) to', 'tap to',
// 'let's', 'go ahead and', 'I want to'.
// cu-researcher 05:02Z: trailing qualifiers too - 'anyway', 'instantly', 'on this device', 'for me', 'here', 'too', 'again'.
// #630 round 2: a trailing ', please' too ('Add time, please').
const TRAILING_QUALIFIER = /(?:\s*,\s*please|\s+(?:anyway|anyways|instantly|immediately|on\s+this\s+(?:device|computer|browser|phone)|for\s+me|here|too|again))+\s*[.!]?\s*$/i
// CU-508 (qualifier sweep): a trailing WIDENING qualifier - 'permanently', 'forever', 'for good', 'completely', 'for all users /
// members / accounts', 'for everyone', 'on all (my) devices', 'everywhere', 'across all devices' - is stripped in a canonical form
// (the trailing twin of CU-502's quantifier), so the row decides. Adds asks only.
// CU-509 (scope sweep): a trailing scope phrase - 'for this project / bucket / account', 'in this workspace', 'on this device' - is
// stripped the same way: it narrows, but it must not free the row.
const WIDENING_QUALIFIER = /(?:\s*,)?\s+(?:permanently|forever|for\s+good|completely|entirely|for\s+(?:all|every)\s+(?:users?|members?|accounts?|devices?|people|employees|seats?)|for\s+everyone|for\s+everybody|(?:on|across|from)\s+(?:all|every)\s+(?:(?:my|your|our)\s+)?(?:devices?|computers?|browsers?|sessions?|accounts?)|everywhere|org(?:anization)?[-\s]wide|company[-\s]wide|(?:for|in|on|from|across|to|into|within)\s+(?:this|the\s+current|the|my|your|our|that)\s+(?:project|workspace|account|bucket|repository|repo|org(?:anization)?|team|site|space|folder|channel|server|cluster|database|device|computer|browser|profile|page|app|domain|tenant|environment|subscription|vault|wallet|store|group))\s*[.!]?\s*$/i
export function widenedStripped(name) {
  const first = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)[0] ?? ''
  let text = first
  for (let i = 0; i < 3 && WIDENING_QUALIFIER.test(text); i += 1) text = text.replace(WIDENING_QUALIFIER, '').trim()
  return text !== first && /\s|^\p{L}{3,}$/u.test(text) ? [text] : []
}
// #630 round 2 (cu-researcher 05:22Z): "I'd like to" (the contraction), 'let us', 'kindly'.
const CTA_LEAD_IN = /^\s*(?:please\s+|kindly\s+|(?:click|tap|press|select)\s+(?:here\s+)?to\s+|let(?:'|\u2019)?s\s+|let\s+us\s+|go\s+ahead\s+and\s+|i(?:\s+want|\s+would\s+like|(?:'|\u2019)d\s+like)\s+to\s+)+/iu
const TRAILING_WRAP = /(?:\s*(?:right\s+now|now|please|\.{2,}|\u2026|!+|\((?:recommended|suggested|best\s+value)\)|[\u2192\u203a\u00bb>\u2794\u27f6\u279c\u27a1]|\p{Extended_Pictographic}|\uFE0F))+\s*$/iu
// CU-473 (cu-researcher 02:15Z): a second line, a badge or a count after a ruled name - the first line of a multi-line name; a
// sentence-case name followed by a capitalised second sentence ('Change direct deposit Takes effect immediately'); a trailing badge
// ('New', 'Beta', 'Preview', 'Updated'); a trailing parenthetical ('(opens in a new window)', '(3)').
const TRAILING_BADGE = /(?:\s+(?:new|beta|preview|updated|hot)!?)+\s*$/i
const TRAILING_PAREN = /(?:\s*\([^()]{1,40}\))+\s*$/
// #609 round 4 (cu-coordinator 02:35Z): an added leading name part - 'Action: ', 'Confirm action: ', 'Step 2: ', 'Step 2 of 3: '.
const LEADING_PART = /^\s*(?:(?:confirm\s+)?action|step\s+\d+(?:\s+of\s+\d+)?)\s*[:\u2013\u2014-]\s*/i
// #609 round 3 (cu-researcher 02:30Z): a trailing key hint ('Send \u2318\u23ce', 'Save \u2318S', 'Submit Ctrl+Enter').
const TRAILING_KEYS = /(?:\s+(?:[\u2318\u2325\u21e7\u2303]+\s*[A-Za-z0-9\u23ce\u21a9\u232b]?|[\u23ce\u21a9]|(?:ctrl|cmd|command|alt|option|shift)\s*\+\s*(?:enter|return|[a-z0-9])))+\s*$/i
function firstSentence(text) {
  const words = text.split(/\s+/)
  if (words.length < 3 || !/^[A-Z]/.test(words[0])) return text
  for (let i = 1; i < words.length; i += 1) {
    if (/^[A-Z][a-z]/.test(words[i])) return i >= 2 && words.slice(1, i).every((w) => !/^[A-Z]/.test(w)) ? words.slice(0, i).join(' ') : text
  }
  return text
}
/** #635 round 2 (cu-researcher 07:08Z): the lead-ins only, with the trailing words kept - 'Yes, install now' keeps its 'now' for the
 * 'Install now' row (the full canonical form strips a trailing 'now'). */
function leadingStripped(name) {
  const lines = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  return (lines[0] ?? '').replace(LEADING_ICONS, '').replace(LEADING_PART, '').replace(CONFIRM_PREFIX, '').replace(CTA_LEAD_IN, '').trim()
}
export function canonicalConfirm(name) {
  const lines = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  const text = lines[0] ?? ''
  return text.replace(LEADING_ICONS, '').replace(LEADING_PART, '').replace(ACK_CONNECTOR, '').replace(CONFIRM_PREFIX, '').replace(CTA_LEAD_IN, '').replace(TRAILING_QUALIFIER, '').replace(TRAILING_KEYS, '').replace(TRAILING_WRAP, '').replace(TRAILING_PAREN, '').replace(TRAILING_BADGE, '').replace(TRAILING_WRAP, '').trim()
}
/** #609 round 2 (cu-researcher 02:24Z): the canonical forms to try, in order - the unwrapped name, then (only if that asks nothing)
 * its first sentence. Additive: a Title-Case object ('Turn off Safe Browsing') is never lost to the sentence cut. */
// CU-478 (High; cu-coordinator 03:51Z): a determiner after the verb breaks the older exact-phrase rows ('Update my firmware', 'Accept
// my counteroffer', 'Turn on my location sharing', 'Open the ports') - one more form drops the / my / your / our / this / these / a / an.
const DETERMINER_WORDS = /\b(?:the|my|your|our|this|these|those|a|an)\s+/gi
function withoutDeterminers(text) {
  const words = text.split(/\s+/)
  if (words.length < 2) return text
  // Keep the first word (the verb) as written; drop determiners after it.
  return `${words[0]} ${words.slice(1).join(' ').replace(DETERMINER_WORDS, '')}`.replace(/\s+/g, ' ').trim()
}
// CU-481 (High; cu-coordinator 04:51Z): a leading-verb synonym of a ruled row - modify -> change, display / reveal -> show,
// give -> grant, begin -> start, ask for -> request, create -> add - one more form, like CU-455 / CU-463, adds only.
// cu-coordinator 06:34Z (CU-481 follow-up): update / edit -> change too, tried last like the others - never 'Update all / now' (the
// App Store's own verdict decides those, CU-254).
const VERB_SYNONYMS = [[/^(\s*)modify\b/i, '$1change'], [/^(\s*)(?:update|edit)\b(?!\s+(?:all|now|available)\b)/i, '$1change'], [/^(\s*)(?:display|reveal)\b/i, '$1show'], [/^(\s*)give\b/i, '$1grant'],
  [/^(\s*)begin\b/i, '$1start'], [/^(\s*)ask\s+for\b/i, '$1request'],
  // #627 round 2 (cu-researcher 05:08Z): creating an account is not adding one ('Create account' stays free).
  [/^(\s*)create\b(?!\s+(?:an?\s+|new\s+|your\s+|my\s+)?accounts?\b)/i, '$1add']]
function withVerbSynonym(text) {
  for (const [pattern, replacement] of VERB_SYNONYMS) if (pattern.test(text)) return text.replace(pattern, replacement)
  return text
}
// CU-486 (High; cu-coordinator 07:36Z): known compounds are joined and split both ways - autolock / auto-lock, e-mail / email, log-in /
// login, e-sim / esim, opt-in / optin, check-in / checkin, add-on / addon, plug-in / plugin, sign-in / signin, set-up / setup.
// #642 round 2 (cu-researcher 07:54Z): auto-invest too, and a SPACED compound joins as well ('Remote log in', 'plug in').
const COMPOUNDS = [['auto', 'lock'], ['auto', 'invest'], ['e', 'mail'], ['log', 'in'], ['e', 'sim'], ['opt', 'in'], ['check', 'in'], ['add', 'on'], ['plug', 'in'], ['sign', 'in'], ['set', 'up']]
function compoundJoined(text) {
  let out = text
  for (const [a, b] of COMPOUNDS) out = out.replace(new RegExp(`\\b${a}[-\\u2010\\u2011 ](${b})\\b`, 'gi'), (m) => m.replace(/[-\u2010\u2011 ]/, ''))
  return out
}
function compoundSplit(text) {
  let out = text
  for (const [a, b] of COMPOUNDS) out = out.replace(new RegExp(`\\b(${a})(${b})\\b`, 'gi'), '$1-$2')
  return out
}
// CU-502 (High; cu-coordinator 13:21Z; canonical-form sweep, tried LAST - after the verb-synonym forms): a quantifier between the verb and its object - '<verb> all (the / of the / your / my) <nouns>' or
// '<verb> every <noun>' - is judged as the verb on the object, plural kept and singular, so 'Silence all alarms', 'Empty all buckets',
// 'Cancel all orders' reach their rows. Never for the list-handling verbs ('Select all', 'Mark all as read', 'Expand all', 'Show all
// results'), and only when a noun follows the quantifier.
// #683 round 2 (cu-coordinator 13:36Z): 'open' is not a list verb ('Open all ports' asks); and a name that already asks takes the
// full class set of its quantifier-dropped row too (policy.mjs: 'Approve each sign-in' = permission + submit like 'Approve sign-in').
const QUANTIFIER_SAFE_VERBS = /^(?:select|deselect|unselect|mark|view|show|see|expand|collapse|read|check|uncheck|filter|sort|hide|load|browse|list|clear\s+filters?|reply)$/i
export function quantifierDropped(form) {
  const m = /^\s*((?:turn\s+(?:on|off)|switch\s+(?:on|off)|set\s+up|log\s+out\s+of|sign\s+out\s+of|[a-z][a-z-]*))\s+(?:all|every|each)(?:\s+(?:of\s+)?(?:the|your|my|these|those))?\s+([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})\s*$/i.exec(String(form ?? ''))
  if (!m || QUANTIFIER_SAFE_VERBS.test(m[1].trim())) return []
  if (/^(?:as|to|from|in|on|at|of|for|with|that|which|read|unread|done)\b/i.test(m[2])) return []
  const words = m[2].split(/\s+/)
  const last = words[words.length - 1]
  const one = [...words.slice(0, -1), singular(last)].join(' ')
  return [...new Set([`${m[1]} ${m[2]}`, `${m[1]} ${one}`])]
}
// #685 round 3 (cu-developer-three 13:57Z): the acknowledgement stripped alone, keeping the row's own trailing words - 'I understand and
// want to open anyway' is judged as 'open anyway' (Gatekeeper's install row), not only as the qualifier-stripped 'open'.
function acknowledgementStripped(name) {
  const first = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)[0] ?? ''
  return first.replace(ACK_CONNECTOR, '').replace(CONFIRM_PREFIX, '').trim()
}
// CU-505 (label sweep): a short section label before the row - '<Label>: <row>' or '<Label> - <row>' (one to three words, a colon
// or a spaced dash) - and brackets or quotes around the whole name are stripped, so the row decides ('Danger zone: Make this
// repository public', 'Payroll - Change direct deposit', '[Delete account]').
// cu-coordinator 14:49Z: a label of up to five words; tried LAST (after the verb-synonym and quantifier forms), so the label never
// lowers and a free rest stays free; a time or ratio ('10:30', '16:9') is never split (no colon before a digit).
// CU-506 (compound sweep): a name of two or three verb-led clauses joined by 'and' / '&' / 'then' / '+' ('Review and confirm
// withdrawal', 'Save and disable encryption', 'Turn off backups & close') is judged clause by clause and asks the union, tried last.
// Only when every clause starts with a verb or asks on its own - so 'Terms and conditions', 'Privacy & Security' and 'Rock and roll'
// never split.
// #699 round 3 (cu-researcher 15:57Z): the free-clause verbs too - check, test, validate, inspect, preview, refresh, paste, select, read,
// double-check, look up, search, name, label, tag, and their kin (find, compare, choose, pick, enter, type, fill, verify).
const CLAUSE_VERBS = /^(?:check|double-check|test|validate|inspect|preview|refresh|paste|select|read|look\s+up|search|name|label|tag|find|compare|choose|pick|enter|type|fill|verify|confirm|save|review|scan|confirm|continue|close|submit|send|delete|remove|disable|enable|turn|switch|link|unlink|sign|pay|buy|apply|accept|agree|approve|transfer|export|download|install|uninstall|open|update|change|create|add|reset|cancel|archive|publish|share|allow|grant|unlock|lock|restart|finish|complete|verify|upload|connect|disconnect|erase|empty|clear|move|copy|exit|quit|leave|join|start|stop|run|deploy|merge|push|release|revoke|deny|block|unblock|activate|deactivate|back|restore|sync|import|print|rename|edit|set|make|give|withdraw|deposit|sell|order|book|schedule|invite|register|log)\b/i
export function clauseSplit(name) {
  const first = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)[0] ?? ''
  if (first.length > 200) return []
  const parts = first.split(/\s+(?:and|&|then|\+)\s+|\s*,\s*(?:and|then)\s+/i).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return []
  return parts
}
/** #699 round 2 (cu-researcher 15:43Z): whether a clause starts with a listed UI verb; the policy also accepts a clause that asks on
 * its own ('Suspend user', 'Silence alarm' - their first word starts an asking row). */
// cu-coordinator 15:49Z: the verb set is derived from the ruled rows' own verb tables (VERBS, MULTI_VERBS, SWITCH_VERBS and the
// family verb sets), not a fixed list; CLAUSE_VERBS adds the plain UI verbs that lead a free clause ('save', 'review', 'scan').
const ROW_VERBS = new Set([...VERBS.keys(), ...MULTI_VERBS.map(([words]) => words[0]), ...SWITCH_VERBS, ...PERSON_PAY_VERBS, ...EMAIL_VERBS, ...CURRENCY_VERBS, ...DIVERSION_VERBS])
export function clauseVerbLed(part) {
  const text = String(part ?? '').trim()
  const first = (text.toLowerCase().match(/^[a-z][a-z-]*/) ?? [''])[0]
  return ROW_VERBS.has(first) || CLAUSE_VERBS.test(text)
}
export function sectionLabelStripped(name) {
  const first = String(name ?? '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)[0] ?? ''
  const forms = []
  const label = /^\s*[\p{L}][\p{L}\p{N}&'.]*(?:\s+[\p{L}\p{N}&'.]+){0,4}\s*(?::(?!\d)|\s[-\u2013\u2014|]\s)\s*(\S.*)$/u.exec(first)
  // #694 round 2 (cu-researcher 15:05Z): a one-word rest counts too ('Movie - Rent', 'Controls: Honk').
  // The rest must start with a letter: a price or score after a label ('Price: $35', 'Score: 3-1') is never a row.
  if (label && /^\p{L}/u.test(label[1].trim())) forms.push(label[1].trim())
  const wrapped = /^\s*[\[("'\u201c\u2018\u00ab\u2039](.+?)[\])"'\u201d\u2019\u00bb\u203a]\s*$/u.exec(first)
  if (wrapped) forms.push(wrapped[1].trim())
  return forms
}
export function canonicalForms(name) {
  const unwrapped = canonicalConfirm(name)
  const cut = firstSentence(unwrapped)
  const bare = withoutDeterminers(unwrapped)
  const forms = [unwrapped, cut, bare, withoutDeterminers(cut), leadingStripped(name), acknowledgementStripped(name), ...widenedStripped(name).flatMap((f) => [f, canonicalConfirm(f)])]
  // The compound forms only for a name a row could match (<= 200 characters): the F3 budget (CU-272) holds for an 80k-character name.
  const compounds = String(name ?? '').length <= 200 ? [...forms.map(compoundJoined), ...forms.map(compoundSplit)] : []
  return [...new Set([...forms, ...compounds])].filter((form) => form !== '' && form !== String(name ?? '').trim())
}
/** CU-481: the verb-synonym forms of a name (and of its canonical forms) - tried LAST, only when the name and its own canonical forms
 * get no class, so a synonym never outranks a row the name already matches ('Create service account key' stays credential). */
// CU-489 (High; cu-coordinator 08:49Z): abbreviations of ruled rows' objects - IBAN / ACH -> direct deposit, 2SV / TOTP / MFA / 2FA /
// login approvals -> two-factor authentication, WPA -> Wi-Fi password, RDP -> Remote Desktop. Word-edged and case-sensitive for the
// acronyms (an 'ach' inside a word never counts); tried last, with the verb synonyms.
// Each expansion only after the verbs its ruled rows use, so a protection being raised ('Require MFA') never takes the row of one being
// lowered (#606 pins 'Require MFA' free).
// #653 round 2 (cu-researcher 09:11Z; cu-developer-three 09:10Z): ACH / IBAN with a trailing info / details / number / account; WPA
// reaches the 'Wi-Fi security' row (permission); 'open RDP' is opening port 3389 (CU-464), 'start' joins the RDP verbs; a bare
// acronym on a TOGGLE (a verbless switch named 'RDP' / 'MFA' / '2SV') expands without a verb, so the switch rules give it direction.
const ABBREVIATIONS = [
  [/^\s*(?:change|update|edit|add|set\s+up|replace)\b/i, /\b(?:IBAN|ACH)(?:\s+(?:info|information|details|number|account))?\b/g, 'direct deposit'],
  [/^\s*(?:turn\s+off|disable|remove|deactivate|reset|bypass|skip|switch\s+off)\b/i, /\b(?:2SV|TOTP|MFA|2FA)\b|\b[Ll]ogin\s+approvals?\b/g, 'two-factor authentication'],
  // #653 round 3 (cu-developer-two 09:14Z): showing or changing a WPA key is the Wi-Fi password (credential); turning WPA off is the
  // Wi-Fi security row (permission).
  [/^\s*(?:show|reveal|view|change|copy)\b/i, /\bWPA[23]?(?:\s+(?:key|password|passphrase))?\b/g, 'Wi-Fi password'],
  [/^\s*(?:turn\s+off|disable|remove)\b/i, /\bWPA[23]?\b/g, 'Wi-Fi security'],
  // cu-researcher 09:15Z: only 'Open RDP (port)' at the END of the name - 'Open RDP guide' stays free.
  [/^\s*open\b/i, /\bRDP(?:\s+port)?\s*$/g, 'port 3389'],
  [/^\s*(?:turn\s+on|enable|allow|activate|start|switch\s+on)\b/i, /\bRDP\b/g, 'Remote Desktop']]
const TOGGLE_ACRONYMS = [[/^\s*(?:2SV|TOTP|MFA|2FA)\s*$/, 'Two-factor authentication'], [/^\s*RDP\s*$/, 'Remote Desktop'], [/^\s*WPA[23]?\s*$/, 'Wi-Fi security']]
/** #653 round 2: a toggle named by a bare acronym ('RDP', 'MFA') is judged as the setting it stands for. */
export function toggleExpansion(name) {
  for (const [pattern, expansion] of TOGGLE_ACRONYMS) if (pattern.test(String(name ?? ''))) return expansion
  return ''
}
function withAbbreviations(text) {
  let out = text
  for (const [verb, acronym, expansion] of ABBREVIATIONS) if (verb.test(out) && acronym.test(out)) { acronym.lastIndex = 0; out = out.replace(acronym, expansion) }
  return out
}
export function synonymForms(name) {
  const own = String(name ?? '').trim()
  if (own.length > 200) return []
  const base = [own, ...canonicalForms(name)]
  const forms = [...base.map(withVerbSynonym), ...base.map(withAbbreviations), ...base.map((f) => withVerbSynonym(withAbbreviations(f)))]
  const known = new Set(canonicalForms(name))
  // CU-502: the quantifier-dropped forms go last of all (and their verb synonyms after them).
  const quantified = [...new Set(base.flatMap(quantifierDropped))]
  // CU-505: the section-label forms after them, last of all.
  const labelled = sectionLabelStripped(name)
  const last = [...quantified, ...quantified.map(withVerbSynonym), ...labelled, ...labelled.flatMap((f) => [f, ...canonicalForms(f)])]
  return [...new Set([...forms, ...last])].filter((form) => form !== '' && form !== own && !known.has(form))
}

/** The grammar on the name and its own canonical forms - no verb synonyms (policy.mjs reads it before probing synonym forms). */
export function grammarClassesBase(name, role = '') {
  const asWritten = grammarClassesOf(name, role)
  if (asWritten.length > 0) return asWritten
  for (const form of canonicalForms(name)) {
    const classes = grammarClassesOf(form, role)
    if (classes.length > 0) return classes
  }
  return asWritten
}

export function grammarClasses(name, role = '') {
  const base = grammarClassesBase(name, role)
  if (base.length > 0) return base
  for (const form of synonymForms(name)) {
    const classes = grammarClassesOf(form, role)
    if (classes.length > 0) return classes
  }
  return base
}

function grammarClassesOf(name, role = '') {
  const raw = String(name ?? '').trim()
  if (raw === '' || raw.length > 400) return []
  if (CURRENCY.test(raw) && PRICED_ROLES.has(String(role ?? '').toLowerCase()) && tokens(raw).some((t) => PRICED_NOUNS.has(t))) return ['purchase']
  // CU-467 (High; cu-coordinator 00:49Z): a pressed control that names a money amount commits a charge whatever its verb - a
  // currency symbol or ISO code beside a number ('Continue for $9.99', 'Confirm 12.00 EUR', '$4.99/month'); a zero amount is free.
  if (amountClass(raw, role)) return ['purchase']
  const split = tokens(raw)
  if (split.length === 0) return []
  // #580 round 2 (cu-coordinator 21:52Z): a split particle - 'turn / switch X on|off' reads as 'turn / switch on|off X'
  // ('Turn ads on', 'Turn privacy mode off'); additive, for every switch verb.
  const particle = split[split.length - 1]
  const list = split.length >= 3 && SWITCH_VERBS.has(split[0]) && (particle === 'on' || particle === 'off') && split[1] !== 'on' && split[1] !== 'off'
    ? [split[0], particle, ...split.slice(1, -1)] : split
  const lower = raw.toLowerCase()
  const last = list[list.length - 1]
  // CU-435 (High; cu-coordinator 18:51Z): an insurance contract - binding, buying, renewing or cancelling a policy, widening
  // coverage, lowering a deductible, accepting a quote or a settlement, filing a claim. Checked before the guards: 'policy' is
  // a list / settings tail elsewhere ('Privacy policy'), a contract only after these verbs.
  const insurance = insuranceClass(list)
  if (insurance) return [insurance]
  // CU-437 (High; cu-coordinator 19:39Z): redirecting pay or payouts - direct deposit, bank details, routing / account number,
  // payout account or method - is an account takeover (credential). Checked before the guards ('details' is a tail elsewhere).
  if (payDiversion(list)) return ['credential']
  // CU-438 (High; cu-coordinator 19:52Z): an admin act on another person's account (CU-416 family).
  const admin = adminClass(list)
  if (admin) return [admin]
  // CU-439 (High; cu-coordinator 20:19Z): in-app currency and passes are bought with real money, and a currency spend is the
  // purchase at one remove.
  if (currencyAct(list)) return ['purchase']
  // CU-440 (High; cu-coordinator 20:26Z): switching off a protection on a child's account (permission).
  if (childProtectionOff(list)) return ['permission']
  // CU-441 (High; cu-coordinator 20:33Z): patient-portal acts - medical orders and consent (submit), cancelling a prescription
  // (delete), joining a video visit or adding a proxy (permission).
  const medical = medicalClass(list)
  if (medical) return [medical]
  // CU-442 (High; cu-coordinator 20:37Z): a metered paid session - EV charging and parking (CU-434 family, new objects).
  const metered = meteredClass(list)
  if (metered) return [metered]
  // CU-443 (High; cu-coordinator 20:49Z): moving a phone number or its calls away (credential), releasing a number (delete),
  // placing a call (submit), recording one (permission). 'Start recording' and 'Call back' stay with #462.
  const phone = phoneClass(list)
  if (phone) return [phone]
  // CU-444 (High; cu-coordinator 20:54Z): starting or raising paid ad spend (purchase).
  if (adSpend(list)) return ['purchase']
  // CU-445 (High; cu-coordinator 20:59Z): opening a home camera's view, audio or biometrics (permission, CU-418 family).
  if (cameraPrivacyOff(list)) return ['permission']
  // CU-446 (High; cu-coordinator 21:05Z): the domain-takeover path - unlocking, auth / EPP codes, registrant or owner change, push
  // (credential); nameservers, DNS records, WHOIS privacy off (permission).
  const domain = domainClass(list)
  if (domain) return [domain]
  // CU-447 (High; cu-coordinator 21:12Z): exposing cloud resources or blinding their audit (permission, CU-417 family);
  // minting a service-account or access key (credential).
  const cloud = cloudExposureClass(list, lower)
  if (cloud) return [cloud]
  // CU-449 (High; cu-coordinator 21:47Z): streaming add-ons, episode / season unlocks, rentals and gifts (purchase, CU-428 family).
  if (streamingPurchase(list)) return ['purchase']
  // CU-451 (High; cu-coordinator 22:22Z): a rate lock, pre-approval, Easy Apply, a tour request or contacting an agent sends
  // personal or financial data to another party or commits to a rate / booking (submit; CU-415 / CU-422 families).
  if (dealSubmit(list)) return ['submit']
  // CU-452 (High; cu-coordinator 22:28Z): wallet secrets and token approvals move money irreversibly.
  const wallet = walletClass(list)
  if (wallet) return [wallet]
  // CU-453 (High; cu-coordinator 22:35Z): the identity-takeover path - moving where mail, codes or credit go (credential);
  // certifying a benefit claim (submit).
  const identity = identityClass(list)
  if (identity) return [identity]
  // CU-454 (High; cu-coordinator 22:39Z): a chat workspace - exposing a private channel, granting an app access, acting on
  // other members (permission), installing an app (install). Desktop and web share the classifier.
  const workspace = workspaceClass(list)
  if (workspace) return [workspace]
  // CU-456 (High; cu-coordinator 22:56Z): turning a mail / account protection off (permission); less secure app access on
  // (credential).
  const mail = mailProtectionClass(list, lower)
  if (mail) return [mail]
  // CU-459 (High; cu-coordinator 23:11Z): filing a tax return or extension by other verbs files a legal document in the
  // person's name (submit; the 'File return' family).
  if (taxFiling(list)) return ['submit']
  // CU-460 (High; cu-coordinator 23:18Z): a connected car - moving or opening it (physical, CU-418 family), switching off its theft
  // protection (permission) or its PIN to drive, or adding a key (credential).
  const vehicle = vehicleClass(list)
  if (vehicle) return [vehicle]
  // CU-461 (High; cu-coordinator 23:34Z): exposing an account or contact detail by other wordings (permission, CU-424's
  // closed family); making an account private is the safe direction - an F2 guard on the grammar's own make-row ask.
  const exposure = exposureClass(list, lower)
  if (exposure === 'free') return []
  if (exposure) return [exposure]
  // CU-464 (High; cu-coordinator 00:04Z): a remote-access switch on a web or app admin page (permission); macOS System Settings
  // stays excluded by app policy. CU-465 (00:19Z): a blanket approval for an agent to run commands (permission, CU-427's family).
  if (remoteAccess(list) || agentBlanket(list)) return ['permission']
  // CU-466 (High; cu-coordinator 00:34Z): removing a repository's protections (permission).
  if (repoProtectionOff(list)) return ['permission']
  // CU-468 (High; cu-coordinator triage): smart-lock and alarm acts - auto-lock off, disarming, bypassing a zone, granting entry,
  // a timed unlock (physical, CU-418's closed family); adding a lock user (credential).
  const lock = lockClass(list)
  if (lock) return [lock]
  // CU-470 (High; cu-coordinator 01:19Z): the SIM-swap path - porting out, eSIM QR codes and conversions, a new SIM, moving the
  // number to a new device (credential, CU-443's family).
  if (simSwap(list)) return ['credential']
  // CU-471 (High; cu-coordinator 01:19Z): removing a tenant's admin protections (permission); resetting a user's MFA (credential).
  const tenant = tenantClass(list)
  if (tenant) return [tenant]
  // CU-474 / CU-475 (High; cu-coordinator 03:05Z): a password vault's protections and a merchant console's bulk money acts.
  const vault = vaultClass(list)
  if (vault) return [vault]
  const merchant = merchantClass(list)
  if (merchant) return [merchant]
  // #642 round 3 (cu-coordinator 08:05Z): 'Install add-on / addon / plug-in / extension' asks install (the older install row did not
  // read add-ons; the compound forms reach this row).
  if (list[0] === 'install' && list.length <= 4 && (['addon', 'plugin', 'extension'].includes(list[list.length - 1]) || (list[list.length - 2] === 'add' && list[list.length - 1] === 'on') || (list[list.length - 2] === 'plug' && list[list.length - 1] === 'in'))) return ['install']
  // CU-477 (High; cu-coordinator 03:36Z): a patient portal - account access to another person (credential), signing an authorization
  // or release and booking care (submit), research opt-in (permission); a copay-charging e-visit asks purchase through the amount row.
  const portal = portalClass(list)
  if (portal) return [portal]
  // CU-479 (High rows; cu-coordinator 04:20Z): a send to people who opted out or to the whole list - 'Resubscribe all' and a bare
  // 'Blast' (submit). Imports and exports belong to CU-462.
  // #633 round 2 (cu-researcher 07:05Z): everyone / entire list / contacts, and 'Blast it / now'. The hyphenated 'Re-subscribe all'
  // keeps the older subscribe -> purchase (it asks either way; named).
  if (list[0] === 'resubscribe' && list.length <= 3 && ['all', 'everyone', 'entire', 'contact', 'list', 'subscriber'].includes(list[1])) return ['submit']
  // CU-484 (High; cu-coordinator 06:05Z): installing by store wording - an OAuth install into a workspace app, a browser add-on, a bare
  // 'Install now', an installer or a plugin activation (install); sideloading and unknown sources (permission). 'Uninstall' keeps delete.
  if (list.length <= 5) {
    const [v, ...r] = list
    if (v === 'add' && r[0] === 'to' && r.length === 2 && ['slack', 'discord', 'telegram', 'teams', 'zoom', 'notion', 'trello', 'asana', 'jira', 'github', 'gitlab', 'workspace', 'firefox', 'chrome', 'edge', 'safari', 'opera', 'brave', 'browser'].includes(r[1])) return ['install']
    // #635 round 3 (cu-developer-three 07:19Z): 'add-on' / 'plug-in' tokenize at the hyphen ('add on', 'plug in').
    const addOn = r.length >= 2 && ((r[r.length - 2] === 'add' && r[r.length - 1] === 'on') || (r[r.length - 2] === 'plug' && r[r.length - 1] === 'in'))
    if (v === 'get' && ((r.length <= 2 && ['extension', 'addon', 'plugin'].includes(r[r.length - 1])) || (r.length === 2 && addOn))) return ['install']
    // #635 round 2 (cu-researcher 07:08Z): launch for run, extension / add-on for plugin, 'apps from' inside 'Allow unknown sources', and
    // the 'Install now' family as a token row (format and lead-in variants reach it).
    if (['run', 'launch', 'open'].includes(v) && r.length === 1 && r[0] === 'installer') return ['install']
    if (v === 'install' && ((r.length === 1 && ['now', 'it'].includes(r[0])) || (r.length === 2 && r[0] === 'now' && r[1] === 'please') || (r.length === 2 && r[0] === 'for' && r[1] === 'free'))) return ['install']
    if (['activate', 'enable'].includes(v) && ((r.length <= 2 && ['plugin', 'addon', 'extension'].includes(r[r.length - 1])) || (r.length === 2 && addOn))) return ['install']
    if (v === 'sideload' && r.length <= 2) return ['permission']
    if (v === 'allow' && ((r[0] === 'unknown' && r[1] === 'source' && r.length === 2) || (r[0] === 'app' && r[1] === 'from' && ['anywhere', 'unknown'].includes(r[2]) && (r.length === 3 || (r[2] === 'unknown' && r[3] === 'source' && r.length === 4))))) return ['permission']
  }
  if (/^\s*install\s+now\s*!?\s*$/i.test(raw)) return ['install']
  // CU-462 (Medium; cu-coordinator 00:04Z triage + 04:20Z, CU-479's rest): an address book or a mailing list leaves the account -
  // uploads, syncs, imports and exports of contacts, subscribers or an audience, and a shareable link (permission). 'Contacts' and the
  // user's own 'Export my data' stay free.
  if (list.length <= 4) {
    const [v, ...r] = list
    const people = ['contact', 'subscriber', 'audience', 'list', 'address', 'addressbook']
    if (['upload', 'sync', 'import', 'export', 'download'].includes(v) && r.length >= 1 && r.length <= 3 && people.includes(r[r.length - 1]) && !(v === 'upload' && r[r.length - 1] === 'list' && r.length > 1)) return ['permission']
    if (v === 'find' && r[0] === 'friend' && r.includes('contact') && r.length <= 3) return ['permission']
    // cu-coordinator 06:49Z: 'Archive all contacts' is permission too (reversible, not delete).
    if (v === 'archive' && r[0] === 'all' && r.length === 2 && ['contact', 'subscriber'].includes(r[1])) return ['permission']
    if (v === 'get' && r.length <= 2 && r[r.length - 1] === 'link' && (r.includes('shareable') || r.includes('share') || r.includes('public'))) return ['permission']
  }
  // #693 round 2 (cu-researcher 14:53Z): the CU-433 rows as verb families with object synonyms.
  if (/^\s*empty\s+(?:the\s+|my\s+)?(?:spam|junk)(?:\s+(?:folder|mail|box))?\s*$/i.test(raw)) return ['delete']
  if (/^\s*report\s+(?:as\s+|this\s+as\s+)?phishing(?:\s+(?:attempt|email|e-mail|message|mail))?\s*$/i.test(raw)) return ['submit']
  if (/^\s*(?:create|new|make)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:inbox\s+|mail\s+|email\s+|message\s+|forwarding\s+)?rule\s*$|^\s*add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:inbox|mail|email|message|forwarding)\s+rule\s*$/i.test(raw)) return ['credential']
  if (/^\s*release\s+(?:all|all\s+messages|messages?|emails?|(?:it\s+)?from\s+quarantine|selected)\s*$/i.test(raw)) return ['permission']
  // CU-433 (cu-coordinator 09:51Z): mail near forms ask as their ruled neighbours - recalling a sent message deletes it ('Unsend
  // message'); reporting phishing submits a report ('Report spam'); emptying spam / junk deletes ('Empty trash'); a mail rule can
  // forward mail out ('Create filter', credential); releasing a held message from quarantine lets it through (permission).
  // A bare 'Add rule' stays free (CU-492 pins it: a cloud console's form opener); 'Create rule' / 'Add mail rule' ask.
  if (list.length <= 4) {
    const [v, ...r] = list
    const last = r[r.length - 1]
    if (v === 'recall' && r.length >= 1 && r.length <= 2 && ['message', 'email', 'mail'].includes(last)) return ['delete']
    if (v === 'report' && r.length <= 2 && last === 'phishing') return ['submit']
    if (v === 'empty' && r.length <= 2 && ['spam', 'junk'].includes(last)) return ['delete']
    if (['create', 'add', 'new'].includes(v) && r.length <= 2 && ['rule', 'forwarding'].includes(last) && (r.length === 1 ? v !== 'add' : ['mail', 'inbox', 'email', 'forwarding', 'message'].includes(r[0]))) return ['credential']
    if (v === 'release' && r.length >= 1 && r.length <= 3 && (['message', 'email', 'mail'].includes(last) || last === 'quarantine')) return ['permission']
  }
  // CU-414's split (High; cu-coordinator 13:51Z): giving a meeting participant remote control hands over the owner's mouse and keyboard -
  // permission, like 'Allow remote control'. 'Request / Stop remote control' stay as they were.
  if (/^\s*(?:give|grant|hand\s+over|pass|share)\s+(?:remote\s+)?(?:control|mouse\s+and\s+keyboard(?:\s+control)?|keyboard\s+and\s+mouse(?:\s+control)?)(?:\s+to\s+[\w .'-]{1,40})?\s*$/i.test(raw)) return ['permission']
  // CU-500 (High; cu-coordinator 12:49Z), as verb families with object synonyms: on an exchange, confirming a withdrawal, a market
  // order, converting everything and setting leverage move money (purchase); adding or allowlisting a withdrawal address redirects it
  // (credential); turning off the withdrawal allowlist opens the account (permission). 'Deposit address' and 'Markets' stay free.
  // #680 round 2 (cu-developer-three 12:55Z): a bare 'Add to allowlist / whitelist' (an ad blocker's, a mail sender's, a firewall's)
  // stays free - the credential row needs an address / wallet / withdrawal object.
  if (/^\s*confirm\s+(?:the\s+|this\s+|your\s+|my\s+)?(?:withdrawals?|withdraw(?:al)?\s+request|crypto\s+withdrawal|payout)\s*$/i.test(raw)
    || /^\s*(?:market\s+(?:sell|buy|order)|(?:sell|buy)\s+(?:at\s+|by\s+)?market(?:\s+price)?|(?:place|submit)\s+(?:a\s+)?market\s+(?:sell|buy|order))\s*$/i.test(raw)
    || /^\s*convert\s+(?:all|everything|max|(?:my\s+|the\s+)?(?:entire|whole|full|max(?:imum)?)\s+(?:balance|amount|portfolio))(?:\s+to\s+[a-z0-9]{2,10})?\s*$/i.test(raw)
    || /^\s*(?:set|change|increase|raise|use|apply)\s+(?:the\s+|my\s+)?leverage(?:\s+to\s+\d+(?:\.\d+)?\s*x)?\s*$|^\s*(?:set|use|apply)\s+\d+(?:\.\d+)?\s*x(?:\s+leverage)?\s*$/i.test(raw)) return ['purchase']
  if (/^\s*(?:add|save|register|create)\s+(?:a\s+|an\s+|new\s+|a\s+new\s+)?(?:withdrawal|withdraw|payout|crypto|wallet|external|whitelisted|allowlisted|trusted)\s+(?:wallet\s+)?address(?:es)?\s*$/i.test(raw)
    || /^\s*(?:whitelist|allowlist|trust)\s+(?:an?\s+|this\s+|the\s+|new\s+)?(?:withdrawal\s+)?(?:address|wallet)\s*$|^\s*add\s+(?:this\s+|the\s+)?(?:address|wallet)\s+to\s+(?:the\s+)?(?:withdrawal\s+|address\s+)?(?:whitelist|allowlist)\s*$|^\s*add\s+to\s+(?:the\s+)?(?:withdrawal|address|wallet)\s+(?:whitelist|allowlist)\s*$/i.test(raw)) return ['credential']
  if (/^\s*(?:disable|turn\s+off|switch\s+off|deactivate|remove|pause)\s+(?:the\s+)?(?:withdrawal|address|wallet|crypto)\s+(?:whitelist|allowlist|lock|protection)(?:ing)?\s*$/i.test(raw)) return ['permission']
  // CU-497 (High; cu-coordinator 11:49Z, the CU-461 exposure family): exposing a phone number, email or location on a profile, or linking
  // another service's account, asks permission - 'Make phone number visible', 'Let anyone find me by phone / email', 'Turn on location in
  // posts', 'Show my location', 'Link Instagram account', 'Connect Instagram'. 'Hide phone number' and pickers stay free.
  // #672 round 3 (cu-coordinator 12:21Z): '... visible publicly' and '... visible on my profile' too.
  if (/^\s*(?:make|set)\s+(?:my\s+)?(?:phone(?:\s+number)?|email(?:\s+address)?|e-mail|birthday|location|address)\s+(?:visible|public|discoverable)(?:\s+(?:to\s+(?:everyone|anyone|all|the\s+public)|publicly|on\s+(?:my\s+)?profile))?\s*$/i.test(raw)
    || /^\s*(?:let|allow)\s+(?:anyone|everyone|people|others)\s+(?:to\s+)?find\s+me\s+(?:by|with|using)\s+(?:my\s+)?(?:phone(?:\s+number)?|email(?:\s+address)?|e-mail|contacts?)\s*$/i.test(raw)
    || /^\s*(?:turn\s+on|enable|add|allow)\s+(?:my\s+)?location\s+(?:in|on|to)\s+(?:my\s+)?(?:posts?|photos?|stories|tweets?|profile)\s*$/i.test(raw)
    // #672 round 2 (cu-researcher 12:00Z): without 'my', and 'to everyone / anyone / the public'.
    || /^\s*(?:show|share|display)\s+(?:my\s+)?(?:location|phone(?:\s+number)?|email(?:\s+address)?)\s+(?:publicly|on\s+(?:my\s+)?profile|(?:with|to)\s+(?:everyone|anyone|the\s+public|all))\s*$|^\s*(?:show|share)\s+my\s+(?:location|phone(?:\s+number)?|email(?:\s+address)?)\s*$/i.test(raw)
    || /^\s*(?:link|connect)\s+(?:my\s+|your\s+|an?\s+)?(?!(?:bank|card|device|wallet|email|phone|billing|payment|payout|merchant|ads?|credit|debit|brokerage|savings|checking)\b)[a-z][\w.+-]{1,20}\s+account\s*$/i.test(raw)
    || /^\s*(?:link|connect)\s+(?:my\s+|your\s+)?(?:instagram|facebook|twitter|x|tiktok|spotify|google|apple|github|linkedin|discord|twitch|youtube|snapchat|strava|venmo|paypal|threads|bluesky|mastodon)\s*$/i.test(raw)) return ['permission']
  // CU-496 (High; cu-coordinator 11:21Z): a recovery, trusted or legacy contact can take the account over (permission); a vault's
  // emergency kit prints its secrets (credential).
  if (/^\s*(?:add|set\s+up|choose|invite|assign)\s+(?:an?\s+)?(?:recovery|trusted|legacy)\s+contacts?\s*$/i.test(raw)) return ['permission']
  if (/^\s*(?:print|download|save)\s+(?:the\s+|your\s+)?emergency\s+kit\s*$/i.test(raw)) return ['credential']
  // CU-495 (High; cu-coordinator 11:06Z): an e-signature commits the signer - 'Sign', 'Sign here', 'Click to sign', 'Agree and sign',
  // 'Apply signature', 'Complete signing', 'Sign all' ask permission anywhere, like 'Adopt and Sign'. 'Sign in' / 'Sign up' keep their rows.
  // #665 round 2 (cu-researcher 11:16Z): 'Add my / Place / Insert signature', 'Sign electronically / digitally'.
  if (/^\s*(?:sign(?:\s+(?:here|all|now|it|below))?|click\s+(?:here\s+)?to\s+sign|(?:agree|accept)\s+(?:and|&)\s+sign|(?:apply|add|place|insert)\s+(?:my\s+|your\s+|a\s+)?signature|(?:complete|finish)\s+signing|e-?sign(?:\s+now)?|sign\s+(?:electronically|digitally))\s*!?\s*$/i.test(raw)) return ['permission']
  // CU-492 (High; cu-coordinator 10:36Z): cloud console - emptying a bucket deletes every object (delete); a rule open to the whole
  // internet, and turning off encryption or versioning, widen access (permission). A bare 'Add rule' opens a form (free).
  if (/^\s*empty\s+(?:the\s+|this\s+)?(?:bucket|container)\s*$/i.test(raw)) return ['delete']
  if (/^\s*add\s+(?:an?\s+)?(?:inbound\s+|outbound\s+|firewall\s+|security\s+)?rule\s+(?:for\s+|from\s+)?(?:0\.0\.0\.0\/0|::\/0|anywhere|any\s+ip)\s*$/i.test(raw)) return ['permission']
  if (/^\s*(?:disable|turn\s+off|remove)\s+(?:bucket\s+|default\s+|server-side\s+)?(?:encryption|versioning)\s*$|^\s*suspend\s+(?:bucket\s+)?versioning\s*$/i.test(raw)) return ['permission']
  // CU-493 (High; cu-coordinator 10:36Z): an MFA-fatigue approval answers a sign-in prompt - 'Yes, it's me', 'This was me', 'It was me',
  // 'Allow sign-in' ask in the class of 'Approve sign-in' (permission since #661 round 2), anywhere; linking a device asks as 'Add device'.
  if (/^\s*(?:yes,?\s+)?(?:it'?s|it\s+is|it\s+was|this'?s|this\s+(?:is|was)|that'?s|that\s+(?:is|was))\s+me\s*!?\s*$/i.test(raw) || /^\s*allow\s+(?:this\s+|the\s+)?(?:sign-?\s?in|log-?\s?in|login)\s*$/i.test(raw)) return ['permission']
  if (/^\s*link\s+(?:a\s+|this\s+|new\s+|another\s+)?device\s*$/i.test(raw)) return ['permission']
  // CU-490 (High; cu-coordinator 09:51Z): booking a ride is a purchase anywhere - 'Confirm ride', 'Book ride', 'Request ride'.
  if (list.length >= 2 && list.length <= 3 && ['confirm', 'book', 'request'].includes(list[0]) && ['ride', 'trip'].includes(list[list.length - 1])) return ['purchase']
  // CU-487 (High; cu-coordinator 07:36Z): payroll compensation - a bonus pays out (purchase); a raise or a salary / compensation change is
  // submitted (submit); employee data and tax forms leave the account (permission). Older classes keep their own rows (named).
  if (list.length <= 4) {
    const [v, ...r] = list
    // #647 round 2 (cu-researcher 08:27Z): plural bonuses, 'Grant raise', payroll data / reports / records.
    if (['issue', 'grant', 'send'].includes(v) && r.length <= 2 && ['bonus', 'bonuse', 'bonuses'].includes(r[r.length - 1])) return ['purchase']
    if (['give', 'grant'].includes(v) && r.length <= 2 && r[r.length - 1] === 'raise') return ['submit']
    if (['change', 'update', 'edit', 'adjust'].includes(v) && r.length <= 2 && ['salary', 'compensation', 'wage'].includes(r[r.length - 1])) return ['submit']
    if (['export', 'download'].includes(v) && r.length <= 3 && (r.includes('employee') || r.includes('payroll')) && ['data', 'record', 'list', 'detail', 'report'].includes(r[r.length - 1])) return ['permission']
  }
  if (/^\s*download\s+(?:all\s+)?(?:w-?2s?|1099s?|tax\s+forms?)\s*$/i.test(raw)) return ['permission']
  // CU-483 (High; cu-coordinator 05:34Z): brokerage - orders and automatic trading spend money (purchase); margin and options trading
  // widen what the account may do (permission). A bare 'Sell' is page-bound (policy.mjs reads the trading URL).
  if (list.length <= 3) {
    const [v, ...r] = list
    if (v === 'sell' && r[0] === 'short' && r.length <= 2) return ['purchase']
    if (v === 'short' && r[0] === 'sell' && r.length <= 2) return ['purchase']
    if (v === 'liquidate' && (r.length === 0 || (r.length <= 2 && ['all', 'position', 'portfolio', 'everything'].includes(r[r.length - 1])))) return ['purchase']
    if (v === 'exercise' && r.length <= 2 && ['option', 'contract'].includes(r[r.length - 1])) return ['purchase']
    if (v === 'auto' && r[0] === 'invest' && r.length === 1) return ['purchase']
    if (v === 'rebalance' && r.length <= 2 && (r.length === 0 || r[r.length - 1] === 'portfolio')) return ['purchase']
    if (['enable', 'activate'].includes(v) && r.length <= 2 && (['margin', 'leverage'].includes(r[0]) || (r[0] === 'option' && (r.length === 1 || r[1] === 'trading')))) return ['permission']
    if (v === 'turn' && r[0] === 'on' && r.length <= 3 && (['margin', 'leverage'].includes(r[1]) || (r[1] === 'option' && (r.length === 2 || r[2] === 'trading')))) return ['permission']
  }
  if (/^\s*blast(?:\s+(?:it|now))?\s*!?\s*$/i.test(raw)) return ['submit']
  // F2 guard (cu-coordinator 20:28Z): declining, denying or rejecting a request answers no - the grammar's own over-ask since
  // #554 ('Decline request'); older asks ('Decline invitation', CU-422's 'Decline offer') are untouched (the hook never sees them).
  if (['decline', 'deny', 'reject'].includes(list[0]) && list.slice(1).filter((t) => !FILLER.has(t)).every((t) => t === 'request' || t === 'this' || t === 'all')
    && list.includes('request')) return []
  // Guards: a trailing list / settings / UI noun; a bare plural noun (a tab); settings-sense apply; 'Sign in as guest'.
  if (FREE_TAIL.has(last) || (list.length >= 2 && FREE_TAIL.has(list[list.length - 2]))) return []
  if (UI_TAIL.has(last) && list.length >= 2) return []
  const oneWord = raw.split(/\s+/).length === 1
  if (list.length === 1 && oneWord && /[a-z]s$/.test(lower) && !lower.endsWith('ss')) return []
  if (list[0] === 'apply' && list.length >= 2 && APPLY_SETTINGS.has(list[1])) return []
  if (list[0] === 'sign' && list[1] === 'in' && list[2] === 'as' && list[3] === 'guest') return []
  if (list.length === 2 && /s$/.test(lower) && ['gift', 'trade', 'tip', 'bet', 'call', 'post', 'report', 'list'].includes(list[0])) return []
  // Object-first forms: '<physical> on' ('Oven on'); a trailing refund.
  if (list.length === 2 && OBJECTS.phys.has(list[0]) && list[1] === 'on') return ['physical']
  if (last === 'refund' && list[0] !== 'view') return ['purchase']
  if (list[0] === 'enable' || list[0] === 'allow' || list[0] === 'grant' || list[0] === 'turn') {
    if (list.includes('accessibility')) return ['permission']
  }
  if (list[0] === 'turn' && list.includes('autopay') && last === 'on') return ['purchase']
  const found = verbOf(list)
  if (found === null) return []
  const { verb, rest, classes } = found
  // Safe directions (guards): turning heat or an engine off, lights or a guard on.
  if (verb === 'turn off' && rest.some((t) => OBJECTS.phys.has(t) && !OBJECTS.physGuard.has(t))) return []
  if (verb === 'turn on' && rest.some((t) => t === 'light' || OBJECTS.physGuard.has(t)) && !rest.some((t) => OBJECTS.phys.has(t) && !OBJECTS.physGuard.has(t))) return []
  if (verb === 'cancel' && rest.some((t) => t === 'download' || t === 'message' || t === 'upload' || t === 'edit')) return []
  if (verb === 'post' && rest.length > 0 && !rest.some((t) => POST_OBJECTS.has(t) || OBJECTS.sendObject.has(t))) return []
  // The object window: up to two filler or adjective tokens before the object (rule 6).
  const window = rest.filter((t) => !FILLER.has(t) || t === 'everyone' || t === 'public').slice(0, 3)
  const has = (cls) => window.some((t) => OBJECTS[cls].has(t))
  const core = rest.filter((t) => !FILLER.has(t))
  const out = []
  if (rest.includes('anyway') && ['open', 'run', 'keep', 'download', 'install', 'continue', 'proceed'].includes(verb)) return ['install']
  // physical
  if (classes.has('phys_on') && has('phys') && verb !== 'open') pushOnce(out, 'physical')
  if (verb === 'open' && window.some((t) => t === 'door' || t === 'garage' || t === 'gate')) pushOnce(out, 'physical')
  if (classes.has('phys_off') && has('physGuard')) pushOnce(out, 'physical')
  // delete (F1: 'clear' / 'reset' a table is a view; a branch is deleted, not closed; 'move to' needs a trash or bin)
  if (classes.has('destroy') && has('data')) {
    const tableOnly = window.includes('table') && !window.some((t) => t !== 'table' && OBJECTS.data.has(t))
    const branchOnly = window.includes('branch') && !window.some((t) => t !== 'branch' && OBJECTS.data.has(t))
    const viewSense = (verb === 'clear' || verb === 'reset') && tableOnly
    const branchSoft = branchOnly && !['delete', 'remove', 'drop', 'destroy', 'force push', 'purge'].includes(verb)
    const moveTo = verb === 'move to' && !window.some((t) => t === 'trash' || t === 'bin')
    if (!viewSense && !branchSoft && !moveTo) pushOnce(out, 'delete')
  }
  if (verb === 'move to' && window.some((t) => t === 'trash' || t === 'bin')) pushOnce(out, 'delete')
  if (verb === 'force push') pushOnce(out, 'delete')
  // purchase
  if (classes.has('cost') && has('cost')) pushOnce(out, 'purchase')
  if (verb === 'spin up' || verb === 'scale up') pushOnce(out, 'purchase')
  if (classes.has('pay')) {
    const moneyHits = window.filter((t) => OBJECTS.money.has(t))
    const realMoney = moneyHits.filter((t) => {
      if ((verb === 'add' || verb === 'make') && ADD_MAKE_NOT_MONEY.has(t)) return false
      if (t === 'limit' && !window.some((u) => LIMIT_QUALIFIER.has(u))) return false
      if (t === 'invoice' && verb === 'send') return false
      if (verb === 'open' && !TRADING_OBJECTS.has(t)) return false
      if (verb === 'cancel' && !CANCEL_PAY.has(t)) return false
      if (verb === 'remove' || verb === 'close') return TRADING_OBJECTS.has(t) || t === 'payee'
      return true
    })
    if (realMoney.length > 0) pushOnce(out, 'purchase')
  }
  if (PERSON_PAY_VERBS.has(verb) && window.some((t) => PERSON.has(t))) pushOnce(out, 'purchase')
  if (PERSON_PAY_VERBS.has(verb) && rest.length === 1 && /^[A-Z][a-z]+$/.test(raw.split(/\s+/).pop()) && !OBJECTS.money.has(rest[0])) pushOnce(out, 'purchase')
  if (classes.has('enable') && window.some((t) => t === 'click' || t === '1' || t === 'autopay' || t === 'renew' || t === 'auto')) pushOnce(out, 'purchase')
  if ((verb === 'set up' || verb === 'turn on' || verb === 'enable') && rest.some((t) => t === 'autopay' || t === 'recurring')) pushOnce(out, 'purchase')
  if ((verb === 'send' || verb === 'add') && rest.includes('tip')) pushOnce(out, 'purchase')
  if ((verb === 'make' || verb === 'make an') && rest.includes('offer')) pushOnce(out, 'purchase')
  if ((verb === 'rent' || verb === 'charge') && rest.length > 0) pushOnce(out, 'purchase')
  // permission
  // CU-423 (ruled class wins): an access code is shared access, not a secret.
  const accessCode = window.includes('access') && window.includes('code')
  if (accessCode && ['create', 'change', 'edit', 'share', 'add', 'new', 'generate', 'reset'].includes(verb)) pushOnce(out, 'permission')
  if (classes.has('grant') && has('access') && !accessCode) pushOnce(out, 'permission')
  if (verb === 'make' && rest.includes('public')) pushOnce(out, 'permission')
  if (verb === 'go' && rest.includes('public')) pushOnce(out, 'permission')
  // F5 cluster 5: 'view as' needs a person or user.
  if (classes.has('actas') && !(rest[0] === 'guest') && (verb !== 'view as' || rest.some((t) => t === 'user' || t === 'member' || PERSON.has(t) || t === 'customer' || t === 'employee'))) pushOnce(out, 'permission')
  if (classes.has('unguard') && has('guard')) pushOnce(out, 'permission')
  if (verb === 'unprotect') pushOnce(out, 'permission')
  if (classes.has('sign') && (has('signable') || verb !== 'sign') && !rest.includes('petition')) pushOnce(out, 'permission')
  if (classes.has('agree') && has('agree')) pushOnce(out, 'permission')
  if (classes.has('consent')) pushOnce(out, 'permission')
  if (classes.has('share') && has('records')) pushOnce(out, 'permission')
  if ((verb === 'trust' || verb === 'remember') && rest.some((t) => t === 'device' || t === 'developer' || t === 'certificate')) pushOnce(out, 'permission')
  if ((verb === 'leave' || verb === 'unlink') && has('access')) pushOnce(out, 'permission')
  // credential (F1 sense table: key / token / code / card need a qualifier after a weak verb; email only with the change family)
  if (classes.has('cred') && has('secret') && !accessCode) {
    const secretHits = window.filter((t) => OBJECTS.secret.has(t))
    const qualified = window.some((t) => KEY_QUALIFIER.has(t))
    const real = secretHits.filter((t) => {
      if (t === 'email' || t === 'phone') return EMAIL_VERBS.has(verb) || window.includes('recovery')
      if (t === 'key' || t === 'token' || t === 'code' || t === 'card') return STRONG_CRED.has(verb) || qualified || ((verb === 'add' || verb === 'link' || verb === 'remove') && t === 'card')
      if (t === 'api') return true
      return true
    })
    if (real.length > 0) pushOnce(out, 'credential')
  }
  // install (F1: a profile installs only after install or download)
  if (classes.has('install') && has('install')) {
    const profileOnly = window.includes('profile') && !window.some((t) => t !== 'profile' && OBJECTS.install.has(t))
    if (!profileOnly || verb === 'install' || verb === 'download') pushOnce(out, 'install')
  }
  if (verb === 'enable' && rest.some((t) => t === 'extension' || t === 'plugin')) pushOnce(out, 'install')
  if (verb === 'add' && rest.some((t) => t === 'extension' || t === 'chrome' || t === 'plugin')) pushOnce(out, 'install')
  // CU-427 (ruled class wins): running a script or a command runs code here - install.
  if (classes.has('exec') && (has('script') || window.includes('command') || window.includes('terminal') || window.includes('shell'))) pushOnce(out, 'install')
  // submit
  if (classes.has('send') && (has('sendObject') || ['vote', 'resign', 'broadcast', 'submit', 'publish', 'repost', 'retweet'].includes(verb) || (verb === 'post' && core.length === 0))) pushOnce(out, 'submit')
  if (verb === 'apply' && (rest[0] === 'for' || rest[0] === 'now')) pushOnce(out, 'submit')
  // cu-coordinator 17:29Z: messaging all or everyone ('Message all subscribers') speaks for the owner to many (CU-419).
  if (['message', 'email', 'text', 'notify', 'send'].includes(verb) && rest.some((t) => t === 'all' || t === 'everyone')) pushOnce(out, 'submit')
  if (verb === 'sign' && rest.includes('petition')) return ['submit']
  if (verb === 'book' && rest.includes('appointment')) return ['submit']
  // '<pay verb> now' and the bare standalone verbs (F5 cluster 6: 'set up now' stays free).
  if (core.length === 0 && out.length === 0) {
    const pluralNoun = rest.length === 0 && oneWord && /[a-z]s$/.test(lower) && !lower.endsWith('ss')
    if (STANDALONE.has(verb) && !pluralNoun) pushOnce(out, STANDALONE.get(verb))
    else if (rest.includes('now') && classes.has('pay') && verb !== 'set up') pushOnce(out, 'purchase')
  }
  if (verb === 'sign' && rest.some((t) => t === 'message' || t === 'transaction')) pushOnce(out, 'purchase')
  // CU-436: activating a full or paid account; committing to <n> year(s) / month(s); lifting a spending cap or limit.
  if (verb === 'activate' && rest.includes('account') && rest.some((t) => t === 'full' || t === 'paid' || t === 'billing')) pushOnce(out, 'purchase')
  if (verb === 'commit' && rest.some((t) => t === 'year' || t === 'month' || t === 'term')) pushOnce(out, 'purchase')
  // cu-coordinator 19:22Z: linking a billing account starts charges to it.
  if (verb === 'link' && rest.includes('billing')) pushOnce(out, 'purchase')
  if (['turn off', 'remove', 'disable', 'lift', 'raise', 'increase'].includes(verb) && rest.includes('spending') && rest.some((t) => t === 'cap' || t === 'limit')) pushOnce(out, 'purchase')
  // CU-426's three chat forms (cu-coordinator 19:25Z): dismissing someone as admin and exporting a chat ask permission.
  if (verb === 'dismiss' && rest.includes('admin')) pushOnce(out, 'permission')
  if (verb === 'export' && rest.some((t) => t === 'chat' || t === 'conversation')) pushOnce(out, 'permission')
  // CU-434: 'Order again' reorders; cancelling a ride may charge a fee (submit).
  if (verb === 'order' && rest.length === 1 && rest[0] === 'again') pushOnce(out, 'purchase')
  if (verb === 'cancel' && rest.some((t) => t === 'ride' || t === 'delivery')) pushOnce(out, 'submit')
  // CU-426 (cu-coordinator 16:28Z), where structure can: unsending a message and turning on disappearing messages delete;
  // leaving or exiting a group, chat or channel, and 'Report and block', submit.
  if (verb === 'unsend' && rest.some((t) => t === 'message' || t === 'chat')) pushOnce(out, 'delete')
  if (verb === 'turn on' && rest.includes('disappearing')) pushOnce(out, 'delete')
  if ((verb === 'leave' || verb === 'exit') && rest.some((t) => ['group', 'chat', 'conversation', 'channel'].includes(t))) pushOnce(out, 'submit')
  if (verb === 'report' && rest.includes('block')) pushOnce(out, 'submit')
  if (verb === 'leave' && !rest.some((t) => ['review', 'star', 'organization', 'team', 'workspace', 'server', 'group', 'chat', 'conversation', 'channel'].includes(t))) {
    const i = out.indexOf('submit')
    if (i >= 0) out.splice(i, 1)
  }
  return out
}
