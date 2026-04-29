import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { calculateFromRoster, totalsFromDrafts } from './dividends.calculation.js'
import type { DividendEligibilityEntry } from './dividends.types.js'

const RECORD_DATE = '2030-06-15'
const SECURITY_ID = 'sec_acme'

function entry(overrides: Partial<DividendEligibilityEntry> & { accountId: string }): DividendEligibilityEntry {
  return {
    accountId: overrides.accountId,
    disqualificationReason: overrides.disqualificationReason,
    eligibilityStatus: overrides.eligibilityStatus ?? 'ELIGIBLE',
    ownershipReference: overrides.ownershipReference ?? overrides.accountId,
    ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
    recordDate: RECORD_DATE,
    securityId: SECURITY_ID,
    shareholderId: overrides.shareholderId ?? `sh_${overrides.accountId}`,
    sharesHeld: overrides.sharesHeld ?? '100',
  }
}

describe('calculateFromRoster (cash dividend)', () => {
  it('multiplies shares by per-share rate with cents rounding', () => {
    const roster = [entry({ accountId: 'a1', sharesHeld: '100' }), entry({ accountId: 'a2', sharesHeld: '37' })]
    const out = calculateFromRoster({
      kind: 'CASH',
      rateAmount: '0.25',
      rateType: 'PER_SHARE',
      roster,
    })
    assert.equal(out.drafts.length, 2)
    const a1 = out.drafts.find(d => d.accountId === 'a1')!
    const a2 = out.drafts.find(d => d.accountId === 'a2')!
    assert.equal(a1.amountCents, 100 * 25)
    assert.equal(a2.amountCents, 37 * 25)
    assert.equal(a1.taxStatus, 'RESIDENT')
    assert.equal(out.warnings.length, 0)
  })

  it('handles fractional shares without floating-point drift', () => {
    const roster = [entry({ accountId: 'a1', sharesHeld: '100.5' })]
    const out = calculateFromRoster({
      kind: 'CASH',
      rateAmount: '0.30',
      rateType: 'PER_SHARE',
      roster,
    })
    assert.equal(out.drafts[0].amountCents, Math.round(100.5 * 30))
  })

  it('skips EXCLUDED rows entirely', () => {
    const roster = [
      entry({ accountId: 'eligible', sharesHeld: '100' }),
      entry({ accountId: 'zero', eligibilityStatus: 'EXCLUDED_ZERO_BALANCE', sharesHeld: '0' }),
      entry({
        accountId: 'blocked',
        disqualificationReason: 'Account is BLOCKED',
        eligibilityStatus: 'EXCLUDED_BLOCKED_ACCOUNT',
        sharesHeld: '50',
      }),
    ]
    const out = calculateFromRoster({
      kind: 'CASH',
      rateAmount: '1.00',
      rateType: 'PER_SHARE',
      roster,
    })
    assert.equal(out.drafts.length, 1)
    assert.equal(out.drafts[0].accountId, 'eligible')
    // Blocked-holder warning surfaces even though no entitlement is created.
    assert.ok(out.warnings.some(w => w.code === 'BLOCKED_HOLDER_EXCLUDED'))
  })

  it('applies default and override withholding percentages', () => {
    const roster = [entry({ accountId: 'a1', sharesHeld: '100' }), entry({ accountId: 'a2', sharesHeld: '100' })]
    const out = calculateFromRoster({
      kind: 'CASH',
      rateAmount: '1.00',
      rateType: 'PER_SHARE',
      roster,
      withholdingDefaultPct: '24',
      withholdingOverrides: { a1: '10' },
    })
    const a1 = out.drafts.find(d => d.accountId === 'a1')!
    const a2 = out.drafts.find(d => d.accountId === 'a2')!
    assert.equal(a1.withholdingCents, Math.round(10000 * 0.1))
    assert.equal(a2.withholdingCents, Math.round(10000 * 0.24))
    assert.equal(a1.netAmountCents, a1.amountCents - a1.withholdingCents)
  })

  it('flags MISSING_TAX_INFO when shareholder has no tax id', () => {
    const roster = [entry({ accountId: 'a1', shareholderId: 'sh_a1', sharesHeld: '10' })]
    const out = calculateFromRoster({
      kind: 'CASH',
      rateAmount: '1.00',
      rateType: 'PER_SHARE',
      roster,
      shareholderHasTaxInfo: { sh_a1: false },
    })
    assert.equal(out.drafts[0].taxStatus, 'MISSING_TAX_INFO')
    assert.ok(out.warnings.some(w => w.code === 'MISSING_TAX_INFO'))
  })

  it('refuses unsupported dividend kinds with a warning + empty drafts', () => {
    const roster = [entry({ accountId: 'a1' })]
    const stock = calculateFromRoster({ kind: 'STOCK', rateAmount: '0.5', rateType: 'PER_SHARE', roster })
    assert.equal(stock.drafts.length, 0)
    assert.ok(stock.warnings.some(w => w.code === 'UNSUPPORTED_DIVIDEND_KIND'))
  })

  it('settles SPECIAL and RETURN_OF_CAPITAL like CASH', () => {
    const roster = [entry({ accountId: 'a1', sharesHeld: '50' })]
    const special = calculateFromRoster({ kind: 'SPECIAL', rateAmount: '0.10', rateType: 'PER_SHARE', roster })
    const roc = calculateFromRoster({ kind: 'RETURN_OF_CAPITAL', rateAmount: '0.10', rateType: 'PER_SHARE', roster })
    assert.equal(special.drafts[0].amountCents, 500)
    assert.equal(roc.drafts[0].amountCents, 500)
  })
})

describe('totalsFromDrafts', () => {
  it('sums cents and shares deterministically', () => {
    const drafts = [
      { amountCents: 1000, holderId: 'a', netAmountCents: 760, sharesHeld: '100', withholdingCents: 240 },
      { amountCents: 2500, holderId: 'b', netAmountCents: 1900, sharesHeld: '250', withholdingCents: 600 },
    ]
    const totals = totalsFromDrafts(drafts)
    assert.equal(totals.totalGrossCents, 3500)
    assert.equal(totals.totalWithholdingCents, 840)
    assert.equal(totals.totalNetCents, 2660)
    assert.equal(totals.totalEligibleShares, '350')
  })
})
