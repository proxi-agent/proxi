import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AUDIT_COLUMNS,
  centsToDecimalString,
  DECLARATION_COLUMNS,
  ENTITLEMENT_COLUMNS,
  escapeCsvCell,
  isFailedPaymentRow,
  PAYMENT_COLUMNS,
  renderCsv,
  SHAREHOLDER_HISTORY_COLUMNS,
  SNAPSHOT_COLUMNS,
  snapshotRows,
} from './dividends.csv.js'
import type {
  DividendEligibilityEntry,
  DividendEligibilitySnapshot,
  DividendEntitlement,
  DividendEvent,
  DividendPayment,
} from './dividends.types.js'

// ----------------------------------------------------------------------
// Shared fixtures
// ----------------------------------------------------------------------

function fixedDate(iso: string): Date {
  return new Date(iso)
}

const DECLARATION: DividendEvent = {
  calculationVersion: 1,
  createdAt: fixedDate('2025-01-02T10:00:00Z'),
  currency: 'USD',
  declarationDate: '2025-01-02',
  exDividendDate: '2025-01-15',
  id: 'div_test_1',
  issuerId: 'iss_meridian',
  kind: 'CASH',
  metadata: {},
  notes: 'Quarterly cash dividend',
  paymentDate: '2025-01-30',
  rateAmount: '0.25',
  ratePerShareCents: 25,
  rateType: 'PER_SHARE',
  recordDate: '2025-01-16',
  securityId: 'sec_meridian_common',
  status: 'CALCULATED',
  supportingDocuments: [],
  totalDistributionCents: 1_500_000,
  updatedAt: fixedDate('2025-01-04T10:00:00Z'),
  version: 4,
  withholdingDefaultPct: '0',
}

const ENT_PAID: DividendEntitlement = {
  accountId: 'acct_eleanor',
  amountCents: 12500,
  calculationVersion: 1,
  createdAt: fixedDate('2025-01-04T10:00:00Z'),
  currency: 'USD',
  dividendEventId: DECLARATION.id,
  grossAmountCents: 12500,
  id: 'ent_paid',
  metadata: {},
  netAmountCents: 12500,
  paidAt: fixedDate('2025-01-30T15:00:00Z'),
  sharesHeld: '500',
  shareholderId: 'sh_eleanor',
  status: 'PAID',
  taxFormStatus: 'W9_ON_FILE',
  taxStatus: 'RESIDENT',
  updatedAt: fixedDate('2025-01-30T15:00:00Z'),
  withholdingCents: 0,
  withholdingPct: '0',
}

const ENT_PENDING: DividendEntitlement = {
  ...ENT_PAID,
  accountId: 'acct_marcus',
  grossAmountCents: 6250,
  id: 'ent_pending',
  netAmountCents: 5625,
  paidAt: undefined,
  sharesHeld: '250',
  shareholderId: 'sh_marcus',
  status: 'CALCULATED',
  taxFormStatus: 'NONE',
  taxStatus: 'MISSING_TAX_INFO',
  withholdingCents: 625,
  withholdingPct: '10',
}

// ----------------------------------------------------------------------
// Generic CSV utilities
// ----------------------------------------------------------------------

describe('escapeCsvCell', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(escapeCsvCell(null), '')
    assert.equal(escapeCsvCell(undefined), '')
  })

  it('quotes values with commas, quotes, or newlines per RFC 4180', () => {
    assert.equal(escapeCsvCell('hello, world'), '"hello, world"')
    assert.equal(escapeCsvCell('he said "hi"'), '"he said ""hi"""')
    assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"')
    assert.equal(escapeCsvCell('line1\r\nline2'), '"line1\r\nline2"')
  })

  it('passes simple strings, numbers, and booleans through verbatim', () => {
    assert.equal(escapeCsvCell('plain'), 'plain')
    assert.equal(escapeCsvCell(42), '42')
    assert.equal(escapeCsvCell(true), 'true')
  })
})

describe('centsToDecimalString', () => {
  it('formats cents to fixed two-decimal strings without floating-point drift', () => {
    assert.equal(centsToDecimalString(0), '0.00')
    assert.equal(centsToDecimalString(5), '0.05')
    assert.equal(centsToDecimalString(99), '0.99')
    assert.equal(centsToDecimalString(100), '1.00')
    assert.equal(centsToDecimalString(12345), '123.45')
    assert.equal(centsToDecimalString(-12), '-0.12')
    assert.equal(centsToDecimalString(-12345), '-123.45')
    // Values that floats can't represent exactly should still round-trip cleanly.
    assert.equal(centsToDecimalString(10001), '100.01')
  })

  it('returns empty string for null/undefined', () => {
    assert.equal(centsToDecimalString(null), '')
    assert.equal(centsToDecimalString(undefined), '')
  })
})

