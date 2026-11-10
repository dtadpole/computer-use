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

function singular(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(?:ss|sh|ch|x)es$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) return token.slice(0, -1)
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
  raise: ['pay'], increase: ['pay'], approve: ['pay', 'send'], confirm: ['pay', 'send'], complete: ['pay'], enable: ['enable', 'grant'],
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
  join: ['send'], answer: ['send'], call: ['send'], execute: ['exec'], unsend: ['destroy'], exit: ['send'],
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
    'ride', 'delivery', 'scooter', 'bike', 'ebike', 'moped']),
  access: new Set(['organization', 'team', 'workspace', 'server', 'people', 'account', 'owner', 'coowner', 'co', 'admin', 'host',
    'cohost', 'collaborator', 'member', 'access', 'guest', 'visitor', 'device', 'public', 'ownership', 'payee', 'recipient',
    'beneficiary', 'everyone']),
  agree: new Set(['term', 'agreement', 'contract', 'condition']),
  signable: new Set(['document', 'agreement', 'contract', 'form', 'consent', 'lease', 'waiver', 'nda']),
  records: new Set(['record', 'release', 'medical']),
  secret: new Set(['key', 'token', 'credential', 'password', 'keychain', 'vault', 'secret', 'code', 'bank', 'card', 'paypal', 'method',
    'email', 'phone', 'api']),
  guard: new Set(['accessibility', 'protection', 'firewall', 'antivirus', 'defender', 'filevault', 'sip', 'integrity', '2fa', 'factor',
    'verification', 'alert', 'notification']),
  phys: new Set(['door', 'garage', 'gate', 'alarm', 'camera', 'security', 'car', 'engine', 'vehicle', 'oven', 'stove', 'heater',
    'burner', 'fireplace', 'guest', 'visitor']),
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
  enroll: 'submit', reactivate: 'purchase', pay: 'purchase', 'restart to update': 'install', reorder: 'purchase',
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
  'customer', 'vendor', 'payee', 'order'])
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
const CURRENCY = /[$\u20ac\u00a3\u00a5]\s?\d|\d\s?(?:usd|eur|gbp)\b/i

// CU-435's insurance rows: verb x object -> class, within the usual two-token window.
const INSURANCE_ROWS = [
  [['bind', 'buy', 'purchase', 'renew'], ['policy'], 'purchase'], [['increase', 'add', 'extend', 'raise'], ['coverage'], 'purchase'],
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

// The classes the grammar asks for a control's name (and its role, for the priced cell); [] when it asks nothing.
export function grammarClasses(name, role = '') {
  const raw = String(name ?? '').trim()
  if (raw === '' || raw.length > 400) return []
  if (CURRENCY.test(raw) && PRICED_ROLES.has(String(role ?? '').toLowerCase()) && tokens(raw).some((t) => PRICED_NOUNS.has(t))) return ['purchase']
  const list = tokens(raw)
  if (list.length === 0) return []
  const lower = raw.toLowerCase()
  const last = list[list.length - 1]
  // CU-435 (High; cu-coordinator 18:51Z): an insurance contract - binding, buying, renewing or cancelling a policy, widening
  // coverage, lowering a deductible, accepting a quote or a settlement, filing a claim. Checked before the guards: 'policy' is
  // a list / settings tail elsewhere ('Privacy policy'), a contract only after these verbs.
  const insurance = insuranceClass(list)
  if (insurance) return [insurance]
  // Guards: a trailing list / settings / UI noun; a bare plural noun (a tab); settings-sense apply; 'Sign in as guest'.
  if (FREE_TAIL.has(last) || (list.length >= 2 && FREE_TAIL.has(list[list.length - 2]))) return []
  if (UI_TAIL.has(last) && list.length >= 2) return []
  if (list.length === 1 && /[a-z]s$/.test(lower) && !lower.endsWith('ss')) return []
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
    const pluralNoun = rest.length === 0 && /[a-z]s$/.test(lower) && !lower.endsWith('ss')
    if (STANDALONE.has(verb) && !pluralNoun) pushOnce(out, STANDALONE.get(verb))
    else if (rest.includes('now') && classes.has('pay') && verb !== 'set up') pushOnce(out, 'purchase')
  }
  if (verb === 'sign' && rest.some((t) => t === 'message' || t === 'transaction')) pushOnce(out, 'purchase')
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
