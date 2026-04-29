/**
 * Shareholder-facing dividend data.
 *
 * Shareholders only ever see their own dividends — these accessors are scoped
 * to the authenticated viewer (`me`) and never expose other holders. When
 * `NEXT_PUBLIC_API_URL` is set the live `/me/dividends` endpoints take over;
 * otherwise the local fixtures keep the prototype self-contained.
 */

import { withApiAuthHeaders } from '../api/auth-headers'
import { API_BASE, apiUrl } from '../api/base-url'

import { ENTITLEMENT_STATUS_LABEL, ENTITLEMENT_STATUS_TONE, formatCents, formatDate } from './copy'
import type { DividendType, EntitlementPaymentStatus, PaymentStatus, TaxFormStatus, WithholdingReason } from './types'

export const SHAREHOLDER_STATUS_LABEL = ENTITLEMENT_STATUS_LABEL
export const SHAREHOLDER_STATUS_TONE = ENTITLEMENT_STATUS_TONE

export type ShareholderProfile = {
  accountNumber: string
  achInstructionsOnFile: boolean
  email: string
  initials: string
  mailingAddressOnFile: boolean
  name: string
  shareholderId: string
  taxFormStatus: TaxFormStatus
  taxResidency: string
}

export type ShareholderDividend = {
  /** When `paid` is true the funds are released; otherwise the date is informational. */
  currency: string
  /** UI-friendly date strings already formatted for the locale. */
  declarationDate: string
  description?: string
  dividendType: DividendType
  exDividendDate?: string
  externalReference?: string
  /** Net amount in integer cents. */
  grossCents: number
  id: string
  issuerName: string
  issuerTicker?: string
  netCents: number
  paidAt?: string
  paymentDate: string
  paymentMethod: 'ACH' | 'CHECK' | 'DRIP' | 'WIRE'
  paymentStatus: EntitlementPaymentStatus
  payoutEvents: ShareholderPaymentEvent[]
  /** Per-share rate as decimal string (preserves precision). */
  rateAmount: string
  recordDate: string
  securityClass?: string
  securityLabel: string
  /** Eligible share count as decimal string (supports fractions). */
  sharesEligible: string
  treatyRate?: string
  withholdingCents: number
  withholdingReason: WithholdingReason
}

export type ShareholderPaymentEvent = {
  /** Empty when the event hasn't happened yet (upcoming step). */
  at?: string
  detail?: string
  state: 'BLOCKED' | 'DONE' | 'IN_PROGRESS' | 'PENDING'
  title: string
}

export type ShareholderMissingInfo = {
  cta?: { href: string; label: string }
  detail: string
  fixHowTo?: string
  id: string
  severity: 'high' | 'low' | 'medium'
  title: string
}

export type ShareholderDividendOverview = {
  failedReturnedCount: number
  missingInfo: ShareholderMissingInfo[]
  pendingPayments: number
  recentlyPaid: ShareholderDividend[]
  totalPaidYtdCents: number
  upcoming: ShareholderDividend[]
  ytdWithholdingCents: number
}

export type ShareholderStatement = {
  account: string
  currency: string
  dividend: ShareholderDividend
  generatedAt: string
  shareholderName: string
  statementId: string
}

const ME: ShareholderProfile = {
  accountNumber: 'AC-1102',
  achInstructionsOnFile: true,
  email: 'eleanor.hayes@example.com',
  initials: 'EH',
  mailingAddressOnFile: true,
  name: 'Eleanor Hayes',
  shareholderId: 'SH-00112',
  taxFormStatus: 'W9_ON_FILE',
  taxResidency: 'US',
}

