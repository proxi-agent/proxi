/**
 * Local fixtures for the dividend UI prototype.
 *
 * The shapes mirror the API contracts in `apps/api/src/dividends/*` so once the
 * API is wired up the consumers can switch from `getDividend(id)` to a real
 * data fetch without changing component code. We intentionally cover the full
 * canonical lifecycle (DRAFT → ARCHIVED) so every page has realistic content.
 */

import type {
  ApprovalRecord,
  CalculatedSummary,
  DeclarationsFilter,
  DividendAuditEvent,
  DividendDashboardData,
  DividendEvent,
  DividendEventDetail,
  EligibilitySnapshot,
  Entitlement,
  PaymentBatch,
  PaymentBatchDetail,
  WorkflowStep,
} from './types'

const MERIDIAN = {
  id: 'iss_meridian',
  name: 'Meridian Optics, Inc.',
  ticker: 'MRDN',
}

const HALCYON = {
  id: 'iss_halcyon',
  name: 'Halcyon Industrial Co.',
  ticker: 'HALC',
}

const RIDGEFIELD = {
  id: 'iss_ridgefield',
  name: 'Ridgefield Energy Holdings',
  ticker: 'RDG',
}

const COMMON = { classLabel: 'Common stock', cusip: '589543 10 2', id: 'sec_meridian_common', label: 'MRDN — Common' }
const HALC_COMMON = { classLabel: 'Common stock', cusip: '402671 10 8', id: 'sec_halcyon_common', label: 'HALC — Common' }
const RDG_PREF = { classLabel: 'Series A preferred', cusip: '765944 21 0', id: 'sec_ridgefield_prefa', label: 'RDG — Pref A' }

const Q4_2025_WORKFLOW: WorkflowStep[] = [
  { detail: 'Approved by board · Jan 14', key: 'BOARD_REVIEW', label: 'Board review', reachedAt: '2026-01-14T16:02:00Z', state: 'DONE' },
  {
    detail: 'Decl Jan 14 · Rec Jan 22 · Pay Jan 24',
    key: 'KEY_DATES',
    label: 'Key dates',
    reachedAt: '2026-01-14T16:05:00Z',
    state: 'DONE',
  },
  {
    detail: '2 of 3 communications approved',
    key: 'COMMUNICATIONS',
    label: 'Notices / Announcement',
    reachedAt: '2026-01-15T20:00:00Z',
    state: 'DONE',
  },
  { detail: '19,210 holders captured', key: 'REGISTER_REVIEW', label: 'Register review', reachedAt: '2026-01-22T05:00:00Z', state: 'DONE' },
  {
    detail: 'Locked · 19.87M shares eligible',
    key: 'ELIGIBILITY',
    label: 'Eligibility',
    reachedAt: '2026-01-22T05:30:00Z',
    state: 'DONE',
  },
  {
    detail: '12 holders missing W-9 · backup withholding will apply',
    key: 'TAX',
    label: 'Tax / Withholding',
    state: 'IN_PROGRESS',
    warnings: [
      { code: 'MISSING_TAX_FORM', detail: '12 holders missing W-9', severity: 'WARNING' },
      { code: 'UNKNOWN_TAX_RESIDENCY', detail: '4 holders with unknown residency', severity: 'WARNING' },
    ],
  },
  { detail: 'Cash-in-lieu @ VWAP awaits TAX gate', key: 'FRACTIONAL', label: 'Fractional adjustments', state: 'PENDING' },
  { detail: '4,412 DRIP · 14,798 cash routed', key: 'DRIP_OR_CASH', label: 'Cash or DRIP', state: 'PENDING' },
  { detail: 'Jan 24 · ACH + check', key: 'PAYMENT_EXECUTION', label: 'Payment execution', state: 'PENDING' },
  { detail: 'Awaiting bank file', key: 'RECONCILIATION', label: 'Reconciliation', state: 'PENDING' },
  { detail: 'Pending closeout', key: 'ARCHIVE', label: 'Archive', state: 'PENDING' },
]

const Q3_2025_WORKFLOW: WorkflowStep[] = Q4_2025_WORKFLOW.map((s, idx) => ({
  ...s,
  detail: idx === 5 ? 'All forms on file' : s.detail,
  reachedAt: s.reachedAt ?? `2025-10-${10 + idx}T18:00:00Z`,
  state: 'DONE' as const,
  warnings: undefined,
}))

