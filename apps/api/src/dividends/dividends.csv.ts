/**
 * Pure CSV builders for dividend exports.
 *
 * The dividend module exposes operational reporting via CSV (declarations,
 * eligibility snapshot, entitlements, payment batches, failed payments,
 * shareholder dividend history, audit trail). All of those endpoints share
 * the same shape — a typed column descriptor list applied to a typed row
 * array — so we centralise the rendering here.
 *
 * Why no `csv-stringify`/`papaparse` dependency:
 *   - The row volumes per export are small (single dividend or batch).
 *   - Our escaping rules are RFC 4180 compliant and easy to test.
 *   - Keeping this module dependency-free means it can be imported into
 *     pure unit tests with no Nest/Postgres bootstrapping.
 *
 * Money is always integer cents at the storage layer. CSV rendering
 * converts to the conventional `\d+\.\d{2}` decimal form so spreadsheets
 * don't auto-format/round it. Decimal share counts are passed through as
 * strings.
 */

import type {
  DividendBatchStatus,
  DividendEligibilityEntry,
  DividendEligibilitySnapshot,
  DividendEntitlement,
  DividendEvent,
  DividendPayment,
  DividendPaymentBatch,
  DividendPaymentStatus,
} from './dividends.types.js'

// ----------------------------------------------------------------------
// Generic CSV utilities
// ----------------------------------------------------------------------

export interface CsvColumn<Row> {
  /** Column header — written verbatim to the first row of the CSV. */
  header: string
  /** Cell extractor. Return `null`/`undefined` for empty cells. */
  value: (row: Row) => string | number | boolean | null | undefined
}

/**
 * Escape a single cell value per RFC 4180. Values that contain a comma,
 * quote, CR, or LF are wrapped in double quotes with embedded quotes
 * doubled. `null`/`undefined` render as empty cells.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Render a single row to a CSV-encoded line (no trailing newline). */
export function renderCsvRow<Row>(row: Row, columns: ReadonlyArray<CsvColumn<Row>>): string {
  return columns.map(col => escapeCsvCell(col.value(row))).join(',')
}

/**
 * Build a full CSV document — header line + one line per row. Lines are
 * joined with CRLF per RFC 4180; terminated with a final CRLF so any
 * downstream `cat`/`>>` operations append cleanly.
 */
