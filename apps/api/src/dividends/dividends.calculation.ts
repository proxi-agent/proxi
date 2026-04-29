/**
 * Pure helpers that turn entitlement drafts + the eligibility roster
 * into the API-level calculation summary, including warnings for
 * downstream review screens.
 *
 * Money is integer cents; share counts are decimal strings backed by
 * BigInt at scale 1e8 (see `dividends.decimal.ts`). All sums stay in
 * BigInt / integer space to avoid rounding drift.
 */

import { parseDecimal } from './dividends.decimal.js'
import type { EntitlementDraft, HolderSnapshot } from './dividends.math.js'
import { computeEntitlements } from './dividends.math.js'
import type { DividendEligibilityEntry, DividendKind, DividendRateType, DividendTaxStatus, DividendWarning } from './dividends.types.js'

/** Dividend kinds the engine can settle today as cash. */
export const SUPPORTED_KINDS: ReadonlySet<DividendKind> = new Set<DividendKind>(['CASH', 'SPECIAL', 'RETURN_OF_CAPITAL'])

/** Kinds we accept declarations for but cannot calculate yet (placeholder rows). */
export const PLACEHOLDER_KINDS: ReadonlySet<DividendKind> = new Set<DividendKind>(['STOCK', 'SCRIP'])

export interface CalculateInput {
  roster: DividendEligibilityEntry[]
  kind: DividendKind
  rateType: DividendRateType
  rateAmount: string | number
  withholdingDefaultPct?: string | number
  withholdingOverrides?: Record<string, string | number>
  parValueCents?: number
  /**
   * Per-shareholder tax-info presence map. Used to flag
   * `MISSING_TAX_INFO` and downgrade `RESIDENT` -> `MISSING_TAX_INFO`
   * on the entitlement row.
   */
  shareholderHasTaxInfo?: Record<string, boolean>
  /** Per-shareholder payment-method presence map. Drives a warning, not exclusion. */
  shareholderHasPaymentMethod?: Record<string, boolean>
}

export interface CalculateOutput {
  /** One entry per ELIGIBLE roster row, ordered to match `roster`. */
  drafts: Array<EntitlementDraft & { taxStatus: DividendTaxStatus; accountId: string; shareholderId: string }>
  warnings: DividendWarning[]
}

/**
 * Run the calculation engine over an immutable roster + a declaration's
 * financial terms. Pure; no DB access. The caller is responsible for
 * persisting drafts and writing audit events.
 */
export function calculateFromRoster(input: CalculateInput): CalculateOutput {
  const warnings: DividendWarning[] = []

  if (PLACEHOLDER_KINDS.has(input.kind)) {
    warnings.push({
      code: 'UNSUPPORTED_DIVIDEND_KIND',
      message: `Dividend kind ${input.kind} cannot be calculated by the cash engine yet; structure is reserved for future support.`,
      severity: 'ERROR',
    })
    return { drafts: [], warnings }
  }
  if (!SUPPORTED_KINDS.has(input.kind)) {
    warnings.push({
      code: 'UNSUPPORTED_DIVIDEND_KIND',
      message: `Dividend kind ${input.kind} is not supported by the calculation engine.`,
      severity: 'ERROR',
    })
    return { drafts: [], warnings }
  }

  const eligible = input.roster.filter(entry => entry.eligibilityStatus === 'ELIGIBLE')

  // Convert ELIGIBLE roster rows to math-layer HolderSnapshots. We use
  // accountId as the holderId so per-account entitlements stay distinct
  // even when a shareholder has multiple accounts under the same issuer.
  const snapshots: HolderSnapshot[] = eligible.map(entry => ({
    holderId: entry.accountId ?? entry.shareholderId ?? entry.ownershipReference ?? '',
    quantity: entry.sharesHeld,
  }))

  const drafts = computeEntitlements({
    parValueCents: input.parValueCents,
    positions: snapshots,
    rateAmount: input.rateAmount,
    rateType: input.rateType,
    withholdingDefaultPct: input.withholdingDefaultPct,
    withholdingOverrides: input.withholdingOverrides,
  })

  // Index by accountId for O(1) lookups when stitching tax-status onto the result.
  const byAccount = new Map<string, DividendEligibilityEntry>()
  for (const entry of eligible) {
    if (entry.accountId) byAccount.set(entry.accountId, entry)
  }

  const enriched: CalculateOutput['drafts'] = drafts.map(draft => {
    const entry = byAccount.get(draft.holderId)
    const accountId = entry?.accountId ?? draft.holderId
    const shareholderId = entry?.shareholderId ?? ''
    const taxStatus = resolveTaxStatus(shareholderId, input)
    if (taxStatus === 'MISSING_TAX_INFO') {
      warnings.push({
        code: 'MISSING_TAX_INFO',
        message: `Shareholder ${shareholderId || draft.holderId} is missing tax info; entitlement may need backup withholding.`,
        metadata: { accountId, shareholderId },
        severity: 'WARNING',
      })
    }
    if (input.shareholderHasPaymentMethod && shareholderId && input.shareholderHasPaymentMethod[shareholderId] === false) {
      warnings.push({
        code: 'MISSING_PAYMENT_METHOD',
        message: `Shareholder ${shareholderId} has no payment method on file; entitlement will hold until set.`,
        metadata: { accountId, shareholderId },
        severity: 'WARNING',
      })
    }
    return { ...draft, accountId, shareholderId, taxStatus }
  })

  for (const entry of input.roster) {
    if (entry.eligibilityStatus === 'EXCLUDED_BLOCKED_ACCOUNT' || entry.eligibilityStatus === 'EXCLUDED_BLOCKED_SHAREHOLDER') {
      warnings.push({
        code: 'BLOCKED_HOLDER_EXCLUDED',
        message: entry.disqualificationReason ?? 'Holder excluded due to account / shareholder block.',
        metadata: { accountId: entry.accountId, shareholderId: entry.shareholderId },
        severity: 'INFO',
      })
    }
  }

  return { drafts: enriched, warnings }
}

function resolveTaxStatus(shareholderId: string, input: CalculateInput): DividendTaxStatus {
  if (!shareholderId) return 'NOT_APPLICABLE'
  if (input.shareholderHasTaxInfo && input.shareholderHasTaxInfo[shareholderId] === false) {
    return 'MISSING_TAX_INFO'
  }
  return 'RESIDENT'
}

export interface CalculationTotals {
  totalGrossCents: number
  totalWithholdingCents: number
  totalNetCents: number
  /** Decimal string sum of shares used in the calculation. */
  totalEligibleShares: string
}

/** Sums the calculation drafts. Pure integer addition over cents and BigInt for shares. */
export function totalsFromDrafts(drafts: EntitlementDraft[]): CalculationTotals {
  let gross = 0
  let withholding = 0
  let net = 0
  let scaledShares = 0n
  for (const draft of drafts) {
    gross += draft.amountCents
    withholding += draft.withholdingCents
    net += draft.netAmountCents
    try {
      scaledShares += parseDecimal(draft.sharesHeld)
    } catch {
      // Defensive: drafts come from pre-validated decimals.
    }
  }
  return {
    totalEligibleShares: scaledToDecimal(scaledShares),
    totalGrossCents: gross,
    totalNetCents: net,
    totalWithholdingCents: withholding,
  }
}

function scaledToDecimal(scaled: bigint): string {
  const SCALE = 8n
  const factor = 10n ** SCALE
  const negative = scaled < 0n
  const abs = negative ? -scaled : scaled
  const whole = abs / factor
  const frac = (abs % factor).toString().padStart(Number(SCALE), '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toString()}${frac ? '.' + frac : ''}`
}
