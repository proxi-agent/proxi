import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildReportsSummary } from './dividends.reports.js'
import type { DividendEntitlement, DividendEvent, DividendPayment, DividendPaymentBatch } from './dividends.types.js'

function makeDeclaration(id: string, status: DividendEvent['status'], totalCents: number): DividendEvent {
  return {
    calculationVersion: 0,
    createdAt: new Date('2025-01-02T10:00:00Z'),
    currency: 'USD',
    declarationDate: '2025-01-02',
    id,
    issuerId: 'iss_meridian',
    kind: 'CASH',
    metadata: {},
    paymentDate: '2025-01-30',
    rateAmount: '0.25',
    ratePerShareCents: 25,
    rateType: 'PER_SHARE',
    recordDate: '2025-01-16',
    securityId: 'sec_meridian_common',
    status,
    supportingDocuments: [],
    totalDistributionCents: totalCents,
    updatedAt: new Date('2025-01-04T10:00:00Z'),
    version: 1,
    withholdingDefaultPct: '0',
  }
}

function makeEntitlement(
  id: string,
  status: DividendEntitlement['status'],
  parts: { gross: number; net: number; withholding: number },
): DividendEntitlement {
  return {
    accountId: 'acct',
    amountCents: parts.gross,
    calculationVersion: 1,
    createdAt: new Date(),
    currency: 'USD',
    dividendEventId: 'div_x',
    grossAmountCents: parts.gross,
    id,
    metadata: {},
    netAmountCents: parts.net,
    sharesHeld: '100',
    shareholderId: 'sh',
    status,
    taxStatus: 'RESIDENT',
    updatedAt: new Date(),
    withholdingCents: parts.withholding,
    withholdingPct: '0',
  }
}

function makePayment(id: string, status: DividendPayment['status']): DividendPayment {
  return {
    accountId: 'acct',
    attemptNo: 1,
    createdAt: new Date(),
    currency: 'USD',
    dividendEventId: 'div_x',
    entitlementId: 'ent',
    grossAmountCents: 0,
    id,
    metadata: {},
    method: 'ACH',
    netAmountCents: 0,
    shareholderId: 'sh',
    status,
    updatedAt: new Date(),
    withholdingCents: 0,
  }
}

function makeBatch(id: string, status: DividendPaymentBatch['status']): DividendPaymentBatch {
  return {
    batchNumber: id.toUpperCase(),
    createdAt: new Date(),
    currency: 'USD',
    dividendEventId: 'div_x',
    id,
    issuerId: 'iss_meridian',
    metadata: {},
    method: 'ACH',
    paymentCount: 0,
    paymentDate: '2025-01-30',
    status,
    totalGrossCents: 0,
    totalNetCents: 0,
    totalWithholdingCents: 0,
    updatedAt: new Date(),
  }
}

describe('buildReportsSummary', () => {
  it('aggregates totals, excludes cancelled/rejected from total declared, and breaks down by status', () => {
    const declarations = [
      makeDeclaration('div_paid', 'PAID', 1_500_000),
      makeDeclaration('div_calc', 'CALCULATED', 500_000),
      makeDeclaration('div_cancel', 'CANCELLED', 100_000),
      makeDeclaration('div_reject', 'REJECTED', 80_000),
    ]
    const entitlements = [
      makeEntitlement('ent_1', 'PAID', { gross: 12500, net: 11250, withholding: 1250 }),
      makeEntitlement('ent_2', 'PAID', { gross: 6000, net: 5500, withholding: 500 }),
      makeEntitlement('ent_3', 'CALCULATED', { gross: 8000, net: 7200, withholding: 800 }),
      makeEntitlement('ent_4', 'PENDING', { gross: 3000, net: 2700, withholding: 300 }),
      makeEntitlement('ent_5', 'VOIDED', { gross: 1000, net: 900, withholding: 100 }),
    ]
    const payments = [
      makePayment('pay_1', 'PAID'),
      makePayment('pay_2', 'FAILED'),
      makePayment('pay_3', 'RETURNED'),
      makePayment('pay_4', 'CANCELLED'),
      makePayment('pay_5', 'PROCESSING'),
    ]
    const batches = [makeBatch('bat_1', 'PROCESSED'), makeBatch('bat_2', 'PROCESSING'), makeBatch('bat_3', 'CANCELLED')]
    const summary = buildReportsSummary({ batches, declarations, entitlements, payments })

    assert.equal(summary.totalDeclaredCents, 1_500_000 + 500_000)
    assert.equal(summary.totalPaidCents, 11250 + 5500)
    assert.equal(summary.totalWithholdingCents, 1250 + 500 + 800 + 300 + 100)
    assert.equal(summary.unpaidAmountCents, 7200 + 2700)
    assert.equal(summary.failedPaymentCount, 3)
    assert.equal(summary.declarationCount, 4)
    assert.equal(summary.dividendsByStatus.PAID, 1)
    assert.equal(summary.dividendsByStatus.CALCULATED, 1)
    assert.equal(summary.dividendsByStatus.CANCELLED, 1)
    assert.equal(summary.dividendsByStatus.REJECTED, 1)
    assert.equal(summary.dividendsByStatus.DRAFT, 0)
    assert.equal(summary.batchesByStatus.PROCESSED, 1)
    assert.equal(summary.batchesByStatus.PROCESSING, 1)
    assert.equal(summary.batchesByStatus.CANCELLED, 1)
    assert.equal(summary.currency, 'USD')
  })

  it('returns USD by default when there are no rows and reflects mixed currencies otherwise', () => {
    const empty = buildReportsSummary({ batches: [], declarations: [], entitlements: [], payments: [] })
    assert.equal(empty.currency, 'USD')

    const mixed = buildReportsSummary({
      batches: [],
      declarations: [makeDeclaration('a', 'PAID', 1_000), { ...makeDeclaration('b', 'PAID', 1_000), currency: 'EUR' }],
      entitlements: [],
      payments: [],
    })
    assert.equal(mixed.currency, 'MIXED')
  })

  it('preserves the supplied window in the response', () => {
    const summary = buildReportsSummary({
      batches: [],
      declarations: [],
      entitlements: [],
      payments: [],
      window: { from: '2025-01-01', to: '2025-12-31' },
    })
    assert.deepEqual(summary.window, { from: '2025-01-01', to: '2025-12-31' })
  })
})
