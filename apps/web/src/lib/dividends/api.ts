/**
 * Frontend data accessors for the dividend module.
 *
 * These are deliberately thin wrappers around the local mock data so pages can
 * read like real API calls. When `NEXT_PUBLIC_API_URL` is configured we fall
 * through to the live API; otherwise we return fixtures so the UI works in
 * isolation. Either way, callers receive the same typed contracts.
 */

import { withApiAuthHeaders } from '../api/auth-headers'
import { API_BASE, apiUrl } from '../api/base-url'

import {
  getBatch as mockBatch,
  getDashboard as mockDashboard,
  getDividend as mockDividend,
  getEligibilitySnapshot as mockSnapshot,
  listAuditEvents as mockAudit,
  listBatches as mockBatches,
  listDividends as mockListDividends,
  listEntitlements as mockEntitlements,
} from './mock'
import type {
  DeclarationsFilter,
  DividendAuditEvent,
  DividendDashboardData,
  DividendEvent,
  DividendEventDetail,
  DividendFormIssuerOption,
  DividendFormSecurityOption,
  EligibilitySnapshot,
  Entitlement,
  PaymentBatch,
  PaymentBatchDetail,
} from './types'

async function tryFetch<T>(path: string, fallback: () => T): Promise<T> {
  if (!API_BASE) return fallback()
  try {
    const url = apiUrl(path)
    if (!url) return fallback()
    const res = await fetch(url, { cache: 'no-store', credentials: 'include', headers: withApiAuthHeaders() })
    if (!res.ok) return fallback()
    return (await res.json()) as T
  } catch {
    return fallback()
  }
}

export async function fetchDashboard(): Promise<DividendDashboardData> {
  // No `/dividends/dashboard` endpoint on the backend by design — the API
  // exposes the underlying primitives (`/dividends`, `/dividends/reports/summary`)
  // and the dashboard view is composed client-side from those. We retain the
  // mock fixture as the canonical default so the UI works in isolation.
  return mockDashboard()
}

export async function fetchDividends(filter: DeclarationsFilter = {}): Promise<DividendEvent[]> {
  const qs = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v !== undefined && v !== '') as Array<[string, string]>,
  ).toString()
  return tryFetch(`/dividends${qs ? `?${qs}` : ''}`, () => mockListDividends(filter))
}

export async function fetchDividend(id: string): Promise<DividendEventDetail> {
  return tryFetch(`/dividends/${encodeURIComponent(id)}`, () => mockDividend(id))
}

export async function fetchEligibilitySnapshot(dividendId: string): Promise<EligibilitySnapshot> {
  return tryFetch(`/dividends/${encodeURIComponent(dividendId)}/snapshot`, () => mockSnapshot(dividendId))
}

export async function fetchEntitlements(dividendId: string): Promise<Entitlement[]> {
  return tryFetch(`/dividends/${encodeURIComponent(dividendId)}/entitlements`, () => mockEntitlements(dividendId))
}

export async function fetchBatches(dividendId: string): Promise<PaymentBatch[]> {
  return tryFetch(`/dividends/${encodeURIComponent(dividendId)}/batches`, () => mockBatches(dividendId))
}

export async function fetchAllBatches(): Promise<PaymentBatch[]> {
  return tryFetch('/dividends/batches', () => mockListDividends({}).flatMap(d => mockBatches(d.id)))
}

export async function fetchBatch(batchId: string): Promise<PaymentBatchDetail> {
  return tryFetch(`/dividends/batches/${encodeURIComponent(batchId)}`, () => mockBatch(batchId))
}

export async function fetchAuditEvents(dividendId: string): Promise<DividendAuditEvent[]> {
  return tryFetch(`/dividends/${encodeURIComponent(dividendId)}/audit`, () => mockAudit(dividendId))
}

/**
 * AI-assisted review record.
 *
 * Mirrors `DividendAiReviewRecord` on the API. The structured `output`
 * is what the UI card renders; `preflight` carries the deterministic
 * findings the AI prose was grounded against, so reviewers can verify
 * the model didn't fabricate content.
 */
export interface DividendAiReview {
  id: string
  dividendEventId: string
  issuerId: string
  generatedAt: string
  requestedBy: string
  provider: string
  model: string
  promptVersion: string
  dividendStatus: string
  preflight: {
    blocking: boolean
    errorCount: number
    warningCount: number
    infoCount: number
    findings: Array<{
      code: string
      category: string
      severity: 'INFO' | 'WARNING' | 'ERROR'
      message: string
      metadata?: Record<string, unknown>
    }>
  }
  output: {
    summary: string
    risks: string[]
    warnings: string[]
    missingInfo: string[]
    suggestedActions: string[]
    shareholderFriendlyExplanation: string
    confidence: number
  }
  providerError?: string
}

