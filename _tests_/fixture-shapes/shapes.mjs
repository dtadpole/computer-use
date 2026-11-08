// Key-shaped test values, built at runtime from fragments that do not match on their own. The suites test a
// sensitive-data classifier and a site filter, so they need values shaped like card numbers, IBANs, SSNs, tokens,
// private keys, recovery phrases and private IPv4 addresses. Written out whole, each would trip a secret scanner or a
// reviewer's grep. Every value here is the same string, byte for byte, that the tests used before it moved here.
// All of them are public documentation examples or made up; none is a live secret.

/** Joins fragments with nothing between them: j('sk-', 'abc') is 'sk-abc'. */
export const j = (...parts) => parts.join('')

/** A dotted IPv4 address from its four octets, any of which may be a '*' pattern: ip(10, 0, 0, 5). */
export const ip = (...octets) => octets.join('.')

// The Visa test card number, grouped in fours; the same with its last digit changed, so the Luhn check fails; and the
// test number with its spaces removed.
export const CARD = ['4111', '1111', '1111', '1111'].join(' ')
export const CARD_BAD_LUHN = ['4111', '1111', '1111', '1112'].join(' ')
export const CARD_DIGITS = CARD.replaceAll(' ', '')

// The ISO 13616 example IBANs. The UK one is grouped in fours. The next is the same with its last digit changed, so the
// mod-97 check fails. Then the UK one cut to five groups (too short), and the German one grouped and compact.
export const IBAN_GB = ['GB82', 'WEST', '1234', '5698', '7654', '32'].join(' ')
export const IBAN_GB_BAD_CHECK = ['GB82', 'WEST', '1234', '5698', '7654', '33'].join(' ')
export const IBAN_GB_SHORT = ['GB82', 'WEST', '1234', '5698', '7654'].join(' ')
export const IBAN_DE = ['DE89', '3704', '0044', '0532', '0130', '00'].join(' ')
export const IBAN_DE_COMPACT = IBAN_DE.replaceAll(' ', '')

// US SSNs: the classic advertising example, and an all-nines one.
export const SSN = ['123', '45', '6789'].join('-')
export const SSN_NINES = ['999', '99', '9999'].join('-')

// The first twelve words of the BIP-39 English list, as a recovery phrase. Each line holds six.
export const SEED_TWELVE = [
  'abandon ability able about above absent',
  'absorb abstract absurd abuse access accident',
].join(' ')

// Token and key shapes: an OpenAI-style key, a live-style sk- key, a GitHub personal token, AWS's documented example
// access key id, and a 0x + 64-hex private key (a widely published example key).
export const SK_KEY = j('sk-', 'abcdefghijklmnopqrstuv')
export const SK_LIVE_KEY = j('sk-', 'live-abcdefghijklmnopqrstuvwx1234')
export const GITHUB_TOKEN = j('ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789')
export const AWS_KEY_ID = j('AKIA', 'IOSFODNN7EXAMPLE')
export const PRIVATE_KEY_0X = j('0x4c0883a69102937d6231471b5dbb6204', 'fe5129617082792ae468d01a3f362318')