const MOCK_DIVIDENDS: ShareholderDividend[] = [
  {
    currency: 'USD',
    declarationDate: '2026-01-14',
    description: 'Q4 2025 cash dividend — regular quarterly payout.',
    dividendType: 'CASH',
    exDividendDate: '2026-01-21',
    grossCents: 22_320,
    id: 'div_q4_2025_mrdn',
    issuerName: 'Meridian Optics, Inc.',
    issuerTicker: 'MRDN',
    netCents: 22_320,
    paymentDate: '2026-01-24',
    paymentMethod: 'ACH',
    paymentStatus: 'SCHEDULED',
    payoutEvents: [
      { at: '2026-01-14T20:02:00Z', state: 'DONE', title: 'Dividend declared' },
      { at: '2026-01-22T05:30:00Z', detail: 'Captured holders as of record date', state: 'DONE', title: 'Eligibility locked' },
      {
        at: '2026-01-23T15:00:00Z',
        detail: 'Net $223.20 scheduled to ACH ••4512',
        state: 'IN_PROGRESS',
        title: 'Payment scheduled',
      },
      { at: '2026-01-24T18:00:00Z', detail: 'Funds release', state: 'PENDING', title: 'Funds released' },
    ],
    rateAmount: '0.18',
    recordDate: '2026-01-22',
    securityClass: 'Common stock',
    securityLabel: 'MRDN — Common',
    sharesEligible: '1240',
    withholdingCents: 0,
    withholdingReason: 'DOMESTIC_NONE',
  },
  {
    currency: 'USD',
    declarationDate: '2025-10-10',
    description: 'Q3 2025 cash dividend',
    dividendType: 'CASH',
    exDividendDate: '2025-10-21',
    externalReference: 'ACH-1042',
    grossCents: 21_080,
    id: 'div_q3_2025_mrdn',
    issuerName: 'Meridian Optics, Inc.',
    issuerTicker: 'MRDN',
    netCents: 21_080,
    paidAt: '2025-10-24T18:00:00Z',
    paymentDate: '2025-10-24',
    paymentMethod: 'ACH',
    paymentStatus: 'PAID',
    payoutEvents: [
      { at: '2025-10-10T20:00:00Z', state: 'DONE', title: 'Dividend declared' },
      { at: '2025-10-22T05:30:00Z', state: 'DONE', title: 'Eligibility locked' },
      { at: '2025-10-23T15:00:00Z', state: 'DONE', title: 'Payment scheduled' },
      { at: '2025-10-24T18:00:00Z', detail: 'Sent via ACH ••4512', state: 'DONE', title: 'Funds released' },
    ],
    rateAmount: '0.17',
    recordDate: '2025-10-22',
    securityClass: 'Common stock',
    securityLabel: 'MRDN — Common',
    sharesEligible: '1240',
    withholdingCents: 0,
    withholdingReason: 'DOMESTIC_NONE',
  },
  {
    currency: 'USD',
    declarationDate: '2025-07-18',
    description: 'Q2 2025 cash dividend',
    dividendType: 'CASH',
    exDividendDate: '2025-07-22',
    externalReference: 'ACH-0982',
    grossCents: 21_080,
    id: 'div_q2_2025_mrdn',
    issuerName: 'Meridian Optics, Inc.',
    issuerTicker: 'MRDN',
    netCents: 21_080,
    paidAt: '2025-07-25T18:00:00Z',
    paymentDate: '2025-07-25',
    paymentMethod: 'ACH',
    paymentStatus: 'PAID',
    payoutEvents: [
      { at: '2025-07-18T20:00:00Z', state: 'DONE', title: 'Dividend declared' },
      { at: '2025-07-23T05:30:00Z', state: 'DONE', title: 'Eligibility locked' },
      { at: '2025-07-25T18:00:00Z', detail: 'Sent via ACH ••4512', state: 'DONE', title: 'Funds released' },
    ],
    rateAmount: '0.17',
    recordDate: '2025-07-23',
    securityClass: 'Common stock',
    securityLabel: 'MRDN — Common',
    sharesEligible: '1240',
    withholdingCents: 0,
    withholdingReason: 'DOMESTIC_NONE',
  },
  {
    currency: 'USD',
    declarationDate: '2025-04-12',
    description: 'Q1 2025 cash dividend',
    dividendType: 'CASH',
    exDividendDate: '2025-04-23',
    externalReference: 'ACH-0871',
    grossCents: 19_840,
    id: 'div_q1_2025_mrdn',
    issuerName: 'Meridian Optics, Inc.',
    issuerTicker: 'MRDN',
    netCents: 19_840,
    paidAt: '2025-04-26T18:00:00Z',
    paymentDate: '2025-04-26',
    paymentMethod: 'ACH',
    paymentStatus: 'PAID',
    payoutEvents: [
      { at: '2025-04-12T20:00:00Z', state: 'DONE', title: 'Dividend declared' },
      { at: '2025-04-24T05:30:00Z', state: 'DONE', title: 'Eligibility locked' },
      { at: '2025-04-26T18:00:00Z', detail: 'Sent via ACH ••4512', state: 'DONE', title: 'Funds released' },
    ],
    rateAmount: '0.16',
    recordDate: '2025-04-24',
    securityClass: 'Common stock',
    securityLabel: 'MRDN — Common',
    sharesEligible: '1240',
    withholdingCents: 0,
    withholdingReason: 'DOMESTIC_NONE',
  },
  {
    currency: 'USD',
    declarationDate: '2026-04-08',
    description: 'Special one-time cash distribution. Awaiting CFO approval.',
    dividendType: 'SPECIAL_CASH',
    exDividendDate: '2026-04-21',
    grossCents: 68_000,
    id: 'div_special_halc',
    issuerName: 'Halcyon Industrial Co.',
    issuerTicker: 'HALC',
    netCents: 51_680,
    paymentDate: '2026-04-29',
    paymentMethod: 'ACH',
    paymentStatus: 'PENDING',
    payoutEvents: [
      { at: '2026-04-08T16:00:00Z', state: 'DONE', title: 'Dividend declared' },
      { detail: 'Pending approval', state: 'IN_PROGRESS', title: 'Eligibility lock' },
      { state: 'PENDING', title: 'Payment scheduled' },
      { state: 'PENDING', title: 'Funds released' },
    ],
    rateAmount: '0.85',
    recordDate: '2026-04-22',
    securityClass: 'Common stock',
    securityLabel: 'HALC — Common',
    sharesEligible: '800',
    treatyRate: undefined,
    withholdingCents: 16_320,
    withholdingReason: 'BACKUP',
  },
  {
    currency: 'USD',
    declarationDate: '2026-01-10',
    description: 'Restricted lot — paid as DRIP per registration default.',
    dividendType: 'CASH',
    exDividendDate: '2026-01-22',
    externalReference: 'DRIP-04122',
    grossCents: 4_000,
    id: 'div_q4_2025_rdg',
    issuerName: 'Ridgefield Energy Holdings',
    issuerTicker: 'RDG',
    netCents: 4_000,
    paidAt: '2026-01-24T18:00:00Z',
    paymentDate: '2026-01-24',
    paymentMethod: 'DRIP',
    paymentStatus: 'PAID',
    payoutEvents: [
      { at: '2026-01-10T18:00:00Z', state: 'DONE', title: 'Dividend declared' },
      { at: '2026-01-22T05:30:00Z', state: 'DONE', title: 'Eligibility locked' },
      { at: '2026-01-24T18:00:00Z', detail: '2.083 shares reinvested · $0.04 cash residual', state: 'DONE', title: 'DRIP shares issued' },
    ],
    rateAmount: '0.016',
    recordDate: '2026-01-22',
    securityClass: 'Common stock',
    securityLabel: 'RDG — Common',
    sharesEligible: '2500',
    withholdingCents: 0,
    withholdingReason: 'DOMESTIC_NONE',
  },
]

