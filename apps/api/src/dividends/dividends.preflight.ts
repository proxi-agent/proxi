/**
 * Deterministic dividend preflight checks.
 *
 * This is the source of truth for everything the AI review layer renders.
 * The AI is only allowed to *describe* findings — never invent them — so
 * by keeping the rule set pure (no DB, no clock, no I/O) we get:
 *
 *   - reproducibility — the same context always yields the same findings
 *   - testability — every rule is covered by the spec sibling
 *   - auditability — the persisted review records `findings` separately
 *     from the AI prose, so reviewers can verify the model didn't fabricate
 *     warnings
 *
 * Contract:
 *   `runPreflightChecks(ctx) -> PreflightReport`
 *
 * Each finding has a stable `code` (UPPER_SNAKE), a `severity`, a category,
 * and a human-readable `message`. UI code can switch on `code`; LLMs see
 * the `message`.
 */

import type {
  DividendCalculatedSummary,
  DividendEligibilitySnapshot,
  DividendEntitlement,
  DividendEvent,
  DividendPayment,
  DividendPaymentBatch,
  DividendStatus,
} from './dividends.types.js'

// ---------- Public types ---------------------------------------------------

export type PreflightSeverity = 'INFO' | 'WARNING' | 'ERROR'

export type PreflightCategory =
  | 'DATES'
  | 'IDENTITY'
  | 'RATE'
  | 'WORKFLOW'
  | 'ELIGIBILITY'
  | 'CALCULATION'
  | 'PAYMENT'
  | 'TAX'
  | 'HISTORICAL'

export interface PreflightFinding {
  code: string
  category: PreflightCategory
  severity: PreflightSeverity
  message: string
  /** Optional structured data the UI/LLM can use without re-parsing the message. */
  metadata?: Record<string, unknown>
}

export interface PreflightReport {
  findings: PreflightFinding[]
  /**
   * Counts by severity, for cheap UI badges. `errorCount > 0` means the
   * declaration should not be progressed without operator action.
   */
  errorCount: number
  warningCount: number
  infoCount: number
  /** True when the deterministic checks see at least one ERROR. */
  blocking: boolean
}

/**
 * Everything the rule engine needs to evaluate a dividend. Callers fetch
 * each piece from the relevant service/repository and pass it in. Every
 * field except `dividend` is optional so partial contexts (e.g. before
 * calculation) still produce useful findings.
 */
export interface ReviewContext {
  dividend: DividendEvent
  snapshot?: DividendEligibilitySnapshot
  entitlements?: ReadonlyArray<DividendEntitlement>
  batches?: ReadonlyArray<DividendPaymentBatch>
  payments?: ReadonlyArray<DividendPayment>
  calculatedSummary?: DividendCalculatedSummary
  /** Has the issuer logged at least one approval decision on this declaration? */
  hasApprovals?: boolean
  /** True if at least one shareholder is missing payment instructions. */
  shareholdersMissingPaymentInstructions?: number
  /** True if at least one shareholder is missing tax info / W-9 / W-8. */
  shareholdersMissingTaxInfo?: number
  /** Prior dividends for the same issuer + security, ordered by recordDate ASC. */
  priorDividends?: ReadonlyArray<
    Pick<DividendEvent, 'id' | 'rateAmount' | 'rateType' | 'recordDate' | 'paymentDate' | 'totalDistributionCents' | 'currency' | 'status'>
  >
}

// ---------- Rule engine ----------------------------------------------------

/** Statuses where the dividend should already have entitlements. */
const POST_CALCULATION: ReadonlySet<DividendStatus> = new Set<DividendStatus>([
  'CALCULATED',
  'PAYMENT_SCHEDULED',
  'PARTIALLY_PAID',
  'PAID',
  'RECONCILED',
  'ARCHIVED',
])

/** Statuses where eligibility should be locked. */
const POST_LOCK: ReadonlySet<DividendStatus> = new Set<DividendStatus>([
  'ELIGIBILITY_LOCKED',
  'CALCULATED',
  'PAYMENT_SCHEDULED',
  'PARTIALLY_PAID',
  'PAID',
  'RECONCILED',
  'ARCHIVED',
])

/** Statuses where approval must already exist. */
const POST_APPROVAL: ReadonlySet<DividendStatus> = new Set<DividendStatus>([
  'APPROVED',
  'ELIGIBILITY_LOCKED',
  'CALCULATED',
  'PAYMENT_SCHEDULED',
  'PARTIALLY_PAID',
  'PAID',
  'RECONCILED',
  'ARCHIVED',
])

