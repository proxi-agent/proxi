/**
 * Pure dividend math. Keep free of framework imports so it can be unit
 * tested with `node:test` directly — and reused inside the calculator
 * service.
 *
 * Money is integer cents. Share counts and rates are decimal strings to
 * support fractional shares without floating-point loss. See
 * `dividends.decimal.ts` for the BigInt-backed helpers.
 */

import { applyPercent, formatDecimal, multiplyToCents, parseDecimal } from './dividends.decimal.js'
import type { DividendRateType } from './dividends.types.js'

export interface HolderSnapshot {
  holderId: string
  /** Decimal string or number for backward compatibility. */
  quantity: number | string
}

export interface EntitlementDraft {
  holderId: string
  /** Decimal-string share count. */
  sharesHeld: string
  /** Gross entitlement in cents (pre-withholding). */
  amountCents: number
  /** Withholding in cents, computed from the resolved withholding pct. */
  withholdingCents: number
  /** Net amount to disburse in cents. */
  netAmountCents: number
}

export interface CalculateEntitlementsInput {
  positions: HolderSnapshot[]
  rateType: DividendRateType
  /** Decimal string. Per-share rate, percentage, or fixed pool depending on type. */
  rateAmount: string | number
  /** Default jurisdictional withholding pct (string, e.g. "24" for 24%). */
  withholdingDefaultPct?: string | number
  /** Optional per-shareholder withholding overrides (keyed by `holderId`). */
  withholdingOverrides?: Record<string, string | number>
  /**
   * Used by `PERCENTAGE` rates: par value per share (in cents). Most
   * issuers declare percentage dividends against par value of the share.
   */
  parValueCents?: number
}

const ZERO_PCT = '0'

/**
 * Computes the per-holder entitlement drafts for a dividend.
 *
 * Behaviour by `rateType`:
 * - `PER_SHARE`: amount = round(shares × rateAmount × 100) cents
 * - `PERCENTAGE`: amount = round((shares × parValue × pct) / 100) cents
 * - `FIXED_AMOUNT`: amount = round((rateAmount × 100 × shares) / totalEligibleShares) cents
 *
 * Holders with non-positive quantity are skipped. Output is sorted by
 * `holderId` so calculations are deterministic across runs.
 */
export function computeEntitlements(input: CalculateEntitlementsInput): EntitlementDraft[]
/**
 * Legacy two-arg signature retained for older call sites and tests:
 * `computeEntitlements(positions, ratePerShareCents)`.
 */
export function computeEntitlements(positions: HolderSnapshot[], ratePerShareCents: number): EntitlementDraft[]
export function computeEntitlements(
  inputOrPositions: CalculateEntitlementsInput | HolderSnapshot[],
  ratePerShareCents?: number,
): EntitlementDraft[] {
  if (Array.isArray(inputOrPositions)) {
    return computeFromCentsRate(inputOrPositions, ratePerShareCents ?? 0)
  }
  const {
    positions,
    rateType,
    rateAmount,
    withholdingDefaultPct = ZERO_PCT,
    withholdingOverrides = {},
    parValueCents = 0,
  } = inputOrPositions

  if (typeof rateAmount === 'number' && (!Number.isFinite(rateAmount) || rateAmount < 0)) {
    throw new Error('rateAmount must be a non-negative finite number')
  }
  // Validate decimal parseability up-front so we fail fast.
  parseDecimal(rateAmount)

  const eligible = positions
    .map(position => ({
      holderId: position.holderId,
      sharesHeld: typeof position.quantity === 'number' ? position.quantity.toString() : position.quantity,
    }))
    .filter(position => parseDecimal(position.sharesHeld) > 0n)
    .sort((a, b) => a.holderId.localeCompare(b.holderId))

  if (rateType === 'FIXED_AMOUNT') {
    return computeFixedAmount(eligible, rateAmount, withholdingDefaultPct, withholdingOverrides)
  }

  return eligible.map(position => {
    const grossCents =
      rateType === 'PERCENTAGE'
        ? // pct × par × shares / 100
          applyPercent(multiplyToCents(position.sharesHeld, parValueToDecimal(parValueCents)), rateAmount)
        : multiplyToCents(position.sharesHeld, rateAmount)

    const pct = withholdingOverrides[position.holderId] ?? withholdingDefaultPct
    const withholdingCents = applyPercent(grossCents, pct)
    return {
      amountCents: grossCents,
      holderId: position.holderId,
      netAmountCents: grossCents - withholdingCents,
      sharesHeld: position.sharesHeld,
      withholdingCents,
    }
  })
}

/**
 * Legacy code path. Treats `ratePerShareCents` as a per-share rate
 * expressed in cents (not dollars), exactly like the original
 * `computeEntitlements(positions, ratePerShareCents)` signature.
 */
