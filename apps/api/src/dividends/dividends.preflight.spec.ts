import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { buildMissingInfoChecklist, buildSuggestedActions, type ReviewContext, runPreflightChecks } from './dividends.preflight.js'
import type { DividendEligibilitySnapshot, DividendEntitlement, DividendEvent, DividendPaymentBatch } from './dividends.types.js'

function makeDividend(overrides: Partial<DividendEvent> = {}): DividendEvent {
  const now = new Date('2030-01-01T00:00:00Z')
  return {
    calculationVersion: 0,
    createdAt: now,
    currency: 'USD',
    declarationDate: '2030-05-01',
    id: 'div_1',
    issuerId: 'iss_acme',
    kind: 'CASH',
    metadata: {},
    paymentDate: '2030-07-15',
    rateAmount: '0.25',
    ratePerShareCents: 25,
    rateType: 'PER_SHARE',
    recordDate: '2030-06-15',
    securityId: 'sec_acme',
    status: 'DRAFT',
    supportingDocuments: [],
    totalDistributionCents: 0,
    updatedAt: now,
    version: 1,
    withholdingDefaultPct: '0',
    ...overrides,
  }
}

function findCode(report: ReturnType<typeof runPreflightChecks>, code: string): boolean {
  return report.findings.some(f => f.code === code)
}

describe('runPreflightChecks — identity', () => {
  it('flags missing issuer/security/currency as ERRORs', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ currency: '', issuerId: '', securityId: '' }),
    })
    assert.equal(findCode(report, 'MISSING_ISSUER'), true)
    assert.equal(findCode(report, 'MISSING_SECURITY'), true)
    assert.equal(findCode(report, 'MISSING_CURRENCY'), true)
    assert.ok(report.errorCount >= 3)
    assert.equal(report.blocking, true)
  })
})

describe('runPreflightChecks — dates', () => {
  it('flags payment date not strictly after record date', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ paymentDate: '2030-06-15', recordDate: '2030-06-15' }),
    })
    assert.equal(findCode(report, 'PAYMENT_NOT_AFTER_RECORD'), true)
  })

  it('flags record date before declaration date', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ declarationDate: '2030-07-01', recordDate: '2030-06-15' }),
    })
    assert.equal(findCode(report, 'RECORD_BEFORE_DECLARATION'), true)
  })

  it('warns when ex-dividend date is after record date', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ exDividendDate: '2030-06-20', recordDate: '2030-06-15' }),
    })
    assert.equal(findCode(report, 'EX_DIVIDEND_AFTER_RECORD'), true)
  })

  it('emits an INFO when payment is more than 120 days from record date', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ paymentDate: '2031-01-01', recordDate: '2030-06-15' }),
    })
    assert.equal(findCode(report, 'PAYMENT_FAR_FROM_RECORD'), true)
  })
})

describe('runPreflightChecks — rate', () => {
  it('flags zero or negative rates as ERROR', () => {
    const report = runPreflightChecks({ dividend: makeDividend({ rateAmount: '0' }) })
    assert.equal(findCode(report, 'NON_POSITIVE_RATE'), true)
  })

  it('warns on percentage rate above 100%', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ rateAmount: '1.25', rateType: 'PERCENTAGE' }),
    })
    assert.equal(findCode(report, 'PERCENTAGE_RATE_OUT_OF_RANGE'), true)
  })
})

describe('runPreflightChecks — workflow', () => {
  it('flags status ahead of approvals', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ status: 'APPROVED' }),
      hasApprovals: false,
    })
    assert.equal(findCode(report, 'STATUS_AHEAD_OF_APPROVAL'), true)
  })
})

describe('runPreflightChecks — eligibility', () => {
  it('flags missing snapshot once status is past lock', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ status: 'CALCULATED' }),
    })
    assert.equal(findCode(report, 'MISSING_ELIGIBILITY_SNAPSHOT'), true)
  })

  it('warns on empty snapshot', () => {
    const snapshot: DividendEligibilitySnapshot = {
      capturedAt: new Date(),
      dividendEventId: 'div_1',
      excludedHolderCount: 0,
      holderCount: 0,
      id: 'snap_1',
      issuerId: 'iss_acme',
      lockedAt: new Date(),
      metadata: {},
      recordDate: '2030-06-15',
      securityId: 'sec_acme',
      snapshotPayload: [],
      totalEligibleShares: '0',
    }
    const report = runPreflightChecks({
      dividend: makeDividend({ status: 'ELIGIBILITY_LOCKED' }),
      snapshot,
    })
    assert.equal(findCode(report, 'EMPTY_SNAPSHOT'), true)
  })
})