/**
 * Trigger a server-side AI review. Always succeeds (the server falls
 * back to a deterministic baseline when no AI provider is configured),
 * so the UI can treat this as a non-failing button.
 */
export async function runAiReview(dividendId: string): Promise<DividendAiReview | null> {
  const url = apiUrl(`/dividends/${encodeURIComponent(dividendId)}/ai-review`)
  if (!url) return null
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    headers: withApiAuthHeaders(),
    method: 'POST',
  })
  if (!res.ok) return null
  return (await res.json()) as DividendAiReview
}

export async function fetchAiReviews(dividendId: string): Promise<DividendAiReview[]> {
  return tryFetch(`/dividends/${encodeURIComponent(dividendId)}/ai-reviews`, () => [])
}

/**
 * Headline reports summary the issuer dashboard surfaces as a row of
 * cards. Mirrors `DividendsReportsSummary` from the API; we keep it
 * `Partial`-tolerant so missing keys don't break the dashboard render
 * when the live endpoint is offline.
 */
export interface DividendsReportsSummary {
  totalDeclaredCents: number
  totalPaidCents: number
  totalWithholdingCents: number
  unpaidAmountCents: number
  failedPaymentCount: number
  declarationCount: number
  currency: string
  dividendsByStatus: Record<string, number>
  batchesByStatus: Record<string, number>
  window?: { from?: string; to?: string }
}

export async function fetchReportsSummary(
  params: { issuerId?: string; from?: string; to?: string } = {},
): Promise<DividendsReportsSummary> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as Array<[string, string]>,
  ).toString()
  return tryFetch(`/dividends/reports/summary${qs ? `?${qs}` : ''}`, () => {
    const dashboard = mockDashboard()
    return {
      batchesByStatus: {},
      currency: 'USD',
      declarationCount: dashboard.byStatus.reduce((s, x) => s + x.count, 0),
      dividendsByStatus: Object.fromEntries(dashboard.byStatus.map(x => [x.status, x.count])),
      failedPaymentCount: dashboard.failedReturnedCount,
      totalDeclaredCents: dashboard.totalDeclaredCents,
      totalPaidCents: 0,
      totalWithholdingCents: 0,
      unpaidAmountCents: dashboard.totalPayableCents,
    }
  })
}

type IssuersListResponse = {
  items?: Array<{
    id: string
    name: string
    legalName?: string
    metadata?: Record<string, unknown>
  }>
}

type SecuritiesListResponse = {
  items?: Array<{
    id: string
    issuerId: string
    ticker?: string
    name: string
    shareClasses?: Array<{
      name: string
    }>
  }>
}

