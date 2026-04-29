/**
 * Tiny decimal helpers built on `BigInt`. We deliberately avoid pulling in
 * a full decimal library: the dividend module only needs to multiply share
 * counts by money rates, sum cents, and round to the nearest cent. Using
 * scaled integers keeps the math exact and free of floating-point error
 * without a runtime dependency.
 *
 * Conventions:
 * - Money is integer cents (BigInt). Public API surfaces `number` because
 *   call sites already use it; values are always within `Number.MAX_SAFE_INTEGER`
 *   for any reasonable dividend.
 * - Share counts and rates are decimal strings. They are converted to a
 *   common scaled BigInt internally (1e8) so 8 fractional digits survive
 *   round-trip with the database `NUMERIC(38,8)` columns.
 */

const SCALE = 8
const SCALE_FACTOR = 10n ** BigInt(SCALE)

/** Parses a decimal string (e.g. "1.25" or "0.0001") to a scaled BigInt. */
export function parseDecimal(value: string | number): bigint {
  const text = typeof value === 'number' ? value.toString() : value.trim()
  if (!text || text === '-' || text === '+') {
    throw new Error(`Invalid decimal: "${value}"`)
  }
  const negative = text.startsWith('-')
  const body = negative || text.startsWith('+') ? text.slice(1) : text
  if (!/^\d+(\.\d+)?$/.test(body)) {
    throw new Error(`Invalid decimal: "${value}"`)
  }
  const [whole, frac = ''] = body.split('.')
  const padded = (frac + '0'.repeat(SCALE)).slice(0, SCALE)
  const scaled = BigInt(whole) * SCALE_FACTOR + BigInt(padded || '0')
  return negative ? -scaled : scaled
}

/** Renders a scaled BigInt back to a decimal string with 8 fractional digits. */
export function formatDecimal(scaled: bigint): string {
  const negative = scaled < 0n
  const abs = negative ? -scaled : scaled
  const whole = abs / SCALE_FACTOR
  const frac = (abs % SCALE_FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toString()}${frac ? '.' + frac : ''}`
}

/**
 * Multiply a decimal-string `a` by a decimal-string `b`. Returns the
 * scaled BigInt result so callers can decide on rounding.
 */
export function multiplyScaled(a: string | number, b: string | number): bigint {
  const aScaled = parseDecimal(a)
  const bScaled = parseDecimal(b)
  return (aScaled * bScaled) / SCALE_FACTOR
}

/**
 * Multiplies two decimal strings and rounds to the nearest integer cent.
 * Banker's-style ties go away from zero (the same behaviour as
 * `Math.round` on positive values).
 */
export function multiplyToCents(decimalA: string | number, dollarsPerUnit: string | number): number {
  const aScaled = parseDecimal(decimalA)
  const bScaled = parseDecimal(dollarsPerUnit)
  // a * b is in scale 1e16; divide by 1e16 to get dollars, then *100 for cents.
  // Equivalently: round((a * b * 100) / 1e16).
  const numerator = aScaled * bScaled * 100n
  const denominator = SCALE_FACTOR * SCALE_FACTOR
  return Number(roundedDivide(numerator, denominator))
}

/** Computes `(a * percent) / 100` as integer cents, rounded half-away-from-zero. */
export function applyPercent(amountCents: number | bigint, pct: string | number): number {
  const amount = typeof amountCents === 'bigint' ? amountCents : BigInt(Math.trunc(amountCents))
  const pctScaled = parseDecimal(pct)
  const numerator = amount * pctScaled
  const denominator = SCALE_FACTOR * 100n
  return Number(roundedDivide(numerator, denominator))
}

/** Rounded integer division (half-away-from-zero). */
export function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero')
  }
  const negative = numerator < 0n !== denominator < 0n
  const absN = numerator < 0n ? -numerator : numerator
  const absD = denominator < 0n ? -denominator : denominator
  const quotient = absN / absD
  const remainder = absN % absD
  const rounded = remainder * 2n >= absD ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}
