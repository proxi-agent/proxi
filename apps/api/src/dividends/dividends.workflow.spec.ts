import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type {
  DividendCalculationSummary,
  DividendCommunication,
  DividendEvent,
  DividendPaymentBatch,
  DividendReconciliationException,
  DividendWarning,
  FractionalSharePolicy,
} from './dividends.types.js'
import {
  assertCommunicationTransition,
  buildWorkflowSteps,
  canCommunicationTransition,
  CommunicationTransitionError,
} from './dividends.workflow.js'

/**
 * Pure unit tests for `dividends.workflow.ts`. These test the
 * communications state machine and the read-projection that drives the
 * 11-step UI stepper. No DB / Nest required.
 */

function makeDividend(overrides: Partial<DividendEvent> = {}): DividendEvent {
  return {
    calculationVersion: 0,
    createdAt: new Date('2026-01-01'),
    currency: 'USD',
    declarationDate: '2026-01-10',
    id: 'div_1',
    issuerId: 'iss_1',
    kind: 'CASH',
    metadata: {},
    paymentDate: '2026-02-10',
    rateAmount: '0.18',
    ratePerShareCents: 18,
    rateType: 'PER_SHARE',
    recordDate: '2026-01-25',
    securityId: 'sec_1',
    status: 'DRAFT',
    supportingDocuments: [],
    totalDistributionCents: 0,
    updatedAt: new Date('2026-01-01'),
    version: 1,
    withholdingDefaultPct: '0',
    ...overrides,
  }
}

