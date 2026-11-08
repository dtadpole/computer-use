/**
 * Seeded randomness for the fixture's per-instance values: the same seed always draws the same values, so
 * a run is reproducible from the seed recorded beside its result.
 */

/** FNV-1a over the seed's string form, so `42` and `'42'` draw the same values. */
export function hashSeed(seed) {
  const text = String(seed)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** A deterministic generator (mulberry32) returning floats in [0, 1). */
export function createRng(seed) {
  let state = hashSeed(seed)
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** An integer in [min, max], inclusive, never one of `exclude`. */
export function randomInt(rng, min, max, exclude = []) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new RangeError(`bad range ${min}..${max}`)
  if (max - min + 1 <= exclude.filter((value) => value >= min && value <= max).length) {
    throw new RangeError(`range ${min}..${max} is fully excluded`)
  }
  for (;;) {
    const value = min + Math.floor(rng() * (max - min + 1))
    if (!exclude.includes(value)) return value
  }
}

/** One element of a non-empty list. */
export function pick(rng, list) {
  if (!Array.isArray(list) || list.length === 0) throw new RangeError('pick needs a non-empty list')
  return list[Math.floor(rng() * list.length)]
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle(rng, list) {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}