const Q2_2025_DRAFT_WORKFLOW: WorkflowStep[] = [
  { detail: 'Awaiting board sign-off', key: 'BOARD_REVIEW', label: 'Board review', state: 'IN_PROGRESS' },
  { detail: 'Draft dates entered', key: 'KEY_DATES', label: 'Key dates', state: 'PENDING' },
  ...Q4_2025_WORKFLOW.slice(2).map(s => ({ ...s, reachedAt: undefined, state: 'PENDING' as const, warnings: undefined })),
]

export const MOCK_APPROVALS: ApprovalRecord[] = [
  { actor: 'Sophia Chen · CFO', at: '2026-01-14T20:02:00Z', decision: 'SUBMITTED', id: 'apr-1' },
  {
    actor: 'Yvonne Park · Board chair',
    at: '2026-01-14T21:15:00Z',
    decision: 'APPROVED',
    id: 'apr-2',
    reason: 'Board reviewed financials',
  },
]

export const MOCK_DIVIDENDS: DividendEvent[] = [
  {
    approvedAt: '2026-01-14T21:15:00Z',
    calculatedAt: '2026-01-22T05:30:00Z',
    calculatedSummary: {
      eligibleHolderCount: 19_210,
      excludedHolderCount: 87,
      grossAmountCents: 357_678_000,
      netAmountCents: 351_092_400,
      totalEligibleShares: '19874800',
      warnings: [
        { code: 'MISSING_TAX_FORM', detail: '12 holders missing W-9', severity: 'WARNING' },
        { code: 'MISSING_PAYMENT_INSTRUCTIONS', detail: '8 holders without ACH instructions', severity: 'WARNING' },
      ],
      withholdingAmountCents: 6_585_600,
    },
    createdAt: '2026-01-10T15:30:00Z',
    createdBy: 'Krishna Ajmeri',
    currency: 'USD',
    declarationDate: '2026-01-14',
    dividendType: 'CASH',
    exDividendDate: '2026-01-21',
    id: 'div_q4_2025_mrdn',
    issuer: MERIDIAN,
    notes: 'Q4 2025 regular cash dividend. ACH primary, check fallback for unbanked holders.',
    paymentDate: '2026-01-24',
    rateAmount: '0.18',
    rateType: 'PER_SHARE',
    recordDate: '2026-01-22',
    security: COMMON,
    status: 'CALCULATED',
    totalPayableCents: 351_092_400,
    updatedAt: '2026-01-22T05:30:00Z',
    version: 7,
  },
  {
    approvedAt: '2025-10-10T20:00:00Z',
    calculatedAt: '2025-10-22T05:30:00Z',
    calculatedSummary: {
      eligibleHolderCount: 18_998,
      excludedHolderCount: 64,
      grossAmountCents: 341_200_200,
      netAmountCents: 334_376_196,
      totalEligibleShares: '20070000',
      warnings: [],
      withholdingAmountCents: 6_824_004,
    },
    createdAt: '2025-10-04T15:30:00Z',
    currency: 'USD',
    declarationDate: '2025-10-10',
    dividendType: 'CASH',
    exDividendDate: '2025-10-21',
    id: 'div_q3_2025_mrdn',
    issuer: MERIDIAN,
    paymentDate: '2025-10-24',
    rateAmount: '0.17',
    rateType: 'PER_SHARE',
    recordDate: '2025-10-22',
    security: COMMON,
    status: 'PAID',
    totalPayableCents: 334_376_196,
    updatedAt: '2025-10-26T16:00:00Z',
    version: 12,
  },
  {
    approvedAt: '2025-07-18T20:00:00Z',
    calculatedSummary: {
      eligibleHolderCount: 18_842,
      excludedHolderCount: 50,
      grossAmountCents: 337_819_000,
      netAmountCents: 331_062_620,
      totalEligibleShares: '19871700',
      warnings: [],
      withholdingAmountCents: 6_756_380,
    },
    createdAt: '2025-07-15T15:30:00Z',
    currency: 'USD',
    declarationDate: '2025-07-18',
    dividendType: 'CASH',
    exDividendDate: '2025-07-22',
    id: 'div_q2_2025_mrdn',
    issuer: MERIDIAN,
    paymentDate: '2025-07-25',
    rateAmount: '0.17',
    rateType: 'PER_SHARE',
    recordDate: '2025-07-23',
    security: COMMON,
    status: 'ARCHIVED',
    totalPayableCents: 331_062_620,
    updatedAt: '2025-08-04T19:00:00Z',
    version: 18,
  },
  {
    createdAt: '2026-04-12T17:00:00Z',
    createdBy: 'Krishna Ajmeri',
    currency: 'USD',
    declarationDate: '2026-04-15',
    dividendType: 'CASH',
    exDividendDate: '2026-04-22',
    id: 'div_q1_2026_mrdn',
    issuer: MERIDIAN,
    notes: 'Proposed Q1 2026 dividend. Awaiting board sign-off.',
    paymentDate: '2026-04-25',
    rateAmount: '0.19',
    rateType: 'PER_SHARE',
    recordDate: '2026-04-23',
    security: COMMON,
    status: 'DRAFT',
    updatedAt: '2026-04-12T17:00:00Z',
    version: 1,
  },
  {
    createdAt: '2026-04-04T11:00:00Z',
    currency: 'USD',
    declarationDate: '2026-04-08',
    dividendType: 'SPECIAL_CASH',
    exDividendDate: '2026-04-21',
    id: 'div_special_halc',
    issuer: HALCYON,
    notes: 'One-time special cash distribution. Pending CFO sign-off.',
    paymentDate: '2026-04-29',
    rateAmount: '0.85',
    rateType: 'PER_SHARE',
    recordDate: '2026-04-22',
    security: HALC_COMMON,
    status: 'PENDING_APPROVAL',
    updatedAt: '2026-04-09T15:00:00Z',
    version: 3,
  },
  {
    approvedAt: '2026-04-15T17:00:00Z',
    createdAt: '2026-04-09T11:00:00Z',
    currency: 'USD',
    declarationDate: '2026-04-12',
    dividendType: 'CASH',
    exDividendDate: '2026-04-21',
    id: 'div_q1_2026_rdg',
    issuer: RIDGEFIELD,
    paymentDate: '2026-04-30',
    rateAmount: '1.20',
    rateType: 'FIXED_AMOUNT',
    recordDate: '2026-04-22',
    security: RDG_PREF,
    status: 'APPROVED',
    updatedAt: '2026-04-15T17:00:00Z',
    version: 4,
  },
  {
    createdAt: '2026-03-30T11:00:00Z',
    currency: 'USD',
    declarationDate: '2026-04-01',
    dividendType: 'CASH',
    exDividendDate: '2026-04-09',
    id: 'div_changes_halc',
    issuer: HALCYON,
    notes: 'Reviewer requested clarifications on funding source.',
    paymentDate: '2026-04-15',
    rateAmount: '0.22',
    rateType: 'PER_SHARE',
    recordDate: '2026-04-10',
    security: HALC_COMMON,
    status: 'CHANGES_REQUESTED',
    updatedAt: '2026-04-04T15:00:00Z',
    version: 5,
  },
]