function makeBatch(overrides: Partial<DividendPaymentBatch> = {}): DividendPaymentBatch {
  return {
    batchNumber: 'BATCH-001',
    createdAt: new Date(),
    currency: 'USD',
    dividendEventId: 'div_1',
    id: 'bat_1',
    issuerId: 'iss_1',
    metadata: {},
    method: 'ACH',
    paymentCount: 1,
    paymentDate: '2026-02-10',
    status: 'DRAFT',
    totalGrossCents: 100,
    totalNetCents: 100,
    totalWithholdingCents: 0,
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeCommunication(overrides: Partial<DividendCommunication>): DividendCommunication {
  return {
    createdAt: new Date(),
    dividendEventId: 'div_1',
    documentRefs: [],
    id: 'com_1',
    issuerId: 'iss_1',
    kind: 'SHAREHOLDER_NOTICE',
    metadata: {},
    status: 'DRAFT',
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeException(overrides: Partial<DividendReconciliationException>): DividendReconciliationException {
  return {
    description: 'Bank reported $98.20, internal expected $98.21',
    dividendEventId: 'div_1',
    id: 'exc_1',
    metadata: {},
    openedAt: new Date(),
    status: 'OPEN',
    type: 'AMOUNT_MISMATCH',
    ...overrides,
  }
}

describe('communication state machine', () => {
  it('walks the happy path DRAFT → PENDING_REVIEW → APPROVED → SENT', () => {
    assert.equal(canCommunicationTransition('DRAFT', 'PENDING_REVIEW'), true)
    assert.equal(canCommunicationTransition('PENDING_REVIEW', 'APPROVED'), true)
    assert.equal(canCommunicationTransition('APPROVED', 'SENT'), true)
  })

  it('allows PENDING_REVIEW → DRAFT (send-back)', () => {
    assert.equal(canCommunicationTransition('PENDING_REVIEW', 'DRAFT'), true)
  })

  it('rejects illegal short-circuits', () => {
    assert.equal(canCommunicationTransition('DRAFT', 'SENT'), false)
    assert.equal(canCommunicationTransition('DRAFT', 'APPROVED'), false)
    assert.equal(canCommunicationTransition('SENT', 'APPROVED'), false)
    assert.throws(() => assertCommunicationTransition('DRAFT', 'SENT'), CommunicationTransitionError)
  })

  it('treats CANCELLED as terminal', () => {
    assert.equal(canCommunicationTransition('CANCELLED', 'DRAFT'), false)
    assert.equal(canCommunicationTransition('CANCELLED', 'SENT'), false)
  })
})

describe('buildWorkflowSteps', () => {
  function emptyInput(dividend: DividendEvent) {
    return {
      batches: [] as DividendPaymentBatch[],
      calculatedSummary: undefined,
      communications: [] as DividendCommunication[],
      dividend,
      exceptions: [] as DividendReconciliationException[],
      fractional: [],
      reinvestmentRecords: [],
      snapshot: null,
    }
  }

  it('returns 11 deterministically-keyed steps', () => {
    const steps = buildWorkflowSteps(emptyInput(makeDividend()))
    assert.equal(steps.length, 11)
    assert.deepEqual(
      steps.map(s => s.key),
      [
        'BOARD_REVIEW',
        'KEY_DATES',
        'COMMUNICATIONS',
        'REGISTER_REVIEW',
        'ELIGIBILITY',
        'TAX',
        'FRACTIONAL',
        'DRIP_OR_CASH',
        'PAYMENT_EXECUTION',
        'RECONCILIATION',
        'ARCHIVE',
      ],
    )
  })

  it('marks BOARD_REVIEW as in_progress for PENDING_APPROVAL and blocked for REJECTED', () => {
    const pending = buildWorkflowSteps(emptyInput(makeDividend({ status: 'PENDING_APPROVAL' })))[0]
    assert.equal(pending.state, 'in_progress')

    const rejected = buildWorkflowSteps(emptyInput(makeDividend({ status: 'REJECTED' })))[0]
    assert.equal(rejected.state, 'blocked')
  })

  it('marks BOARD_REVIEW done once the dividend is APPROVED or beyond', () => {
    const approved = makeDividend({ approvedAt: new Date('2026-01-15'), status: 'APPROVED' })
    const step = buildWorkflowSteps(emptyInput(approved))[0]
    assert.equal(step.state, 'done')
    assert.match(step.detail ?? '', /Approved 2026-01-15/)
  })

  it('marks COMMUNICATIONS in_progress when drafted but not sent', () => {
    const dividend = makeDividend({ status: 'APPROVED' })
    const draft = makeCommunication({ kind: 'SHAREHOLDER_NOTICE', status: 'PENDING_REVIEW' })
    const steps = buildWorkflowSteps({
      ...emptyInput(dividend),
      communications: [draft],
    })
    assert.equal(steps[2].state, 'in_progress')
  })

  it('marks COMMUNICATIONS done when at least one is SENT', () => {
    const dividend = makeDividend({ status: 'APPROVED' })
    const sent = makeCommunication({ status: 'SENT' })
    const steps = buildWorkflowSteps({ ...emptyInput(dividend), communications: [sent] })
    assert.equal(steps[2].state, 'done')
  })

  it('surfaces tax warnings on the TAX step when calculation produced them', () => {
    const summary = {
      eligibleHolderCount: 2,
      excludedHolderCount: 0,
      totalGrossCents: 200,
      totalEligibleShares: '2',
      totalNetCents: 200,
      totalWithholdingCents: 0,
      warnings: [
        { code: 'MISSING_TAX_INFO', message: 'No W-9 on file', severity: 'WARNING' as DividendWarning['severity'] },
        { code: 'UNKNOWN_RESIDENCY', message: 'Resident country missing', severity: 'WARNING' as DividendWarning['severity'] },
      ],
    } as unknown as DividendCalculationSummary
    const dividend = makeDividend({ status: 'CALCULATED' })
    const steps = buildWorkflowSteps({ ...emptyInput(dividend), calculatedSummary: summary })
    const taxStep = steps.find(s => s.key === 'TAX')!
    assert.equal(taxStep.state, 'in_progress')
    assert.equal(taxStep.warnings.length, 2)
  })

  it('marks RECONCILIATION in_progress when there are open exceptions', () => {
    const dividend = makeDividend({ status: 'PAID' })
    const batches = [makeBatch({ status: 'PROCESSED' })]
    const exceptions = [makeException({ status: 'OPEN' })]
    const steps = buildWorkflowSteps({ ...emptyInput(dividend), batches, exceptions })
    const recon = steps.find(s => s.key === 'RECONCILIATION')!
    assert.equal(recon.state, 'in_progress')
    assert.equal(recon.warnings.length, 1)
  })

  it('marks ARCHIVE done only when the dividend is archived', () => {
    const dividend = makeDividend({ archivedAt: new Date('2026-03-01'), status: 'ARCHIVED' })
    const archive = buildWorkflowSteps(emptyInput(dividend))[10]
    assert.equal(archive.state, 'done')
    assert.match(archive.detail ?? '', /Archived 2026-03-01/)
  })

  it('keeps ARCHIVE pending when reconciliation is still open', () => {
    const dividend = makeDividend({ status: 'PAID' })
    const batches = [makeBatch({ status: 'PROCESSED' })]
    const exceptions = [makeException({ status: 'OPEN' })]
    const archive = buildWorkflowSteps({ ...emptyInput(dividend), batches, exceptions })[10]
    assert.equal(archive.state, 'pending')
  })

  it('marks ARCHIVE in_progress once everything is reconciled but still PAID', () => {
    const dividend = makeDividend({ status: 'PAID' })
    const batches = [makeBatch({ status: 'RECONCILED' })]
    const archive = buildWorkflowSteps({ ...emptyInput(dividend), batches })[10]
    assert.equal(archive.state, 'in_progress')
  })

  it('exercises the DRIP-or-cash branch when reinvestment records exist', () => {
    const dividend = makeDividend({ status: 'CALCULATED' })
    const drip = [
      {
        accountId: 'acc_1',
        createdAt: new Date(),
        dividendEventId: 'div_1',
        entitlementId: 'ent_1',
        fractionalShareHandling: 'CASH_IN_LIEU' as FractionalSharePolicy,
        id: 'drr_1',
        metadata: {},
        purchasePrice: '82.44',
        reinvestedAmountCents: 1000,
        residualCashCents: 0,
        shareholderId: 'sh_1',
        sharesIssued: '12',
        status: 'EXECUTED' as const,
        updatedAt: new Date(),
      },
    ]
    const summary = {
      eligibleHolderCount: 1,
      excludedHolderCount: 0,
      totalEligibleShares: '12',
      totalGrossCents: 1000,
      totalNetCents: 1000,
      totalWithholdingCents: 0,
      warnings: [],
    } as unknown as DividendCalculationSummary
    const step = buildWorkflowSteps({
      ...emptyInput(dividend),
      calculatedSummary: summary,
      reinvestmentRecords: drip,
    })[7]
    assert.equal(step.state, 'done')
    assert.match(step.detail ?? '', /1 DRIP records/)
  })
})
