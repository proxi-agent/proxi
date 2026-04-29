import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { AccountLookup } from './dividends.eligibility.js'
import { buildEligibilityRoster, computeRosterTotals } from './dividends.eligibility.js'

const SECURITY_ID = 'sec_acme_common'
const RECORD_DATE = '2030-06-15'

function account(overrides: Partial<AccountLookup> & { holderId: string }): [string, AccountLookup] {
  const { holderId, ...rest } = overrides
  return [
    holderId,
    {
      accountId: rest.accountId ?? `acct_${holderId}`,
      accountNumber: rest.accountNumber ?? holderId,
      accountStatus: rest.accountStatus ?? 'ACTIVE',
      kycStatus: rest.kycStatus ?? 'APPROVED',
      shareholderId: rest.shareholderId ?? `sh_${holderId}`,
      shareholderStatus: rest.shareholderStatus ?? 'ACTIVE',
    },
  ]
}

function accountMap(...rows: Array<[string, AccountLookup]>): Record<string, AccountLookup> {
  return Object.fromEntries(rows)
}

describe('buildEligibilityRoster', () => {
  it('marks active holders with positive balances ELIGIBLE', () => {
    const accounts = accountMap(account({ holderId: 'h1' }), account({ holderId: 'h2' }))
    const roster = buildEligibilityRoster({
      accounts,
      positions: [
        { holderId: 'h1', quantity: '125' },
        { holderId: 'h2', quantity: '50' },
      ],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    assert.equal(roster.length, 2)
    assert.equal(roster[0].eligibilityStatus, 'ELIGIBLE')
    assert.equal(roster[1].eligibilityStatus, 'ELIGIBLE')
    // Sorted by accountId for determinism.
    assert.deepEqual(
      roster.map(r => r.accountId),
      ['acct_h1', 'acct_h2'],
    )
    // All rows tagged with the source + reference for auditability.
    assert.equal(roster[0].ownershipSource, 'LEDGER_AS_OF_RECORD_DATE')
    assert.equal(roster[0].ownershipReference, 'h1')
  })

  it('preserves fractional shares as decimal strings', () => {
    const accounts = accountMap(account({ holderId: 'h1' }))
    const roster = buildEligibilityRoster({
      accounts,
      positions: [{ holderId: 'h1', quantity: '12.5' }],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    assert.equal(roster[0].sharesHeld, '12.5')
  })

  it('emits zero balances as EXCLUDED_ZERO_BALANCE rows (not dropped)', () => {
    const accounts = accountMap(account({ holderId: 'h1' }), account({ holderId: 'zero' }))
    const roster = buildEligibilityRoster({
      accounts,
      positions: [
        { holderId: 'h1', quantity: '10' },
        { holderId: 'zero', quantity: '0' },
      ],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    const zeroRow = roster.find(r => r.accountId === 'acct_zero')!
    assert.equal(zeroRow.eligibilityStatus, 'EXCLUDED_ZERO_BALANCE')
    assert.match(zeroRow.disqualificationReason ?? '', /no positive balance/i)
  })

  it('flags blocked accounts and inactive shareholders separately', () => {
    const accounts = accountMap(
      account({ holderId: 'blocked_acct', accountStatus: 'BLOCKED' }),
      account({ holderId: 'blocked_sh', shareholderStatus: 'SUSPENDED' }),
      account({ holderId: 'pending_kyc', kycStatus: 'PENDING' }),
    )
    const roster = buildEligibilityRoster({
      accounts,
      positions: [
        { holderId: 'blocked_acct', quantity: '10' },
        { holderId: 'blocked_sh', quantity: '10' },
        { holderId: 'pending_kyc', quantity: '10' },
      ],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    const byHolder = Object.fromEntries(roster.map(r => [r.ownershipReference, r.eligibilityStatus]))
    assert.equal(byHolder['blocked_acct'], 'EXCLUDED_BLOCKED_ACCOUNT')
    assert.equal(byHolder['blocked_sh'], 'EXCLUDED_BLOCKED_SHAREHOLDER')
    assert.equal(byHolder['pending_kyc'], 'EXCLUDED_INACTIVE_KYC')
  })

  it('treats ledger holders without a shareholder account as EXCLUDED_UNKNOWN_ACCOUNT', () => {
    const roster = buildEligibilityRoster({
      accounts: {},
      positions: [{ holderId: 'lone_holder', quantity: '5' }],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    assert.equal(roster.length, 1)
    assert.equal(roster[0].eligibilityStatus, 'EXCLUDED_UNKNOWN_ACCOUNT')
    assert.equal(roster[0].accountId, null)
  })

  it('rejects negative quantities as EXCLUDED_ZERO_BALANCE (defensive)', () => {
    const accounts = accountMap(account({ holderId: 'neg' }))
    const roster = buildEligibilityRoster({
      accounts,
      positions: [{ holderId: 'neg', quantity: '-5' }],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    assert.equal(roster[0].eligibilityStatus, 'EXCLUDED_ZERO_BALANCE')
  })
})

describe('computeRosterTotals', () => {
  it('sums eligible shares using BigInt math (fractional-safe)', () => {
    const accounts = accountMap(account({ holderId: 'h1' }), account({ holderId: 'h2' }), account({ holderId: 'h3' }))
    const roster = buildEligibilityRoster({
      accounts,
      positions: [
        { holderId: 'h1', quantity: '100.25' },
        { holderId: 'h2', quantity: '50.50' },
        { holderId: 'h3', quantity: '0' },
      ],
      recordDate: RECORD_DATE,
      securityId: SECURITY_ID,
    })
    const totals = computeRosterTotals(roster)
    assert.equal(totals.eligibleHolderCount, 2)
    assert.equal(totals.excludedHolderCount, 1)
    assert.equal(totals.totalEligibleShares, '150.75')
  })
})