export function renderCsv<Row>(rows: ReadonlyArray<Row>, columns: ReadonlyArray<CsvColumn<Row>>): string {
  const lines: string[] = [columns.map(c => escapeCsvCell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(renderCsvRow(row, columns))
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * Convert integer cents to a fixed-precision decimal string, e.g.
 * `12345 -> "123.45"`, `-12 -> "-0.12"`. Avoids floating-point drift.
 */
export function centsToDecimalString(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  const n = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(Number(cents)))
  const negative = n < 0n
  const abs = negative ? -n : n
  const whole = abs / 100n
  const frac = abs % 100n
  const fracStr = frac.toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${fracStr}`
}

/** Convert a Date or ISO-string to a stable `YYYY-MM-DDTHH:mm:ssZ` form. */
export function isoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  // Allow caller to pre-format as YYYY-MM-DD; pass through.
  return value
}

// ----------------------------------------------------------------------
// Column maps per dividend entity
// ----------------------------------------------------------------------

/**
 * Wire-format projection of a dividend declaration as exported to CSV.
 * Joined with the issuer/security context so analysts don't have to
 * reverse-lookup ids in another sheet.
 */
export interface DeclarationExportRow {
  declaration: DividendEvent
  issuerName?: string
  securitySymbol?: string
  securityName?: string
}

export const DECLARATION_COLUMNS: ReadonlyArray<CsvColumn<DeclarationExportRow>> = [
  { header: 'dividend_id', value: r => r.declaration.id },
  { header: 'status', value: r => r.declaration.status },
  { header: 'kind', value: r => r.declaration.kind },
  { header: 'issuer_id', value: r => r.declaration.issuerId },
  { header: 'issuer_name', value: r => r.issuerName ?? '' },
  { header: 'security_id', value: r => r.declaration.securityId },
  { header: 'security_symbol', value: r => r.securitySymbol ?? '' },
  { header: 'security_name', value: r => r.securityName ?? '' },
  { header: 'rate_type', value: r => r.declaration.rateType },
  { header: 'rate_amount', value: r => r.declaration.rateAmount },
  { header: 'currency', value: r => r.declaration.currency },
  { header: 'declaration_date', value: r => r.declaration.declarationDate },
  { header: 'ex_dividend_date', value: r => r.declaration.exDividendDate ?? '' },
  { header: 'record_date', value: r => r.declaration.recordDate },
  { header: 'payment_date', value: r => r.declaration.paymentDate },
  { header: 'total_distribution', value: r => centsToDecimalString(r.declaration.totalDistributionCents) },
  { header: 'withholding_default_pct', value: r => r.declaration.withholdingDefaultPct },
  { header: 'description', value: r => r.declaration.description ?? '' },
  { header: 'created_at', value: r => isoOrEmpty(r.declaration.createdAt) },
  { header: 'updated_at', value: r => isoOrEmpty(r.declaration.updatedAt) },
]

export const SNAPSHOT_COLUMNS: ReadonlyArray<CsvColumn<DividendEligibilityEntry>> = [
  { header: 'shareholder_id', value: r => r.shareholderId ?? '' },
  { header: 'account_id', value: r => r.accountId ?? '' },
  { header: 'ownership_reference', value: r => r.ownershipReference ?? '' },
  { header: 'security_id', value: r => r.securityId },
  { header: 'shares_held', value: r => r.sharesHeld },
  { header: 'eligibility_status', value: r => r.eligibilityStatus },
  { header: 'disqualification_reason', value: r => r.disqualificationReason ?? '' },
  { header: 'ownership_source', value: r => r.ownershipSource },
  { header: 'record_date', value: r => r.recordDate },
]

/** Per-entitlement export row — joined with the friendly shareholder name. */
export interface EntitlementExportRow {
  entitlement: DividendEntitlement
  shareholderName?: string
}

export const ENTITLEMENT_COLUMNS: ReadonlyArray<CsvColumn<EntitlementExportRow>> = [
  { header: 'entitlement_id', value: r => r.entitlement.id },
  { header: 'dividend_id', value: r => r.entitlement.dividendEventId },
  { header: 'shareholder_id', value: r => r.entitlement.shareholderId },
  { header: 'shareholder_name', value: r => r.shareholderName ?? '' },
  { header: 'account_id', value: r => r.entitlement.accountId },
  { header: 'shares_held', value: r => r.entitlement.sharesHeld },
  { header: 'gross_amount', value: r => centsToDecimalString(r.entitlement.grossAmountCents) },
  { header: 'withholding_pct', value: r => r.entitlement.withholdingPct },
  { header: 'withholding_amount', value: r => centsToDecimalString(r.entitlement.withholdingCents) },
  { header: 'net_amount', value: r => centsToDecimalString(r.entitlement.netAmountCents) },
  { header: 'currency', value: r => r.entitlement.currency },
  { header: 'status', value: r => r.entitlement.status },
  { header: 'tax_status', value: r => r.entitlement.taxStatus },
  { header: 'tax_residency', value: r => r.entitlement.taxResidency ?? '' },
  { header: 'tax_form_status', value: r => r.entitlement.taxFormStatus ?? '' },
  { header: 'treaty_rate', value: r => r.entitlement.treatyRate ?? '' },
  { header: 'withholding_reason', value: r => r.entitlement.withholdingReason ?? '' },
  { header: 'calculation_version', value: r => r.entitlement.calculationVersion },
  { header: 'payment_method', value: r => r.entitlement.paymentMethod ?? '' },
  { header: 'paid_at', value: r => isoOrEmpty(r.entitlement.paidAt) },
]

/** Per-payment export row — joined with the entitlement's shareholder name. */
export interface PaymentExportRow {
  payment: DividendPayment
  shareholderName?: string
}

export const PAYMENT_COLUMNS: ReadonlyArray<CsvColumn<PaymentExportRow>> = [
  { header: 'payment_id', value: r => r.payment.id },
  { header: 'batch_id', value: r => r.payment.batchId ?? '' },
  { header: 'dividend_id', value: r => r.payment.dividendEventId },
  { header: 'entitlement_id', value: r => r.payment.entitlementId },
  { header: 'shareholder_id', value: r => r.payment.shareholderId },
  { header: 'shareholder_name', value: r => r.shareholderName ?? '' },
  { header: 'account_id', value: r => r.payment.accountId },
  { header: 'method', value: r => r.payment.method },
  { header: 'status', value: r => r.payment.status },
  { header: 'gross_amount', value: r => centsToDecimalString(r.payment.grossAmountCents) },
  { header: 'withholding_amount', value: r => centsToDecimalString(r.payment.withholdingCents) },
  { header: 'net_amount', value: r => centsToDecimalString(r.payment.netAmountCents) },
  { header: 'currency', value: r => r.payment.currency },
  { header: 'external_ref', value: r => r.payment.externalRef ?? '' },
  { header: 'failure_reason', value: r => r.payment.failureReason ?? '' },
  { header: 'attempt_no', value: r => r.payment.attemptNo },
  { header: 'paid_at', value: r => isoOrEmpty(r.payment.paidAt) },
  { header: 'reconciled_at', value: r => isoOrEmpty(r.payment.reconciledAt) },
  { header: 'returned_at', value: r => isoOrEmpty(r.payment.returnedAt) },
]

export interface BatchExportRow {
  batch: DividendPaymentBatch
}

export const BATCH_COLUMNS: ReadonlyArray<CsvColumn<BatchExportRow>> = [
  { header: 'batch_id', value: r => r.batch.id },
  { header: 'batch_number', value: r => r.batch.batchNumber },
  { header: 'dividend_id', value: r => r.batch.dividendEventId },
  { header: 'issuer_id', value: r => r.batch.issuerId },
  { header: 'method', value: r => r.batch.method },
  { header: 'status', value: r => r.batch.status },
  { header: 'currency', value: r => r.batch.currency },
  { header: 'payment_date', value: r => r.batch.paymentDate },
  { header: 'payment_count', value: r => r.batch.paymentCount },
  { header: 'total_gross', value: r => centsToDecimalString(r.batch.totalGrossCents) },
  { header: 'total_withholding', value: r => centsToDecimalString(r.batch.totalWithholdingCents) },
  { header: 'total_net', value: r => centsToDecimalString(r.batch.totalNetCents) },
  { header: 'created_by', value: r => r.batch.createdBy ?? '' },
  { header: 'scheduled_at', value: r => isoOrEmpty(r.batch.scheduledAt) },
  { header: 'approved_at', value: r => isoOrEmpty(r.batch.approvedAt) },
  { header: 'completed_at', value: r => isoOrEmpty(r.batch.completedAt) },
  { header: 'reconciled_at', value: r => isoOrEmpty(r.batch.reconciledAt) },
]

/**
 * Friendly export shape for a shareholder's dividend history. Joins
 * declaration + entitlement + payment so the row reads end-to-end
 * without cross-references.
 */
export interface ShareholderHistoryRow {
  declaration: DividendEvent
  entitlement: DividendEntitlement
  payment?: DividendPayment
  issuerName?: string
  securitySymbol?: string
}

export const SHAREHOLDER_HISTORY_COLUMNS: ReadonlyArray<CsvColumn<ShareholderHistoryRow>> = [
  { header: 'dividend_id', value: r => r.declaration.id },
  { header: 'issuer_name', value: r => r.issuerName ?? '' },
  { header: 'security_symbol', value: r => r.securitySymbol ?? '' },
  { header: 'kind', value: r => r.declaration.kind },
  { header: 'declaration_date', value: r => r.declaration.declarationDate },
  { header: 'record_date', value: r => r.declaration.recordDate },
  { header: 'payment_date', value: r => r.declaration.paymentDate },
  { header: 'shares_eligible', value: r => r.entitlement.sharesHeld },
  { header: 'rate_amount', value: r => r.declaration.rateAmount },
  { header: 'gross_amount', value: r => centsToDecimalString(r.entitlement.grossAmountCents) },
  { header: 'withholding_amount', value: r => centsToDecimalString(r.entitlement.withholdingCents) },
  { header: 'net_amount', value: r => centsToDecimalString(r.entitlement.netAmountCents) },
  { header: 'currency', value: r => r.entitlement.currency },
  { header: 'entitlement_status', value: r => r.entitlement.status },
  { header: 'payment_status', value: r => r.payment?.status ?? '' },
  { header: 'payment_method', value: r => r.payment?.method ?? r.entitlement.paymentMethod ?? '' },
  { header: 'paid_at', value: r => isoOrEmpty(r.payment?.paidAt ?? r.entitlement.paidAt) },
  { header: 'external_ref', value: r => r.payment?.externalRef ?? '' },
]

/**
 * Audit-trail CSV row shape. We render the metadata payload as JSON in a
 * single column so it's preserved without exploding column count; the
 * `headline` column gives a human-readable summary alongside it.
 */
export interface AuditExportRow {
  id: number
  at: string
  action: string
  headline: string
  actorId: string
  actorRole?: string
  severity: string
  payload: Record<string, unknown>
}

export const AUDIT_COLUMNS: ReadonlyArray<CsvColumn<AuditExportRow>> = [
  { header: 'event_id', value: r => r.id },
  { header: 'occurred_at', value: r => r.at },
  { header: 'action', value: r => r.action },
  { header: 'headline', value: r => r.headline },
  { header: 'severity', value: r => r.severity },
  { header: 'actor_id', value: r => r.actorId },
  { header: 'actor_role', value: r => r.actorRole ?? '' },
  { header: 'payload_json', value: r => JSON.stringify(r.payload ?? {}) },
]

// ----------------------------------------------------------------------
// Snapshot helpers
// ----------------------------------------------------------------------

/** Flatten a snapshot wrapper to its row array for CSV rendering. */
export function snapshotRows(snapshot: DividendEligibilitySnapshot): DividendEligibilityEntry[] {
  return snapshot.snapshotPayload.slice()
}

/**
 * Filter a payment array to the failed/returned subset used by the
 * "Failed payments" report. Status values are taken from the canonical
 * payment lifecycle in `dividends.payments.state.ts`.
 */
export const FAILED_PAYMENT_STATUSES_SET: ReadonlySet<DividendPaymentStatus> = new Set<DividendPaymentStatus>([
  'FAILED',
  'RETURNED',
  'CANCELLED',
])

export function isFailedPaymentRow(row: PaymentExportRow): boolean {
  return FAILED_PAYMENT_STATUSES_SET.has(row.payment.status)
}

// ----------------------------------------------------------------------
// Download envelope
// ----------------------------------------------------------------------

/**
 * The shape returned by every `export*` service method. The controller
 * sets HTTP headers from `contentType`/`filename` and writes `body` to
 * the response stream. Keeping it as a value object means the unit tests
 * can assert on it without booting Nest.
 */
export interface CsvDownload {
  filename: string
  contentType: 'text/csv; charset=utf-8'
  body: string
  /** Rows actually rendered, useful for audit metadata. */
  rowCount: number
}

export function csvDownload(filename: string, body: string, rowCount: number): CsvDownload {
  return {
    body,
    contentType: 'text/csv; charset=utf-8',
    filename,
    rowCount,
  }
}

/**
 * Map the canonical batch status enum to a stable status string used by
 * the CSV exports. Keeps the row layer typed even if we later add or
 * deprecate states.
 */
export function batchStatusToCsv(status: DividendBatchStatus): DividendBatchStatus {
  return status
}