const FAILED_PAYMENT_STATUSES = new Set(['FAILED', 'RETURNED'])

/**
 * Run all deterministic checks against a review context.
 *
 * Findings are appended in roughly the order an operator would tackle
 * them: identity → dates → rate → workflow → eligibility → calculation
 * → payment → tax → historical.
 */
export function runPreflightChecks(ctx: ReviewContext): PreflightReport {
  const findings: PreflightFinding[] = []
  const push = (f: PreflightFinding): void => {
    findings.push(f)
  }

  checkIdentity(ctx, push)
  checkDates(ctx, push)
  checkRate(ctx, push)
  checkWorkflow(ctx, push)
  checkEligibility(ctx, push)
  checkCalculation(ctx, push)
  checkPayment(ctx, push)
  checkTax(ctx, push)
  checkHistoricalAnomalies(ctx, push)

  let errorCount = 0
  let warningCount = 0
  let infoCount = 0
  for (const f of findings) {
    if (f.severity === 'ERROR') errorCount++
    else if (f.severity === 'WARNING') warningCount++
    else infoCount++
  }

  return { blocking: errorCount > 0, errorCount, findings, infoCount, warningCount }
}

// ---------- Individual rule groups ----------------------------------------

function checkIdentity(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { dividend } = ctx
  if (!dividend.issuerId) {
    push({ category: 'IDENTITY', code: 'MISSING_ISSUER', message: 'Dividend has no issuer attached.', severity: 'ERROR' })
  }
  if (!dividend.securityId) {
    push({ category: 'IDENTITY', code: 'MISSING_SECURITY', message: 'Dividend has no security/class attached.', severity: 'ERROR' })
  }
  if (!dividend.currency) {
    push({ category: 'IDENTITY', code: 'MISSING_CURRENCY', message: 'Dividend has no currency set.', severity: 'ERROR' })
  }
}

function checkDates(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { declarationDate, recordDate, exDividendDate, paymentDate } = ctx.dividend
  const decl = parseDate(declarationDate)
  const rec = parseDate(recordDate)
  const ex = parseDate(exDividendDate)
  const pay = parseDate(paymentDate)

  if (!rec) {
    push({ category: 'DATES', code: 'MISSING_RECORD_DATE', message: 'Record date is missing.', severity: 'ERROR' })
  }
  if (!pay) {
    push({ category: 'DATES', code: 'MISSING_PAYMENT_DATE', message: 'Payment date is missing.', severity: 'ERROR' })
  }
  if (decl && rec && rec < decl) {
    push({
      category: 'DATES',
      code: 'RECORD_BEFORE_DECLARATION',
      message: 'Record date is before the declaration date.',
      metadata: { declarationDate, recordDate },
      severity: 'ERROR',
    })
  }
  if (rec && pay && pay <= rec) {
    push({
      category: 'DATES',
      code: 'PAYMENT_NOT_AFTER_RECORD',
      message: 'Payment date must be strictly after the record date.',
      metadata: { paymentDate, recordDate },
      severity: 'ERROR',
    })
  }
  if (ex && rec && ex > rec) {
    push({
      category: 'DATES',
      code: 'EX_DIVIDEND_AFTER_RECORD',
      message: 'Ex-dividend date should normally be on or before the record date.',
      metadata: { exDividendDate, recordDate },
      severity: 'WARNING',
    })
  }
  if (rec && pay && daysBetween(rec, pay) > 120) {
    push({
      category: 'DATES',
      code: 'PAYMENT_FAR_FROM_RECORD',
      message: 'Payment date is more than 120 days after the record date — please confirm the schedule.',
      metadata: { paymentDate, recordDate },
      severity: 'INFO',
    })
  }
}

function checkRate(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { rateAmount, rateType } = ctx.dividend
  const numeric = Number(rateAmount)
  if (!rateAmount || Number.isNaN(numeric)) {
    push({ category: 'RATE', code: 'MISSING_RATE', message: 'Rate amount is missing or not a number.', severity: 'ERROR' })
    return
  }
  if (numeric <= 0) {
    push({
      category: 'RATE',
      code: 'NON_POSITIVE_RATE',
      message: 'Rate amount must be greater than zero.',
      metadata: { rateAmount },
      severity: 'ERROR',
    })
  }
  if (rateType === 'PERCENTAGE' && numeric > 1) {
    push({
      category: 'RATE',
      code: 'PERCENTAGE_RATE_OUT_OF_RANGE',
      message: 'Percentage rate is greater than 100% — confirm this is a stock split or special distribution, not a typo.',
      metadata: { rateAmount },
      severity: 'WARNING',
    })
  }
}