const MOCK_FAILED_BANNER: ShareholderMissingInfo[] = [
  {
    cta: { href: '/investor/tax', label: 'Update W-9 (2025)' },
    detail: 'Your most recent W-9 is from 2024 — refresh it to keep your dividends paid without backup withholding.',
    fixHowTo: 'Sign electronically · 2 min',
    id: 'mi-w9',
    severity: 'medium',
    title: 'W-9 needs a refresh',
  },
]

export async function fetchMyProfile(): Promise<ShareholderProfile> {
  return tryFetch('/me', () => ME)
}

export async function fetchMyDividendOverview(): Promise<ShareholderDividendOverview> {
  return tryFetch('/me/dividends/overview', () => buildOverview())
}

export async function fetchMyDividends(): Promise<ShareholderDividend[]> {
  return tryFetch('/me/dividends', () =>
    [...MOCK_DIVIDENDS].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
  )
}

export async function fetchMyDividend(id: string): Promise<null | ShareholderDividend> {
  return tryFetch(`/me/dividends/${encodeURIComponent(id)}`, () => MOCK_DIVIDENDS.find(d => d.id === id) ?? null)
}

export async function fetchMyStatement(id: string): Promise<null | ShareholderStatement> {
  const dividend = await fetchMyDividend(id)
  if (!dividend) return null
  const profile = await fetchMyProfile()
  return {
    account: profile.accountNumber,
    currency: dividend.currency,
    dividend,
    generatedAt: new Date().toISOString(),
    shareholderName: profile.name,
    statementId: `stmt_${dividend.id}_${profile.shareholderId}`,
  }
}