function computeFromCentsRate(positions: HolderSnapshot[], ratePerShareCents: number): EntitlementDraft[] {
  if (!Number.isFinite(ratePerShareCents) || ratePerShareCents < 0) {
    throw new Error('ratePerShareCents must be a non-negative finite number')
  }
  return positions
    .map(position => ({
      holderId: position.holderId,
      sharesHeld: typeof position.quantity === 'number' ? position.quantity.toString() : position.quantity,
    }))
    .filter(position => parseDecimal(position.sharesHeld) > 0n)
    .sort((a, b) => a.holderId.localeCompare(b.holderId))
    .map(position => {
      const grossCents = Math.round(Number(position.sharesHeld) * ratePerShareCents)
      return {
        amountCents: grossCents,
        holderId: position.holderId,
        netAmountCents: grossCents,
        sharesHeld: position.sharesHeld,
        withholdingCents: 0,
      }
    })
}

function computeFixedAmount(
  eligible: Array<{ holderId: string; sharesHeld: string }>,
  rateAmount: string | number,
  withholdingDefaultPct: string | number,
  withholdingOverrides: Record<string, string | number>,
): EntitlementDraft[] {
  if (!eligible.length) return []

  const totalEligibleScaled = eligible.reduce<bigint>((sum, position) => sum + parseDecimal(position.sharesHeld), 0n)
  if (totalEligibleScaled === 0n) return []

  // rateAmount is a dollar pool. Convert to integer cents via the scaled
  // representation so we don't lose precision on values like "10000.50".
  const rateScaled = parseDecimal(rateAmount)
  const totalCentsBig = (rateScaled * 100n) / 10n ** 8n
  const totalCents = Number(totalCentsBig)

  let allocated = 0
  const drafts: EntitlementDraft[] = eligible.map(position => {
    const shareScaled = parseDecimal(position.sharesHeld)
    const grossCents = Number((BigInt(totalCents) * shareScaled) / totalEligibleScaled)
    allocated += grossCents
    return {
      amountCents: grossCents,
      holderId: position.holderId,
      netAmountCents: grossCents,
      sharesHeld: position.sharesHeld,
      withholdingCents: 0,
    }
  })

  // Re-attribute rounding remainder so the sum equals the declared pool.
  const remainder = totalCents - allocated
  if (remainder !== 0 && drafts.length) {
    const largest = [...drafts].sort((a, b) => {
      const diff = parseDecimal(b.sharesHeld) - parseDecimal(a.sharesHeld)
      if (diff !== 0n) return diff > 0n ? 1 : -1
      return a.holderId.localeCompare(b.holderId)
    })[0]
    largest.amountCents += remainder
    largest.netAmountCents += remainder
  }

  for (const draft of drafts) {
    const pct = withholdingOverrides[draft.holderId] ?? withholdingDefaultPct
    draft.withholdingCents = applyPercent(draft.amountCents, pct)
    draft.netAmountCents = draft.amountCents - draft.withholdingCents
  }

  return drafts.sort((a, b) => a.holderId.localeCompare(b.holderId))
}

function parValueToDecimal(parValueCents: number): string {
  if (!Number.isFinite(parValueCents)) {
    throw new Error('parValueCents must be a finite number')
  }
  const negative = parValueCents < 0
  const abs = Math.abs(parValueCents)
  const whole = Math.trunc(abs / 100)
  const remainder = abs - whole * 100
  const fracText = remainder.toString().padStart(2, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fracText ? '.' + fracText : ''}`
}

export function totalDistributionCents(entitlements: Array<{ amountCents: number }>): number {
  return entitlements.reduce((sum, entitlement) => sum + entitlement.amountCents, 0)
}

export function totalNetCents(entitlements: Array<{ netAmountCents: number }>): number {
  return entitlements.reduce((sum, entitlement) => sum + entitlement.netAmountCents, 0)
}

export function totalWithholdingCents(entitlements: Array<{ withholdingCents: number }>): number {
  return entitlements.reduce((sum, entitlement) => sum + entitlement.withholdingCents, 0)
}

export function isValidRecordDate(recordDate: string, paymentDate: string, declarationDate: string): boolean {
  const rec = Date.parse(recordDate)
  const pay = Date.parse(paymentDate)
  const dec = Date.parse(declarationDate)
  if (Number.isNaN(rec) || Number.isNaN(pay) || Number.isNaN(dec)) {
    return false
  }
  return dec <= rec && rec <= pay
}

export function isValidExDividendDate(exDate: string | undefined, recordDate: string, declarationDate: string): boolean {
  if (!exDate) return true
  const ex = Date.parse(exDate)
  const rec = Date.parse(recordDate)
  const dec = Date.parse(declarationDate)
  if (Number.isNaN(ex) || Number.isNaN(rec) || Number.isNaN(dec)) {
    return false
  }
  return dec <= ex && ex <= rec
}

export { formatDecimal, parValueToDecimal }