function checkWorkflow(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { dividend, hasApprovals } = ctx
  if (POST_APPROVAL.has(dividend.status) && hasApprovals === false) {
    push({
      category: 'WORKFLOW',
      code: 'STATUS_AHEAD_OF_APPROVAL',
      message: `Status is ${dividend.status} but no approval decisions are recorded.`,
      severity: 'ERROR',
    })
  }
  if (dividend.status === 'CHANGES_REQUESTED') {
    push({
      category: 'WORKFLOW',
      code: 'AWAITING_CHANGES',
      message: 'Approver requested changes — resubmit after addressing the feedback.',
      severity: 'INFO',
    })
  }
}

function checkEligibility(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { dividend, snapshot } = ctx
  if (POST_LOCK.has(dividend.status) && !snapshot) {
    push({
      category: 'ELIGIBILITY',
      code: 'MISSING_ELIGIBILITY_SNAPSHOT',
      message: 'Dividend has progressed past lock but no eligibility snapshot is recorded.',
      severity: 'ERROR',
    })
    return
  }
  if (POST_LOCK.has(dividend.status) && snapshot && !snapshot.lockedAt) {
    push({
      category: 'ELIGIBILITY',
      code: 'SNAPSHOT_NOT_LOCKED',
      message: 'Eligibility snapshot exists but is not locked.',
      severity: 'WARNING',
    })
  }
  if (snapshot && snapshot.holderCount === 0) {
    push({
      category: 'ELIGIBILITY',
      code: 'EMPTY_SNAPSHOT',
      message: 'Eligibility snapshot has zero eligible holders.',
      severity: 'WARNING',
    })
  }
}

function checkCalculation(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { dividend, entitlements, batches, calculatedSummary } = ctx
  if (POST_CALCULATION.has(dividend.status) && (!entitlements || entitlements.length === 0)) {
    push({
      category: 'CALCULATION',
      code: 'MISSING_ENTITLEMENTS',
      message: 'Dividend has progressed past calculation but no entitlements are recorded.',
      severity: 'ERROR',
    })
  }
  if (!batches || batches.length === 0) return
  const entitlementGross = (entitlements || []).reduce((s, e) => s + (e.grossAmountCents || 0), 0)
  const batchGross = batches.reduce((s, b) => s + (b.totalGrossCents || 0), 0)
  if (entitlements && entitlements.length > 0 && batchGross > entitlementGross) {
    push({
      category: 'PAYMENT',
      code: 'BATCH_EXCEEDS_ENTITLEMENTS',
      message: `Payment batch totals (${batchGross}¢) exceed entitlement gross totals (${entitlementGross}¢).`,
      metadata: { batchGross, entitlementGross },
      severity: 'ERROR',
    })
  }
  if (calculatedSummary && entitlements && Math.abs(calculatedSummary.totalGrossCents - entitlementGross) > 1) {
    push({
      category: 'CALCULATION',
      code: 'SUMMARY_GROSS_MISMATCH',
      message: 'Calculated summary gross does not match sum of entitlement gross amounts.',
      metadata: { entitlementGross, summaryGross: calculatedSummary.totalGrossCents },
      severity: 'WARNING',
    })
  }
}

function checkPayment(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { payments, shareholdersMissingPaymentInstructions } = ctx
  if (shareholdersMissingPaymentInstructions && shareholdersMissingPaymentInstructions > 0) {
    push({
      category: 'PAYMENT',
      code: 'MISSING_PAYMENT_INSTRUCTIONS',
      message: `${shareholdersMissingPaymentInstructions} eligible holder(s) are missing payment instructions.`,
      metadata: { count: shareholdersMissingPaymentInstructions },
      severity: 'WARNING',
    })
  }
  if (!payments || payments.length === 0) return
  const failed = payments.filter(p => FAILED_PAYMENT_STATUSES.has(String(p.status))).length
  if (failed > 0) {
    push({
      category: 'PAYMENT',
      code: 'FAILED_PAYMENTS_DETECTED',
      message: `${failed} payment(s) failed or were returned and need operator follow-up.`,
      metadata: { count: failed },
      severity: 'ERROR',
    })
  }
}

function checkTax(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { shareholdersMissingTaxInfo } = ctx
  if (shareholdersMissingTaxInfo && shareholdersMissingTaxInfo > 0) {
    push({
      category: 'TAX',
      code: 'MISSING_TAX_INFO',
      message: `${shareholdersMissingTaxInfo} eligible holder(s) are missing tax forms — backup withholding may apply.`,
      metadata: { count: shareholdersMissingTaxInfo },
      severity: 'WARNING',
    })
  }
}