const Q4_2025_AUDIT: DividendAuditEvent[] = [
  {
    action: 'DIVIDEND_DRAFTED',
    actor: 'Krishna Ajmeri',
    actorRole: 'Issuer · Corporate Secretary',
    at: '2026-01-10T15:30:00Z',
    detail: 'Draft created from prior quarter template',
    id: 'au-1',
  },
  {
    action: 'DIVIDEND_SUBMITTED',
    actor: 'Sophia Chen',
    actorRole: 'CFO',
    at: '2026-01-14T20:02:00Z',
    detail: 'Submitted for board approval',
    id: 'au-2',
  },
  {
    action: 'DIVIDEND_APPROVED',
    actor: 'Yvonne Park',
    actorRole: 'Board Chair',
    at: '2026-01-14T21:15:00Z',
    detail: 'Board approved · 5/5 votes',
    id: 'au-3',
  },
  {
    action: 'DIVIDEND_COMMUNICATION_APPROVED',
    actor: 'Maya Ruiz',
    actorRole: 'Compliance',
    at: '2026-01-15T19:30:00Z',
    detail: 'Shareholder notice approved for distribution',
    id: 'au-4',
  },
  {
    action: 'DIVIDEND_ELIGIBILITY_LOCKED',
    actor: 'Daniel Chen',
    actorRole: 'TA Operator',
    at: '2026-01-22T05:00:00Z',
    detail: '19,210 eligible · 87 excluded',
    id: 'au-5',
  },
  {
    action: 'DIVIDEND_CALCULATED',
    actor: 'Daniel Chen',
    actorRole: 'TA Operator',
    at: '2026-01-22T05:30:00Z',
    detail: 'Gross $3.58M · Net $3.51M (calc v7)',
    id: 'au-6',
  },
]