describe('renderCsv', () => {
  it('emits a header row and CRLF-terminated lines', () => {
    const out = renderCsv(
      [
        { id: 'a', name: 'one' },
        { id: 'b', name: 'two' },
      ],
      [
        { header: 'id', value: r => r.id },
        { header: 'name', value: r => r.name },
      ],
    )
    assert.equal(out, 'id,name\r\na,one\r\nb,two\r\n')
  })

  it('writes only the header row when there are no rows', () => {
    const out = renderCsv([], [{ header: 'id', value: r => (r as { id: string }).id }])
    assert.equal(out, 'id\r\n')
  })
})

// ----------------------------------------------------------------------
// Per-entity column maps
// ----------------------------------------------------------------------

describe('DECLARATION_COLUMNS', () => {
  it('renders dividend declarations with issuer/security context joined in', () => {
    const out = renderCsv(
      [{ declaration: DECLARATION, issuerName: 'Meridian Industries', securityName: 'Common Stock', securitySymbol: 'MRDN' }],
      DECLARATION_COLUMNS,
    )
    assert.match(out, /^dividend_id,status,kind,issuer_id,issuer_name,/)
    assert.match(out, /div_test_1,CALCULATED,CASH,iss_meridian,Meridian Industries,/)
    assert.match(out, /sec_meridian_common,MRDN,Common Stock,/)
    assert.match(out, /15000\.00/) // 1,500,000 cents → 15,000.00
  })
})

describe('SNAPSHOT_COLUMNS', () => {
  it('extracts each entry from a snapshot payload', () => {
    const snapshot: DividendEligibilitySnapshot = {
      capturedAt: fixedDate('2025-01-16T00:00:00Z'),
      dividendEventId: DECLARATION.id,
      excludedHolderCount: 1,
      holderCount: 2,
      id: 'snap_1',
      issuerId: DECLARATION.issuerId,
      metadata: {},
      recordDate: DECLARATION.recordDate,
      securityId: DECLARATION.securityId,
      snapshotPayload: [
        {
          accountId: 'acct_eleanor',
          eligibilityStatus: 'ELIGIBLE',
          ownershipReference: 'ACC-001',
          ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
          recordDate: DECLARATION.recordDate,
          securityId: DECLARATION.securityId,
          shareholderId: 'sh_eleanor',
          sharesHeld: '500',
        } satisfies DividendEligibilityEntry,
        {
          accountId: 'acct_blocked',
          disqualificationReason: 'Account blocked by compliance',
          eligibilityStatus: 'EXCLUDED_BLOCKED_ACCOUNT',
          ownershipReference: 'ACC-002',
          ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
          recordDate: DECLARATION.recordDate,
          securityId: DECLARATION.securityId,
          shareholderId: 'sh_blocked',
          sharesHeld: '125',
        } satisfies DividendEligibilityEntry,
      ],
      totalEligibleShares: '500',
    }
    const out = renderCsv(snapshotRows(snapshot), SNAPSHOT_COLUMNS)
    assert.match(out, /^shareholder_id,account_id,ownership_reference,security_id,/)
    assert.match(out, /sh_eleanor,acct_eleanor,ACC-001/)
    assert.match(out, /EXCLUDED_BLOCKED_ACCOUNT,Account blocked by compliance/)
  })
})

describe('ENTITLEMENT_COLUMNS', () => {
  it('formats gross/withholding/net amounts and surfaces tax fields', () => {
    const out = renderCsv(
      [
        { entitlement: ENT_PAID, shareholderName: 'Eleanor Hayes' },
        { entitlement: ENT_PENDING, shareholderName: 'Marcus Bell' },
      ],
      ENTITLEMENT_COLUMNS,
    )
    const lines = out.split('\r\n').filter(Boolean)
    assert.equal(lines.length, 3) // header + 2 rows
    assert.match(
      lines[1]!,
      /ent_paid,div_test_1,sh_eleanor,Eleanor Hayes,acct_eleanor,500,125\.00,0,0\.00,125\.00,USD,PAID,RESIDENT,,W9_ON_FILE/,
    )
    assert.match(
      lines[2]!,
      /ent_pending,.*,sh_marcus,Marcus Bell,acct_marcus,250,62\.50,10,6\.25,56\.25,USD,CALCULATED,MISSING_TAX_INFO,,NONE/,
    )
  })
})

