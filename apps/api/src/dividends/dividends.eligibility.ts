/**
 * Pure eligibility-roster builder. Given the raw ledger positions as of
 * the record date plus the issuer's account/shareholder metadata, this
 * module produces the per-row roster that becomes the immutable
 * eligibility snapshot.
 *
 * Keep this file framework-free so it can be unit-tested with
 * `node:test` and reused from the eligibility / calculation services.
 *
 * Rounding policy
 * ===============
 * - Share quantities are decimal strings backed by `BigInt` at scale 1e8
 *   (see `dividends.decimal.ts`). They are NEVER converted through JS
 *   `number`, so fractional shares survive round-trip with NUMERIC(38,8)
 *   columns.
 * - Money math (gross/withholding/net) is performed in integer cents
 *   using half-away-from-zero rounding via `roundedDivide`. Sums are
 *   computed as integer addition to avoid drift across rows.
 * - For `FIXED_AMOUNT` pool dividends, any rounding remainder is
 *   re-attributed to the largest holder (deterministic tiebreak: by
 *   sharesHeld desc, then holderId asc) so the sum equals the declared
 *   pool exactly.
 */

import { parseDecimal } from './dividends.decimal.js'
import type { DividendEligibilityEntry, EligibilityRowStatus, OwnershipSource } from './dividends.types.js'

export interface RawLedgerPosition {
  holderId: string
  /** Decimal string or number — zero / negative rows are emitted as EXCLUDED_ZERO_BALANCE. */
  quantity: string | number
}

export interface AccountLookup {
  accountId: string
  shareholderId: string
  /** Issuer-side business id used as the ownership reference (e.g. account number). */
  accountNumber?: string
  /** `ACTIVE` accounts pass through; any other status is BLOCKED_ACCOUNT. */
  accountStatus?: string
  /** Shareholder status (`ACTIVE` -> ok, otherwise BLOCKED_SHAREHOLDER). */
  shareholderStatus?: string
  /** `APPROVED` -> ok, `PENDING`/`REJECTED`/etc -> EXCLUDED_INACTIVE_KYC. */
  kycStatus?: string
}

export interface BuildRosterInput {
  securityId: string
  recordDate: string
  ownershipSource?: OwnershipSource
  positions: RawLedgerPosition[]
  /**
   * Map keyed by `holderId` (== ledger holder id == shareholder account id).
   * Missing entries are emitted as EXCLUDED_UNKNOWN_ACCOUNT so the
   * snapshot still records that the ledger had a balance we could not
   * attribute to a known shareholder.
   */
  accounts: Record<string, AccountLookup>
}

/**
 * Builds the deterministic per-row roster. Output is sorted by
 * `accountId` (or `holderId` when accountId is null) for stable
 * snapshot payloads across runs. Idempotency at the service layer
 * relies on this stability.
 */
export function buildEligibilityRoster(input: BuildRosterInput): DividendEligibilityEntry[] {
  const ownershipSource: OwnershipSource = input.ownershipSource ?? 'LEDGER_AS_OF_RECORD_DATE'

  const entries: DividendEligibilityEntry[] = input.positions.map(position => {
    const sharesHeld = typeof position.quantity === 'string' ? position.quantity : position.quantity.toString()
    const account = input.accounts[position.holderId]

    const baseRow: DividendEligibilityEntry = {
      accountId: account?.accountId ?? null,
      disqualificationReason: undefined,
      eligibilityStatus: 'ELIGIBLE',
      ownershipReference: account?.accountNumber ?? position.holderId,
      ownershipSource,
      recordDate: input.recordDate,
      securityId: input.securityId,
      shareholderId: account?.shareholderId ?? null,
      sharesHeld,
    }

    if (!account) {
      return mark(baseRow, 'EXCLUDED_UNKNOWN_ACCOUNT', `Ledger holder ${position.holderId} has no shareholder account.`)
    }

    let scaled: bigint
    try {
      scaled = parseDecimal(sharesHeld)
    } catch {
      return mark(baseRow, 'EXCLUDED_OTHER', `Unparseable share quantity "${sharesHeld}".`)
    }
    if (scaled <= 0n) {
      return mark(baseRow, 'EXCLUDED_ZERO_BALANCE', 'Holder has no positive balance as of the record date.')
    }

    if (account.accountStatus && account.accountStatus !== 'ACTIVE') {
      return mark(baseRow, 'EXCLUDED_BLOCKED_ACCOUNT', `Account is in status ${account.accountStatus}; entitlement withheld.`)
    }
    if (account.shareholderStatus && account.shareholderStatus !== 'ACTIVE') {
      return mark(baseRow, 'EXCLUDED_BLOCKED_SHAREHOLDER', `Shareholder is in status ${account.shareholderStatus}; entitlement withheld.`)
    }
    if (account.kycStatus && account.kycStatus !== 'APPROVED' && account.kycStatus !== 'NOT_REQUIRED') {
      return mark(baseRow, 'EXCLUDED_INACTIVE_KYC', `KYC is in status ${account.kycStatus}; entitlement withheld until cleared.`)
    }

    return baseRow
  })

  return entries.sort((a, b) => {
    const left = a.accountId ?? a.shareholderId ?? a.ownershipReference ?? ''
    const right = b.accountId ?? b.shareholderId ?? b.ownershipReference ?? ''
    return left.localeCompare(right)
  })
}

function mark(row: DividendEligibilityEntry, status: EligibilityRowStatus, reason: string): DividendEligibilityEntry {
  return { ...row, disqualificationReason: reason, eligibilityStatus: status }
}

export interface RosterTotals {
  eligibleHolderCount: number
  excludedHolderCount: number
  /** Decimal string sum of `sharesHeld` across ELIGIBLE rows. */
  totalEligibleShares: string
}

/**
 * Sums the eligible portion of the roster using `BigInt` arithmetic to
 * preserve fractional precision. Used for the snapshot summary and for
 * pre-flight totals before the cents-level entitlement calculation.
 */
export function computeRosterTotals(roster: DividendEligibilityEntry[]): RosterTotals {
  let eligibleHolderCount = 0
  let excludedHolderCount = 0
  let totalScaled = 0n
  for (const entry of roster) {
    if (entry.eligibilityStatus === 'ELIGIBLE') {
      eligibleHolderCount += 1
      try {
        totalScaled += parseDecimal(entry.sharesHeld)
      } catch {
        // Already filtered above; defensive only.
      }
    } else {
      excludedHolderCount += 1
    }
  }
  return {
    eligibleHolderCount,
    excludedHolderCount,
    totalEligibleShares: scaledToDecimal(totalScaled),
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