export function getDashboard(): DividendDashboardData {
  const all = MOCK_DIVIDENDS
  const byStatus = Array.from(all.reduce((m, d) => m.set(d.status, (m.get(d.status) ?? 0) + 1), new Map<DividendEvent['status'], number>()))
    .map(([status, count]) => ({ count, status }))
    .sort((a, b) => b.count - a.count)
  return {
    byStatus,
    failedReturnedCount: 6,
    pendingApprovals: all.filter(d => d.status === 'PENDING_APPROVAL' || d.status === 'CHANGES_REQUESTED').length,
    recentlyCompleted: all.filter(d => d.status === 'PAID' || d.status === 'RECONCILED' || d.status === 'ARCHIVED').slice(0, 4),
    requiringAttention: all.filter(d =>
      ['CALCULATED', 'CHANGES_REQUESTED', 'ELIGIBILITY_LOCKED', 'PARTIALLY_PAID', 'PENDING_APPROVAL'].includes(d.status),
    ),
    totalDeclaredCents: all.reduce((sum, d) => sum + (d.totalPayableCents ?? 0), 0),
    totalPayableCents: all
      .filter(d => ['CALCULATED', 'ELIGIBILITY_LOCKED', 'PARTIALLY_PAID', 'PAYMENT_SCHEDULED'].includes(d.status))
      .reduce((sum, d) => sum + (d.totalPayableCents ?? 0), 0),
    upcomingPayments: all
      .filter(d => new Date(d.paymentDate).getTime() >= Date.now() - 1000 * 60 * 60 * 24 * 30)
      .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
      .slice(0, 4),
  }
}