function buildMockIssuerOptions(): DividendFormIssuerOption[] {
  const byIssuer = new Map<string, DividendFormIssuerOption>()
  for (const d of mockListDividends({})) {
    if (!byIssuer.has(d.issuer.id)) {
      const ticker = d.issuer.ticker ? ` (${d.issuer.ticker})` : ''
      byIssuer.set(d.issuer.id, { id: d.issuer.id, label: `${d.issuer.name}${ticker}` })
    }
  }
  return [...byIssuer.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function buildMockSecurityOptions(): DividendFormSecurityOption[] {
  const bySecurity = new Map<string, DividendFormSecurityOption>()
  for (const d of mockListDividends({})) {
    if (!bySecurity.has(d.security.id)) {
      bySecurity.set(d.security.id, {
        id: d.security.id,
        issuerId: d.issuer.id,
        label: d.security.classLabel ? `${d.security.label} — ${d.security.classLabel}` : d.security.label,
      })
    }
  }
  return [...bySecurity.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export async function fetchIssuerOptions(): Promise<DividendFormIssuerOption[]> {
  if (!API_BASE) return buildMockIssuerOptions()
  const url = apiUrl('/issuers?pageSize=200&sortBy=name&sortDir=asc')
  if (!url) return []
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'include', headers: withApiAuthHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as IssuersListResponse
    const items = data.items ?? []
    if (!items.length) return []
    return items
      .map(issuer => {
        const ticker = typeof issuer.metadata?.ticker === 'string' ? issuer.metadata.ticker : undefined
        const tickerSuffix = ticker ? ` (${ticker})` : ''
        return { id: issuer.id, label: `${issuer.name}${tickerSuffix}` }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

export async function fetchSecurityOptions(): Promise<DividendFormSecurityOption[]> {
  if (!API_BASE) return buildMockSecurityOptions()
  const url = apiUrl('/securities?pageSize=500&sortBy=name&sortDir=asc')
  if (!url) return []
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'include', headers: withApiAuthHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as SecuritiesListResponse
    const items = data.items ?? []
    if (!items.length) return []
    return items
      .map(security => {
        const classLabel = security.shareClasses?.[0]?.name
        const tickerPrefix = security.ticker ? `${security.ticker} — ` : ''
        return {
          id: security.id,
          issuerId: security.issuerId,
          label: classLabel ? `${tickerPrefix}${security.name} (${classLabel})` : `${tickerPrefix}${security.name}`,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

/**
 * Reports & exports.
 *
 * The export endpoints stream `text/csv` with a `Content-Disposition:
 * attachment` header set server-side, so we don't need any custom logic
 * on the client beyond pointing the browser at the URL.
 *
 * `exportUrl()` builds the absolute URL using `NEXT_PUBLIC_API_URL` when
 * set, otherwise falls back to the relative path so the same code can
 * power the local mock-driven dev experience and the live API. The
 * frontend's existing buttons can drop these URLs into a hidden anchor
 * or call `triggerDownload()` to download from a button click handler.
 */
export type DividendExportKind =
  | 'declarations'
  | 'snapshot'
  | 'entitlements'
  | 'batches-summary'
  | 'audit'
  | 'batch-payments'
  | 'failed-payments'
  | 'shareholder-history'

export interface DividendExportLocation {
  /** Absolute or relative URL the browser should fetch. */
  url: string
  /** Suggested filename for the download (the server also sets one). */
  filename: string
}

export function exportUrl(
  kind: DividendExportKind,
  params: {
    dividendId?: string
    batchId?: string
    shareholderId?: string
    issuerId?: string
    from?: string
    to?: string
  } = {},
): DividendExportLocation {
  const base = API_BASE ?? ''
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as Array<[string, string]>)
  switch (kind) {
    case 'audit':
      if (!params.dividendId) throw new Error('audit export requires dividendId')
      return {
        filename: `dividend-${params.dividendId}-audit.csv`,
        url: `${base}/dividends/${encodeURIComponent(params.dividendId)}/exports/audit.csv`,
      }
    case 'batch-payments':
      if (!params.batchId) throw new Error('batch-payments export requires batchId')
      return {
        filename: `dividend-batch-${params.batchId}.csv`,
        url: `${base}/dividends/batches/${encodeURIComponent(params.batchId)}/exports/payments.csv`,
      }
    case 'batches-summary':
      if (!params.dividendId) throw new Error('batches-summary export requires dividendId')
      return {
        filename: `dividend-${params.dividendId}-batches.csv`,
        url: `${base}/dividends/${encodeURIComponent(params.dividendId)}/exports/batches.csv`,
      }
    case 'declarations':
      return {
        filename: 'dividend-declarations.csv',
        url: `${base}/dividends/exports/declarations.csv${qs.toString() ? `?${qs.toString()}` : ''}`,
      }
    case 'entitlements':
      if (!params.dividendId) throw new Error('entitlements export requires dividendId')
      return {
        filename: `dividend-${params.dividendId}-entitlements.csv`,
        url: `${base}/dividends/${encodeURIComponent(params.dividendId)}/exports/entitlements.csv`,
      }
    case 'failed-payments': {
      const url = `${base}/dividends/exports/failed-payments.csv${qs.toString() ? `?${qs.toString()}` : ''}`
      return { filename: 'dividend-failed-payments.csv', url }
    }
    case 'shareholder-history': {
      if (!params.shareholderId) throw new Error('shareholder-history export requires shareholderId')
      const url = `${base}/dividends/shareholders/${encodeURIComponent(params.shareholderId)}/exports/history.csv${
        qs.toString() ? `?${qs.toString()}` : ''
      }`
      return { filename: `shareholder-${params.shareholderId}-dividends.csv`, url }
    }
    case 'snapshot':
      if (!params.dividendId) throw new Error('snapshot export requires dividendId')
      return {
        filename: `dividend-${params.dividendId}-snapshot.csv`,
        url: `${base}/dividends/${encodeURIComponent(params.dividendId)}/exports/snapshot.csv`,
      }
  }
}

/**
 * Trigger a browser download by clicking a temporary anchor. Safe to
 * call inside a React event handler. No-ops on the server.
 */
export function triggerDownload(location: DividendExportLocation): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const a = document.createElement('a')
  a.href = location.url
  a.download = location.filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * URL of the rendered HTML statement for a single shareholder
 * entitlement. Statements are server-rendered (see
 * `dividends.statement.ts`); the shareholder portal links to this URL
 * directly so browser printing / save-as-PDF works without an extra
 * client-side render step.
 */
export function statementUrl(dividendId: string, entitlementId: string): string {
  const url = apiUrl(`/dividends/${encodeURIComponent(dividendId)}/statements/${encodeURIComponent(entitlementId)}/render`)
  return url ?? `/dividends/${encodeURIComponent(dividendId)}/statements/${encodeURIComponent(entitlementId)}/render`
}