describe('PAYMENT_COLUMNS + isFailedPaymentRow', () => {
  const PAID: DividendPayment = {
    accountId: 'acct_eleanor',
    attemptNo: 1,
    batchId: 'bat_1',
    createdAt: fixedDate('2025-01-30T10:00:00Z'),
    currency: 'USD',
    dividendEventId: DECLARATION.id,
    entitlementId: 'ent_paid',
    externalRef: 'ACH-2025-0001',
    grossAmountCents: 12500,
    id: 'pay_paid',
    metadata: {},
    method: 'ACH',
    netAmountCents: 12500,
    paidAt: fixedDate('2025-01-30T15:00:00Z'),
    shareholderId: 'sh_eleanor',
    status: 'PAID',
    updatedAt: fixedDate('2025-01-30T15:00:00Z'),
    withholdingCents: 0,
  }
  const FAILED: DividendPayment = {
    ...PAID,
    failureReason: 'Account closed (R02)',
    id: 'pay_failed',
    paidAt: undefined,
    status: 'FAILED',
  }
  const RETURNED: DividendPayment = { ...FAILED, id: 'pay_returned', returnedAt: fixedDate('2025-02-01T00:00:00Z'), status: 'RETURNED' }

  it('quotes failure reasons containing parentheses and renders all amount columns', () => {
    const out = renderCsv(
      [
        { payment: PAID, shareholderName: 'Eleanor Hayes' },
        { payment: FAILED, shareholderName: 'Eleanor Hayes' },
      ],
      PAYMENT_COLUMNS,
    )
    assert.match(
      out,
      /pay_paid,bat_1,div_test_1,ent_paid,sh_eleanor,Eleanor Hayes,acct_eleanor,ACH,PAID,125\.00,0\.00,125\.00,USD,ACH-2025-0001,/,
    )
    assert.match(out, /pay_failed,.*,FAILED,.*Account closed \(R02\)/)
  })

  it('detects failed/returned/cancelled payments for the failed-payments report', () => {
    assert.equal(isFailedPaymentRow({ payment: PAID }), false)
    assert.equal(isFailedPaymentRow({ payment: FAILED }), true)
    assert.equal(isFailedPaymentRow({ payment: RETURNED }), true)
    assert.equal(isFailedPaymentRow({ payment: { ...PAID, status: 'CANCELLED' } }), true)
  })
})

describe('SHAREHOLDER_HISTORY_COLUMNS', () => {
  it('joins declaration + entitlement + payment for the shareholder export', () => {
    const out = renderCsv(
      [
        {
          declaration: DECLARATION,
          entitlement: ENT_PAID,
          issuerName: 'Meridian Industries',
          payment: {
            accountId: 'acct_eleanor',
            attemptNo: 1,
            batchId: 'bat_1',
            createdAt: fixedDate('2025-01-30T00:00:00Z'),
            currency: 'USD',
            dividendEventId: DECLARATION.id,
            entitlementId: ENT_PAID.id,
            externalRef: 'ACH-2025-0001',
            grossAmountCents: 12500,
            id: 'pay_paid',
            metadata: {},
            method: 'ACH',
            netAmountCents: 12500,
            paidAt: fixedDate('2025-01-30T15:00:00Z'),
            shareholderId: 'sh_eleanor',
            status: 'PAID',
            updatedAt: fixedDate('2025-01-30T15:00:00Z'),
            withholdingCents: 0,
          },
          securitySymbol: 'MRDN',
        },
      ],
      SHAREHOLDER_HISTORY_COLUMNS,
    )
    assert.match(out, /^dividend_id,issuer_name,security_symbol,kind,/)
    assert.match(out, /Meridian Industries,MRDN,CASH,2025-01-02,2025-01-16,2025-01-30,500,0\.25,125\.00,0\.00,125\.00,USD,PAID,PAID,ACH/)
  })
})

describe('AUDIT_COLUMNS', () => {
  it('serialises the metadata payload as JSON in the last column', () => {
    const out = renderCsv(
      [
        {
          action: 'DIVIDEND_APPROVED',
          actorId: 'usr_1',
          actorRole: 'super_admin',
          at: '2025-01-04T12:00:00Z',
          headline: 'Dividend approved',
          id: 42,
          payload: { decisionNotes: 'Looks good, approved.' },
          severity: 'INFO',
        },
      ],
      AUDIT_COLUMNS,
    )
    assert.match(out, /^event_id,occurred_at,action,headline,severity,actor_id,actor_role,payload_json/)
    assert.match(out, /42,2025-01-04T12:00:00Z,DIVIDEND_APPROVED,Dividend approved,INFO,usr_1,super_admin,/)
    assert.match(out, /"\{""decisionNotes"":""Looks good, approved\.""\}"/)
  })
})