export function listDividends(filter: DeclarationsFilter = {}): DividendEvent[] {
  return MOCK_DIVIDENDS.filter(d => {
    if (filter.status && d.status !== filter.status) return false
    if (filter.dividendType && d.dividendType !== filter.dividendType) return false
    if (filter.issuerId && d.issuer.id !== filter.issuerId) return false
    if (filter.securityId && d.security.id !== filter.securityId) return false
    if (filter.startDate && d.recordDate < filter.startDate) return false
    if (filter.endDate && d.paymentDate > filter.endDate) return false
    if (filter.query) {
      const q = filter.query.toLowerCase()
      const hay = `${d.issuer.name} ${d.security.label} ${d.id} ${d.notes ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function getDividend(id: string): DividendEventDetail {
  const base = MOCK_DIVIDENDS.find(d => d.id === id) ?? MOCK_DIVIDENDS[0]
  const workflow = workflowFor(base)
  return {
    ...base,
    allowedActions: allowedActionsFor(base.status),
    approvalHistory: base.id === 'div_q4_2025_mrdn' ? MOCK_APPROVALS : [],
    warnings: collectWarnings(workflow),
    workflow,
  }
}

function workflowFor(d: DividendEvent): WorkflowStep[] {
  if (d.id === 'div_q4_2025_mrdn') return Q4_2025_WORKFLOW
  if (d.status === 'DRAFT' || d.status === 'PENDING_APPROVAL' || d.status === 'CHANGES_REQUESTED') return Q2_2025_DRAFT_WORKFLOW
  return Q3_2025_WORKFLOW
}

function collectWarnings(steps: WorkflowStep[]) {
  return steps.flatMap(s => s.warnings ?? [])
}

function allowedActionsFor(status: DividendEvent['status']): DividendEventDetail['allowedActions'] {
  switch (status) {
    case 'APPROVED':
      return ['lockEligibility', 'cancel']
    case 'ARCHIVED':
      return []
    case 'CALCULATED':
      return ['cancel']
    case 'CANCELLED':
      return []
    case 'CHANGES_REQUESTED':
      return ['edit', 'submit', 'cancel']
    case 'DRAFT':
      return ['edit', 'submit', 'cancel']
    case 'ELIGIBILITY_LOCKED':
      return ['calculate', 'cancel']
    case 'PAID':
      return ['archive']
    case 'PARTIALLY_PAID':
      return []
    case 'PAYMENT_SCHEDULED':
      return []
    case 'PENDING_APPROVAL':
      return ['approve', 'reject', 'requestChanges']
    case 'RECONCILED':
      return ['archive']
    case 'REJECTED':
      return ['edit']
    default:
      return []
  }
}

export function getEligibilitySnapshot(dividendId: string): EligibilitySnapshot {
  const summary: CalculatedSummary | undefined = MOCK_DIVIDENDS.find(d => d.id === dividendId)?.calculatedSummary
  return {
    createdAt: '2026-01-22T05:00:00Z',
    excludedHolderCount: summary?.excludedHolderCount ?? 12,
    holders: HOLDERS,
    id: 'snap_' + dividendId,
    locked: dividendId === 'div_q4_2025_mrdn' || dividendId === 'div_q3_2025_mrdn',
    recordDate: '2026-01-22',
    totalEligibleHolders: summary?.eligibleHolderCount ?? 9,
    totalEligibleShares: summary?.totalEligibleShares ?? '12345',
    warnings: [
      { code: 'MISSING_TAX_FORM', detail: '12 holders missing W-9', severity: 'WARNING' },
      { code: 'HOLDER_BLOCKED', detail: '2 OFAC holds', severity: 'ERROR' },
    ],
  }
}

const HOLDERS = [
  {
    accountId: 'AC-1102',
    excluded: false,
    shareholderId: 'SH-00112',
    shareholderName: 'Hayes, Eleanor',
    sharesHeld: '4250',
    taxFormStatus: 'W9_ON_FILE' as const,
    taxResidency: 'US',
  },
  {
    accountId: 'AC-1190',
    excluded: false,
    shareholderId: 'SH-02119',
    shareholderName: 'Pemberton Trust',
    sharesHeld: '180000',
    taxFormStatus: 'MISSING' as const,
    taxResidency: 'US',
  },
  {
    accountId: 'AC-2241',
    excluded: false,
    shareholderId: 'SH-33712',
    shareholderName: 'Okada, Kenji',
    sharesHeld: '12300',
    taxFormStatus: 'W8BEN_ON_FILE' as const,
    taxResidency: 'JP',
  },
  {
    accountId: 'AC-3308',
    excluded: false,
    shareholderId: 'SH-10284',
    shareholderName: 'Nguyen, Thuy',
    sharesHeld: '892',
    taxFormStatus: 'W9_ON_FILE' as const,
    taxResidency: 'US',
  },
  {
    accountId: 'AC-4419',
    disqualificationReason: 'OFAC review',
    excluded: true,
    shareholderId: 'SH-88102',
    shareholderName: 'Sterling Holdings, Ltd.',
    sharesHeld: '0',
    taxFormStatus: 'PENDING' as const,
    taxResidency: 'GB',
  },
  {
    accountId: 'AC-7714',
    excluded: false,
    shareholderId: 'SH-71210',
    shareholderName: 'Ortega, Miguel',
    sharesHeld: '3120',
    taxFormStatus: 'W9_ON_FILE' as const,
    taxResidency: 'US',
  },
  {
    accountId: 'AC-9923',
    disqualificationReason: 'Address RTS',
    excluded: true,
    shareholderId: 'SH-88103',
    shareholderName: 'Ellis Family Trust',
    sharesHeld: '54',
    taxFormStatus: 'EXPIRED' as const,
    taxResidency: 'US',
  },
  {
    accountId: 'AC-5571',
    excluded: false,
    shareholderId: 'SH-44022',
    shareholderName: 'Harlow, Dominic',
    sharesHeld: '2100',
    taxFormStatus: 'UNKNOWN' as const,
    taxResidency: 'UNKNOWN',
  },
]

export function listEntitlements(dividendId: string): Entitlement[] {
  const dividend = MOCK_DIVIDENDS.find(d => d.id === dividendId) ?? MOCK_DIVIDENDS[0]
  return HOLDERS.filter(h => !h.excluded).map((h, i) => {
    const sharesNum = parseFloat(h.sharesHeld)
    const rate = parseFloat(dividend.rateAmount)
    const grossCents = Math.round(sharesNum * rate * 100)
    const withholding = h.taxFormStatus === 'MISSING' || h.taxResidency === 'UNKNOWN' ? 0.24 : h.taxResidency === 'JP' ? 0.1 : 0
    const withholdingCents = Math.round(grossCents * withholding)
    const reason =
      withholding === 0
        ? 'DOMESTIC_NONE'
        : h.taxFormStatus === 'MISSING'
          ? 'BACKUP'
          : h.taxResidency === 'JP'
            ? 'TREATY'
            : 'FOREIGN_DEFAULT'
    return {
      calculationVersion: 7,
      currency: 'USD',
      grossAmountCents: grossCents,
      id: `ent_${dividendId}_${i}`,
      netAmountCents: grossCents - withholdingCents,
      paymentMethod: i % 4 === 0 ? 'DRIP' : i % 5 === 0 ? 'CHECK' : 'ACH',
      paymentStatus: 'PENDING',
      shareholderId: h.shareholderId,
      shareholderName: h.shareholderName,
      sharesEligible: h.sharesHeld,
      taxFormStatus: h.taxFormStatus,
      taxResidency: h.taxResidency,
      treatyRate: h.taxResidency === 'JP' ? '10' : undefined,
      withholdingAmountCents: withholdingCents,
      withholdingReason: reason,
    }
  })
}

export function listBatches(dividendId: string): PaymentBatch[] {
  if (dividendId !== 'div_q4_2025_mrdn' && dividendId !== 'div_q3_2025_mrdn') return []
  return [
    {
      batchNumber: 'BATCH-001',
      createdAt: '2026-01-23T14:00:00Z',
      createdBy: 'Daniel Chen',
      currency: 'USD',
      dividendId,
      grossTotalCents: 357_678_000,
      id: `dbt_${dividendId}_1`,
      netTotalCents: 351_092_400,
      paymentCount: 19_123,
      paymentDate: '2026-01-24',
      status: dividendId === 'div_q4_2025_mrdn' ? 'SCHEDULED' : 'RECONCILED',
      withholdingTotalCents: 6_585_600,
    },
    {
      batchNumber: 'BATCH-002',
      createdAt: '2026-01-23T14:30:00Z',
      currency: 'USD',
      dividendId,
      grossTotalCents: 1_842_000,
      id: `dbt_${dividendId}_2`,
      netTotalCents: 1_842_000,
      paymentCount: 87,
      paymentDate: '2026-01-24',
      status: dividendId === 'div_q4_2025_mrdn' ? 'DRAFT' : 'RECONCILED',
      withholdingTotalCents: 0,
    },
  ]
}

export function getBatch(batchId: string): PaymentBatchDetail {
  const dividendId = batchId.includes('q3_2025') ? 'div_q3_2025_mrdn' : 'div_q4_2025_mrdn'
  const base = listBatches(dividendId).find(b => b.id === batchId) ?? listBatches(dividendId)[0]
  const ents = listEntitlements(dividendId)
  const payments = ents.map((e, idx) => ({
    currency: e.currency,
    entitlementId: e.id,
    externalPaymentReference: idx % 7 === 0 ? `ACH-${1000 + idx}` : undefined,
    failureReason: idx === 1 ? 'Account closed' : undefined,
    grossAmountCents: e.grossAmountCents,
    id: `dpy_${batchId}_${idx}`,
    netAmountCents: e.netAmountCents,
    paidAt: idx > 1 && idx < 4 ? '2026-01-24T18:00:00Z' : undefined,
    paymentMethod: e.paymentMethod ?? ('ACH' as const),
    paymentStatus:
      idx === 0
        ? ('SCHEDULED' as const)
        : idx === 1
          ? ('FAILED' as const)
          : idx === 2
            ? ('PAID' as const)
            : idx === 3
              ? ('PAID' as const)
              : idx === 4
                ? ('RETURNED' as const)
                : ('SCHEDULED' as const),
    reconciledAt: undefined,
    shareholderId: e.shareholderId,
    shareholderName: e.shareholderName,
    withholdingAmountCents: e.withholdingAmountCents,
  }))
  const distribution = payments.reduce(
    (m, p) => m.set(p.paymentStatus, (m.get(p.paymentStatus) ?? 0) + 1),
    new Map<(typeof payments)[number]['paymentStatus'], number>(),
  )
  return {
    ...base,
    payments,
    statusDistribution: Array.from(distribution).map(([status, count]) => ({ count, status })),
  }
}

export function listAuditEvents(dividendId: string): DividendAuditEvent[] {
  if (dividendId === 'div_q4_2025_mrdn') return Q4_2025_AUDIT
  return Q4_2025_AUDIT.slice(0, 3)
}
