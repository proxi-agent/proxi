import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildStatementView, renderStatementHtml } from './dividends.statement.js'
import type {
  DividendEntitlement,
  DividendEvent,
  DividendIssuerSummary,
  DividendPayment,
  DividendSecuritySummary,
  DividendStatement,
} from './dividends.types.js'

const ISSUER: DividendIssuerSummary = {
  id: 'iss_meridian',
  jurisdiction: 'US-DE',
  legalName: 'Meridian Industries Inc.',
}

const SECURITY: DividendSecuritySummary = {
  id: 'sec_meridian_common',
  name: 'Common Stock',
  symbol: 'MRDN',
}

const DECLARATION: DividendEvent = {
  calculationVersion: 1,
  createdAt: new Date('2025-01-02T10:00:00Z'),
  currency: 'USD',
  declarationDate: '2025-01-02',
  exDividendDate: '2025-01-15',
  id: 'div_test_1',
  issuerId: ISSUER.id,
  kind: 'CASH',
  metadata: {},
  paymentDate: '2025-01-30',
  rateAmount: '0.25',
  ratePerShareCents: 25,
  rateType: 'PER_SHARE',
  recordDate: '2025-01-16',
  securityId: SECURITY.id,
  status: 'PAID',
  supportingDocuments: [],
  totalDistributionCents: 1_500_000,
  updatedAt: new Date('2025-01-30T15:00:00Z'),
  version: 7,
  withholdingDefaultPct: '0',
}

const ENTITLEMENT: DividendEntitlement = {
  accountId: 'acct_eleanor',
  amountCents: 12500,
  calculationVersion: 1,
  createdAt: new Date('2025-01-04T10:00:00Z'),
  currency: 'USD',
  dividendEventId: DECLARATION.id,
  grossAmountCents: 12500,
  id: 'ent_paid',
  metadata: {},
  netAmountCents: 11250,
  paidAt: new Date('2025-01-30T15:00:00Z'),
  sharesHeld: '500',
  shareholderId: 'sh_eleanor',
  status: 'PAID',
  taxFormStatus: 'W9_ON_FILE',
  taxStatus: 'RESIDENT',
  updatedAt: new Date('2025-01-30T15:00:00Z'),
  withholdingCents: 1250,
  withholdingPct: '10',
}

const STATEMENT: DividendStatement = {
  accountId: ENTITLEMENT.accountId,
  createdAt: new Date('2025-01-30T16:00:00Z'),
  currency: 'USD',
  dividendEventId: DECLARATION.id,
  entitlementId: ENTITLEMENT.id,
  grossAmountCents: ENTITLEMENT.grossAmountCents,
  id: 'dst_eleanor_q4',
  metadata: {},
  netAmountCents: ENTITLEMENT.netAmountCents,
  shareholderId: ENTITLEMENT.shareholderId,
  statementDate: DECLARATION.paymentDate,
  status: 'READY',
  updatedAt: new Date('2025-01-30T16:00:00Z'),
  withholdingCents: ENTITLEMENT.withholdingCents,
}

const PAYMENT: DividendPayment = {
  accountId: ENTITLEMENT.accountId,
  attemptNo: 1,
  batchId: 'bat_q4_1',
  createdAt: new Date('2025-01-30T10:00:00Z'),
  currency: 'USD',
  dividendEventId: DECLARATION.id,
  entitlementId: ENTITLEMENT.id,
  externalRef: 'ACH-2025-0001',
  grossAmountCents: ENTITLEMENT.grossAmountCents,
  id: 'pay_eleanor',
  metadata: {},
  method: 'ACH',
  netAmountCents: ENTITLEMENT.netAmountCents,
  paidAt: ENTITLEMENT.paidAt,
  shareholderId: ENTITLEMENT.shareholderId,
  status: 'PAID',
  updatedAt: new Date('2025-01-30T15:00:00Z'),
  withholdingCents: ENTITLEMENT.withholdingCents,
}

