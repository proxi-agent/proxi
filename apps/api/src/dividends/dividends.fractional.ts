/**
 * Pure fractional-share adjustment helpers.
 *
 * Stock dividends and DRIP allocations frequently produce non-integer
 * share counts. The platform delegates the rounding policy to the
 * issuer (configured per dividend) and records the adjustment per
 * holder so the audit trail explains why a particular cash residual
 * was paid out.
 *
 * Money is always integer cents. Share counts are decimal strings to
 * stay precision-safe (see `dividends.decimal.ts`).
 */

import type { FractionalSharePolicy } from './dividends.types.js'

export interface FractionalRoundInput {
  /** Decimal-string share count, e.g. "12.45". */
  shares: string | number
  /**
   * Reinvestment / stock-grant price per share in *cents*. Required
   * for `CASH_IN_LIEU` so we can compute the residual cash amount.
   */
  priceCents?: number
  policy: FractionalSharePolicy
}

export interface FractionalRoundResult {
  /** Whole shares awarded after the policy is applied. */
  wholeShares: number
  /** Decimal-string fractional remainder before the policy was applied. */
  fractionalShares: string
  /** Cents to add (positive) or subtract (negative) from the cash entitlement. */
  adjustmentCents: number
  /**
   * Cash paid out in lieu of the fractional share, when the policy is
   * `CASH_IN_LIEU`. Always non-negative.
   */
  residualCashCents: number
}

/**
 * Decimal helpers — kept local to avoid a circular import with
 * `dividends.decimal.ts`. We keep 8 fractional digits of precision to
 * match the schema (NUMERIC(38,8)).
 */
const SCALE = 8
const SCALE_FACTOR = 10n ** BigInt(SCALE)

function toScaled(input: string | number): bigint {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('shares must be finite')
    return toScaled(input.toFixed(SCALE))
  }
  const trimmed = input.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Cannot parse decimal "${input}"`)
  }
  const negative = trimmed.startsWith('-')
  const cleaned = negative ? trimmed.slice(1) : trimmed
  const [intPart, fracPart = ''] = cleaned.split('.')
  const fracPadded = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE)
  const value = BigInt(intPart) * SCALE_FACTOR + BigInt(fracPadded || '0')
  return negative ? -value : value
}

function fromScaled(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / SCALE_FACTOR
  const frac = abs % SCALE_FACTOR
  const fracStr = frac.toString().padStart(SCALE, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toString()}${fracStr ? '.' + fracStr : ''}`
}

/**
 * Apply the configured fractional-share policy to a raw share count.
 *
 * Rounding semantics (deterministic, no floating-point):
 * - `ROUND_DOWN` truncates the fractional remainder.
 * - `ROUND_HALF_UP` rounds 0.5 → 1.
 * - `ROUND_HALF_EVEN` (banker's): 0.5 rounds to nearest even integer.
 * - `CASH_IN_LIEU` truncates and pays the residual fractional × price
 *   as integer cents (`Math.round` for the final cents conversion to
 *   match the existing `multiplyToCents` convention).
 *
 * `adjustmentCents` reports the cash *delta* the entitlement should
 * receive on top of any pre-policy gross. For pure share dividends
 * (where the entitlement was a share count) this is simply the
 * `residualCashCents` for `CASH_IN_LIEU`, and zero for the rounding
 * policies. For cash dividends with fractional share grants, callers
 * apply the result directly to the cash leg.
 */
export function applyFractionalPolicy(input: FractionalRoundInput): FractionalRoundResult {
  const scaled = toScaled(input.shares)
  if (scaled < 0n) throw new Error('shares must be non-negative')
  const wholeBig = scaled / SCALE_FACTOR
  const fracBig = scaled - wholeBig * SCALE_FACTOR

  switch (input.policy) {
    case 'ROUND_DOWN':
      return {
        adjustmentCents: 0,
        fractionalShares: fromScaled(fracBig),
        residualCashCents: 0,
        wholeShares: Number(wholeBig),
      }
    case 'ROUND_HALF_UP': {
      const half = SCALE_FACTOR / 2n
      const rounded = fracBig >= half ? wholeBig + 1n : wholeBig
      return {
        adjustmentCents: 0,
        fractionalShares: fromScaled(fracBig),
        residualCashCents: 0,
        wholeShares: Number(rounded),
      }
    }
    case 'ROUND_HALF_EVEN': {
      const half = SCALE_FACTOR / 2n
      let rounded = wholeBig
      if (fracBig > half) rounded = wholeBig + 1n
      else if (fracBig === half) rounded = wholeBig % 2n === 0n ? wholeBig : wholeBig + 1n
      return {
        adjustmentCents: 0,
        fractionalShares: fromScaled(fracBig),
        residualCashCents: 0,
        wholeShares: Number(rounded),
      }
    }
    case 'CASH_IN_LIEU': {
      if (input.priceCents === undefined || input.priceCents < 0) {
        throw new Error('CASH_IN_LIEU requires a non-negative priceCents')
      }
      // residual fractional × price → cents. Use BigInt math to keep
      // precision; round half-up at the final cent.
      const residualScaled = fracBig
      const priceCentsBig = BigInt(input.priceCents)
      const product = residualScaled * priceCentsBig
      // half-up rounding: (product + half) / SCALE_FACTOR
      const half = SCALE_FACTOR / 2n
      const residualCashCents = Number((product + half) / SCALE_FACTOR)
      return {
        adjustmentCents: residualCashCents,
        fractionalShares: fromScaled(fracBig),
        residualCashCents,
        wholeShares: Number(wholeBig),
      }
    }
    default:
      throw new Error(`Unknown fractional policy: ${input.policy as string}`)
  }
}