function buildOverview(): ShareholderDividendOverview {
  const now = Date.now()
  const upcoming = MOCK_DIVIDENDS.filter(d => new Date(d.paymentDate).getTime() >= now - 1000 * 60 * 60 * 24)
    .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
    .filter(d => d.paymentStatus !== 'PAID')
  const recentlyPaid = MOCK_DIVIDENDS.filter(d => d.paymentStatus === 'PAID')
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
    .slice(0, 4)

  const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime()
  const ytdPaid = MOCK_DIVIDENDS.filter(d => d.paymentStatus === 'PAID' && d.paidAt && new Date(d.paidAt).getTime() >= startOfYear)
  const totalPaidYtdCents = ytdPaid.reduce((sum, d) => sum + d.netCents, 0)
  const ytdWithholdingCents = ytdPaid.reduce((sum, d) => sum + d.withholdingCents, 0)
  const failedReturnedCount = MOCK_DIVIDENDS.filter(d => d.paymentStatus === 'FAILED' || d.paymentStatus === 'RETURNED').length
  const pendingPayments = MOCK_DIVIDENDS.filter(d => ['PENDING', 'PROCESSING', 'SCHEDULED'].includes(d.paymentStatus)).length

  const missingInfo: ShareholderMissingInfo[] = []
  if (MOCK_DIVIDENDS.some(d => d.withholdingReason === 'BACKUP')) {
    missingInfo.push(...MOCK_FAILED_BANNER)
  }

  return {
    failedReturnedCount,
    missingInfo,
    pendingPayments,
    recentlyPaid,
    totalPaidYtdCents,
    upcoming,
    ytdWithholdingCents,
  }
}

export function describeStatus(status: PaymentStatus): { description: string; reassuring: string } {
  switch (status) {
    case 'CANCELLED':
      return { description: 'Cancelled', reassuring: 'This dividend was cancelled by the issuer. No action needed.' }
    case 'FAILED':
      return {
        description: 'Payment failed',
        reassuring: 'Proxi will retry automatically once your payment instructions are updated.',
      }
    case 'PAID':
      return { description: 'Paid', reassuring: 'Funds released to your account on the payment date.' }
    case 'PENDING':
      return { description: 'Pending', reassuring: 'The issuer is still finalizing this dividend.' }
    case 'PROCESSING':
      return { description: 'Processing', reassuring: 'Your bank is processing the funds — typically 1–2 business days.' }
    case 'RECONCILED':
      return { description: 'Settled', reassuring: 'Funds confirmed on both ends.' }
    case 'RETURNED':
      return {
        description: 'Returned',
        reassuring: 'Your bank returned the payment. We’ll reach out to confirm the right account.',
      }
    case 'SCHEDULED':
      return { description: 'Scheduled', reassuring: 'Funds will release on the payment date.' }
  }
}

async function tryFetch<T>(path: string, fallback: () => T): Promise<T> {
  if (!API_BASE) return fallback()
  try {
    const url = apiUrl(path)
    if (!url) return fallback()
    const res = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      headers: withApiAuthHeaders(),
    })
    if (!res.ok) return fallback()
    return (await res.json()) as T
  } catch {
    return fallback()
  }
}

export const _formatters = { formatCents, formatDate }