function checkHistoricalAnomalies(ctx: ReviewContext, push: (f: PreflightFinding) => void): void {
  const { dividend, priorDividends } = ctx
  if (!priorDividends || priorDividends.length < 2) return
  const sameKind = priorDividends.filter(d => d.rateType === dividend.rateType && d.currency === dividend.currency)
  if (sameKind.length < 2) return
  const rates = sameKind.map(d => Number(d.rateAmount)).filter(n => !Number.isNaN(n) && n > 0)
  if (rates.length < 2) return
  const median = computeMedian(rates)
  const current = Number(dividend.rateAmount)
  if (!current || Number.isNaN(current) || median <= 0) return
  const ratio = current / median
  if (ratio >= 2) {
    push({
      category: 'HISTORICAL',
      code: 'RATE_SPIKE_VS_HISTORY',
      message: `Rate is ${ratio.toFixed(1)}× the median of the last ${rates.length} comparable dividends — confirm board resolution.`,
      metadata: { medianRate: median, observedRate: current, priorCount: rates.length, ratio },
      severity: 'WARNING',
    })
  } else if (ratio > 0 && ratio <= 0.5) {
    push({
      category: 'HISTORICAL',
      code: 'RATE_DROP_VS_HISTORY',
      message: `Rate is ${(ratio * 100).toFixed(0)}% of the median of the last ${rates.length} comparable dividends.`,
      metadata: { medianRate: median, observedRate: current, priorCount: rates.length, ratio },
      severity: 'INFO',
    })
  }
}

// ---------- Helpers --------------------------------------------------------

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.valueOf() - a.valueOf()) / (1000 * 60 * 60 * 24)
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Stringly-typed checklist of "what's still missing" suitable for a
 * shareholder/operator-friendly UI list. Derived purely from findings so
 * the AI layer can reuse it.
 */
export function buildMissingInfoChecklist(report: PreflightReport): string[] {
  const items: string[] = []
  for (const f of report.findings) {
    switch (f.code) {
      case 'EMPTY_SNAPSHOT':
        items.push('Eligibility snapshot has no holders — verify the record-date roster.')
        break
      case 'MISSING_ELIGIBILITY_SNAPSHOT':
        items.push('Create and lock an eligibility snapshot before progressing.')
        break
      case 'MISSING_ENTITLEMENTS':
        items.push('Calculate entitlements before scheduling payment.')
        break
      case 'MISSING_PAYMENT_INSTRUCTIONS':
        items.push('Collect payment instructions for holders missing ACH/wire/check details.')
        break
      case 'MISSING_RATE':
      case 'NON_POSITIVE_RATE':
        items.push('Set a positive dividend rate.')
        break
      case 'MISSING_RECORD_DATE':
        items.push('Set a record date.')
        break
      case 'MISSING_TAX_INFO':
        items.push('Request W-9 / W-8BEN forms from holders missing tax certifications.')
        break
    }
  }
  return Array.from(new Set(items))
}

/**
 * Suggest the next concrete operator action(s) based purely on
 * deterministic findings. This is the "rails" the AI layer can polish
 * with friendlier prose.
 */
export function buildSuggestedActions(ctx: ReviewContext, report: PreflightReport): string[] {
  const out: string[] = []
  const { dividend } = ctx
  const has = (code: string): boolean => report.findings.some(f => f.code === code)

  if (has('FAILED_PAYMENTS_DETECTED')) {
    out.push('Open the failed-payments report and reconcile each row before progressing.')
  }
  if (has('MISSING_RATE') || has('NON_POSITIVE_RATE')) {
    out.push('Edit the declaration to set a valid rate amount.')
  }
  if (has('MISSING_RECORD_DATE') || has('MISSING_PAYMENT_DATE') || has('PAYMENT_NOT_AFTER_RECORD')) {
    out.push('Edit the declaration to set declaration → record → payment dates in valid order.')
  }
  if (has('MISSING_ELIGIBILITY_SNAPSHOT') || has('SNAPSHOT_NOT_LOCKED')) {
    out.push('Generate and lock the eligibility snapshot before calculating entitlements.')
  }
  if (has('MISSING_ENTITLEMENTS')) {
    out.push('Run the entitlement calculation.')
  }
  if (dividend.status === 'DRAFT' && report.errorCount === 0) {
    out.push('Submit the declaration for approval when ready.')
  }
  if (dividend.status === 'PENDING_APPROVAL') {
    out.push('Awaiting reviewer decision — no operator action required.')
  }
  return out
}