describe('buildStatementView', () => {
  it('flattens declaration/entitlement/payment context with formatted decimals', () => {
    const view = buildStatementView({
      declaration: DECLARATION,
      entitlement: ENTITLEMENT,
      generatedAt: new Date('2025-01-31T00:00:00Z'),
      issuer: ISSUER,
      payment: PAYMENT,
      security: SECURITY,
      shareholder: { id: ENTITLEMENT.shareholderId, legalName: 'Eleanor Hayes', taxResidency: 'US' },
      statement: STATEMENT,
    })

    assert.equal(view.statementId, STATEMENT.id)
    assert.equal(view.statementNumber, 'STMT-ELEANOR_Q4')
    assert.equal(view.amounts.grossAmountDecimal, '125.00')
    assert.equal(view.amounts.withholdingDecimal, '12.50')
    assert.equal(view.amounts.netAmountDecimal, '112.50')
    assert.equal(view.amounts.currency, 'USD')
    assert.equal(view.declaration.kind, 'CASH')
    assert.equal(view.declaration.recordDate, '2025-01-16')
    assert.equal(view.payment?.method, 'ACH')
    assert.equal(view.payment?.externalRef, 'ACH-2025-0001')
    assert.equal(view.shareholder.legalName, 'Eleanor Hayes')
    assert.equal(view.disclaimer.length > 0, true)
    assert.equal(view.generatedAt, '2025-01-31T00:00:00.000Z')
  })

  it('omits the payment block when no payment row is provided', () => {
    const view = buildStatementView({
      declaration: DECLARATION,
      entitlement: ENTITLEMENT,
      issuer: ISSUER,
      security: SECURITY,
      shareholder: { id: ENTITLEMENT.shareholderId },
      statement: STATEMENT,
    })
    assert.equal(view.payment, undefined)
  })

  it('honours overrides for statement number and disclaimer', () => {
    const view = buildStatementView({
      declaration: DECLARATION,
      disclaimer: 'Custom disclaimer',
      entitlement: ENTITLEMENT,
      issuer: ISSUER,
      security: SECURITY,
      shareholder: { id: ENTITLEMENT.shareholderId },
      statement: STATEMENT,
      statementNumber: 'CUSTOM-001',
    })
    assert.equal(view.statementNumber, 'CUSTOM-001')
    assert.equal(view.disclaimer, 'Custom disclaimer')
  })
})

describe('renderStatementHtml', () => {
  it('produces a complete HTML document with safely escaped fields', () => {
    const view = buildStatementView({
      declaration: DECLARATION,
      entitlement: ENTITLEMENT,
      issuer: { id: ISSUER.id, legalName: 'Meridian & Co. <Industries>' },
      payment: PAYMENT,
      security: SECURITY,
      shareholder: { id: ENTITLEMENT.shareholderId, legalName: 'Hayes, Eleanor "Ellie"', taxResidency: 'US' },
      statement: STATEMENT,
    })
    const html = renderStatementHtml(view)
    assert.match(html, /^<!doctype html>/)
    assert.match(html, /<\/html>$/)
    assert.match(html, /Meridian &amp; Co\. &lt;Industries&gt;/)
    assert.match(html, /Hayes, Eleanor &quot;Ellie&quot;/)
    assert.match(html, /USD 125\.00/)
    assert.match(html, /USD 12\.50/)
    assert.match(html, /USD 112\.50/)
    assert.match(html, /class="disclaimer"/)
    assert.match(html, /STMT-ELEANOR_Q4/)
    assert.match(html, /Generated /)
  })

  it('omits the payment block when payment is missing', () => {
    const view = buildStatementView({
      declaration: DECLARATION,
      entitlement: ENTITLEMENT,
      issuer: ISSUER,
      security: SECURITY,
      shareholder: { id: ENTITLEMENT.shareholderId },
      statement: STATEMENT,
    })
    const html = renderStatementHtml(view)
    assert.equal(/<h2>Payment<\/h2>/.test(html), false)
  })
})