describe('runPreflightChecks — calculation/payment', () => {
  it('flags a batch whose totals exceed entitlement totals', () => {
    const entitlements: DividendEntitlement[] = [
      {
        accountId: 'acc_1',
        amountCents: 100,
        currency: 'USD',
        dividendEventId: 'div_1',
        grossAmountCents: 100,
        id: 'ent_1',
        netAmountCents: 100,
        sharesHeld: '100',
        shareholderId: 'sh_1',
        status: 'CALCULATED',
        taxStatus: 'NONE',
        withholdingCents: 0,
        withholdingPct: '0',
      } as unknown as DividendEntitlement,
    ]
    const batches: DividendPaymentBatch[] = [
      {
        batchNumber: 'B-1',
        currency: 'USD',
        dividendEventId: 'div_1',
        id: 'b_1',
        issuerId: 'iss_acme',
        method: 'ACH',
        paymentCount: 1,
        paymentDate: '2030-07-15',
        status: 'DRAFT',
        totalGrossCents: 999,
        totalNetCents: 999,
        totalWithholdingCents: 0,
      } as unknown as DividendPaymentBatch,
    ]
    const report = runPreflightChecks({ batches, dividend: makeDividend(), entitlements })
    assert.equal(findCode(report, 'BATCH_EXCEEDS_ENTITLEMENTS'), true)
    assert.equal(report.blocking, true)
  })

  it('flags failed payments', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ status: 'PAID' }),
      payments: [
        { id: 'p_1', status: 'FAILED' } as DividendEntitlement & { status: 'FAILED' },
        { id: 'p_2', status: 'PAID' } as DividendEntitlement & { status: 'PAID' },
        { id: 'p_3', status: 'RETURNED' } as DividendEntitlement & { status: 'RETURNED' },
      ] as unknown as ReviewContext['payments'],
    })
    assert.equal(findCode(report, 'FAILED_PAYMENTS_DETECTED'), true)
    const finding = report.findings.find(f => f.code === 'FAILED_PAYMENTS_DETECTED')!
    assert.deepEqual(finding.metadata, { count: 2 })
  })
})

describe('runPreflightChecks — historical anomalies', () => {
  it('warns on a 2x+ rate spike vs. comparable history', () => {
    const priorDividends: ReviewContext['priorDividends'] = [
      {
        currency: 'USD',
        id: 'p1',
        paymentDate: '2029-04-01',
        rateAmount: '0.20',
        rateType: 'PER_SHARE',
        recordDate: '2029-03-15',
        status: 'PAID',
        totalDistributionCents: 0,
      },
      {
        currency: 'USD',
        id: 'p2',
        paymentDate: '2029-07-01',
        rateAmount: '0.22',
        rateType: 'PER_SHARE',
        recordDate: '2029-06-15',
        status: 'PAID',
        totalDistributionCents: 0,
      },
      {
        currency: 'USD',
        id: 'p3',
        paymentDate: '2029-10-01',
        rateAmount: '0.21',
        rateType: 'PER_SHARE',
        recordDate: '2029-09-15',
        status: 'PAID',
        totalDistributionCents: 0,
      },
    ]
    const report = runPreflightChecks({
      dividend: makeDividend({ rateAmount: '0.55' }),
      priorDividends,
    })
    assert.equal(findCode(report, 'RATE_SPIKE_VS_HISTORY'), true)
  })

  it('does not flag when there is insufficient history', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ rateAmount: '5.00' }),
      priorDividends: [
        {
          currency: 'USD',
          id: 'p1',
          paymentDate: '2029-04-01',
          rateAmount: '0.20',
          rateType: 'PER_SHARE',
          recordDate: '2029-03-15',
          status: 'PAID',
          totalDistributionCents: 0,
        },
      ],
    })
    assert.equal(findCode(report, 'RATE_SPIKE_VS_HISTORY'), false)
  })
})

describe('checklist + suggested actions derived purely from findings', () => {
  it('builds a missing info checklist that maps findings to user-friendly bullets', () => {
    const report = runPreflightChecks({
      dividend: makeDividend({ rateAmount: '0', recordDate: '' }),
      shareholdersMissingPaymentInstructions: 3,
      shareholdersMissingTaxInfo: 2,
    })
    const checklist = buildMissingInfoChecklist(report)
    assert.ok(checklist.some(s => /record date/i.test(s)))
    assert.ok(checklist.some(s => /positive dividend rate/i.test(s)))
    assert.ok(checklist.some(s => /payment instructions/i.test(s)))
    assert.ok(checklist.some(s => /W-9/.test(s)))
  })

  it('suggests submitting for approval when a clean DRAFT is ready', () => {
    const report = runPreflightChecks({ dividend: makeDividend() })
    const actions = buildSuggestedActions({ dividend: makeDividend() }, report)
    assert.ok(actions.some(s => /submit/i.test(s)))
  })

  it('does not suggest submitting when there are blocking errors', () => {
    const dividend = makeDividend({ rateAmount: '0' })
    const report = runPreflightChecks({ dividend })
    const actions = buildSuggestedActions({ dividend }, report)
    assert.ok(!actions.some(s => /submit/i.test(s)))
    assert.ok(actions.some(s => /rate/i.test(s)))
  })
})
