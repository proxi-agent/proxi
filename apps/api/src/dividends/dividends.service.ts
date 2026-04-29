import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditActions } from '../audit/audit.events.js'
import { AuditService } from '../audit/audit.service.js'
import { actorCanAccessIssuer, type ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'
import { LedgerService } from '../ledger/ledger.service.js'

import { calculateFromRoster, totalsFromDrafts } from './dividends.calculation.js'
import {
  AUDIT_COLUMNS,
  type AuditExportRow,
  BATCH_COLUMNS,
  type CsvDownload,
  csvDownload,
  DECLARATION_COLUMNS,
  type DeclarationExportRow,
  ENTITLEMENT_COLUMNS,
  type EntitlementExportRow,
  isFailedPaymentRow,
  PAYMENT_COLUMNS,
  type PaymentExportRow,
  renderCsv,
  SHAREHOLDER_HISTORY_COLUMNS,
  type ShareholderHistoryRow,
  SNAPSHOT_COLUMNS,
  snapshotRows,
} from './dividends.csv.js'
import type {
  ApproveBatchDto,
  ApproveDividendDto,
  BatchListQuery,
  BulkRecordPaymentsDto,
  CalculateEntitlementsDto,
  CancelBatchDto,
  CancelDividendDto,
  CreateDividendDto,
  CreatePaymentBatchDto,
  DividendListQuery,
  EntitlementListQuery,
  GenerateStatementsDto,
  MarkBatchProcessingDto,
  MarkPaidDto,
  PaymentListQuery,
  ReconcileBatchDto,
  ReconciliationEntryDto,
  RecordPaymentDto,
  RejectBatchDto,
  RejectDividendDto,
  RequestChangesDto,
  ScheduleBatchDto,
  SubmitBatchDto,
  SubmitForApprovalDto,
  UpdateDividendDto,
  UpsertReinvestmentInstructionDto,
} from './dividends.dto.js'
import type { AccountLookup } from './dividends.eligibility.js'
import { buildEligibilityRoster, computeRosterTotals } from './dividends.eligibility.js'
import { applyFractionalPolicy } from './dividends.fractional.js'
import { isValidExDividendDate, isValidRecordDate } from './dividends.math.js'
import {
  assertBatchTransition,
  assertPaymentTransition,
  BATCH_LIFECYCLE_REQUIREMENTS,
  BatchTransitionError,
  FAILED_PAYMENT_STATUSES,
  IN_FLIGHT_PAYMENT_STATUSES,
  isTerminalBatch,
  isTerminalPayment,
  PAID_PAYMENT_STATUSES,
  PaymentTransitionError,
  PENDING_PAYMENT_STATUSES,
  rollupBatchStatus,
} from './dividends.payments.state.js'
import {
  buildMissingInfoChecklist,
  buildSuggestedActions,
  type PreflightReport,
  type ReviewContext,
  runPreflightChecks,
} from './dividends.preflight.js'
import { buildReportsSummary, type DividendsReportsSummary } from './dividends.reports.js'
import {
  type DividendAiProvider,
  type DividendAiReviewOutput,
  type DividendAiReviewRecord,
  selectDefaultProvider,
} from './dividends.review.js'
import {
  allowedActionsFor,
  assertDividendTransition,
  canCancelDividend,
  canForceCancelDividend,
  isCalculatedOrLater,
  isEligibilityLockedOrLater,
  isTerminalDividendStatus,
  LIFECYCLE_REQUIREMENTS,
} from './dividends.state.js'
import {
  buildStatementView,
  type DividendStatementView,
  renderStatementHtml,
  type StatementShareholderInfo,
} from './dividends.statement.js'
import type {
  DividendAction,
  DividendApproval,
  DividendApprovalAction,
  DividendBatchAction,
  DividendBatchExport,
  DividendBatchExportRow,
  DividendBatchStatus,
  DividendCalculatedSummary,
  DividendCalculationSummary,
  DividendCommunication,
  DividendCommunicationKind,
  DividendCommunicationStatus,
  DividendDeclarationDetail,
  DividendDocumentRef,
  DividendEligibilityEntry,
  DividendEligibilitySnapshot,
  DividendEntitlement,
  DividendEvent,
  DividendFractionalAdjustment,
  DividendIssuerSummary,
  DividendKind,
  DividendPayment,
  DividendPaymentBatch,
  DividendPaymentMethod,
  DividendPaymentStatus,
  DividendRateType,
  DividendReconciliationException,
  DividendReconciliationExceptionStatus,
  DividendReconciliationExceptionType,
  DividendReconciliationImportSummary,
  DividendReconciliationOutcome,
  DividendReinvestmentInstruction,
  DividendReinvestmentRecord,
  DividendReinvestmentStatus,
  DividendSecuritySummary,
  DividendStatement,
  DividendStatementStatus,
  DividendStatus,
  DividendTaxStatus,
  DividendTaxWithholding,
  DividendWarning,
  DividendWorkflowStepper,
  EntitlementStatus,
  FractionalSharePolicy,
} from './dividends.types.js'
import { assertCommunicationTransition, buildWorkflowSteps } from './dividends.workflow.js'

// ----------------------------------------------------------------------
// Row types matching the schema. Each row mapper translates snake_case
// into the camelCase domain type.
// ----------------------------------------------------------------------

type DividendRow = {
  id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  status: DividendStatus
  kind: DividendKind
  rate_type: DividendRateType
  rate_amount: string
  rate_per_share_cents: number
  currency: string
  withholding_default_pct: string
  declaration_date: string | Date
  record_date: string | Date
  ex_dividend_date: string | Date | null
  payment_date: string | Date
  total_distribution_cents: string
  description: string | null
  notes: string | null
  supporting_documents: DividendDocumentRef[]
  metadata: Record<string, unknown>
  approved_at: Date | null
  eligibility_locked_at: Date | null
  calculated_at: Date | null
  scheduled_at: Date | null
  paid_at: Date | null
  archived_at: Date | null
  cancelled_at: Date | null
  rejected_at: Date | null
  changes_requested_at: Date | null
  version: number | string
  calculation_version: number | string | null
  calculations_locked_at: Date | null
  created_at: Date
  updated_at: Date
}

type EntitlementRow = {
  id: string
  dividend_event_id: string
  eligibility_snapshot_id: string | null
  account_id: string
  shareholder_id: string
  shares_held: string
  shares_held_decimal: string
  amount_cents: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
  withholding_pct: string
  payment_method: DividendPaymentMethod | null
  status: EntitlementStatus
  currency: string | null
  tax_status: DividendTaxStatus | null
  tax_residency: string | null
  tax_form_status: string | null
  treaty_rate: string | null
  withholding_reason: string | null
  calculation_version: number | string | null
  frozen_at: Date | null
  paid_at: Date | null
  payment_reference: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type SnapshotRow = {
  id: string
  dividend_event_id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  record_date: string | Date
  captured_at: Date
  locked_at: Date | null
  holder_count: number
  excluded_holder_count: number | string | null
  total_eligible_shares: string
  snapshot_payload: DividendEligibilityEntry[]
  metadata: Record<string, unknown>
}

type ApprovalRow = {
  id: string
  dividend_event_id: string
  action: DividendApprovalAction
  actor_id: string
  actor_role: string | null
  decision_notes: string | null
  decided_at: Date
  metadata: Record<string, unknown>
  created_at: Date
}

type BatchRow = {
  id: string
  dividend_event_id: string
  issuer_id: string
  batch_number: string | null
  currency: string
  payment_date: string | Date | null
  method: DividendPaymentMethod
  status: DividendBatchStatus
  created_by: string | null
  scheduled_at: Date | null
  approved_at: Date | null
  started_at: Date | null
  completed_at: Date | null
  reconciled_at: Date | null
  cancelled_at: Date | null
  payment_count: number
  total_gross_cents: string
  total_withholding_cents: string
  total_net_cents: string
  notes: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type PaymentRow = {
  id: string
  dividend_event_id: string
  batch_id: string | null
  entitlement_id: string
  account_id: string
  shareholder_id: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
  currency: string
  method: DividendPaymentMethod
  status: DividendPaymentStatus
  external_ref: string | null
  failure_reason: string | null
  attempt_no: number
  idempotency_key: string | null
  paid_at: Date | null
  reconciled_at: Date | null
  returned_at: Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type WithholdingRow = {
  id: string
  dividend_event_id: string
  entitlement_id: string
  payment_id: string | null
  shareholder_id: string
  jurisdiction: string
  withholding_pct: string
  taxable_amount_cents: string
  withholding_cents: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: Date
}

type StatementRow = {
  id: string
  dividend_event_id: string
  entitlement_id: string
  shareholder_id: string
  account_id: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
  currency: string
  statement_date: string | Date
  status: DividendStatementStatus
  document_storage_key: string | null
  sent_at: Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type ReinvestmentRow = {
  id: string
  issuer_id: string
  shareholder_id: string
  account_id: string
  security_id: string
  share_class_id: string | null
  enabled: boolean
  percentage: string
  effective_from: string | Date
  effective_to: string | Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const EVENT_SORT: Record<string, string> = {
  createdAt: 'created_at',
  paymentDate: 'payment_date',
  recordDate: 'record_date',
  status: 'status',
}

const ENTITLEMENT_SORT: Record<string, string> = {
  createdAt: 'created_at',
  grossAmountCents: 'gross_amount_cents',
  netAmountCents: 'net_amount_cents',
  sharesHeld: 'shares_held',
  status: 'status',
}

const PAYMENT_SORT: Record<string, string> = {
  createdAt: 'created_at',
  netAmountCents: 'net_amount_cents',
  paidAt: 'paid_at',
  status: 'status',
}

const BATCH_SORT: Record<string, string> = {
  createdAt: 'created_at',
  scheduledAt: 'scheduled_at',
  status: 'status',
}

@Injectable()
export class DividendsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly ledgerService: LedgerService,
  ) {}

  // ====================================================================
  // Read APIs
  // ====================================================================

  async list(query: DividendListQuery): Promise<PaginatedResponse<DividendEvent>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.securityId) {
      params.push(query.securityId)
      where.push(`security_id = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.kind) {
      params.push(query.kind)
      where.push(`kind = $${params.length}`)
    }
    if (query.fromPaymentDate) {
      params.push(query.fromPaymentDate)
      where.push(`payment_date >= $${params.length}`)
    }
    if (query.toPaymentDate) {
      params.push(query.toPaymentDate)
      where.push(`payment_date <= $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(COALESCE(description, '')) LIKE $${params.length} OR LOWER(COALESCE(notes, '')) LIKE $${params.length})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, EVENT_SORT, { column: 'payment_date', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_events ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<DividendRow>(
      `SELECT * FROM dividend_events ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapDividend), total, query)
  }

  async getById(id: string): Promise<DividendEvent> {
    const result = await this.database.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Dividend ${id} not found`)
    }
    return mapDividend(result.rows[0])
  }

  /**
   * Rich, UI-shaped detail view for a single declaration. Combines the
   * declaration itself with related issuer/security context, the workflow
   * actions allowed from the current status, the approval history, the
   * recent audit timeline, and any workflow warnings the operator should
   * see (e.g. record date in the past, missing supporting documents).
   *
   * The result is intentionally self-contained so the UI doesn't have to
   * fan out across many endpoints to render the review screen.
   */
  async getDetail(id: string, actor?: ActorContext): Promise<DividendDeclarationDetail> {
    const declaration = await this.getById(id)
    const [issuer, security, approvalHistory, calculatedSummary, recentAuditEvents] = await Promise.all([
      this.loadIssuerSummary(declaration.issuerId),
      this.loadSecuritySummary(declaration.securityId, declaration.shareClassId),
      this.listApprovals(id),
      this.computeCalculatedSummary(id, declaration),
      this.auditService.timeline('DIVIDEND_EVENT', id, { limit: 25 }),
    ])

    const allActions = allowedActionsFor(declaration.status)
    const allowedActions = allActions.filter(action => isActionVisibleTo(action, actor))
    const warnings = buildWarnings(declaration, calculatedSummary)

    return {
      allowedActions,
      approvalHistory,
      calculatedSummary,
      declaration,
      financialTerms: {
        currency: declaration.currency,
        kind: declaration.kind,
        rateAmount: declaration.rateAmount,
        ratePerShareCents: declaration.ratePerShareCents,
        rateType: declaration.rateType,
        withholdingDefaultPct: declaration.withholdingDefaultPct,
      },
      importantDates: {
        declarationDate: declaration.declarationDate,
        exDividendDate: declaration.exDividendDate,
        paymentDate: declaration.paymentDate,
        recordDate: declaration.recordDate,
      },
      issuer,
      recentAuditEvents: recentAuditEvents.map(entry => ({
        action: entry.action,
        actor: entry.actor,
        at: entry.at,
        headline: entry.headline,
        id: entry.id,
        payload: entry.payload,
        severity: entry.severity,
      })),
      security,
      status: declaration.status,
      warnings,
    }
  }

  /**
   * Returns the chronological audit timeline for a single dividend
   * declaration. Powered by the central `audit_events` table — captures
   * every transition, payment status change, statement event, etc.
   */
  async listAuditEvents(id: string, options: { since?: string; limit?: number } = {}) {
    await this.getById(id) // assert existence (404s otherwise)
    return this.auditService.timeline('DIVIDEND_EVENT', id, options)
  }

  // ====================================================================
  // Lifecycle: create / update / submit / approve / reject / lock /
  //            calculate / schedule / cancel
  // ====================================================================

  async create(input: CreateDividendDto, actor: ActorContext): Promise<DividendEvent> {
    if (!isValidRecordDate(input.recordDate, input.paymentDate, input.declarationDate)) {
      throw new BadRequestException('declarationDate <= recordDate <= paymentDate is required')
    }
    if (!isValidExDividendDate(input.exDividendDate, input.recordDate, input.declarationDate)) {
      throw new BadRequestException('exDividendDate must lie between declarationDate and recordDate')
    }
    const { rateAmount, ratePerShareCents } = resolveRate(input)
    assertPositiveCashRate(input.kind, rateAmount, ratePerShareCents)
    const id = shortId('div')
    return this.database.tx(async client => {
      const security = await client.query<{ issuer_id: string }>(`SELECT issuer_id FROM securities WHERE id = $1`, [input.securityId])
      if (!security.rows.length) {
        throw new NotFoundException(`Security ${input.securityId} not found`)
      }
      if (security.rows[0].issuer_id !== input.issuerId) {
        throw new BadRequestException('Security does not belong to issuer')
      }
      const result = await client.query<DividendRow>(
        `INSERT INTO dividend_events (
            id, issuer_id, security_id, share_class_id, status, kind, rate_type, rate_amount,
            rate_per_share_cents, currency, withholding_default_pct, declaration_date, record_date,
            ex_dividend_date, payment_date, description, notes, supporting_documents, metadata
         ) VALUES (
            $1, $2, $3, $4, 'DRAFT', $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17::jsonb, $18::jsonb
         ) RETURNING *`,
        [
          id,
          input.issuerId,
          input.securityId,
          input.shareClassId || null,
          input.kind || 'CASH',
          input.rateType || 'PER_SHARE',
          rateAmount,
          ratePerShareCents,
          (input.currency || 'USD').toUpperCase(),
          input.withholdingDefaultPct || '0',
          input.declarationDate,
          input.recordDate,
          input.exDividendDate || null,
          input.paymentDate,
          input.description || null,
          input.notes || null,
          JSON.stringify(input.supportingDocuments || []),
          JSON.stringify(input.metadata || {}),
        ],
      )
      const event = mapDividend(result.rows[0])
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_CREATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: event.id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: event.issuerId,
          metadata: {
            kind: event.kind,
            paymentDate: event.paymentDate,
            rateAmount: event.rateAmount,
            rateType: event.rateType,
            recordDate: event.recordDate,
          },
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return event
    })
  }

  async update(id: string, input: UpdateDividendDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'DRAFT' && existing.status !== 'CHANGES_REQUESTED') {
        throw new ConflictException('Only DRAFT or CHANGES_REQUESTED dividends can be edited')
      }
      assertVersionMatches(existing, input.expectedVersion)
      const declarationDate = input.declarationDate ?? formatDate(existing.declaration_date)
      const recordDate = input.recordDate ?? formatDate(existing.record_date)
      const paymentDate = input.paymentDate ?? formatDate(existing.payment_date)
      const exDividendDate = input.exDividendDate ?? (existing.ex_dividend_date ? formatDate(existing.ex_dividend_date) : undefined)

      if (!isValidRecordDate(recordDate, paymentDate, declarationDate)) {
        throw new BadRequestException('declarationDate <= recordDate <= paymentDate is required')
      }
      if (!isValidExDividendDate(exDividendDate, recordDate, declarationDate)) {
        throw new BadRequestException('exDividendDate must lie between declarationDate and recordDate')
      }

      const { rateAmount, ratePerShareCents } = resolveRate({
        rateAmount: input.rateAmount ?? existing.rate_amount,
        ratePerShareCents: input.ratePerShareCents ?? existing.rate_per_share_cents,
        rateType: (input.rateType ?? existing.rate_type) as DividendRateType,
      })
      const effectiveKind = (input.kind ?? existing.kind) as DividendKind | undefined
      assertPositiveCashRate(effectiveKind, rateAmount, ratePerShareCents)

      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET
            kind = $2,
            rate_type = $3,
            rate_amount = $4,
            rate_per_share_cents = $5,
            currency = $6,
            withholding_default_pct = $7,
            declaration_date = $8,
            record_date = $9,
            ex_dividend_date = $10,
            payment_date = $11,
            description = $12,
            notes = $13,
            supporting_documents = $14::jsonb,
            metadata = $15::jsonb,
            version = version + 1,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.kind ?? existing.kind,
          (input.rateType ?? existing.rate_type) as DividendRateType,
          rateAmount,
          ratePerShareCents,
          (input.currency ?? existing.currency).toUpperCase(),
          input.withholdingDefaultPct ?? existing.withholding_default_pct,
          declarationDate,
          recordDate,
          exDividendDate || null,
          paymentDate,
          input.description ?? existing.description,
          input.notes ?? existing.notes,
          JSON.stringify(input.supportingDocuments ?? existing.supporting_documents ?? []),
          JSON.stringify({ ...existing.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_UPDATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: {},
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async submitForApproval(id: string, input: SubmitForApprovalDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'DRAFT' && existing.status !== 'CHANGES_REQUESTED') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.submitForApproval)
      }
      assertVersionMatches(existing, input.expectedVersion)
      assertDividendTransition(existing.status, 'PENDING_APPROVAL')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'PENDING_APPROVAL', version = version + 1, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.recordApproval(client, id, 'REQUESTED', actor, input.decisionNotes, input.metadata)
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_SUBMITTED_FOR_APPROVAL,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: { decisionNotes: input.decisionNotes },
          severity: 'LOW',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async approve(id: string, input: ApproveDividendDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.approve)
      }
      assertVersionMatches(existing, input.expectedVersion)
      assertDividendTransition(existing.status, 'APPROVED')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'APPROVED', approved_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.recordApproval(client, id, 'APPROVED', actor, input.decisionNotes, input.metadata)
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_APPROVED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: { decisionNotes: input.decisionNotes },
          severity: 'MEDIUM',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async reject(id: string, input: RejectDividendDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.reject)
      }
      assertVersionMatches(existing, input.expectedVersion)
      assertDividendTransition(existing.status, 'REJECTED')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'REJECTED', rejected_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.recordApproval(client, id, 'REJECTED', actor, input.reason, input.metadata)
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_REJECTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: { reason: input.reason },
          severity: 'HIGH',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  /**
   * Reviewer asks the issuer to amend the declaration before re-review.
   * The dividend is sent to `CHANGES_REQUESTED`, where it is re-editable
   * (like a draft) and re-submittable. A `CHANGES_REQUESTED` approval
   * row + audit event capture the reviewer's reason.
   */
  async requestChanges(id: string, input: RequestChangesDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.requestChanges)
      }
      assertVersionMatches(existing, input.expectedVersion)
      assertDividendTransition(existing.status, 'CHANGES_REQUESTED')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET
            status = 'CHANGES_REQUESTED',
            changes_requested_at = NOW(),
            version = version + 1,
            updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.recordApproval(client, id, 'CHANGES_REQUESTED', actor, input.reason, input.metadata)
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_CHANGES_REQUESTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: { reason: input.reason },
          severity: 'MEDIUM',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  /**
   * Captures the eligibility roster as of the record date and locks the
   * dividend in `ELIGIBILITY_LOCKED`. Idempotent: re-running on an
   * already-locked dividend refreshes the snapshot rows but does not
   * change status or emit a duplicate lock-audit event.
   */
  async lockEligibility(id: string, actor: ActorContext): Promise<{ event: DividendEvent; snapshot: DividendEligibilitySnapshot }> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'APPROVED' && existing.status !== 'DECLARED' && existing.status !== 'ELIGIBILITY_LOCKED') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.lockEligibility)
      }
      const wasLocked = existing.status === 'ELIGIBILITY_LOCKED'
      const snapshot = await this.captureEligibilitySnapshot(client, existing, actor)
      let event: DividendEvent
      if (!wasLocked) {
        assertDividendTransition(existing.status, 'ELIGIBILITY_LOCKED')
        const result = await client.query<DividendRow>(
          `UPDATE dividend_events SET status = 'ELIGIBILITY_LOCKED', eligibility_locked_at = NOW(),
                                      version = version + 1, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id],
        )
        event = mapDividend(result.rows[0])

        for (const action of [AuditActions.DIVIDEND_ELIGIBILITY_LOCKED, AuditActions.DIVIDEND_ELIGIBILITY_SNAPSHOT_LOCKED]) {
          await this.auditService.record(
            {
              action,
              actorId: actor.actorId,
              actorRole: actor.actorRole,
              entityId: id,
              entityType: 'DIVIDEND_EVENT',
              ip: actor.ip,
              issuerId: existing.issuer_id,
              metadata: {
                eligibleHolderCount: snapshot.holderCount,
                excludedHolderCount: snapshot.excludedHolderCount,
                recordDate: snapshot.recordDate,
                snapshotId: snapshot.id,
                totalEligibleShares: snapshot.totalEligibleShares,
              },
              severity: 'MEDIUM',
              sourceContext: { component: 'dividends', system: 'HTTP_API' },
              userAgent: actor.userAgent,
            },
            client,
          )
        }
      } else {
        event = mapDividend(existing)
      }
      return { event, snapshot }
    })
  }

  /**
   * Calculates (or recalculates) entitlements from the locked
   * eligibility snapshot.
   *
   * Idempotency:
   * - Re-running on the same dividend safely deletes prior entitlements
   *   for the dividend and writes a fresh set with `calculation_version`
   *   bumped by 1.
   * - Re-running before payment scheduling bumps the version and emits
   *   `DIVIDEND_ENTITLEMENTS_RECALCULATED`.
   *
   * Lock gate:
   * - Once status is `PAYMENT_SCHEDULED` (or later), recalculation is
   *   refused unless `force === true` AND the actor is an internal
   *   admin AND a `reason` is supplied. The override path emits
   *   `DIVIDEND_CALCULATION_LOCKED` (the lock event) plus
   *   `DIVIDEND_ENTITLEMENTS_RECALCULATED` with the override metadata.
   */
  async calculateEntitlements(
    id: string,
    input: CalculateEntitlementsDto,
    actor: ActorContext,
  ): Promise<{ event: DividendEvent; entitlements: DividendEntitlement[]; summary: DividendCalculationSummary }> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      const isInitialCalc = !isCalculatedOrLater(existing.status)
      const isPaymentLocked = existing.status === 'PAYMENT_SCHEDULED' || existing.status === 'PARTIALLY_PAID' || existing.status === 'PAID'

      if (isInitialCalc && !isEligibilityLockedOrLater(existing.status)) {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.calculate)
      }
      if (existing.status === 'CANCELLED' || existing.status === 'REJECTED') {
        throw new ConflictException(`Cannot calculate entitlements for dividend in status ${existing.status}`)
      }
      if (isPaymentLocked) {
        if (!input.force) {
          throw new ConflictException('Calculations are locked once payment is scheduled. Pass `force: true` with a reason to override.')
        }
        if (!isInternalAdmin(actor)) {
          throw new ForbiddenException('Only internal admins can recalculate after payment scheduling')
        }
        if (!input.reason || !input.reason.trim()) {
          throw new BadRequestException('A reason is required when force-recalculating a payment-scheduled dividend')
        }
      }

      const snapshot = await this.requireSnapshot(client, id)

      const securityClassResult = await client.query<{ par_value_cents: number }>(
        `SELECT par_value_cents FROM share_classes WHERE id = $1`,
        [existing.share_class_id],
      )
      const parValueCents = securityClassResult.rows[0]?.par_value_cents ?? 0

      const overrides = input.withholdingOverrides || {}
      const overridesByAccountId = await this.resolveWithholdingOverrides(client, snapshot, overrides)

      // Pull tax-info / payment-method presence flags so the calculator
      // can attach the appropriate tax_status and emit warnings.
      const eligibleShareholderIds = Array.from(
        new Set(
          snapshot.snapshotPayload
            .filter(row => row.eligibilityStatus === 'ELIGIBLE' && row.shareholderId)
            .map(row => row.shareholderId as string),
        ),
      )
      const presence = await this.loadShareholderEligibilityFlags(client, eligibleShareholderIds)

      const calc = calculateFromRoster({
        kind: existing.kind,
        parValueCents,
        rateAmount: existing.rate_amount,
        rateType: existing.rate_type,
        roster: snapshot.snapshotPayload,
        shareholderHasPaymentMethod: presence.hasPaymentMethod,
        shareholderHasTaxInfo: presence.hasTaxInfo,
        withholdingDefaultPct: existing.withholding_default_pct,
        withholdingOverrides: overridesByAccountId,
      })

      const previousVersion = Number(existing.calculation_version || 0)
      const nextVersion = previousVersion + 1

      // Wipe prior derived rows. Snapshot rows are preserved so the
      // record-date roster stays immutable.
      await client.query(`DELETE FROM dividend_tax_withholdings WHERE dividend_event_id = $1`, [id])
      await client.query(`DELETE FROM dividend_entitlements WHERE dividend_event_id = $1`, [id])

      const entitlements: DividendEntitlement[] = []
      for (const draft of calc.drafts) {
        const entitlementId = shortId('ent')
        const pct = overridesByAccountId[draft.accountId] ?? existing.withholding_default_pct
        const inserted = await client.query<EntitlementRow>(
          `INSERT INTO dividend_entitlements (
              id, dividend_event_id, eligibility_snapshot_id, account_id, shareholder_id,
              shares_held, shares_held_decimal, amount_cents, gross_amount_cents,
              withholding_cents, net_amount_cents, withholding_pct, status, frozen_at,
              currency, tax_status, calculation_version, metadata
           ) VALUES (
              $1, $2, $3, $4, $5,
              $6::bigint, $7, $8::bigint, $8::bigint,
              $9::bigint, $10::bigint, $11, 'CALCULATED', NOW(),
              $12, $13, $14, '{}'::jsonb
           ) RETURNING *`,
          [
            entitlementId,
            id,
            snapshot.id,
            draft.accountId,
            draft.shareholderId,
            decimalToBigIntFloor(draft.sharesHeld),
            draft.sharesHeld,
            draft.amountCents,
            draft.withholdingCents,
            draft.netAmountCents,
            pct.toString(),
            existing.currency,
            draft.taxStatus,
            nextVersion,
          ],
        )
        entitlements.push(mapEntitlement(inserted.rows[0]))

        if (draft.withholdingCents > 0) {
          const withholdingId = shortId('whw')
          await client.query(
            `INSERT INTO dividend_tax_withholdings (
                id, dividend_event_id, entitlement_id, shareholder_id, jurisdiction, withholding_pct,
                taxable_amount_cents, withholding_cents, reason, metadata
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb)`,
            [
              withholdingId,
              id,
              entitlementId,
              draft.shareholderId,
              'US',
              pct.toString(),
              draft.amountCents,
              draft.withholdingCents,
              'auto-calculated default withholding',
            ],
          )
        }
      }

      const totals = totalsFromDrafts(calc.drafts)

      // Status only advances on the first calc; recalculations preserve
      // status (CALCULATED stays CALCULATED, payment-scheduled stays
      // PAYMENT_SCHEDULED with a force-override audit).
      let result
      if (isInitialCalc) {
        assertDividendTransition(existing.status, 'CALCULATED')
        result = await client.query<DividendRow>(
          `UPDATE dividend_events SET
              status = 'CALCULATED',
              calculated_at = NOW(),
              total_distribution_cents = $2::bigint,
              version = version + 1,
              calculation_version = $3,
              updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, totals.totalGrossCents, nextVersion],
        )
      } else {
        result = await client.query<DividendRow>(
          `UPDATE dividend_events SET
              total_distribution_cents = $2::bigint,
              version = version + 1,
              calculation_version = $3,
              updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, totals.totalGrossCents, nextVersion],
        )
      }

      const auditAction = isInitialCalc ? AuditActions.DIVIDEND_ENTITLEMENTS_CALCULATED : AuditActions.DIVIDEND_ENTITLEMENTS_RECALCULATED
      await this.auditService.record(
        {
          action: auditAction,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: {
            calculationVersion: nextVersion,
            entitlementCount: entitlements.length,
            force: isPaymentLocked,
            previousCalculationVersion: previousVersion,
            previousStatus: existing.status,
            reason: input.reason,
            totalGrossCents: totals.totalGrossCents,
            totalNetCents: totals.totalNetCents,
            totalWithholdingCents: totals.totalWithholdingCents,
            warningCount: calc.warnings.length,
          },
          severity: isPaymentLocked ? 'HIGH' : 'MEDIUM',
          sourceContext: { component: 'dividends', correlationId: `div:${id}`, system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )

      // Emit a separate `CALCULATION_LOCKED` audit when the override
      // path was taken so reviewers can find these in the audit feed
      // even when filtering only on the lock action.
      if (isPaymentLocked) {
        await this.auditService.record(
          {
            action: AuditActions.DIVIDEND_CALCULATION_LOCKED,
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            entityId: id,
            entityType: 'DIVIDEND_EVENT',
            ip: actor.ip,
            issuerId: existing.issuer_id,
            metadata: { calculationVersion: nextVersion, override: true, reason: input.reason },
            severity: 'HIGH',
            sourceContext: { component: 'dividends', system: 'HTTP_API' },
            userAgent: actor.userAgent,
          },
          client,
        )
      }

      const event = mapDividend(result.rows[0])
      const summary = buildCalculationSummary(event, snapshot, totals, calc.warnings)
      return { entitlements, event, summary }
    })
  }

  /**
   * Read-only projection of the most recent calculation. Returns
   * `undefined` when no entitlements exist yet so the caller can choose
   * how to render an "uncalculated" state.
   */
  async getCalculationSummary(id: string): Promise<DividendCalculationSummary | undefined> {
    const dividend = await this.getById(id)
    const snapshot = await this.getSnapshot(id)
    if (!snapshot) return undefined
    const totalsResult = await this.database.query<{
      gross: string | null
      withholding: string | null
      net: string | null
      shares: string | null
      version: number | string | null
      count: string | null
    }>(
      `SELECT
         COALESCE(SUM(gross_amount_cents), 0)::text AS gross,
         COALESCE(SUM(withholding_cents), 0)::text AS withholding,
         COALESCE(SUM(net_amount_cents), 0)::text AS net,
         COALESCE(SUM(shares_held_decimal), 0)::text AS shares,
         MAX(calculation_version) AS version,
         COUNT(*)::text AS count
       FROM dividend_entitlements WHERE dividend_event_id = $1`,
      [id],
    )
    const totalsRow = totalsResult.rows[0]
    if (!totalsRow || Number(totalsRow.count || 0) === 0) return undefined
    const totals = {
      totalEligibleShares: totalsRow.shares ?? '0',
      totalGrossCents: Number(totalsRow.gross || 0),
      totalNetCents: Number(totalsRow.net || 0),
      totalWithholdingCents: Number(totalsRow.withholding || 0),
    }
    const warnings = buildCalculationSummaryWarnings(snapshot)
    const summary = buildCalculationSummary(dividend, snapshot, totals, warnings)
    summary.calculationVersion = Number(totalsRow.version || dividend.calculationVersion || 1)
    return summary
  }

  /** Returns presence flags for downstream calculation warnings. */
  private async loadShareholderEligibilityFlags(
    client: PoolClient,
    shareholderIds: string[],
  ): Promise<{ hasTaxInfo: Record<string, boolean>; hasPaymentMethod: Record<string, boolean> }> {
    if (!shareholderIds.length) return { hasPaymentMethod: {}, hasTaxInfo: {} }
    const result = await client.query<{ id: string; tax_id_last4: string | null }>(
      `SELECT id, tax_id_last4 FROM shareholders WHERE id = ANY($1::text[])`,
      [shareholderIds],
    )
    const hasTaxInfo: Record<string, boolean> = {}
    const hasPaymentMethod: Record<string, boolean> = {}
    for (const row of result.rows) {
      hasTaxInfo[row.id] = Boolean(row.tax_id_last4)
      // Payment method tracking lives on a separate table that may not
      // exist in every deployment yet; default to `true` so the missing
      // record doesn't generate noisy warnings until the table lands.
      hasPaymentMethod[row.id] = true
    }
    return { hasPaymentMethod, hasTaxInfo }
  }

  async cancel(id: string, input: CancelDividendDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (isTerminalDividendStatus(existing.status)) {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.cancel)
      }
      assertVersionMatches(existing, input.expectedVersion)

      const wantsForce = input.force === true
      const requiresOverride = !canCancelDividend(existing.status)

      if (requiresOverride) {
        if (!canForceCancelDividend(existing.status)) {
          throw new ConflictException(LIFECYCLE_REQUIREMENTS.cancel)
        }
        if (!wantsForce) {
          throw new ConflictException(LIFECYCLE_REQUIREMENTS.cancelOverride)
        }
        if (!isInternalAdmin(actor)) {
          throw new ForbiddenException('Only internal admins can force-cancel a dividend after payment scheduling')
        }
      }

      assertDividendTransition(existing.status, 'CANCELLED')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'CANCELLED', cancelled_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await client.query(
        `UPDATE dividend_entitlements SET status = 'VOIDED', updated_at = NOW()
         WHERE dividend_event_id = $1 AND status IN ('PENDING', 'CALCULATED', 'HELD')`,
        [id],
      )
      await client.query(
        `UPDATE dividend_payment_batches SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
         WHERE dividend_event_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'FAILED')`,
        [id],
      )
      await this.auditService.record(
        {
          action: requiresOverride ? AuditActions.DIVIDEND_FORCE_CANCELLED : AuditActions.DIVIDEND_CANCELLED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: existing.issuer_id,
          metadata: { force: requiresOverride, previousStatus: existing.status, reason: input.reason },
          severity: 'HIGH',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  // ====================================================================
  // Communications — board resolutions, shareholder notices, market
  // announcements. Tracks status only; document storage is delegated.
  // ====================================================================

  async createCommunication(
    dividendId: string,
    input: {
      kind: DividendCommunicationKind
      subject?: string
      body?: string
      audience?: string
      channel?: DividendCommunication['channel']
      scheduledAt?: string
      documentRefs?: DividendDocumentRef[]
      metadata?: Record<string, unknown>
    },
    actor: ActorContext,
  ): Promise<DividendCommunication> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      const id = shortId('dcm')
      const result = await client.query<CommunicationRow>(
        `INSERT INTO dividend_communications (
            id, dividend_event_id, issuer_id, kind, status, subject, body, audience, channel,
            scheduled_at, document_refs, metadata
          ) VALUES (
            $1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb
          )
          RETURNING *`,
        [
          id,
          dividendId,
          dividend.issuer_id,
          input.kind,
          input.subject ?? null,
          input.body ?? null,
          input.audience ?? null,
          input.channel ?? null,
          input.scheduledAt ?? null,
          JSON.stringify(input.documentRefs ?? []),
          JSON.stringify(input.metadata ?? {}),
        ],
      )
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_COMMUNICATION_CREATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_COMMUNICATION',
          issuerId: dividend.issuer_id,
          metadata: { dividendId, kind: input.kind },
          severity: 'LOW',
        },
        client,
      )
      return mapCommunication(result.rows[0])
    })
  }

  async listCommunications(dividendId: string): Promise<DividendCommunication[]> {
    const result = await this.database.query<CommunicationRow>(
      `SELECT * FROM dividend_communications WHERE dividend_event_id = $1 ORDER BY created_at DESC`,
      [dividendId],
    )
    return result.rows.map(mapCommunication)
  }

  async submitCommunication(communicationId: string, actor: ActorContext): Promise<DividendCommunication> {
    return this.transitionCommunication(communicationId, 'PENDING_REVIEW', actor, AuditActions.DIVIDEND_COMMUNICATION_SUBMITTED)
  }

  async approveCommunication(communicationId: string, actor: ActorContext): Promise<DividendCommunication> {
    return this.transitionCommunication(communicationId, 'APPROVED', actor, AuditActions.DIVIDEND_COMMUNICATION_APPROVED, {
      approved_at: 'NOW()',
    })
  }

  async sendCommunication(
    communicationId: string,
    input: { sentAt?: string; reference?: string },
    actor: ActorContext,
  ): Promise<DividendCommunication> {
    return this.transitionCommunication(
      communicationId,
      'SENT',
      actor,
      AuditActions.DIVIDEND_COMMUNICATION_SENT,
      { sent_at: input.sentAt ? `'${input.sentAt}'` : 'NOW()' },
      { reference: input.reference },
    )
  }

  async cancelCommunication(communicationId: string, input: { reason: string }, actor: ActorContext): Promise<DividendCommunication> {
    return this.transitionCommunication(
      communicationId,
      'CANCELLED',
      actor,
      AuditActions.DIVIDEND_COMMUNICATION_CANCELLED,
      { cancelled_at: 'NOW()' },
      { reason: input.reason },
    )
  }

  private async transitionCommunication(
    id: string,
    target: DividendCommunicationStatus,
    actor: ActorContext,
    action: string,
    extraSets: Record<string, string> = {},
    auditExtras: Record<string, unknown> = {},
  ): Promise<DividendCommunication> {
    return this.database.tx(async client => {
      const existing = await client.query<CommunicationRow>(`SELECT * FROM dividend_communications WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Communication ${id} not found`)
      }
      const row = existing.rows[0]
      assertCommunicationTransition(row.status, target)

      const sets = [`status = '${target}'`, `updated_at = NOW()`]
      for (const [col, expr] of Object.entries(extraSets)) {
        sets.push(`${col} = ${expr}`)
      }
      const result = await client.query<CommunicationRow>(
        `UPDATE dividend_communications SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.auditService.record(
        {
          action,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_COMMUNICATION',
          issuerId: row.issuer_id,
          metadata: { dividendId: row.dividend_event_id, previousStatus: row.status, ...auditExtras },
          severity: target === 'SENT' ? 'MEDIUM' : 'LOW',
        },
        client,
      )
      return mapCommunication(result.rows[0])
    })
  }

  // ====================================================================
  // Fractional-share adjustments — applied per-entitlement using the
  // configured rounding policy. Stores an adjustment row + audit event
  // so the trail explains every cent of variance.
  // ====================================================================

  async applyFractionalAdjustments(
    dividendId: string,
    input: { policy: FractionalSharePolicy; priceCents?: number; reason?: string },
    actor: ActorContext,
  ): Promise<{
    dividend: DividendEvent
    adjustments: DividendFractionalAdjustment[]
    totalAdjustmentCents: number
  }> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      if (!isCalculatedOrLater(dividend.status)) {
        throw new ConflictException('Fractional adjustments require CALCULATED entitlements')
      }
      // Idempotency: replace prior adjustments for this dividend.
      await client.query(`DELETE FROM dividend_fractional_adjustments WHERE dividend_event_id = $1`, [dividendId])
      const entitlements = await client.query<EntitlementRow>(
        `SELECT * FROM dividend_entitlements WHERE dividend_event_id = $1 AND status NOT IN ('VOIDED', 'REVERSED')`,
        [dividendId],
      )
      const adjustments: DividendFractionalAdjustment[] = []
      let totalAdjustmentCents = 0
      for (const ent of entitlements.rows) {
        const sharesText = ent.shares_held_decimal?.toString() || ent.shares_held?.toString() || '0'
        const policyResult = applyFractionalPolicy({
          policy: input.policy,
          priceCents: input.priceCents,
          shares: sharesText,
        })
        // Skip zero-fractional rows for the adjustments table — no
        // audit value, and they bloat the result set for round-lot
        // dividends.
        if (policyResult.fractionalShares === '0' && policyResult.adjustmentCents === 0 && policyResult.residualCashCents === 0) {
          continue
        }
        const id = shortId('dfa')
        const inserted = await client.query<FractionalAdjustmentRow>(
          `INSERT INTO dividend_fractional_adjustments (
              id, dividend_event_id, entitlement_id, shareholder_id, policy,
              fractional_shares, whole_shares_issued, adjustment_cents, reason, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10::jsonb)
            RETURNING *`,
          [
            id,
            dividendId,
            ent.id,
            ent.shareholder_id,
            input.policy,
            policyResult.fractionalShares,
            policyResult.wholeShares,
            policyResult.adjustmentCents,
            input.reason ?? null,
            JSON.stringify({ priceCents: input.priceCents }),
          ],
        )
        adjustments.push(mapFractionalAdjustment(inserted.rows[0]))
        totalAdjustmentCents += policyResult.adjustmentCents
        // For CASH_IN_LIEU on a stock dividend the residual is added to
        // the entitlement's net amount. For pure cash dividends with
        // fractional rate, this is a no-op since rate × shares already
        // produced the correct cents.
        if (policyResult.adjustmentCents !== 0) {
          await client.query(
            `UPDATE dividend_entitlements
              SET net_amount_cents = net_amount_cents + $2,
                  updated_at = NOW()
              WHERE id = $1`,
            [ent.id, policyResult.adjustmentCents],
          )
        }
      }
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_FRACTIONAL_ADJUSTMENT_APPLIED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: dividendId,
          entityType: 'DIVIDEND_EVENT',
          issuerId: dividend.issuer_id,
          metadata: {
            adjustmentsApplied: adjustments.length,
            policy: input.policy,
            reason: input.reason,
            totalAdjustmentCents,
          },
          severity: 'LOW',
        },
        client,
      )
      const refreshed = await client.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1`, [dividendId])
      return { adjustments, dividend: mapDividend(refreshed.rows[0]), totalAdjustmentCents }
    })
  }

  async listFractionalAdjustments(dividendId: string): Promise<DividendFractionalAdjustment[]> {
    const result = await this.database.query<FractionalAdjustmentRow>(
      `SELECT * FROM dividend_fractional_adjustments WHERE dividend_event_id = $1 ORDER BY created_at`,
      [dividendId],
    )
    return result.rows.map(mapFractionalAdjustment)
  }

  // ====================================================================
  // DRIP execution — distinct from the standing reinvestment instruction.
  // For each entitlement whose holder has an active election, we compute
  // shares × purchase price and create a reinvestment record. Residuals
  // honour the configured fractional policy.
  // ====================================================================

  async executeDrip(
    dividendId: string,
    input: { purchasePrice: string; fractionalShareHandling?: FractionalSharePolicy },
    actor: ActorContext,
  ): Promise<{ dividend: DividendEvent; records: DividendReinvestmentRecord[] }> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      if (!isCalculatedOrLater(dividend.status)) {
        throw new ConflictException('DRIP execution requires CALCULATED entitlements')
      }
      const policy: FractionalSharePolicy = input.fractionalShareHandling ?? 'CASH_IN_LIEU'
      const priceText = input.purchasePrice
      const priceCents = decimalToCents(priceText)
      if (priceCents <= 0) {
        throw new BadRequestException('purchasePrice must be positive')
      }

      const electing = await client.query<{
        entitlement_id: string
        shareholder_id: string
        account_id: string
        net_amount_cents: string
        percentage: string
      }>(
        `SELECT e.id AS entitlement_id, e.shareholder_id, e.account_id, e.net_amount_cents,
                d.percentage
           FROM dividend_entitlements e
           JOIN dividend_reinvestment_instructions d
             ON d.account_id = e.account_id AND d.enabled = TRUE
            AND (d.effective_to IS NULL OR d.effective_to >= NOW())
          WHERE e.dividend_event_id = $1
            AND e.status IN ('CALCULATED', 'PENDING')`,
        [dividendId],
      )

      const records: DividendReinvestmentRecord[] = []
      for (const row of electing.rows) {
        const netCents = Number(row.net_amount_cents)
        const percent = Number(row.percentage)
        if (!Number.isFinite(netCents) || netCents <= 0) continue
        const reinvestCents = Math.floor((netCents * percent) / 100)
        if (reinvestCents <= 0) continue

        // Decimal share count: reinvestCents / priceCents (both BigInt-safe ints).
        const wholeShareCount = reinvestCents / priceCents
        const sharesString = formatNonNegativeDecimal(wholeShareCount, 8)
        const fractionResult = applyFractionalPolicy({
          policy,
          priceCents,
          shares: sharesString,
        })

        const id = shortId('drr')
        await client.query(
          `INSERT INTO dividend_reinvestment_records (
              id, dividend_event_id, entitlement_id, shareholder_id, account_id, status,
              reinvested_amount_cents, purchase_price, shares_issued, fractional_share_handling, residual_cash_cents
            ) VALUES ($1, $2, $3, $4, $5, 'EXECUTED', $6, $7::numeric, $8::numeric, $9, $10)
            ON CONFLICT (dividend_event_id, entitlement_id) DO UPDATE
              SET status = EXCLUDED.status,
                  reinvested_amount_cents = EXCLUDED.reinvested_amount_cents,
                  purchase_price = EXCLUDED.purchase_price,
                  shares_issued = EXCLUDED.shares_issued,
                  fractional_share_handling = EXCLUDED.fractional_share_handling,
                  residual_cash_cents = EXCLUDED.residual_cash_cents,
                  updated_at = NOW()`,
          [
            id,
            dividendId,
            row.entitlement_id,
            row.shareholder_id,
            row.account_id,
            reinvestCents - fractionResult.residualCashCents,
            priceText,
            fractionResult.wholeShares.toString(),
            policy,
            fractionResult.residualCashCents,
          ],
        )
        // Reduce the cash entitlement by the reinvested amount; the
        // residual cash (if any) stays on the cash leg.
        const cashCarryForward = netCents - (reinvestCents - fractionResult.residualCashCents)
        await client.query(`UPDATE dividend_entitlements SET net_amount_cents = $2, updated_at = NOW() WHERE id = $1`, [
          row.entitlement_id,
          cashCarryForward,
        ])

        const inserted = await client.query<ReinvestmentRecordRow>(`SELECT * FROM dividend_reinvestment_records WHERE id = $1`, [id])
        if (inserted.rows[0]) records.push(mapReinvestmentRecord(inserted.rows[0]))
      }

      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_REINVESTMENT_EXECUTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: dividendId,
          entityType: 'DIVIDEND_EVENT',
          issuerId: dividend.issuer_id,
          metadata: { fractionalShareHandling: policy, recordCount: records.length },
          severity: 'MEDIUM',
        },
        client,
      )
      const refreshed = await client.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1`, [dividendId])
      return { dividend: mapDividend(refreshed.rows[0]), records }
    })
  }

  async listReinvestmentRecords(dividendId: string): Promise<DividendReinvestmentRecord[]> {
    const result = await this.database.query<ReinvestmentRecordRow>(
      `SELECT * FROM dividend_reinvestment_records WHERE dividend_event_id = $1 ORDER BY created_at`,
      [dividendId],
    )
    return result.rows.map(mapReinvestmentRecord)
  }

  // ====================================================================
  // Reconciliation exceptions — typed exception store with a resolution
  // loop. Captured automatically when payments fail/return, or manually
  // by an operator who spotted a break in the bank file.
  // ====================================================================

  async openReconciliationException(
    dividendId: string,
    input: {
      type: DividendReconciliationExceptionType
      description: string
      batchId?: string
      paymentId?: string
      expectedCents?: number
      observedCents?: number
      metadata?: Record<string, unknown>
    },
    actor: ActorContext,
  ): Promise<DividendReconciliationException> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      const id = shortId('drx')
      const result = await client.query<ReconciliationExceptionRow>(
        `INSERT INTO dividend_reconciliation_exceptions (
            id, dividend_event_id, batch_id, payment_id, type, status, description,
            expected_cents, observed_cents, metadata
          ) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, $9::jsonb)
          RETURNING *`,
        [
          id,
          dividendId,
          input.batchId ?? null,
          input.paymentId ?? null,
          input.type,
          input.description,
          input.expectedCents ?? null,
          input.observedCents ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      )
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_RECONCILIATION_EXCEPTION_OPENED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_RECONCILIATION_EXCEPTION',
          issuerId: dividend.issuer_id,
          metadata: { dividendId, paymentId: input.paymentId, type: input.type },
          severity: 'HIGH',
        },
        client,
      )
      return mapReconciliationException(result.rows[0])
    })
  }

  async resolveReconciliationException(
    exceptionId: string,
    input: { status: 'INVESTIGATING' | 'RESOLVED' | 'WAIVED'; resolution?: string; metadata?: Record<string, unknown> },
    actor: ActorContext,
  ): Promise<DividendReconciliationException> {
    return this.database.tx(async client => {
      const existing = await client.query<ReconciliationExceptionRow>(
        `SELECT * FROM dividend_reconciliation_exceptions WHERE id = $1 FOR UPDATE`,
        [exceptionId],
      )
      if (!existing.rows.length) {
        throw new NotFoundException(`Exception ${exceptionId} not found`)
      }
      const row = existing.rows[0]
      if (row.status === 'RESOLVED' || row.status === 'WAIVED') {
        throw new ConflictException(`Exception is already ${row.status}`)
      }
      const closed = input.status === 'RESOLVED' || input.status === 'WAIVED'
      const updated = await client.query<ReconciliationExceptionRow>(
        `UPDATE dividend_reconciliation_exceptions
            SET status = $2,
                resolution = COALESCE($3, resolution),
                resolved_at = CASE WHEN $4::boolean THEN NOW() ELSE resolved_at END,
                metadata = metadata || $5::jsonb
          WHERE id = $1 RETURNING *`,
        [exceptionId, input.status, input.resolution ?? null, closed, JSON.stringify(input.metadata ?? {})],
      )
      const dividend = await client.query<DividendRow>(`SELECT issuer_id FROM dividend_events WHERE id = $1`, [row.dividend_event_id])
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_RECONCILIATION_EXCEPTION_RESOLVED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: exceptionId,
          entityType: 'DIVIDEND_RECONCILIATION_EXCEPTION',
          issuerId: dividend.rows[0]?.issuer_id ?? '',
          metadata: {
            dividendId: row.dividend_event_id,
            previousStatus: row.status,
            resolution: input.resolution,
            status: input.status,
          },
          severity: 'MEDIUM',
        },
        client,
      )
      return mapReconciliationException(updated.rows[0])
    })
  }

  async listReconciliationExceptions(
    dividendId: string,
    filter: { status?: DividendReconciliationExceptionStatus } = {},
  ): Promise<DividendReconciliationException[]> {
    const params: unknown[] = [dividendId]
    let sql = `SELECT * FROM dividend_reconciliation_exceptions WHERE dividend_event_id = $1`
    if (filter.status) {
      params.push(filter.status)
      sql += ` AND status = $2`
    }
    sql += ` ORDER BY opened_at DESC`
    const result = await this.database.query<ReconciliationExceptionRow>(sql, params)
    return result.rows.map(mapReconciliationException)
  }

  // ====================================================================
  // Archive — final closeout. Locks the dividend so no further
  // adjustments are accepted; only readable from this point on.
  // ====================================================================

  async archiveDividend(dividendId: string, input: { reason?: string }, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, dividendId)
      if (existing.status !== 'PAID' && existing.status !== 'RECONCILED') {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.archive)
      }
      const openExceptions = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM dividend_reconciliation_exceptions
          WHERE dividend_event_id = $1 AND status IN ('OPEN', 'INVESTIGATING')`,
        [dividendId],
      )
      if (Number(openExceptions.rows[0]?.count ?? '0') > 0) {
        throw new ConflictException('Cannot archive a dividend with open reconciliation exceptions')
      }
      assertDividendTransition(existing.status, 'ARCHIVED')
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events
            SET status = 'ARCHIVED',
                archived_at = NOW(),
                version = version + 1,
                updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [dividendId],
      )
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_ARCHIVED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: dividendId,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: { previousStatus: existing.status, reason: input.reason },
          severity: 'MEDIUM',
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  // ====================================================================
  // Workflow stepper — aggregate read API used by the operator UI to
  // render the 11-step guided workflow.
  // ====================================================================

  async getWorkflowStepper(dividendId: string): Promise<DividendWorkflowStepper> {
    const dividend = await this.getById(dividendId)
    const [communications, snapshot, calculatedSummary, batches, exceptions, drip] = await Promise.all([
      this.listCommunications(dividendId),
      this.getSnapshot(dividendId),
      this.getCalculationSummary(dividendId),
      this.listBatches(dividendId, { limit: 100, page: 1, pageSize: 100, sortDir: 'desc' } as unknown as BatchListQuery),
      this.listReconciliationExceptions(dividendId),
      this.listReinvestmentRecords(dividendId),
    ])
    const fractional = await this.listFractionalAdjustments(dividendId)
    const steps = buildWorkflowSteps({
      batches: batches.items,
      calculatedSummary,
      communications,
      dividend,
      exceptions,
      fractional,
      reinvestmentRecords: drip,
      snapshot: snapshot ?? null,
    })
    return {
      currentStepKey: steps.find(s => s.state === 'in_progress' || s.state === 'pending')?.key ?? null,
      dividendEventId: dividendId,
      generatedAt: new Date().toISOString(),
      status: dividend.status,
      steps,
    }
  }

  // ====================================================================
  // Payment batches & per-payment recording
  // ====================================================================

  async createPaymentBatch(
    dividendId: string,
    input: CreatePaymentBatchDto,
    actor: ActorContext,
  ): Promise<{ batch: DividendPaymentBatch; payments: DividendPayment[]; warnings: DividendWarning[] }> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      if (!isCalculatedOrLater(dividend.status)) {
        throw new ConflictException(LIFECYCLE_REQUIREMENTS.schedulePayment)
      }
      if (dividend.status === 'CANCELLED' || dividend.status === 'PAID') {
        throw new ConflictException(`Cannot create batch on dividend in status ${dividend.status}`)
      }

      const params: unknown[] = [dividendId]
      let entitlementFilter = `dividend_event_id = $1 AND status IN ('CALCULATED', 'PENDING', 'HELD')`
      if (input.entitlementIds && input.entitlementIds.length) {
        params.push(input.entitlementIds)
        entitlementFilter += ` AND id = ANY($${params.length}::text[])`
      }
      const entitlementRows = await client.query<EntitlementRow>(
        `SELECT * FROM dividend_entitlements WHERE ${entitlementFilter} ORDER BY id`,
        params,
      )
      if (!entitlementRows.rows.length) {
        throw new BadRequestException('No eligible entitlements available for the requested batch')
      }

      // Reject entitlements that already settled or that are bound to a
      // non-terminal batch — preventing double-pay is the central
      // invariant of this workflow.
      const claimed = await client.query<{ entitlement_id: string; status: DividendPaymentStatus; batch_id: string | null }>(
        `SELECT p.entitlement_id, p.status, p.batch_id
         FROM dividend_payments p
         LEFT JOIN dividend_payment_batches b ON b.id = p.batch_id
         WHERE p.entitlement_id = ANY($1::text[])
           AND (
             p.status IN ('PAID', 'SETTLED', 'RECONCILED')
             OR (b.id IS NOT NULL AND b.status NOT IN ('CANCELLED', 'FAILED'))
           )`,
        [entitlementRows.rows.map(row => row.id)],
      )
      if (claimed.rows.length) {
        throw new ConflictException(
          `Entitlements already attached to another batch or already paid: ${claimed.rows.map(row => row.entitlement_id).join(', ')}`,
        )
      }

      const method: DividendPaymentMethod = input.method || 'ACH'
      const batchId = shortId('dbt')
      const batchNumber = input.batchNumber || (await this.nextBatchNumber(client, dividendId))
      const paymentDate = input.paymentDate || formatDate(dividend.payment_date)
      const totalGross = entitlementRows.rows.reduce((sum, row) => sum + Number(row.gross_amount_cents), 0)
      const totalWithholding = entitlementRows.rows.reduce((sum, row) => sum + Number(row.withholding_cents), 0)
      const totalNet = entitlementRows.rows.reduce((sum, row) => sum + Number(row.net_amount_cents), 0)

      const batchInsert = await client.query<BatchRow>(
        `INSERT INTO dividend_payment_batches (
            id, dividend_event_id, issuer_id, batch_number, currency, payment_date,
            method, status, scheduled_at, created_by,
            payment_count, total_gross_cents, total_withholding_cents, total_net_cents,
            notes, metadata
         ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, 'DRAFT', $8, $9,
            $10, $11::bigint, $12::bigint, $13::bigint,
            $14, $15::jsonb
         ) RETURNING *`,
        [
          batchId,
          dividendId,
          dividend.issuer_id,
          batchNumber,
          dividend.currency,
          paymentDate || null,
          method,
          input.scheduledAt || null,
          actor.actorId || null,
          entitlementRows.rows.length,
          totalGross,
          totalWithholding,
          totalNet,
          input.notes || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      const batch = mapBatch(batchInsert.rows[0])

      const payments: DividendPayment[] = []
      for (const entitlementRow of entitlementRows.rows) {
        const paymentId = shortId('dpy')
        const inserted = await client.query<PaymentRow>(
          `INSERT INTO dividend_payments (
              id, dividend_event_id, batch_id, entitlement_id, account_id, shareholder_id,
              gross_amount_cents, withholding_cents, net_amount_cents, currency, method, status, attempt_no, metadata
           ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7::bigint, $8::bigint, $9::bigint, $10, $11, 'PENDING', 1, '{}'::jsonb
           ) RETURNING *`,
          [
            paymentId,
            dividendId,
            batchId,
            entitlementRow.id,
            entitlementRow.account_id,
            entitlementRow.shareholder_id,
            Number(entitlementRow.gross_amount_cents),
            Number(entitlementRow.withholding_cents),
            Number(entitlementRow.net_amount_cents),
            dividend.currency,
            method,
          ],
        )
        payments.push(mapPayment(inserted.rows[0]))
      }

      await client.query(
        `UPDATE dividend_entitlements SET status = 'HELD', payment_method = $2, updated_at = NOW()
         WHERE dividend_event_id = $1 AND id = ANY($3::text[])`,
        [dividendId, method, entitlementRows.rows.map(row => row.id)],
      )

      const warnings = await this.detectBatchWarnings(client, payments)

      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_BATCH_CREATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: batchId,
          entityType: 'DIVIDEND_BATCH',
          ip: actor.ip,
          issuerId: dividend.issuer_id,
          metadata: {
            batchNumber,
            dividendEventId: dividendId,
            method,
            paymentCount: payments.length,
            totalNetCents: totalNet,
            warningCount: warnings.length,
          },
          severity: 'MEDIUM',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return { batch, payments, warnings }
    })
  }

  // ====================================================================
  // Batch lifecycle: submit / approve / reject / schedule / process
  // ====================================================================

  async submitBatch(batchId: string, input: SubmitBatchDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      this.assertBatchTransitionOrConflict(row.status, 'PENDING_APPROVAL', BATCH_LIFECYCLE_REQUIREMENTS.submit)
      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'PENDING_APPROVAL', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [batchId],
      )
      const batch = mapBatch(updated.rows[0])
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_SUBMITTED, 'LOW', {
        decisionNotes: input.decisionNotes,
      })
      return batch
    })
  }

  async approveBatch(batchId: string, input: ApproveBatchDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      this.assertBatchTransitionOrConflict(row.status, 'APPROVED', BATCH_LIFECYCLE_REQUIREMENTS.approve)
      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [batchId],
      )
      const batch = mapBatch(updated.rows[0])
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_APPROVED, 'MEDIUM', {
        decisionNotes: input.decisionNotes,
      })
      return batch
    })
  }

  async rejectBatch(batchId: string, input: RejectBatchDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      // Reject sends the batch back to DRAFT for editing.
      this.assertBatchTransitionOrConflict(row.status, 'DRAFT', BATCH_LIFECYCLE_REQUIREMENTS.reject)
      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'DRAFT', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [batchId],
      )
      const batch = mapBatch(updated.rows[0])
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_REJECTED, 'MEDIUM', {
        reason: input.reason,
      })
      return batch
    })
  }

  async scheduleBatch(batchId: string, input: ScheduleBatchDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      this.assertBatchTransitionOrConflict(row.status, 'SCHEDULED', BATCH_LIFECYCLE_REQUIREMENTS.schedule)

      const payments = await client.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE batch_id = $1`, [batchId])
      const warnings = await this.detectBatchWarnings(client, payments.rows.map(mapPayment))
      const blockers = warnings.filter(warning => warning.code === 'MISSING_PAYMENT_METHOD' || warning.code === 'BLOCKED_HOLDER')
      if (blockers.length) {
        if (!input.force) {
          throw new ConflictException(BATCH_LIFECYCLE_REQUIREMENTS.forceSchedule)
        }
        if (!isInternalAdmin(actor)) {
          throw new ForbiddenException('Only internal admins can override missing payment instructions')
        }
        if (!input.reason || !input.reason.trim()) {
          throw new BadRequestException('reason is required when overriding the schedule guard')
        }
      }

      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'SCHEDULED', scheduled_at = COALESCE($2::timestamptz, NOW()), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [batchId, input.scheduledAt || null],
      )
      const batch = mapBatch(updated.rows[0])

      // Mark each payment as SCHEDULED so payment-file generators see a
      // consistent ready-to-disburse state. Skip transitions that the
      // state machine would reject (e.g. a previously cancelled payment).
      const paymentRows = payments.rows
      for (const payment of paymentRows) {
        if (payment.status === 'PENDING') {
          await client.query(`UPDATE dividend_payments SET status = 'SCHEDULED', updated_at = NOW() WHERE id = $1`, [payment.id])
        }
      }

      // Advance dividend status to PAYMENT_SCHEDULED on first scheduled batch.
      const dividend = await this.findForUpdate(client, row.dividend_event_id)
      if (dividend.status === 'CALCULATED') {
        assertDividendTransition(dividend.status, 'PAYMENT_SCHEDULED')
        await client.query(
          `UPDATE dividend_events SET status = 'PAYMENT_SCHEDULED', scheduled_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [row.dividend_event_id],
        )
      }

      if (blockers.length) {
        await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_SCHEDULE_OVERRIDDEN, 'HIGH', {
          blockers: blockers.map(blocker => blocker.code),
          reason: input.reason,
        })
      }
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_SCHEDULED, 'MEDIUM', {
        scheduledAt: batch.scheduledAt?.toISOString(),
        warningCount: warnings.length,
      })
      return batch
    })
  }

  async markBatchProcessing(batchId: string, _input: MarkBatchProcessingDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      this.assertBatchTransitionOrConflict(row.status, 'PROCESSING', BATCH_LIFECYCLE_REQUIREMENTS.markProcessing)
      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'PROCESSING', started_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [batchId],
      )
      // Move SCHEDULED payments into PROCESSING so per-payment state
      // mirrors the batch.
      await client.query(
        `UPDATE dividend_payments SET status = 'PROCESSING', updated_at = NOW()
         WHERE batch_id = $1 AND status = 'SCHEDULED'`,
        [batchId],
      )
      const batch = mapBatch(updated.rows[0])
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_PROCESSING_STARTED, 'MEDIUM', {})
      return batch
    })
  }

  async cancelBatch(batchId: string, input: CancelBatchDto, actor: ActorContext): Promise<DividendPaymentBatch> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      if (isTerminalBatch(row.status)) {
        throw new ConflictException(BATCH_LIFECYCLE_REQUIREMENTS.cancel)
      }
      // PROCESSING/PARTIALLY_* batches can only be cancelled by an
      // internal admin since money may be in flight.
      if (
        (row.status === 'PROCESSING' || row.status === 'PARTIALLY_PROCESSED' || row.status === 'PARTIALLY_FAILED') &&
        !isInternalAdmin(actor)
      ) {
        throw new ForbiddenException('Only internal admins can cancel a batch that has started processing')
      }
      this.assertBatchTransitionOrConflict(row.status, 'CANCELLED', BATCH_LIFECYCLE_REQUIREMENTS.cancel)

      const updated = await client.query<BatchRow>(
        `UPDATE dividend_payment_batches SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [batchId],
      )
      // Release any non-paid payments and roll affected entitlements
      // back to CALCULATED so they can be re-batched later.
      await client.query(
        `UPDATE dividend_payments SET status = 'CANCELLED', updated_at = NOW()
         WHERE batch_id = $1 AND status NOT IN ('PAID', 'SETTLED', 'RECONCILED', 'CANCELLED')`,
        [batchId],
      )
      await client.query(
        `UPDATE dividend_entitlements SET status = 'CALCULATED', updated_at = NOW()
         WHERE id IN (
           SELECT entitlement_id FROM dividend_payments
           WHERE batch_id = $1 AND status = 'CANCELLED'
         )`,
        [batchId],
      )
      const batch = mapBatch(updated.rows[0])
      await this.auditBatch(client, batch, actor, AuditActions.DIVIDEND_BATCH_CANCELLED, 'HIGH', {
        reason: input.reason,
      })
      return batch
    })
  }

  async recordPayment(input: RecordPaymentDto, actor: ActorContext): Promise<DividendPayment> {
    return this.database.tx(async client => this.recordPaymentTx(client, input, actor))
  }

  /**
   * Bulk variant of `recordPayment`. Writes are best-effort per row;
   * any entry that fails state validation is collected and surfaced
   * in the response so the caller can correct + retry the failures
   * without losing the successes.
   */
  async bulkRecordPayments(
    input: BulkRecordPaymentsDto,
    actor: ActorContext,
  ): Promise<{ updated: DividendPayment[]; failures: Array<{ paymentId: string; reason: string }> }> {
    const updated: DividendPayment[] = []
    const failures: Array<{ paymentId: string; reason: string }> = []
    for (const entry of input.results) {
      try {
        const payment = await this.database.tx(client => this.recordPaymentTx(client, entry, actor))
        updated.push(payment)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        failures.push({ paymentId: entry.paymentId, reason })
      }
    }
    return { failures, updated }
  }

  /**
   * Apply a reconciliation file (or hand-typed entries) to a batch.
   * Each entry is matched to a payment by id, external_ref, or
   * idempotency key; matched + successful entries move to RECONCILED,
   * unmatched entries are reported in the summary so an operator can
   * triage them. The batch advances to RECONCILED when all of its
   * paid payments are reconciled.
   */
  async reconcileBatch(batchId: string, input: ReconcileBatchDto, actor: ActorContext): Promise<DividendReconciliationImportSummary> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      if (!isReconcilableBatchStatus(row.status)) {
        throw new ConflictException(BATCH_LIFECYCLE_REQUIREMENTS.reconcile)
      }

      const outcomes: DividendReconciliationOutcome[] = []
      const unmatchedReferences: string[] = []
      let alreadyReconciled = 0
      let errors = 0

      for (const entry of input.entries) {
        const matched = await this.matchReconciliationEntry(client, batchId, entry)
        if (!matched.payment) {
          unmatchedReferences.push(matched.reference)
          continue
        }
        const payment = matched.payment
        if (payment.status === 'RECONCILED') {
          alreadyReconciled += 1
          continue
        }
        if (!entry.success) {
          // The reconciliation file flagged a returned/failed payment.
          // Move it to RETURNED if the state machine allows.
          try {
            assertPaymentTransition(payment.status, 'RETURNED')
            await client.query(
              `UPDATE dividend_payments SET status = 'RETURNED', returned_at = NOW(),
                                            failure_reason = COALESCE($2, failure_reason),
                                            updated_at = NOW()
               WHERE id = $1`,
              [payment.id, entry.failureReason || null],
            )
            outcomes.push({
              matchedBy: matched.matchedBy,
              newStatus: 'RETURNED',
              paymentId: payment.id,
              previousStatus: payment.status,
              reconciledAt: new Date().toISOString(),
            })
          } catch {
            errors += 1
          }
          continue
        }

        try {
          assertPaymentTransition(payment.status, 'RECONCILED')
        } catch {
          errors += 1
          continue
        }
        await client.query(
          `UPDATE dividend_payments SET status = 'RECONCILED', reconciled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [payment.id],
        )
        outcomes.push({
          matchedBy: matched.matchedBy,
          newStatus: 'RECONCILED',
          paymentId: payment.id,
          previousStatus: payment.status,
          reconciledAt: new Date().toISOString(),
        })
      }

      // Roll the batch forward if everything reconciled.
      const tally = await this.tallyBatch(client, batchId)
      const allReconciled = tally.paid === 0 && tally.inFlight === 0 && tally.pending === 0 && tally.failed === 0 && tally.reconciled > 0
      if (allReconciled) {
        await client.query(
          `UPDATE dividend_payment_batches SET status = 'RECONCILED', reconciled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [batchId],
        )
      }

      const summary: DividendReconciliationImportSummary = {
        alreadyReconciled,
        batchId,
        errors,
        matched: outcomes.length,
        outcomes,
        totalEntries: input.entries.length,
        unmatched: unmatchedReferences.length,
        unmatchedReferences,
      }

      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_BATCH_RECONCILIATION_IMPORTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: batchId,
          entityType: 'DIVIDEND_BATCH',
          ip: actor.ip,
          issuerId: row.issuer_id,
          metadata: {
            alreadyReconciled,
            errors,
            matched: summary.matched,
            source: input.source,
            totalEntries: summary.totalEntries,
            unmatched: summary.unmatched,
          },
          severity: 'MEDIUM',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )

      if (allReconciled) {
        await this.auditService.record(
          {
            action: AuditActions.DIVIDEND_BATCH_RECONCILED,
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            entityId: batchId,
            entityType: 'DIVIDEND_BATCH',
            ip: actor.ip,
            issuerId: row.issuer_id,
            metadata: { reconciledCount: tally.reconciled },
            severity: 'MEDIUM',
            sourceContext: { component: 'dividends', system: 'HTTP_API' },
            userAgent: actor.userAgent,
          },
          client,
        )
      }
      return summary
    })
  }

  /**
   * Build an export-ready projection of a batch suitable for the
   * NACHA / SWIFT / check formatter that lives outside the dividend
   * module. We deliberately avoid emitting raw bank account info
   * here — that is the formatter's responsibility (it will resolve
   * the routing details from the shareholder profile at the moment
   * the file is generated).
   */
  async exportBatch(batchId: string, actor: ActorContext): Promise<DividendBatchExport> {
    return this.database.tx(async client => {
      const row = await this.findBatchForUpdate(client, batchId)
      const payments = await client.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE batch_id = $1 ORDER BY id`, [batchId])
      const batch = mapBatch(row)
      const rows: DividendBatchExportRow[] = payments.rows.map(record => ({
        accountId: record.account_id,
        currency: record.currency,
        entitlementId: record.entitlement_id,
        externalRef: record.external_ref || undefined,
        grossAmountCents: Number(record.gross_amount_cents),
        method: record.method,
        netAmountCents: Number(record.net_amount_cents),
        paymentId: record.id,
        shareholderId: record.shareholder_id,
        status: record.status,
        withholdingCents: Number(record.withholding_cents),
      }))
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_BATCH_EXPORTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: batchId,
          entityType: 'DIVIDEND_BATCH',
          ip: actor.ip,
          issuerId: row.issuer_id,
          metadata: { paymentCount: rows.length },
          severity: 'LOW',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        currency: batch.currency,
        dividendEventId: batch.dividendEventId,
        generatedAt: new Date().toISOString(),
        issuerId: batch.issuerId,
        method: batch.method,
        paymentCount: batch.paymentCount,
        paymentDate: batch.paymentDate,
        rows,
        totalGrossCents: batch.totalGrossCents,
        totalNetCents: batch.totalNetCents,
        totalWithholdingCents: batch.totalWithholdingCents,
      }
    })
  }

  /**
   * Fetch a single batch with its payments for the detail view.
   * Returns null if the batch is missing — callers map to a 404.
   */
  async getBatchDetail(batchId: string): Promise<{
    actions: DividendBatchAction[]
    batch: DividendPaymentBatch
    payments: DividendPayment[]
    warnings: DividendWarning[]
  } | null> {
    const batchResult = await this.database.query<BatchRow>(`SELECT * FROM dividend_payment_batches WHERE id = $1`, [batchId])
    if (!batchResult.rows.length) return null
    const paymentResult = await this.database.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE batch_id = $1 ORDER BY id`, [
      batchId,
    ])
    const batch = mapBatch(batchResult.rows[0])
    const payments = paymentResult.rows.map(mapPayment)
    const warnings = await this.detectBatchWarnings(undefined, payments)
    return {
      actions: allowedBatchActionsFor(batch.status, payments),
      batch,
      payments,
      warnings,
    }
  }

  // ====================================================================
  // Statements & DRIP instructions
  // ====================================================================

  async generateStatements(dividendId: string, input: GenerateStatementsDto, actor: ActorContext): Promise<DividendStatement[]> {
    return this.database.tx(async client => {
      const dividend = await this.findForUpdate(client, dividendId)
      if (!isCalculatedOrLater(dividend.status)) {
        throw new ConflictException('Dividend must be CALCULATED before statements can be generated')
      }

      const params: unknown[] = [dividendId]
      let where = `dividend_event_id = $1`
      if (input.entitlementIds && input.entitlementIds.length) {
        params.push(input.entitlementIds)
        where += ` AND id = ANY($${params.length}::text[])`
      }
      const entitlements = await client.query<EntitlementRow>(`SELECT * FROM dividend_entitlements WHERE ${where}`, params)

      const statementDate = input.statementDate || formatDate(dividend.payment_date)
      const statements: DividendStatement[] = []
      for (const entitlement of entitlements.rows) {
        const statementId = shortId('dst')
        const inserted = await client.query<StatementRow>(
          `INSERT INTO dividend_statements (
              id, dividend_event_id, entitlement_id, shareholder_id, account_id,
              gross_amount_cents, withholding_cents, net_amount_cents, currency,
              statement_date, status, metadata
           ) VALUES (
              $1, $2, $3, $4, $5,
              $6::bigint, $7::bigint, $8::bigint, $9,
              $10, 'READY', $11::jsonb
           )
           ON CONFLICT (dividend_event_id, entitlement_id) DO UPDATE SET
              gross_amount_cents = EXCLUDED.gross_amount_cents,
              withholding_cents = EXCLUDED.withholding_cents,
              net_amount_cents = EXCLUDED.net_amount_cents,
              statement_date = EXCLUDED.statement_date,
              status = 'READY',
              updated_at = NOW()
           RETURNING *`,
          [
            statementId,
            dividendId,
            entitlement.id,
            entitlement.shareholder_id,
            entitlement.account_id,
            Number(entitlement.gross_amount_cents),
            Number(entitlement.withholding_cents),
            Number(entitlement.net_amount_cents),
            dividend.currency,
            statementDate,
            JSON.stringify(input.metadata || {}),
          ],
        )
        statements.push(mapStatement(inserted.rows[0]))
      }

      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_STATEMENT_GENERATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: dividendId,
          entityType: 'DIVIDEND_EVENT',
          issuerId: dividend.issuer_id,
          metadata: { count: statements.length, statementDate },
          severity: 'LOW',
        },
        client,
      )
      return statements
    })
  }

  async upsertReinvestmentInstruction(
    input: UpsertReinvestmentInstructionDto,
    actor: ActorContext,
  ): Promise<DividendReinvestmentInstruction> {
    return this.database.tx(async client => {
      const id = shortId('drp')
      const result = await client.query<ReinvestmentRow>(
        `INSERT INTO dividend_reinvestment_instructions (
            id, issuer_id, shareholder_id, account_id, security_id, share_class_id,
            enabled, percentage, effective_from, effective_to, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (account_id, security_id, share_class_id, effective_from)
         DO UPDATE SET
            enabled = EXCLUDED.enabled,
            percentage = EXCLUDED.percentage,
            effective_to = EXCLUDED.effective_to,
            metadata = dividend_reinvestment_instructions.metadata || EXCLUDED.metadata,
            updated_at = NOW()
         RETURNING *`,
        [
          id,
          input.issuerId,
          input.shareholderId,
          input.accountId,
          input.securityId,
          input.shareClassId || null,
          input.enabled ?? true,
          input.percentage ?? 100,
          input.effectiveFrom,
          input.effectiveTo || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      const instruction = mapReinvestment(result.rows[0])
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_DRIP_INSTRUCTION_UPSERTED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: instruction.id,
          entityType: 'DIVIDEND_DRIP_INSTRUCTION',
          issuerId: instruction.issuerId,
          metadata: {
            accountId: instruction.accountId,
            enabled: instruction.enabled,
            percentage: instruction.percentage,
            shareholderId: instruction.shareholderId,
          },
        },
        client,
      )
      return instruction
    })
  }

  // ====================================================================
  // Listing helpers
  // ====================================================================

  async listEntitlements(dividendId: string, query: EntitlementListQuery): Promise<PaginatedResponse<DividendEntitlement>> {
    const where: string[] = [`dividend_event_id = $1`]
    const params: unknown[] = [dividendId]
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.accountId) {
      params.push(query.accountId)
      where.push(`account_id = $${params.length}`)
    }
    if (query.shareholderId) {
      params.push(query.shareholderId)
      where.push(`shareholder_id = $${params.length}`)
    }
    return this.runEntitlementQuery(where, params, query)
  }

  async listEntitlementsForShareholder(
    shareholderId: string,
    query: EntitlementListQuery,
  ): Promise<PaginatedResponse<DividendEntitlement>> {
    const merged = { ...query, shareholderId }
    const where: string[] = [`shareholder_id = $1`]
    const params: unknown[] = [shareholderId]
    if (merged.status) {
      params.push(merged.status)
      where.push(`status = $${params.length}`)
    }
    if (merged.accountId) {
      params.push(merged.accountId)
      where.push(`account_id = $${params.length}`)
    }
    return this.runEntitlementQuery(where, params, merged)
  }

  async listPayments(dividendId: string, query: PaymentListQuery): Promise<PaginatedResponse<DividendPayment>> {
    const where: string[] = [`dividend_event_id = $1`]
    const params: unknown[] = [dividendId]
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.batchId) {
      params.push(query.batchId)
      where.push(`batch_id = $${params.length}`)
    }
    if (query.shareholderId) {
      params.push(query.shareholderId)
      where.push(`shareholder_id = $${params.length}`)
    }
    if (query.accountId) {
      params.push(query.accountId)
      where.push(`account_id = $${params.length}`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const sort = resolveSort(query, PAYMENT_SORT, { column: 'created_at', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_payments ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')
    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length
    const rows = await this.database.query<PaymentRow>(
      `SELECT * FROM dividend_payments ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapPayment), total, query)
  }

  async listBatches(dividendId: string, query: BatchListQuery): Promise<PaginatedResponse<DividendPaymentBatch>> {
    const where: string[] = [`dividend_event_id = $1`]
    const params: unknown[] = [dividendId]
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const sort = resolveSort(query, BATCH_SORT, { column: 'created_at', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_payment_batches ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')
    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length
    const rows = await this.database.query<BatchRow>(
      `SELECT * FROM dividend_payment_batches ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapBatch), total, query)
  }

  async listApprovals(dividendId: string): Promise<DividendApproval[]> {
    const result = await this.database.query<ApprovalRow>(
      `SELECT * FROM dividend_approvals WHERE dividend_event_id = $1 ORDER BY decided_at ASC`,
      [dividendId],
    )
    return result.rows.map(mapApproval)
  }

  async listStatements(dividendId: string, query: { status?: DividendStatementStatus }): Promise<DividendStatement[]> {
    const where: string[] = [`dividend_event_id = $1`]
    const params: unknown[] = [dividendId]
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    const result = await this.database.query<StatementRow>(
      `SELECT * FROM dividend_statements WHERE ${where.join(' AND ')} ORDER BY statement_date DESC`,
      params,
    )
    return result.rows.map(mapStatement)
  }

  async listWithholdings(dividendId: string): Promise<DividendTaxWithholding[]> {
    const result = await this.database.query<WithholdingRow>(
      `SELECT * FROM dividend_tax_withholdings WHERE dividend_event_id = $1 ORDER BY created_at ASC`,
      [dividendId],
    )
    return result.rows.map(mapWithholding)
  }

  async getSnapshot(dividendId: string): Promise<DividendEligibilitySnapshot | null> {
    const result = await this.database.query<SnapshotRow>(`SELECT * FROM dividend_eligibility_snapshots WHERE dividend_event_id = $1`, [
      dividendId,
    ])
    return result.rows.length ? mapSnapshot(result.rows[0]) : null
  }

  // ====================================================================
  // AI-assisted reviews
  // ====================================================================
  //
  // The deterministic preflight engine (`dividends.preflight.ts`) is the
  // source of truth. The AI provider (`dividends.review.ts`) only
  // *rephrases* findings — it cannot invent risks/warnings or take
  // workflow actions. We persist both the deterministic report and the
  // AI prose so reviewers can verify the model didn't fabricate content.
  //
  // Behaviour matrix:
  //   • No `OPENAI_API_KEY`            → deterministic provider, confidence=1
  //   • `DIVIDEND_AI_REVIEW_DISABLED=1` → deterministic provider, confidence=1
  //   • OpenAI provider succeeds        → AI prose, confidence∈[0,1]
  //   • OpenAI provider errors          → deterministic baseline + persisted error string

  /**
   * Generate (and persist) an AI-assisted review of a dividend
   * declaration. Always succeeds — providers must fall back to
   * deterministic output rather than throwing. Records a
   * `DIVIDEND_AI_REVIEW_GENERATED` audit row.
   *
   * The provider is overrideable for tests; production callers leave it
   * undefined to pick up the env-driven default.
   */
  async generateAiReview(dividendId: string, actor: ActorContext, providerOverride?: DividendAiProvider): Promise<DividendAiReviewRecord> {
    const dividend = await this.getById(dividendId)
    const ctx = await this.buildReviewContext(dividend)
    const preflight = runPreflightChecks(ctx)
    const checklist = buildMissingInfoChecklist(preflight)
    const suggested = buildSuggestedActions(ctx, preflight)

    const provider = providerOverride ?? selectDefaultProvider()
    const { output, error } = await provider.review({ checklist, ctx, preflight, suggested })

    const id = shortId('dvr')
    const generatedAt = new Date()
    await this.database.query(
      `INSERT INTO dividend_ai_reviews
         (id, dividend_event_id, issuer_id, requested_by, provider, model, prompt_version,
          dividend_status, preflight, output, provider_error, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [
        id,
        dividend.id,
        dividend.issuerId,
        actor.actorId,
        provider.id,
        provider.model,
        provider.promptVersion,
        dividend.status,
        JSON.stringify(preflight),
        JSON.stringify(output),
        error || null,
        generatedAt.toISOString(),
      ],
    )

    await this.auditService.record({
      action: AuditActions.DIVIDEND_AI_REVIEW_GENERATED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      entityId: dividend.id,
      entityType: 'DIVIDEND_EVENT',
      issuerId: dividend.issuerId,
      metadata: {
        confidence: output.confidence,
        errorCount: preflight.errorCount,
        provider: provider.id,
        providerError: error,
        reviewId: id,
        warningCount: preflight.warningCount,
      },
      severity: preflight.blocking ? 'MEDIUM' : 'INFO',
    })

    return {
      dividendEventId: dividend.id,
      dividendStatus: dividend.status,
      generatedAt,
      id,
      issuerId: dividend.issuerId,
      model: provider.model,
      output,
      preflight,
      promptVersion: provider.promptVersion,
      provider: provider.id,
      providerError: error,
      requestedBy: actor.actorId,
    }
  }

  /**
   * Return persisted AI reviews for a declaration in newest-first order.
   * The output column is returned as the structured
   * `DividendAiReviewOutput` shape the UI consumes directly.
   */
  async listAiReviews(dividendId: string): Promise<DividendAiReviewRecord[]> {
    const result = await this.database.query<{
      id: string
      dividend_event_id: string
      issuer_id: string
      requested_by: string
      provider: string
      model: string
      prompt_version: string
      dividend_status: string
      preflight: PreflightReport
      output: DividendAiReviewOutput
      provider_error: string | null
      generated_at: Date | string
    }>(
      `SELECT id, dividend_event_id, issuer_id, requested_by, provider, model, prompt_version,
              dividend_status, preflight, output, provider_error, generated_at
       FROM dividend_ai_reviews
       WHERE dividend_event_id = $1
       ORDER BY generated_at DESC`,
      [dividendId],
    )
    return result.rows.map(row => ({
      dividendEventId: row.dividend_event_id,
      dividendStatus: row.dividend_status as DividendAiReviewRecord['dividendStatus'],
      generatedAt: row.generated_at instanceof Date ? row.generated_at : new Date(row.generated_at),
      id: row.id,
      issuerId: row.issuer_id,
      model: row.model,
      output: row.output,
      preflight: row.preflight,
      promptVersion: row.prompt_version,
      provider: row.provider,
      providerError: row.provider_error || undefined,
      requestedBy: row.requested_by,
    }))
  }

  /**
   * Build the `ReviewContext` consumed by `runPreflightChecks`. This
   * stays in the service (not the pure module) because gathering the
   * dependent rows requires DB access. We deliberately pull only the
   * fields the rule engine needs to keep the prompt grounded and small.
   */
  private async buildReviewContext(dividend: DividendEvent): Promise<ReviewContext> {
    const [snapshot, entitlements, batches, payments, approvals, prior] = await Promise.all([
      this.findSnapshotForDividend(dividend.id),
      this.listEntitlementsForDividend(dividend.id),
      this.listBatchesForDividend(dividend.id),
      this.listPaymentsForDividend(dividend.id),
      this.countApprovalsForDividend(dividend.id),
      this.listPriorDividendsForRate(dividend.issuerId, dividend.securityId, dividend.id),
    ])

    const [missingPaymentInstructions, missingTaxInfo] = await Promise.all([
      this.countShareholdersMissingField(entitlements, 'payment_instructions'),
      this.countShareholdersMissingField(entitlements, 'tax_info'),
    ])

    return {
      batches,
      calculatedSummary:
        dividend.totalDistributionCents > 0
          ? {
              entitlementCount: entitlements.length,
              paidCount: entitlements.filter(e => e.status === 'PAID').length,
              pendingCount: entitlements.filter(e => e.status !== 'PAID').length,
              totalEligibleShares: entitlements.reduce((s, e) => s + Number(e.sharesHeld || 0), 0).toString(),
              totalGrossCents: entitlements.reduce((s, e) => s + (e.grossAmountCents || 0), 0),
              totalNetCents: entitlements.reduce((s, e) => s + (e.netAmountCents || 0), 0),
              totalWithholdingCents: entitlements.reduce((s, e) => s + (e.withholdingCents || 0), 0),
            }
          : undefined,
      dividend,
      entitlements,
      hasApprovals: approvals > 0,
      payments,
      priorDividends: prior,
      shareholdersMissingPaymentInstructions: missingPaymentInstructions,
      shareholdersMissingTaxInfo: missingTaxInfo,
      snapshot: snapshot ?? undefined,
    }
  }

  private async findSnapshotForDividend(dividendId: string): Promise<DividendEligibilitySnapshot | undefined> {
    const result = await this.database.query<{
      id: string
      dividend_event_id: string
      issuer_id: string
      security_id: string
      share_class_id: string | null
      record_date: string
      captured_at: Date
      locked_at: Date | null
      holder_count: number
      excluded_holder_count: number
      total_eligible_shares: string
      snapshot_payload: unknown
      metadata: Record<string, unknown>
    }>(
      `SELECT id, dividend_event_id, issuer_id, security_id, share_class_id, record_date,
              captured_at, locked_at, holder_count, excluded_holder_count,
              total_eligible_shares, snapshot_payload, metadata
       FROM dividend_eligibility_snapshots
       WHERE dividend_event_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [dividendId],
    )
    if (result.rowCount === 0) return undefined
    const row = result.rows[0]
    return {
      capturedAt: row.captured_at,
      dividendEventId: row.dividend_event_id,
      excludedHolderCount: Number(row.excluded_holder_count) || 0,
      holderCount: Number(row.holder_count) || 0,
      id: row.id,
      issuerId: row.issuer_id,
      lockedAt: row.locked_at || undefined,
      metadata: row.metadata || {},
      recordDate:
        typeof row.record_date === 'string' ? row.record_date : new Date(row.record_date as unknown as string).toISOString().slice(0, 10),
      securityId: row.security_id,
      shareClassId: row.share_class_id || undefined,
      snapshotPayload: Array.isArray(row.snapshot_payload) ? (row.snapshot_payload as DividendEligibilitySnapshot['snapshotPayload']) : [],
      totalEligibleShares: row.total_eligible_shares,
    }
  }

  private async listEntitlementsForDividend(dividendId: string): Promise<DividendEntitlement[]> {
    const result = await this.database.query<{
      id: string
      gross_amount_cents: string | number
      withholding_cents: string | number
      net_amount_cents: string | number
      shares_held: string
      status: string
    }>(
      `SELECT id, gross_amount_cents, withholding_cents, net_amount_cents, shares_held, status
       FROM dividend_entitlements
       WHERE dividend_event_id = $1`,
      [dividendId],
    )
    return result.rows.map(
      row =>
        ({
          grossAmountCents: Number(row.gross_amount_cents) || 0,
          id: row.id,
          netAmountCents: Number(row.net_amount_cents) || 0,
          sharesHeld: row.shares_held,
          status: row.status,
          withholdingCents: Number(row.withholding_cents) || 0,
        }) as unknown as DividendEntitlement,
    )
  }

  private async listBatchesForDividend(dividendId: string): Promise<DividendPaymentBatch[]> {
    const result = await this.database.query<{
      id: string
      total_gross_cents: string | number
      status: string
    }>(`SELECT id, total_gross_cents, status FROM dividend_payment_batches WHERE dividend_event_id = $1`, [dividendId])
    return result.rows.map(
      row =>
        ({
          id: row.id,
          status: row.status,
          totalGrossCents: Number(row.total_gross_cents) || 0,
        }) as unknown as DividendPaymentBatch,
    )
  }

  private async listPaymentsForDividend(dividendId: string): Promise<DividendPayment[]> {
    const result = await this.database.query<{ id: string; status: string }>(
      `SELECT id, status FROM dividend_payments WHERE dividend_event_id = $1`,
      [dividendId],
    )
    return result.rows.map(row => ({ id: row.id, status: row.status }) as unknown as DividendPayment)
  }

  private async countApprovalsForDividend(dividendId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_approvals WHERE dividend_event_id = $1`,
      [dividendId],
    )
    return Number(result.rows[0]?.count) || 0
  }

  /** Prior comparable dividends for the historical-anomaly rule. */
  private async listPriorDividendsForRate(
    issuerId: string,
    securityId: string,
    excludeId: string,
  ): Promise<ReviewContext['priorDividends']> {
    const result = await this.database.query<{
      id: string
      rate_amount: string
      rate_type: string
      record_date: string
      payment_date: string
      total_distribution_cents: string | number
      currency: string
      status: string
    }>(
      `SELECT id, rate_amount, rate_type, record_date, payment_date,
              total_distribution_cents, currency, status
       FROM dividend_events
       WHERE issuer_id = $1 AND security_id = $2 AND id <> $3
         AND status NOT IN ('CANCELLED','REJECTED','DRAFT')
       ORDER BY record_date DESC
       LIMIT 12`,
      [issuerId, securityId, excludeId],
    )
    return result.rows.map(row => ({
      currency: row.currency,
      id: row.id,
      paymentDate: typeof row.payment_date === 'string' ? row.payment_date : String(row.payment_date),
      rateAmount: row.rate_amount,
      rateType: row.rate_type as DividendEvent['rateType'],
      recordDate: typeof row.record_date === 'string' ? row.record_date : String(row.record_date),
      status: row.status as DividendEvent['status'],
      totalDistributionCents: Number(row.total_distribution_cents) || 0,
    }))
  }

  /**
   * Best-effort count of distinct shareholders missing a given field.
   * The shareholders schema differs across deployments; we look for the
   * common payload columns and tolerate either being absent.
   */
  private async countShareholdersMissingField(
    entitlements: ReadonlyArray<DividendEntitlement>,
    field: 'payment_instructions' | 'tax_info',
  ): Promise<number> {
    const ids = uniq(entitlements.map(e => (e as unknown as { shareholderId?: string }).shareholderId).filter(Boolean) as string[])
    if (ids.length === 0) return 0
    const column = field === 'payment_instructions' ? 'payment_instructions' : 'tax_information'
    try {
      const result = await this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM shareholders
         WHERE id = ANY($1::text[])
           AND (${column} IS NULL OR ${column} = '{}'::jsonb)`,
        [ids],
      )
      return Number(result.rows[0]?.count) || 0
    } catch {
      return 0
    }
  }

  // ====================================================================
  // Reports & exports
  // ====================================================================
  //
  // Operational reporting endpoints. The CSV builders live in
  // `dividends.csv.ts` and the report aggregator in `dividends.reports.ts`
  // — this section just stitches the persistence layer to those pure
  // modules and emits a `DIVIDEND_REPORT_EXPORTED` audit row per call.
  //
  // Permission scoping is handled by the controller via `@Permissions`
  // and `@Scope`; the service only enforces existence checks. Each
  // export call accepts an optional `actor` so we can attribute the
  // audit row; missing actor falls back to `'system'`.

  /**
   * Operational headline metrics for the issuer / agent dashboard.
   * Optionally scoped to a single issuer; otherwise tenant-wide.
   */
  async getReportsSummary(
    options: { issuerId?: string; from?: string; to?: string } = {},
    actor?: ActorContext,
  ): Promise<DividendsReportsSummary> {
    const declarationParams: unknown[] = []
    const declarationWhere: string[] = []
    if (options.issuerId) {
      declarationParams.push(options.issuerId)
      declarationWhere.push(`issuer_id = $${declarationParams.length}`)
    }
    if (options.from) {
      declarationParams.push(options.from)
      declarationWhere.push(`payment_date >= $${declarationParams.length}`)
    }
    if (options.to) {
      declarationParams.push(options.to)
      declarationWhere.push(`payment_date <= $${declarationParams.length}`)
    }
    const declarationWhereSql = declarationWhere.length ? `WHERE ${declarationWhere.join(' AND ')}` : ''

    const declarationsResult = await this.database.query<DividendRow>(
      `SELECT * FROM dividend_events ${declarationWhereSql}`,
      declarationParams,
    )
    const declarations = declarationsResult.rows.map(mapDividend)
    const declarationIds = declarations.map(d => d.id)

    let entitlements: DividendEntitlement[] = []
    let payments: DividendPayment[] = []
    let batches: DividendPaymentBatch[] = []
    if (declarationIds.length) {
      const [entRes, payRes, batchRes] = await Promise.all([
        this.database.query<EntitlementRow>(`SELECT * FROM dividend_entitlements WHERE dividend_event_id = ANY($1::text[])`, [
          declarationIds,
        ]),
        this.database.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE dividend_event_id = ANY($1::text[])`, [declarationIds]),
        this.database.query<BatchRow>(`SELECT * FROM dividend_payment_batches WHERE dividend_event_id = ANY($1::text[])`, [declarationIds]),
      ])
      entitlements = entRes.rows.map(mapEntitlement)
      payments = payRes.rows.map(mapPayment)
      batches = batchRes.rows.map(mapBatch)
    }

    const summary = buildReportsSummary({
      batches,
      declarations,
      entitlements,
      payments,
      window: options.from || options.to ? { from: options.from, to: options.to } : undefined,
    })

    if (actor) {
      await this.auditService.record({
        action: AuditActions.DIVIDEND_REPORT_GENERATED,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: options.issuerId || 'tenant',
        entityType: 'DIVIDEND_EVENT',
        issuerId: options.issuerId,
        metadata: { declarationCount: summary.declarationCount, scope: options.issuerId ? 'issuer' : 'tenant' },
      })
    }
    return summary
  }

  /**
   * Statement projection for a single shareholder entitlement. If a
   * `dividend_statements` row already exists it's reused; otherwise we
   * build the projection from the entitlement directly so the endpoint
   * works even before a bulk `generateStatements` run.
   */
  async getStatementForEntitlement(dividendId: string, entitlementId: string, actor?: ActorContext): Promise<DividendStatementView> {
    const declaration = await this.getById(dividendId)
    const entResult = await this.database.query<EntitlementRow>(
      `SELECT * FROM dividend_entitlements WHERE id = $1 AND dividend_event_id = $2`,
      [entitlementId, dividendId],
    )
    if (!entResult.rows.length) {
      throw new NotFoundException(`Entitlement ${entitlementId} not found for dividend ${dividendId}`)
    }
    const entitlement = mapEntitlement(entResult.rows[0])

    const stmtResult = await this.database.query<StatementRow>(
      `SELECT * FROM dividend_statements WHERE dividend_event_id = $1 AND entitlement_id = $2`,
      [dividendId, entitlementId],
    )
    const statement: DividendStatement = stmtResult.rows.length
      ? mapStatement(stmtResult.rows[0])
      : {
          accountId: entitlement.accountId,
          createdAt: new Date(),
          currency: entitlement.currency,
          dividendEventId: dividendId,
          entitlementId,
          grossAmountCents: entitlement.grossAmountCents,
          id: `dst_pending_${entitlementId}`,
          metadata: { ephemeral: true },
          netAmountCents: entitlement.netAmountCents,
          shareholderId: entitlement.shareholderId,
          statementDate: declaration.paymentDate,
          status: 'DRAFT',
          updatedAt: new Date(),
          withholdingCents: entitlement.withholdingCents,
        }

    const [issuer, security, shareholder, payment] = await Promise.all([
      this.loadIssuerSummary(declaration.issuerId),
      this.loadSecuritySummary(declaration.securityId, declaration.shareClassId),
      this.loadShareholderInfo(entitlement.shareholderId),
      this.loadLatestPaymentForEntitlement(entitlementId),
    ])

    const view = buildStatementView({
      declaration,
      entitlement,
      issuer,
      payment,
      security,
      shareholder,
      statement,
    })

    if (actor) {
      await this.auditService.record({
        action: AuditActions.DIVIDEND_STATEMENT_RENDERED,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: statement.id,
        entityType: 'DIVIDEND_STATEMENT',
        issuerId: declaration.issuerId,
        metadata: { dividendEventId: dividendId, entitlementId, format: 'json' },
      })
    }
    return view
  }

  /**
   * Render the statement as a self-contained HTML document. The HTML
   * is suitable for direct download or as input to a future PDF
   * generator (`DividendPdfGenerator` boundary in `dividends.statement.ts`).
   */
  async renderStatementHtmlForEntitlement(
    dividendId: string,
    entitlementId: string,
    actor?: ActorContext,
  ): Promise<{ filename: string; contentType: 'text/html; charset=utf-8'; body: string }> {
    const view = await this.getStatementForEntitlement(dividendId, entitlementId)
    const html = renderStatementHtml(view)
    if (actor) {
      await this.auditService.record({
        action: AuditActions.DIVIDEND_STATEMENT_RENDERED,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: view.statementId,
        entityType: 'DIVIDEND_STATEMENT',
        issuerId: view.issuer.id,
        metadata: { dividendEventId: dividendId, entitlementId, format: 'html' },
      })
    }
    return {
      body: html,
      contentType: 'text/html; charset=utf-8',
      filename: `dividend-statement-${view.statementNumber}.html`,
    }
  }

  /**
   * CSV export of the dividend declaration register. Mirrors the same
   * filters as `list()`. The output joins issuer + security context.
   */
  async exportDeclarationsCsv(filter: DividendListQuery, actor?: ActorContext): Promise<CsvDownload> {
    const where: string[] = []
    const params: unknown[] = []
    if (filter.issuerId) {
      params.push(filter.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (filter.securityId) {
      params.push(filter.securityId)
      where.push(`security_id = $${params.length}`)
    }
    if (filter.status) {
      params.push(filter.status)
      where.push(`status = $${params.length}`)
    }
    if (filter.kind) {
      params.push(filter.kind)
      where.push(`kind = $${params.length}`)
    }
    if (filter.fromPaymentDate) {
      params.push(filter.fromPaymentDate)
      where.push(`payment_date >= $${params.length}`)
    }
    if (filter.toPaymentDate) {
      params.push(filter.toPaymentDate)
      where.push(`payment_date <= $${params.length}`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const result = await this.database.query<DividendRow>(`SELECT * FROM dividend_events ${whereSql} ORDER BY payment_date DESC`, params)
    const declarations = result.rows.map(mapDividend)
    const issuerIds = uniq(declarations.map(d => d.issuerId))
    const securityIds = uniq(declarations.map(d => d.securityId))
    const [issuerNames, securityNames] = await Promise.all([this.loadIssuerNames(issuerIds), this.loadSecurityNames(securityIds)])
    const rows: DeclarationExportRow[] = declarations.map(declaration => ({
      declaration,
      issuerName: issuerNames.get(declaration.issuerId),
      securityName: securityNames.get(declaration.securityId)?.name,
      securitySymbol: securityNames.get(declaration.securityId)?.symbol,
    }))
    const body = renderCsv(rows, DECLARATION_COLUMNS)
    const download = csvDownload('dividend-declarations.csv', body, rows.length)
    await this.recordExportAudit('declarations', download.rowCount, { issuerId: filter.issuerId }, actor)
    return download
  }

  /** CSV export of the locked eligibility snapshot for a dividend. */
  async exportEligibilitySnapshotCsv(dividendId: string, actor?: ActorContext): Promise<CsvDownload> {
    const declaration = await this.getById(dividendId)
    const snapshot = await this.getSnapshot(dividendId)
    if (!snapshot) {
      throw new NotFoundException(`Eligibility snapshot for dividend ${dividendId} not found`)
    }
    const body = renderCsv(snapshotRows(snapshot), SNAPSHOT_COLUMNS)
    const download = csvDownload(`dividend-${dividendId}-snapshot.csv`, body, snapshot.snapshotPayload.length)
    await this.recordExportAudit(
      'eligibility_snapshot',
      download.rowCount,
      { dividendEventId: dividendId, issuerId: declaration.issuerId },
      actor,
      declaration.issuerId,
    )
    return download
  }

  /** CSV export of the latest entitlement calculation for a dividend. */
  async exportEntitlementsCsv(dividendId: string, actor?: ActorContext): Promise<CsvDownload> {
    const declaration = await this.getById(dividendId)
    const result = await this.database.query<EntitlementRow>(
      `SELECT * FROM dividend_entitlements WHERE dividend_event_id = $1 ORDER BY shareholder_id ASC`,
      [dividendId],
    )
    const entitlements = result.rows.map(mapEntitlement)
    const shareholderIds = uniq(entitlements.map(e => e.shareholderId))
    const names = await this.loadShareholderNames(shareholderIds)
    const rows: EntitlementExportRow[] = entitlements.map(entitlement => ({
      entitlement,
      shareholderName: names.get(entitlement.shareholderId),
    }))
    const body = renderCsv(rows, ENTITLEMENT_COLUMNS)
    const download = csvDownload(`dividend-${dividendId}-entitlements.csv`, body, rows.length)
    await this.recordExportAudit('entitlements', download.rowCount, { dividendEventId: dividendId }, actor, declaration.issuerId)
    return download
  }

  /** CSV export of the payments inside a single payment batch. */
  async exportPaymentBatchCsv(batchId: string, actor?: ActorContext): Promise<CsvDownload> {
    const batchResult = await this.database.query<BatchRow>(`SELECT * FROM dividend_payment_batches WHERE id = $1`, [batchId])
    if (!batchResult.rows.length) {
      throw new NotFoundException(`Payment batch ${batchId} not found`)
    }
    const batch = mapBatch(batchResult.rows[0])
    const paymentResult = await this.database.query<PaymentRow>(
      `SELECT * FROM dividend_payments WHERE batch_id = $1 ORDER BY shareholder_id ASC`,
      [batchId],
    )
    const payments = paymentResult.rows.map(mapPayment)
    const names = await this.loadShareholderNames(uniq(payments.map(p => p.shareholderId)))
    const rows: PaymentExportRow[] = payments.map(payment => ({ payment, shareholderName: names.get(payment.shareholderId) }))
    const body = renderCsv(rows, PAYMENT_COLUMNS)
    const download = csvDownload(`dividend-batch-${batch.batchNumber}.csv`, body, rows.length)
    await this.recordExportAudit(
      'payment_batch',
      download.rowCount,
      { batchId, dividendEventId: batch.dividendEventId },
      actor,
      batch.issuerId,
    )
    return download
  }

  /** Failed-payments report — payments in FAILED/RETURNED/CANCELLED state. */
  async exportFailedPaymentsCsv(
    options: { dividendId?: string; batchId?: string; issuerId?: string },
    actor?: ActorContext,
  ): Promise<CsvDownload> {
    const where: string[] = [`status = ANY($1::text[])`]
    const params: unknown[] = [['FAILED', 'RETURNED', 'CANCELLED']]
    if (options.dividendId) {
      params.push(options.dividendId)
      where.push(`dividend_event_id = $${params.length}`)
    }
    if (options.batchId) {
      params.push(options.batchId)
      where.push(`batch_id = $${params.length}`)
    }
    const result = await this.database.query<PaymentRow>(
      `SELECT p.* FROM dividend_payments p
       ${options.issuerId ? 'JOIN dividend_events e ON e.id = p.dividend_event_id' : ''}
       WHERE ${where.join(' AND ')}
       ${options.issuerId ? `AND e.issuer_id = $${params.length + 1}` : ''}
       ORDER BY p.created_at ASC`,
      options.issuerId ? [...params, options.issuerId] : params,
    )
    const payments = result.rows.map(mapPayment).filter(p => isFailedPaymentRow({ payment: p }))
    const names = await this.loadShareholderNames(uniq(payments.map(p => p.shareholderId)))
    const rows: PaymentExportRow[] = payments.map(payment => ({ payment, shareholderName: names.get(payment.shareholderId) }))
    const body = renderCsv(rows, PAYMENT_COLUMNS)
    const filename = options.batchId
      ? `dividend-batch-${options.batchId}-failed.csv`
      : options.dividendId
        ? `dividend-${options.dividendId}-failed.csv`
        : 'dividend-failed-payments.csv'
    const download = csvDownload(filename, body, rows.length)
    await this.recordExportAudit('failed_payments', download.rowCount, options, actor, options.issuerId)
    return download
  }

  /**
   * Shareholder dividend history export. The controller scopes this
   * endpoint to the calling shareholder via `@Scope shareholderPaths` —
   * only an internal admin should ever pass a `shareholderId` other
   * than their own.
   */
  async exportShareholderHistoryCsv(
    shareholderId: string,
    options: { issuerId?: string; from?: string; to?: string } = {},
    actor?: ActorContext,
  ): Promise<CsvDownload> {
    const where: string[] = [`e.shareholder_id = $1`]
    const params: unknown[] = [shareholderId]
    if (options.issuerId) {
      params.push(options.issuerId)
      where.push(`d.issuer_id = $${params.length}`)
    }
    if (options.from) {
      params.push(options.from)
      where.push(`d.payment_date >= $${params.length}`)
    }
    if (options.to) {
      params.push(options.to)
      where.push(`d.payment_date <= $${params.length}`)
    }
    const result = await this.database.query<EntitlementRow & DividendRow & { entitlement_id: string; declaration_id: string }>(
      `SELECT e.id AS entitlement_id, d.id AS declaration_id,
              e.shareholder_id, e.account_id, e.shares_held, e.shares_held_decimal,
              e.gross_amount_cents, e.withholding_cents, e.net_amount_cents,
              e.amount_cents, e.withholding_pct, e.payment_method, e.status,
              e.currency, e.tax_status, e.tax_residency, e.tax_form_status, e.treaty_rate,
              e.withholding_reason, e.calculation_version, e.frozen_at, e.paid_at,
              e.payment_reference, e.metadata AS entitlement_metadata,
              e.created_at AS entitlement_created_at, e.updated_at AS entitlement_updated_at,
              d.issuer_id, d.security_id, d.share_class_id, d.kind, d.rate_type,
              d.rate_amount, d.rate_per_share_cents, d.withholding_default_pct,
              d.declaration_date, d.record_date, d.ex_dividend_date, d.payment_date,
              d.total_distribution_cents, d.description, d.notes, d.supporting_documents,
              d.metadata, d.status AS declaration_status, d.version, d.calculation_version AS declaration_calculation_version,
              d.approved_at, d.eligibility_locked_at, d.calculated_at, d.scheduled_at,
              d.paid_at AS declaration_paid_at, d.archived_at, d.cancelled_at,
              d.rejected_at, d.changes_requested_at, d.calculations_locked_at,
              d.created_at, d.updated_at,
              d.eligibility_snapshot_id
       FROM dividend_entitlements e
       JOIN dividend_events d ON d.id = e.dividend_event_id
       WHERE ${where.join(' AND ')}
       ORDER BY d.payment_date DESC`,
      params,
    )

    const declarations = new Map<string, DividendEvent>()
    const entitlements: DividendEntitlement[] = []
    for (const row of result.rows) {
      const declarationId = (row as unknown as { declaration_id: string }).declaration_id
      const entitlementId = (row as unknown as { entitlement_id: string }).entitlement_id
      // The CTE-style row contains both declaration_* and entitlement_* fields
      // — re-pack into the canonical row types each mapper expects.
      const declarationRow: DividendRow = {
        approved_at: row.approved_at,
        archived_at: row.archived_at,
        calculated_at: row.calculated_at,
        calculation_version: (row as unknown as { declaration_calculation_version: number | string | null })
          .declaration_calculation_version,
        calculations_locked_at: row.calculations_locked_at,
        cancelled_at: row.cancelled_at,
        changes_requested_at: row.changes_requested_at,
        created_at: row.created_at,
        currency: row.currency || 'USD',
        declaration_date: row.declaration_date,
        description: row.description,
        eligibility_locked_at: row.eligibility_locked_at,
        ex_dividend_date: row.ex_dividend_date,
        id: declarationId,
        issuer_id: row.issuer_id,
        kind: row.kind,
        metadata: row.metadata,
        notes: row.notes,
        paid_at: (row as unknown as { declaration_paid_at: Date | null }).declaration_paid_at,
        payment_date: row.payment_date,
        rate_amount: row.rate_amount,
        rate_per_share_cents: row.rate_per_share_cents,
        rate_type: row.rate_type,
        record_date: row.record_date,
        rejected_at: row.rejected_at,
        scheduled_at: row.scheduled_at,
        security_id: row.security_id,
        share_class_id: row.share_class_id,
        status: (row as unknown as { declaration_status: DividendStatus }).declaration_status,
        supporting_documents: row.supporting_documents,
        total_distribution_cents: row.total_distribution_cents,
        updated_at: row.updated_at,
        version: row.version,
        withholding_default_pct: row.withholding_default_pct,
      }
      declarations.set(declarationId, mapDividend(declarationRow))
      const entitlementRow: EntitlementRow = {
        account_id: row.account_id,
        amount_cents: row.amount_cents,
        calculation_version: row.calculation_version,
        created_at: (row as unknown as { entitlement_created_at: Date }).entitlement_created_at,
        currency: row.currency,
        dividend_event_id: declarationId,
        eligibility_snapshot_id: row.eligibility_snapshot_id,
        frozen_at: row.frozen_at,
        gross_amount_cents: row.gross_amount_cents,
        id: entitlementId,
        metadata: (row as unknown as { entitlement_metadata: Record<string, unknown> }).entitlement_metadata,
        net_amount_cents: row.net_amount_cents,
        paid_at: row.paid_at,
        payment_method: row.payment_method,
        payment_reference: row.payment_reference,
        shareholder_id: row.shareholder_id,
        shares_held: row.shares_held,
        shares_held_decimal: row.shares_held_decimal,
        status: row.status,
        tax_form_status: row.tax_form_status,
        tax_residency: row.tax_residency,
        tax_status: row.tax_status,
        treaty_rate: row.treaty_rate,
        updated_at: (row as unknown as { entitlement_updated_at: Date }).entitlement_updated_at,
        withholding_cents: row.withholding_cents,
        withholding_pct: row.withholding_pct,
        withholding_reason: row.withholding_reason,
      }
      entitlements.push(mapEntitlement(entitlementRow))
    }

    const issuerIds = uniq([...declarations.values()].map(d => d.issuerId))
    const securityIds = uniq([...declarations.values()].map(d => d.securityId))
    const entitlementIds = entitlements.map(e => e.id)
    const [issuerNames, securityNames, paymentByEntitlement] = await Promise.all([
      this.loadIssuerNames(issuerIds),
      this.loadSecurityNames(securityIds),
      this.loadLatestPaymentsByEntitlement(entitlementIds),
    ])

    const rows: ShareholderHistoryRow[] = entitlements.map(entitlement => {
      const declaration = declarations.get(entitlement.dividendEventId)!
      return {
        declaration,
        entitlement,
        issuerName: issuerNames.get(declaration.issuerId),
        payment: paymentByEntitlement.get(entitlement.id),
        securitySymbol: securityNames.get(declaration.securityId)?.symbol,
      }
    })
    const body = renderCsv(rows, SHAREHOLDER_HISTORY_COLUMNS)
    const download = csvDownload(`shareholder-${shareholderId}-dividends.csv`, body, rows.length)
    await this.recordExportAudit('shareholder_history', download.rowCount, { shareholderId, ...options }, actor, options.issuerId)
    return download
  }

  /** CSV export of the audit trail for a single dividend declaration. */
  async exportAuditTrailCsv(
    dividendId: string,
    options: { since?: string; limit?: number } = {},
    actor?: ActorContext,
  ): Promise<CsvDownload> {
    const declaration = await this.getById(dividendId)
    const events = await this.auditService.timeline('DIVIDEND_EVENT', dividendId, {
      limit: options.limit ?? 1000,
      since: options.since,
    })
    const rows: AuditExportRow[] = events.map(event => ({
      action: event.action,
      actorId: event.actor.id,
      actorRole: event.actor.role,
      at: event.at,
      headline: event.headline,
      id: event.id,
      payload: event.payload,
      severity: event.severity,
    }))
    const body = renderCsv(rows, AUDIT_COLUMNS)
    const download = csvDownload(`dividend-${dividendId}-audit.csv`, body, rows.length)
    await this.recordExportAudit('audit_trail', download.rowCount, { dividendEventId: dividendId }, actor, declaration.issuerId)
    return download
  }

  /**
   * Convenience batch-level CSV (the batch row itself, not its
   * payments). Useful when someone wants a one-row CSV per batch for
   * cross-batch reconciliation worksheets.
   */
  async exportBatchSummaryCsv(dividendId: string, actor?: ActorContext): Promise<CsvDownload> {
    const declaration = await this.getById(dividendId)
    const result = await this.database.query<BatchRow>(
      `SELECT * FROM dividend_payment_batches WHERE dividend_event_id = $1 ORDER BY created_at ASC`,
      [dividendId],
    )
    const batches = result.rows.map(mapBatch)
    const body = renderCsv(
      batches.map(batch => ({ batch })),
      BATCH_COLUMNS,
    )
    const download = csvDownload(`dividend-${dividendId}-batches.csv`, body, batches.length)
    await this.recordExportAudit('batch_summary', download.rowCount, { dividendEventId: dividendId }, actor, declaration.issuerId)
    return download
  }

  // -------------------- exports: helpers ------------------------------

  private async recordExportAudit(
    kind: string,
    rowCount: number,
    metadata: Record<string, unknown>,
    actor?: ActorContext,
    issuerId?: string,
  ): Promise<void> {
    if (!actor) return
    await this.auditService.record({
      action: AuditActions.DIVIDEND_REPORT_EXPORTED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      entityId:
        (metadata.dividendEventId as string | undefined) ||
        (metadata.batchId as string | undefined) ||
        (metadata.shareholderId as string | undefined) ||
        'tenant',
      entityType: metadata.batchId ? 'DIVIDEND_BATCH' : 'DIVIDEND_EVENT',
      issuerId,
      metadata: { ...metadata, kind, rowCount },
    })
  }

  private async loadIssuerNames(issuerIds: string[]): Promise<Map<string, string | undefined>> {
    if (!issuerIds.length) return new Map()
    const result = await this.database.query<{ id: string; legal_name: string | null }>(
      `SELECT id, legal_name FROM issuers WHERE id = ANY($1::text[])`,
      [issuerIds],
    )
    return new Map(result.rows.map(row => [row.id, row.legal_name || undefined]))
  }

  private async loadSecurityNames(securityIds: string[]): Promise<Map<string, { name?: string; symbol?: string }>> {
    if (!securityIds.length) return new Map()
    const result = await this.database.query<{ id: string; name: string | null; symbol: string | null }>(
      `SELECT id, name, symbol FROM securities WHERE id = ANY($1::text[])`,
      [securityIds],
    )
    return new Map(result.rows.map(row => [row.id, { name: row.name || undefined, symbol: row.symbol || undefined }]))
  }

  private async loadShareholderNames(shareholderIds: string[]): Promise<Map<string, string | undefined>> {
    if (!shareholderIds.length) return new Map()
    const result = await this.database.query<{ id: string; legal_name: string | null }>(
      `SELECT id, legal_name FROM shareholders WHERE id = ANY($1::text[])`,
      [shareholderIds],
    )
    return new Map(result.rows.map(row => [row.id, row.legal_name || undefined]))
  }

  private async loadShareholderInfo(shareholderId: string): Promise<StatementShareholderInfo> {
    const result = await this.database.query<{
      id: string
      legal_name: string | null
      email: string | null
      address: Record<string, unknown> | null
      jurisdiction: string | null
    }>(`SELECT id, legal_name, email, address, jurisdiction FROM shareholders WHERE id = $1`, [shareholderId])
    const row = result.rows[0]
    if (!row) {
      return { id: shareholderId }
    }
    return {
      email: row.email || undefined,
      id: row.id,
      legalName: row.legal_name || undefined,
      mailingAddress: formatAddress(row.address),
      taxResidency: row.jurisdiction || undefined,
    }
  }

  private async loadLatestPaymentForEntitlement(entitlementId: string): Promise<DividendPayment | undefined> {
    const result = await this.database.query<PaymentRow>(
      `SELECT * FROM dividend_payments WHERE entitlement_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [entitlementId],
    )
    return result.rows.length ? mapPayment(result.rows[0]) : undefined
  }

  private async loadLatestPaymentsByEntitlement(entitlementIds: string[]): Promise<Map<string, DividendPayment>> {
    if (!entitlementIds.length) return new Map()
    const result = await this.database.query<PaymentRow>(
      `SELECT DISTINCT ON (entitlement_id) *
       FROM dividend_payments
       WHERE entitlement_id = ANY($1::text[])
       ORDER BY entitlement_id, created_at DESC`,
      [entitlementIds],
    )
    return new Map(result.rows.map(row => [row.entitlement_id, mapPayment(row)]))
  }

  // ====================================================================
  // Legacy compatibility aliases — used by seed and existing callers
  // ====================================================================

  /** Equivalent to: submitForApproval(...) → approve(...) for the same actor. */
  async declare(id: string, actor: ActorContext): Promise<DividendEvent> {
    const submitted = await this.submitForApproval(id, {}, actor)
    if (submitted.status !== 'PENDING_APPROVAL') {
      return submitted
    }
    const approved = await this.approve(id, { decisionNotes: 'Auto-approved (legacy declare)' }, actor)
    await this.auditService.record({
      action: AuditActions.DIVIDEND_DECLARED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      entityId: id,
      entityType: 'DIVIDEND_EVENT',
      issuerId: approved.issuerId,
      metadata: {},
    })
    return approved
  }

  /**
   * Legacy two-step "snapshot" used by older seed/test code: locks
   * eligibility, then immediately calculates entitlements.
   */
  async snapshot(id: string, actor: ActorContext): Promise<{ event: DividendEvent; entitlements: DividendEntitlement[] }> {
    const locked = await this.lockEligibility(id, actor)
    const calculated = await this.calculateEntitlements(id, {}, actor)
    void locked
    await this.auditService.record({
      action: AuditActions.DIVIDEND_SNAPSHOTTED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      entityId: id,
      entityType: 'DIVIDEND_EVENT',
      issuerId: calculated.event.issuerId,
      metadata: { entitlementCount: calculated.entitlements.length },
    })
    return calculated
  }

  /**
   * Legacy single-payment marker. Creates (if missing) a per-entitlement
   * payment row in PAID state and updates entitlement status. New code
   * should prefer `createPaymentBatch` + `recordPayment`.
   */
  async markEntitlementPaid(input: MarkPaidDto, actor: ActorContext): Promise<DividendEntitlement> {
    return this.database.tx(async client => {
      const existing = await client.query<EntitlementRow>(`SELECT * FROM dividend_entitlements WHERE id = $1 FOR UPDATE`, [
        input.entitlementId,
      ])
      if (!existing.rows.length) {
        throw new NotFoundException(`Entitlement ${input.entitlementId} not found`)
      }
      const current = existing.rows[0]
      if (current.status === 'PAID') {
        return mapEntitlement(current)
      }
      if (current.status === 'VOIDED') {
        throw new ConflictException('Cannot mark voided entitlement as paid')
      }

      const dividend = await this.findForUpdate(client, current.dividend_event_id)
      if (!actorCanAccessIssuer(actor, dividend.issuer_id)) {
        throw new ForbiddenException('Issuer scope denied for this entitlement')
      }
      const paymentId = shortId('dpy')
      await client.query(
        `INSERT INTO dividend_payments (
            id, dividend_event_id, entitlement_id, account_id, shareholder_id,
            gross_amount_cents, withholding_cents, net_amount_cents, currency, method, status, attempt_no,
            external_ref, paid_at, metadata
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6::bigint, $7::bigint, $8::bigint, $9, $10, 'SETTLED', 1,
            $11, NOW(), $12::jsonb
         )`,
        [
          paymentId,
          current.dividend_event_id,
          current.id,
          current.account_id,
          current.shareholder_id,
          Number(current.gross_amount_cents || current.amount_cents),
          Number(current.withholding_cents),
          Number(current.net_amount_cents || current.amount_cents),
          dividend.currency,
          input.method || 'ACH',
          input.paymentReference || null,
          JSON.stringify(input.metadata || {}),
        ],
      )

      const updated = await client.query<EntitlementRow>(
        `UPDATE dividend_entitlements SET status = 'PAID', paid_at = NOW(),
                                         payment_reference = $2, payment_method = $3, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [input.entitlementId, input.paymentReference || null, input.method || 'ACH'],
      )

      await this.refreshDividendStatus(client, current.dividend_event_id)

      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_ENTITLEMENT_PAID,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: input.entitlementId,
          entityType: 'DIVIDEND_ENTITLEMENT',
          issuerId: dividend.issuer_id,
          metadata: { dividendEventId: current.dividend_event_id, paymentReference: input.paymentReference },
        },
        client,
      )
      return mapEntitlement(updated.rows[0])
    })
  }

  // ====================================================================
  // Internals
  // ====================================================================

  private async loadIssuerSummary(issuerId: string): Promise<DividendIssuerSummary> {
    const result = await this.database.query<{
      id: string
      legal_name: string | null
      jurisdiction: string | null
      metadata: Record<string, unknown> | null
    }>(`SELECT id, legal_name, jurisdiction, metadata FROM issuers WHERE id = $1`, [issuerId])
    const row = result.rows[0]
    return {
      id: issuerId,
      jurisdiction: row?.jurisdiction || undefined,
      legalName: row?.legal_name || undefined,
      metadata: row?.metadata || undefined,
    }
  }

  private async loadSecuritySummary(securityId: string, shareClassId?: string): Promise<DividendSecuritySummary> {
    const securityResult = await this.database.query<{
      id: string
      name: string | null
      symbol: string | null
      cusip: string | null
    }>(`SELECT id, name, symbol, cusip FROM securities WHERE id = $1`, [securityId])
    const security = securityResult.rows[0]
    let shareClassCode: string | undefined
    let shareClassName: string | undefined
    let parValueCents: number | undefined
    if (shareClassId) {
      const classResult = await this.database.query<{
        code: string | null
        name: string | null
        par_value_cents: number | string | null
      }>(`SELECT code, name, par_value_cents FROM share_classes WHERE id = $1`, [shareClassId])
      const classRow = classResult.rows[0]
      shareClassCode = classRow?.code || undefined
      shareClassName = classRow?.name || undefined
      parValueCents = classRow?.par_value_cents != null ? Number(classRow.par_value_cents) : undefined
    }
    return {
      cusip: security?.cusip || undefined,
      id: securityId,
      name: security?.name || undefined,
      parValueCents,
      shareClassCode,
      shareClassId,
      shareClassName,
      symbol: security?.symbol || undefined,
    }
  }

  private async computeCalculatedSummary(id: string, declaration: DividendEvent): Promise<DividendCalculatedSummary | undefined> {
    const counts = await this.database.query<{
      total: string
      paid: string
      pending: string
      gross: string
      withholding: string
      net: string
      version: number | string | null
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END), 0)::text AS paid,
         COALESCE(SUM(CASE WHEN status IN ('PENDING', 'CALCULATED', 'HELD') THEN 1 ELSE 0 END), 0)::text AS pending,
         COALESCE(SUM(gross_amount_cents), 0)::text AS gross,
         COALESCE(SUM(withholding_cents), 0)::text AS withholding,
         COALESCE(SUM(net_amount_cents), 0)::text AS net,
         MAX(calculation_version) AS version
       FROM dividend_entitlements WHERE dividend_event_id = $1`,
      [id],
    )
    const row = counts.rows[0]
    const total = Number(row?.total || '0')
    if (!total) return undefined

    const snapshot = await this.getSnapshot(id)
    return {
      calculationVersion: Number(row?.version || declaration.calculationVersion || 1),
      capturedAt: snapshot?.capturedAt,
      entitlementCount: total,
      lockedAt: snapshot?.lockedAt,
      paidCount: Number(row?.paid || '0'),
      pendingCount: Number(row?.pending || '0'),
      recordDate: snapshot?.recordDate ?? declaration.recordDate,
      totalEligibleShares: snapshot?.totalEligibleShares ?? '0',
      totalGrossCents: Number(row?.gross || '0'),
      totalNetCents: Number(row?.net || '0'),
      totalWithholdingCents: Number(row?.withholding || '0'),
    }
  }

  private async runEntitlementQuery(
    where: string[],
    params: unknown[],
    query: EntitlementListQuery,
  ): Promise<PaginatedResponse<DividendEntitlement>> {
    const whereSql = `WHERE ${where.join(' AND ')}`
    const sort = resolveSort(query, ENTITLEMENT_SORT, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_entitlements ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<EntitlementRow>(
      `SELECT * FROM dividend_entitlements ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapEntitlement), total, query)
  }

  private async findForUpdate(client: PoolClient, id: string): Promise<DividendRow> {
    const result = await client.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1 FOR UPDATE`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Dividend ${id} not found`)
    }
    return result.rows[0]
  }

  /**
   * Build the immutable eligibility roster for the dividend and persist
   * it as the snapshot payload. Idempotent on `dividend_event_id`: when
   * a snapshot already exists, its rows are replaced with a fresh
   * roster but the `id` is preserved so foreign keys on entitlements
   * remain valid.
   *
   * Side effects: writes a `DIVIDEND_ELIGIBILITY_SNAPSHOT_CREATED`
   * audit event on first insert and a `DIVIDEND_ELIGIBILITY_SNAPSHOT_LOCKED`
   * event when the lock action follows. The caller (`lockEligibility`)
   * is responsible for the lock-side audit.
   */
  private async captureEligibilitySnapshot(
    client: PoolClient,
    dividend: DividendRow,
    actor?: ActorContext,
  ): Promise<DividendEligibilitySnapshot> {
    const recordDate = formatDate(dividend.record_date)
    const positions = await this.ledgerService.getPositionsAsOf(dividend.security_id, recordDate)

    // Resolve (holderId -> account/shareholder/status) for every ledger
    // position. We pull both accounts and shareholders in two queries
    // to avoid N+1; the volume per dividend is bounded by holder count.
    const holderIds = positions.map(p => p.holderId)
    const accountsResult = holderIds.length
      ? await client.query<{
          id: string
          shareholder_id: string
          account_number: string
          status: string
        }>(
          `SELECT id, shareholder_id, account_number, status FROM shareholder_accounts
           WHERE issuer_id = $1 AND account_number = ANY($2::text[])`,
          [dividend.issuer_id, holderIds],
        )
      : { rows: [] as Array<{ id: string; shareholder_id: string; account_number: string; status: string }> }

    const shareholderIds = Array.from(new Set(accountsResult.rows.map(r => r.shareholder_id)))
    const shareholdersResult = shareholderIds.length
      ? await client.query<{ id: string; status: string; kyc_status: string }>(
          `SELECT id, status, kyc_status FROM shareholders WHERE id = ANY($1::text[])`,
          [shareholderIds],
        )
      : { rows: [] as Array<{ id: string; status: string; kyc_status: string }> }
    const shareholderById = new Map(shareholdersResult.rows.map(s => [s.id, s] as const))

    const accountLookup: Record<string, AccountLookup> = {}
    for (const account of accountsResult.rows) {
      const shareholder = shareholderById.get(account.shareholder_id)
      accountLookup[account.account_number] = {
        accountId: account.id,
        accountNumber: account.account_number,
        accountStatus: account.status,
        kycStatus: shareholder?.kyc_status,
        shareholderId: account.shareholder_id,
        shareholderStatus: shareholder?.status,
      }
    }

    const roster = buildEligibilityRoster({
      accounts: accountLookup,
      ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
      positions: positions.map(p => ({ holderId: p.holderId, quantity: p.quantity })),
      recordDate,
      securityId: dividend.security_id,
    })
    const totals = computeRosterTotals(roster)

    const existingSnapshot = await client.query<{ id: string }>(
      `SELECT id FROM dividend_eligibility_snapshots WHERE dividend_event_id = $1`,
      [dividend.id],
    )
    const isNewSnapshot = !existingSnapshot.rows.length
    const snapshotId = existingSnapshot.rows[0]?.id ?? shortId('des')

    const inserted = await client.query<SnapshotRow>(
      `INSERT INTO dividend_eligibility_snapshots (
          id, dividend_event_id, issuer_id, security_id, share_class_id, record_date,
          captured_at, locked_at, holder_count, excluded_holder_count, total_eligible_shares,
          snapshot_payload, metadata
       ) VALUES (
          $1, $2, $3, $4, $5, $6,
          NOW(), NOW(), $7, $8, $9, $10::jsonb, '{}'::jsonb
       )
       ON CONFLICT (dividend_event_id) DO UPDATE SET
          captured_at = NOW(),
          locked_at = NOW(),
          holder_count = EXCLUDED.holder_count,
          excluded_holder_count = EXCLUDED.excluded_holder_count,
          total_eligible_shares = EXCLUDED.total_eligible_shares,
          snapshot_payload = EXCLUDED.snapshot_payload
       RETURNING *`,
      [
        snapshotId,
        dividend.id,
        dividend.issuer_id,
        dividend.security_id,
        dividend.share_class_id,
        recordDate,
        totals.eligibleHolderCount,
        totals.excludedHolderCount,
        totals.totalEligibleShares,
        JSON.stringify(roster),
      ],
    )

    if (isNewSnapshot && actor) {
      await this.auditService.record(
        {
          action: AuditActions.DIVIDEND_ELIGIBILITY_SNAPSHOT_CREATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: dividend.id,
          entityType: 'DIVIDEND_EVENT',
          ip: actor.ip,
          issuerId: dividend.issuer_id,
          metadata: {
            eligibleHolderCount: totals.eligibleHolderCount,
            excludedHolderCount: totals.excludedHolderCount,
            recordDate,
            snapshotId,
            totalEligibleShares: totals.totalEligibleShares,
          },
          severity: 'MEDIUM',
          sourceContext: { component: 'dividends', system: 'HTTP_API' },
          userAgent: actor.userAgent,
        },
        client,
      )
    }
    return mapSnapshot(inserted.rows[0])
  }

  private async requireSnapshot(client: PoolClient, dividendId: string): Promise<DividendEligibilitySnapshot> {
    const result = await client.query<SnapshotRow>(`SELECT * FROM dividend_eligibility_snapshots WHERE dividend_event_id = $1`, [
      dividendId,
    ])
    if (!result.rows.length) {
      throw new ConflictException('Eligibility snapshot is missing — lock eligibility before calculating')
    }
    return mapSnapshot(result.rows[0])
  }

  private async resolveWithholdingOverrides(
    client: PoolClient,
    snapshot: DividendEligibilitySnapshot,
    raw: Record<string, string>,
  ): Promise<Record<string, string | number>> {
    if (!Object.keys(raw).length) return {}
    const eligible = snapshot.snapshotPayload.filter(row => row.accountId && row.eligibilityStatus === 'ELIGIBLE')
    const accountIdSet = new Set(eligible.map(row => row.accountId as string))
    const shareholderToAccount = new Map<string, string[]>()
    for (const row of eligible) {
      if (!row.shareholderId || !row.accountId) continue
      const list = shareholderToAccount.get(row.shareholderId) ?? []
      list.push(row.accountId)
      shareholderToAccount.set(row.shareholderId, list)
    }

    const result: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (accountIdSet.has(key)) {
        result[key] = value
        continue
      }
      const accounts = shareholderToAccount.get(key)
      if (accounts) {
        for (const accountId of accounts) {
          result[accountId] = value
        }
        continue
      }
      // Try resolving as account_number (issuer-scoped business id) by
      // mapping it to the canonical account id.
      const accountLookup = await client.query<{ id: string }>(`SELECT id FROM shareholder_accounts WHERE account_number = $1 LIMIT 1`, [
        key,
      ])
      if (accountLookup.rows.length && accountIdSet.has(accountLookup.rows[0].id)) {
        result[accountLookup.rows[0].id] = value
      }
    }
    return result
  }

  private async recordApproval(
    client: PoolClient,
    dividendId: string,
    action: DividendApprovalAction,
    actor: ActorContext,
    decisionNotes?: string,
    metadata?: Record<string, unknown>,
  ): Promise<DividendApproval> {
    const id = shortId('dap')
    const result = await client.query<ApprovalRow>(
      `INSERT INTO dividend_approvals (id, dividend_event_id, action, actor_id, actor_role, decision_notes, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [id, dividendId, action, actor.actorId, actor.actorRole || null, decisionNotes || null, JSON.stringify(metadata || {})],
    )
    return mapApproval(result.rows[0])
  }

  private async refreshBatchTotals(client: PoolClient, batchId: string): Promise<void> {
    const tally = await this.tallyBatch(client, batchId)
    const nextStatus = rollupBatchStatus(tally)
    if (!nextStatus) return

    // Pull the current status so we don't move backwards (e.g. away
    // from RECONCILED) and so we only advance via valid transitions.
    const currentRow = await client.query<{ status: DividendBatchStatus }>(
      `SELECT status FROM dividend_payment_batches WHERE id = $1 FOR UPDATE`,
      [batchId],
    )
    const currentStatus = currentRow.rows[0]?.status
    if (!currentStatus || isTerminalBatch(currentStatus)) return

    let allowed = false
    try {
      assertBatchTransition(currentStatus, nextStatus)
      allowed = true
    } catch {
      // The rollup is purely advisory — if the state machine doesn't
      // allow this transition (e.g. PROCESSED → PARTIALLY_PROCESSED),
      // we just keep the existing status.
      allowed = false
    }
    if (!allowed) return

    const setCompletedAt = nextStatus === 'PROCESSED' || nextStatus === 'FAILED' || nextStatus === 'PARTIALLY_FAILED'
    await client.query(
      `UPDATE dividend_payment_batches SET status = $2,
         completed_at = CASE WHEN $3::boolean THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $1`,
      [batchId, nextStatus, setCompletedAt],
    )

    if (nextStatus === 'PROCESSED' || nextStatus === 'FAILED' || nextStatus === 'PARTIALLY_FAILED') {
      const action =
        nextStatus === 'PROCESSED'
          ? AuditActions.DIVIDEND_BATCH_PROCESSED
          : nextStatus === 'FAILED'
            ? AuditActions.DIVIDEND_BATCH_FAILED
            : AuditActions.DIVIDEND_BATCH_PARTIALLY_FAILED
      const fresh = await client.query<BatchRow>(`SELECT * FROM dividend_payment_batches WHERE id = $1`, [batchId])
      if (fresh.rows.length) {
        await this.auditService.record(
          {
            action,
            actorId: 'system:dividends',
            actorRole: 'system',
            entityId: batchId,
            entityType: 'DIVIDEND_BATCH',
            issuerId: fresh.rows[0].issuer_id,
            metadata: {
              dividendEventId: fresh.rows[0].dividend_event_id,
              failed: tally.failed,
              paid: tally.paid,
              status: nextStatus,
            },
            severity: nextStatus === 'FAILED' ? 'HIGH' : 'MEDIUM',
            sourceContext: { component: 'dividends', system: 'INTERNAL' },
          },
          client,
        )
      }
    }
  }

  private async refreshDividendStatus(client: PoolClient, dividendId: string): Promise<void> {
    const counts = await client.query<{ total: string; paid: string; pending: string; failed: string }>(
      `SELECT
         COUNT(*)::text AS total,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END)::text AS paid,
         SUM(CASE WHEN status IN ('PENDING', 'CALCULATED', 'HELD') THEN 1 ELSE 0 END)::text AS pending,
         SUM(CASE WHEN status IN ('FAILED', 'REVERSED') THEN 1 ELSE 0 END)::text AS failed
       FROM dividend_entitlements WHERE dividend_event_id = $1`,
      [dividendId],
    )
    const total = Number(counts.rows[0]?.total || '0')
    const paid = Number(counts.rows[0]?.paid || '0')
    const pending = Number(counts.rows[0]?.pending || '0')

    if (total === 0) return

    if (paid === total) {
      await client.query(
        `UPDATE dividend_events SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status IN ('PAYMENT_SCHEDULED', 'PARTIALLY_PAID', 'CALCULATED', 'SNAPSHOTTED')`,
        [dividendId],
      )
    } else if (paid > 0) {
      await client.query(
        `UPDATE dividend_events SET status = 'PARTIALLY_PAID', updated_at = NOW()
         WHERE id = $1 AND status IN ('PAYMENT_SCHEDULED', 'CALCULATED', 'SNAPSHOTTED')`,
        [dividendId],
      )
    }
    void pending
  }

  // ====================================================================
  // Internal helpers used by the new batch/payment workflow.
  // ====================================================================

  private async findBatchForUpdate(client: PoolClient, batchId: string): Promise<BatchRow> {
    const result = await client.query<BatchRow>(`SELECT * FROM dividend_payment_batches WHERE id = $1 FOR UPDATE`, [batchId])
    if (!result.rows.length) {
      throw new NotFoundException(`Payment batch ${batchId} not found`)
    }
    return result.rows[0]
  }

  /**
   * Wrap the framework-free state-machine error in a ConflictException
   * so HTTP callers see a 409. We always include the lifecycle hint
   * the UI can display ("Only DRAFT batches can be submitted...").
   */
  private assertBatchTransitionOrConflict(from: DividendBatchStatus, to: DividendBatchStatus, hint: string): void {
    try {
      assertBatchTransition(from, to)
    } catch (error) {
      if (error instanceof BatchTransitionError) {
        throw new ConflictException(`${hint} (current status: ${from})`)
      }
      throw error
    }
  }

  private async auditBatch(
    client: PoolClient,
    batch: DividendPaymentBatch,
    actor: ActorContext,
    action: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record(
      {
        action,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: batch.id,
        entityType: 'DIVIDEND_BATCH',
        ip: actor.ip,
        issuerId: batch.issuerId,
        metadata: {
          batchNumber: batch.batchNumber,
          dividendEventId: batch.dividendEventId,
          status: batch.status,
          ...extra,
        },
        severity,
        sourceContext: { component: 'dividends', system: 'HTTP_API' },
        userAgent: actor.userAgent,
      },
      client,
    )
  }

  private async nextBatchNumber(client: PoolClient, dividendId: string): Promise<string> {
    const existing = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_payment_batches WHERE dividend_event_id = $1`,
      [dividendId],
    )
    const next = Number(existing.rows[0]?.count || '0') + 1
    return `BATCH-${String(next).padStart(3, '0')}`
  }

  /**
   * Computes scheduling-blocking warnings for a set of payments. The
   * caller decides whether to fail-fast (e.g. on schedule) or
   * pass-through (e.g. on create).
   *
   * - MISSING_PAYMENT_METHOD: no payment instructions on the linked
   *   shareholder account; rail-specific implementations will likely
   *   refuse to enqueue these.
   * - BLOCKED_HOLDER: shareholder/account is blocked from receiving
   *   distributions.
   * - MISSING_TAX_INFO: surfaced for visibility but not a blocker.
   */
  private async detectBatchWarnings(client: PoolClient | undefined, payments: DividendPayment[]): Promise<DividendWarning[]> {
    if (!payments.length) return []
    const exec = async <T extends QueryResultRow>(text: string, values: unknown[]) =>
      client ? client.query<T>(text, values) : this.database.query<T>(text, values)

    const accountIds = Array.from(new Set(payments.map(payment => payment.accountId)))
    const shareholderIds = Array.from(new Set(payments.map(payment => payment.shareholderId)))

    type AccountFlagRow = {
      id: string
      status: string | null
      payment_instructions: Record<string, unknown> | null
      blocked_at: Date | null
    }
    type ShareholderFlagRow = { id: string; tax_id_last4: string | null; status: string | null; blocked_at: Date | null }
    let accountFlags: AccountFlagRow[] = []
    let shareholderFlags: ShareholderFlagRow[] = []
    try {
      const accountResult = await exec<AccountFlagRow>(
        `SELECT id, status, payment_instructions, blocked_at FROM shareholder_accounts WHERE id = ANY($1::text[])`,
        [accountIds],
      )
      accountFlags = accountResult.rows
    } catch {
      // The downstream account schema may not yet expose these
      // columns in older deployments. Treat as "no info available"
      // rather than blocking the workflow.
      accountFlags = []
    }
    try {
      const shareholderResult = await exec<ShareholderFlagRow>(
        `SELECT id, tax_id_last4, status, blocked_at FROM shareholders WHERE id = ANY($1::text[])`,
        [shareholderIds],
      )
      shareholderFlags = shareholderResult.rows
    } catch {
      shareholderFlags = []
    }

    const accountById = new Map(accountFlags.map(row => [row.id, row]))
    const shareholderById = new Map(shareholderFlags.map(row => [row.id, row]))

    const warnings: DividendWarning[] = []
    for (const payment of payments) {
      const account = accountById.get(payment.accountId)
      const holder = shareholderById.get(payment.shareholderId)
      const blocked =
        Boolean(account?.blocked_at) || Boolean(holder?.blocked_at) || account?.status === 'BLOCKED' || holder?.status === 'BLOCKED'
      if (blocked) {
        warnings.push({
          code: 'BLOCKED_HOLDER',
          message: `Account ${payment.accountId} or shareholder ${payment.shareholderId} is blocked.`,
          severity: 'ERROR',
        })
      }
      const hasInstructions = account?.payment_instructions && Object.keys(account.payment_instructions).length > 0
      if (!hasInstructions) {
        warnings.push({
          code: 'MISSING_PAYMENT_METHOD',
          message: `No payment instructions on file for account ${payment.accountId}.`,
          severity: 'ERROR',
        })
      }
      if (!holder?.tax_id_last4) {
        warnings.push({
          code: 'MISSING_TAX_INFO',
          message: `Shareholder ${payment.shareholderId} is missing tax info.`,
          severity: 'WARNING',
        })
      }
    }
    return warnings
  }

  /**
   * Core write path for a single payment status change. Shared by
   * `recordPayment` and `bulkRecordPayments`. Idempotent under
   * `idempotencyKey` — re-applying the same key with the same status
   * returns the existing row without writing.
   */
  private async recordPaymentTx(client: PoolClient, input: RecordPaymentDto, actor: ActorContext): Promise<DividendPayment> {
    if (input.idempotencyKey) {
      const dedupe = await client.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE idempotency_key = $1 FOR UPDATE`, [
        input.idempotencyKey,
      ])
      if (dedupe.rows.length) {
        const dedupeRow = dedupe.rows[0]
        if (dedupeRow.id !== input.paymentId) {
          throw new ConflictException(`Idempotency key already used by payment ${dedupeRow.id}`)
        }
        if (dedupeRow.status === input.status) {
          return mapPayment(dedupeRow)
        }
        // fall through — same payment, different status: treat as a
        // legitimate transition under the same key.
      }
    }

    const existing = await client.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE id = $1 FOR UPDATE`, [input.paymentId])
    if (!existing.rows.length) {
      throw new NotFoundException(`Payment ${input.paymentId} not found`)
    }
    const current = existing.rows[0]
    if (isTerminalPayment(current.status)) {
      throw new ConflictException(`Cannot record status on payment in ${current.status}`)
    }
    try {
      assertPaymentTransition(current.status, input.status)
    } catch (error) {
      if (error instanceof PaymentTransitionError) {
        throw new ConflictException(error.message)
      }
      throw error
    }

    const dividend = await this.findForUpdate(client, current.dividend_event_id)
    if (!actorCanAccessIssuer(actor, dividend.issuer_id)) {
      throw new ForbiddenException('Issuer scope denied for this payment')
    }
    const setPaidAt = input.status === 'PAID' || input.status === 'SETTLED' || input.status === 'SENT'
    const setReturnedAt = input.status === 'RETURNED'
    const updated = await client.query<PaymentRow>(
      `UPDATE dividend_payments SET
          status = $2,
          external_ref = $3,
          failure_reason = $4,
          idempotency_key = COALESCE(idempotency_key, $5),
          paid_at = CASE WHEN $6::boolean THEN NOW() ELSE paid_at END,
          returned_at = CASE WHEN $7::boolean THEN NOW() ELSE returned_at END,
          metadata = $8::jsonb,
          updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        input.paymentId,
        input.status,
        input.externalRef ?? current.external_ref,
        input.failureReason ?? current.failure_reason,
        input.idempotencyKey ?? null,
        setPaidAt,
        setReturnedAt,
        JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
      ],
    )
    const payment = mapPayment(updated.rows[0])

    if (PAID_PAYMENT_STATUSES.has(payment.status)) {
      await client.query(
        `UPDATE dividend_entitlements SET status = 'PAID', paid_at = NOW(),
                                          payment_reference = $2, updated_at = NOW()
         WHERE id = $1`,
        [current.entitlement_id, payment.externalRef || null],
      )
    } else if (FAILED_PAYMENT_STATUSES.has(payment.status)) {
      await client.query(`UPDATE dividend_entitlements SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [current.entitlement_id])
    } else if (payment.status === 'CANCELLED') {
      await client.query(`UPDATE dividend_entitlements SET status = 'CALCULATED', updated_at = NOW() WHERE id = $1`, [
        current.entitlement_id,
      ])
    }

    if (current.batch_id) {
      await this.refreshBatchTotals(client, current.batch_id)
    }
    await this.refreshDividendStatus(client, current.dividend_event_id)

    const action = paymentStatusToAuditAction(payment.status)
    const severity: 'LOW' | 'MEDIUM' | 'HIGH' = payment.status === 'FAILED' || payment.status === 'RETURNED' ? 'HIGH' : 'LOW'
    await this.auditService.record(
      {
        action,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: payment.id,
        entityType: 'DIVIDEND_PAYMENT',
        ip: actor.ip,
        issuerId: dividend.issuer_id,
        metadata: {
          batchId: payment.batchId,
          dividendEventId: payment.dividendEventId,
          externalRef: payment.externalRef,
          idempotencyKey: payment.idempotencyKey,
          status: payment.status,
        },
        severity,
        sourceContext: { component: 'dividends', system: 'HTTP_API' },
        userAgent: actor.userAgent,
      },
      client,
    )
    return payment
  }

  private async tallyBatch(
    client: PoolClient,
    batchId: string,
  ): Promise<{ pending: number; inFlight: number; paid: number; failed: number; cancelled: number; reconciled: number }> {
    const result = await client.query<{ status: DividendPaymentStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM dividend_payments WHERE batch_id = $1 GROUP BY status`,
      [batchId],
    )
    const tally = { cancelled: 0, failed: 0, inFlight: 0, paid: 0, pending: 0, reconciled: 0 }
    for (const row of result.rows) {
      const count = Number(row.count || '0')
      if (PENDING_PAYMENT_STATUSES.has(row.status)) tally.pending += count
      else if (IN_FLIGHT_PAYMENT_STATUSES.has(row.status)) tally.inFlight += count
      else if (row.status === 'RECONCILED') tally.reconciled += count
      else if (PAID_PAYMENT_STATUSES.has(row.status)) tally.paid += count
      else if (FAILED_PAYMENT_STATUSES.has(row.status)) tally.failed += count
      else if (row.status === 'CANCELLED') tally.cancelled += count
    }
    return tally
  }

  private async matchReconciliationEntry(
    client: PoolClient,
    batchId: string,
    entry: ReconciliationEntryDto,
  ): Promise<{ payment: PaymentRow | null; matchedBy: 'EXTERNAL_REF' | 'IDEMPOTENCY_KEY' | 'PAYMENT_ID'; reference: string }> {
    if (entry.paymentId) {
      const result = await client.query<PaymentRow>(`SELECT * FROM dividend_payments WHERE id = $1 AND batch_id = $2 FOR UPDATE`, [
        entry.paymentId,
        batchId,
      ])
      return { matchedBy: 'PAYMENT_ID', payment: result.rows[0] || null, reference: entry.paymentId }
    }
    if (entry.externalRef) {
      const result = await client.query<PaymentRow>(
        `SELECT * FROM dividend_payments WHERE external_ref = $1 AND batch_id = $2 FOR UPDATE`,
        [entry.externalRef, batchId],
      )
      return { matchedBy: 'EXTERNAL_REF', payment: result.rows[0] || null, reference: entry.externalRef }
    }
    if (entry.idempotencyKey) {
      const result = await client.query<PaymentRow>(
        `SELECT * FROM dividend_payments WHERE idempotency_key = $1 AND batch_id = $2 FOR UPDATE`,
        [entry.idempotencyKey, batchId],
      )
      return { matchedBy: 'IDEMPOTENCY_KEY', payment: result.rows[0] || null, reference: entry.idempotencyKey }
    }
    return { matchedBy: 'EXTERNAL_REF', payment: null, reference: '<missing-reference>' }
  }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Optimistic concurrency guard. When the caller supplied an
 * `expectedVersion` (e.g. the `version` they last saw in the UI), reject
 * the write if the row has moved on since.
 */
function assertVersionMatches(row: DividendRow, expected: number | undefined): void {
  if (expected === undefined || expected === null) return
  const current = Number(row.version ?? 1)
  if (current !== Number(expected)) {
    throw new ConflictException(`Dividend version mismatch — expected ${expected}, current ${current}. Refresh and try again.`)
  }
}

/**
 * True when the actor is allowed to perform internal-admin overrides
 * (e.g. force-cancelling a dividend that has already entered payment
 * processing). Mirrors the role list in `auth/rbac.ts`.
 */
function isInternalAdmin(actor: ActorContext): boolean {
  return actor.actorRole === 'super_admin' || actor.actorRole === 'transfer_agent_admin'
}

/**
 * Hides actions the actor cannot legally take. The rules here are
 * conservative — they assume "show unless we know better" so that callers
 * with no actor context (e.g. system tasks) still see every option.
 */
function isActionVisibleTo(action: DividendAction, actor: ActorContext | undefined): boolean {
  if (action === 'forceCancel') {
    return actor ? isInternalAdmin(actor) : true
  }
  return true
}

/**
 * Surfaces actionable warnings for the detail view. These are designed
 * to be lightweight UI hints, not hard validation errors — the workflow
 * methods themselves are the authoritative gate.
 */
function buildWarnings(declaration: DividendEvent, summary: DividendCalculatedSummary | undefined): DividendWarning[] {
  const warnings: DividendWarning[] = []
  const today = new Date().toISOString().slice(0, 10)

  // Date sanity — these are also enforced at create/update, but a row
  // edited before validation existed (or via legacy paths) might still
  // have inconsistent dates.
  if (declaration.recordDate < declaration.declarationDate) {
    warnings.push({
      code: 'RECORD_DATE_BEFORE_DECLARATION',
      message: 'Record date is before the declaration date — review and re-issue.',
      severity: 'ERROR',
    })
  }
  if (declaration.paymentDate < declaration.recordDate) {
    warnings.push({
      code: 'PAYMENT_DATE_BEFORE_RECORD',
      message: 'Payment date is before the record date — review and re-issue.',
      severity: 'ERROR',
    })
  }

  // Past record date on a non-terminal, pre-snapshot row is a soft
  // problem — operators usually want to know.
  const preSnapshot =
    declaration.status === 'DRAFT' ||
    declaration.status === 'PENDING_APPROVAL' ||
    declaration.status === 'CHANGES_REQUESTED' ||
    declaration.status === 'APPROVED'
  if (preSnapshot && declaration.recordDate < today) {
    warnings.push({
      code: 'RECORD_DATE_IN_PAST',
      message: 'Record date is in the past. Lock eligibility soon to avoid further ledger drift.',
      metadata: { recordDate: declaration.recordDate },
      severity: 'WARNING',
    })
  }

  // Cash dividends should usually have an ex-dividend date set.
  if (declaration.kind === 'CASH' && !declaration.exDividendDate) {
    warnings.push({
      code: 'MISSING_EX_DIVIDEND_DATE',
      message: 'No ex-dividend date set. Cash dividends typically require one for market settlement.',
      severity: 'WARNING',
    })
  }

  // No supporting documents on a CASH dividend over a meaningful threshold.
  if (declaration.supportingDocuments.length === 0) {
    warnings.push({
      code: 'MISSING_SUPPORTING_DOCUMENTS',
      message: 'No supporting documents attached. Attach the board resolution or rate authorisation before approval.',
      severity: 'INFO',
    })
  }

  // Default withholding of 0 on a cash dividend — surface it so the
  // operator can confirm intentionality.
  if (declaration.kind === 'CASH' && Number(declaration.withholdingDefaultPct) === 0) {
    warnings.push({
      code: 'NO_DEFAULT_WITHHOLDING',
      message: 'Default withholding is 0%. Confirm tax forms are on file or set a jurisdictional default.',
      severity: 'INFO',
    })
  }

  // After calculation: missing payment instructions.
  if (summary && summary.entitlementCount > 0 && summary.pendingCount > 0 && declaration.status === 'PAYMENT_SCHEDULED') {
    warnings.push({
      code: 'PENDING_PAYMENT_INSTRUCTIONS',
      message: `${summary.pendingCount} entitlement(s) are still awaiting payment processing.`,
      metadata: { pendingCount: summary.pendingCount },
      severity: 'INFO',
    })
  }

  // Mid-payment cancel risk.
  if (declaration.status === 'PARTIALLY_PAID') {
    warnings.push({
      code: 'PARTIALLY_PAID_CANCEL_RISK',
      message: 'Some shareholders have already been paid. Cancellation requires an internal-admin override.',
      severity: 'WARNING',
    })
  }

  return warnings
}

/**
 * Reject zero or negative rates on cash-style dividends. Stock and
 * scrip dividends can legitimately use a 0 rate (the value is in the
 * issued share count), but a CASH/SPECIAL/RETURN_OF_CAPITAL dividend
 * with rate <= 0 is always a setup mistake.
 */
function assertPositiveCashRate(kind: DividendKind | undefined, rateAmount: string, ratePerShareCents: number): void {
  const cashLike: ReadonlyArray<DividendKind> = ['CASH', 'SPECIAL', 'RETURN_OF_CAPITAL']
  if (!kind || !cashLike.includes(kind)) return
  const decimal = Number(rateAmount)
  if (!Number.isFinite(decimal) || decimal <= 0) {
    throw new BadRequestException('Cash dividend rate must be positive')
  }
  if (ratePerShareCents < 0) {
    throw new BadRequestException('Cash dividend rate cannot be negative')
  }
}

function resolveRate(input: { rateType?: DividendRateType; rateAmount?: string; ratePerShareCents?: number | string }): {
  rateAmount: string
  ratePerShareCents: number
} {
  const rateType: DividendRateType = input.rateType ?? 'PER_SHARE'
  if (input.rateAmount !== undefined && input.rateAmount !== null) {
    const ratePerShareCents = rateType === 'PER_SHARE' ? Math.round(Number(input.rateAmount) * 100) : 0
    return { rateAmount: input.rateAmount, ratePerShareCents }
  }
  if (input.ratePerShareCents !== undefined && input.ratePerShareCents !== null) {
    const cents = Number(input.ratePerShareCents)
    return { rateAmount: (cents / 100).toFixed(8).replace(/0+$/, '').replace(/\.$/, ''), ratePerShareCents: cents }
  }
  return { rateAmount: '0', ratePerShareCents: 0 }
}

function decimalToBigIntFloor(decimal: string): string {
  const idx = decimal.indexOf('.')
  if (idx === -1) return decimal
  return decimal.slice(0, idx) || '0'
}

function mapDividend(row: DividendRow): DividendEvent {
  return {
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
    calculatedAt: row.calculated_at ? new Date(row.calculated_at) : undefined,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
    changesRequestedAt: row.changes_requested_at ? new Date(row.changes_requested_at) : undefined,
    createdAt: new Date(row.created_at),
    currency: row.currency,
    declarationDate: formatDate(row.declaration_date),
    description: row.description || undefined,
    eligibilityLockedAt: row.eligibility_locked_at ? new Date(row.eligibility_locked_at) : undefined,
    exDividendDate: row.ex_dividend_date ? formatDate(row.ex_dividend_date) : undefined,
    id: row.id,
    issuerId: row.issuer_id,
    kind: row.kind,
    metadata: row.metadata || {},
    notes: row.notes || undefined,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    paymentDate: formatDate(row.payment_date),
    rateAmount: row.rate_amount?.toString() || '0',
    ratePerShareCents: Number(row.rate_per_share_cents || 0),
    rateType: row.rate_type || 'PER_SHARE',
    recordDate: formatDate(row.record_date),
    rejectedAt: row.rejected_at ? new Date(row.rejected_at) : undefined,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
    securityId: row.security_id,
    shareClassId: row.share_class_id || undefined,
    status: row.status,
    supportingDocuments: Array.isArray(row.supporting_documents) ? row.supporting_documents : [],
    totalDistributionCents: Number(row.total_distribution_cents || '0'),
    updatedAt: new Date(row.updated_at),
    version: Number(row.version ?? 1),
    withholdingDefaultPct: row.withholding_default_pct?.toString() || '0',
    calculationsLockedAt: row.calculations_locked_at ? new Date(row.calculations_locked_at) : undefined,
    calculationVersion: Number(row.calculation_version ?? 0),
  }
}

function mapEntitlement(row: EntitlementRow): DividendEntitlement {
  const gross = Number(row.gross_amount_cents || row.amount_cents || '0')
  const withholding = Number(row.withholding_cents || '0')
  const net = Number(row.net_amount_cents || row.amount_cents || '0')
  return {
    accountId: row.account_id,
    amountCents: gross,
    calculationVersion: Number(row.calculation_version ?? 1),
    createdAt: new Date(row.created_at),
    currency: row.currency || 'USD',
    dividendEventId: row.dividend_event_id,
    eligibilitySnapshotId: row.eligibility_snapshot_id || undefined,
    frozenAt: row.frozen_at ? new Date(row.frozen_at) : undefined,
    grossAmountCents: gross,
    id: row.id,
    metadata: row.metadata || {},
    netAmountCents: net,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    paymentMethod: row.payment_method || undefined,
    paymentReference: row.payment_reference || undefined,
    shareholderId: row.shareholder_id,
    sharesHeld: row.shares_held_decimal?.toString() || row.shares_held?.toString() || '0',
    status: row.status,
    taxFormStatus: (row.tax_form_status as DividendEntitlement['taxFormStatus']) || undefined,
    taxResidency: row.tax_residency || undefined,
    taxStatus: (row.tax_status as DividendTaxStatus) || 'RESIDENT',
    treatyRate: row.treaty_rate?.toString() || undefined,
    updatedAt: new Date(row.updated_at),
    withholdingCents: withholding,
    withholdingPct: row.withholding_pct?.toString() || '0',
    withholdingReason: (row.withholding_reason as DividendEntitlement['withholdingReason']) || undefined,
  }
}

function mapSnapshot(row: SnapshotRow): DividendEligibilitySnapshot {
  // Tolerate legacy payloads (pre-eligibility-engine) where rows had only
  // `{ accountId, shareholderId, sharesHeld }` and assume those are
  // ELIGIBLE so historical snapshots keep behaving the same.
  const rawPayload = Array.isArray(row.snapshot_payload) ? row.snapshot_payload : []
  const recordDate = formatDate(row.record_date)
  const snapshotPayload: DividendEligibilityEntry[] = rawPayload.map((entry: any) => ({
    accountId: entry.accountId ?? null,
    disqualificationReason: entry.disqualificationReason ?? undefined,
    eligibilityStatus: (entry.eligibilityStatus as DividendEligibilityEntry['eligibilityStatus']) ?? 'ELIGIBLE',
    ownershipReference: entry.ownershipReference ?? undefined,
    ownershipSource: (entry.ownershipSource as DividendEligibilityEntry['ownershipSource']) ?? 'LEDGER_AS_OF_RECORD_DATE',
    recordDate: entry.recordDate ?? recordDate,
    securityId: entry.securityId ?? row.security_id,
    shareholderId: entry.shareholderId ?? null,
    sharesHeld: entry.sharesHeld?.toString() ?? '0',
  }))
  return {
    capturedAt: new Date(row.captured_at),
    dividendEventId: row.dividend_event_id,
    excludedHolderCount: Number(row.excluded_holder_count ?? 0),
    holderCount: row.holder_count,
    id: row.id,
    issuerId: row.issuer_id,
    lockedAt: row.locked_at ? new Date(row.locked_at) : undefined,
    metadata: row.metadata || {},
    recordDate,
    securityId: row.security_id,
    shareClassId: row.share_class_id || undefined,
    snapshotPayload,
    totalEligibleShares: row.total_eligible_shares?.toString() || '0',
  }
}

/**
 * Pure projection: given the dividend, snapshot, and totals, build the
 * API-level `DividendCalculationSummary`. Centralised here so both the
 * inline write path and the read-only `getCalculationSummary` produce
 * an identical shape.
 */
function buildCalculationSummary(
  dividend: DividendEvent,
  snapshot: DividendEligibilitySnapshot,
  totals: { totalGrossCents: number; totalWithholdingCents: number; totalNetCents: number; totalEligibleShares: string },
  warnings: DividendWarning[],
): DividendCalculationSummary {
  return {
    calculationVersion: dividend.calculationVersion ?? 0,
    currency: dividend.currency,
    dividendEventId: dividend.id,
    eligibleHolderCount: snapshot.holderCount,
    excludedHolderCount: snapshot.excludedHolderCount,
    lockedForPayment: dividend.status === 'PAYMENT_SCHEDULED' || dividend.status === 'PARTIALLY_PAID' || dividend.status === 'PAID',
    recordDate: snapshot.recordDate,
    status: dividend.status,
    totalEligibleShares: totals.totalEligibleShares,
    totalGrossCents: totals.totalGrossCents,
    totalNetCents: totals.totalNetCents,
    totalWithholdingCents: totals.totalWithholdingCents,
    warnings,
  }
}

/** Re-derive snapshot-only warnings (blocked accounts, unknown ledger holders, etc.). */
function buildCalculationSummaryWarnings(snapshot: DividendEligibilitySnapshot): DividendWarning[] {
  const warnings: DividendWarning[] = []
  for (const entry of snapshot.snapshotPayload) {
    if (entry.eligibilityStatus === 'EXCLUDED_BLOCKED_ACCOUNT' || entry.eligibilityStatus === 'EXCLUDED_BLOCKED_SHAREHOLDER') {
      warnings.push({
        code: 'BLOCKED_HOLDER_EXCLUDED',
        message: entry.disqualificationReason ?? 'Holder excluded due to account / shareholder block.',
        metadata: { accountId: entry.accountId, shareholderId: entry.shareholderId },
        severity: 'INFO',
      })
    }
    if (entry.eligibilityStatus === 'EXCLUDED_INACTIVE_KYC') {
      warnings.push({
        code: 'INACTIVE_KYC_EXCLUDED',
        message: entry.disqualificationReason ?? 'Holder excluded due to inactive KYC.',
        metadata: { accountId: entry.accountId, shareholderId: entry.shareholderId },
        severity: 'WARNING',
      })
    }
    if (entry.eligibilityStatus === 'EXCLUDED_UNKNOWN_ACCOUNT') {
      warnings.push({
        code: 'UNKNOWN_LEDGER_HOLDER',
        message: entry.disqualificationReason ?? 'Ledger holder did not match a shareholder account.',
        metadata: { ownershipReference: entry.ownershipReference },
        severity: 'WARNING',
      })
    }
  }
  return warnings
}

function mapApproval(row: ApprovalRow): DividendApproval {
  return {
    action: row.action,
    actorId: row.actor_id,
    actorRole: row.actor_role || undefined,
    createdAt: new Date(row.created_at),
    decidedAt: new Date(row.decided_at),
    decisionNotes: row.decision_notes || undefined,
    dividendEventId: row.dividend_event_id,
    id: row.id,
    metadata: row.metadata || {},
  }
}

function mapBatch(row: BatchRow): DividendPaymentBatch {
  return {
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    batchNumber: row.batch_number || '',
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by || undefined,
    currency: row.currency || 'USD',
    dividendEventId: row.dividend_event_id,
    id: row.id,
    issuerId: row.issuer_id,
    metadata: row.metadata || {},
    method: row.method,
    notes: row.notes || undefined,
    paymentCount: row.payment_count,
    paymentDate: formatDate(row.payment_date),
    reconciledAt: row.reconciled_at ? new Date(row.reconciled_at) : undefined,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    status: row.status,
    totalGrossCents: Number(row.total_gross_cents || '0'),
    totalNetCents: Number(row.total_net_cents || '0'),
    totalWithholdingCents: Number(row.total_withholding_cents || '0'),
    updatedAt: new Date(row.updated_at),
  }
}

function mapPayment(row: PaymentRow): DividendPayment {
  return {
    accountId: row.account_id,
    attemptNo: row.attempt_no,
    batchId: row.batch_id || undefined,
    createdAt: new Date(row.created_at),
    currency: row.currency,
    dividendEventId: row.dividend_event_id,
    entitlementId: row.entitlement_id,
    externalRef: row.external_ref || undefined,
    failureReason: row.failure_reason || undefined,
    grossAmountCents: Number(row.gross_amount_cents),
    id: row.id,
    idempotencyKey: row.idempotency_key || undefined,
    metadata: row.metadata || {},
    method: row.method,
    netAmountCents: Number(row.net_amount_cents),
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    reconciledAt: row.reconciled_at ? new Date(row.reconciled_at) : undefined,
    returnedAt: row.returned_at ? new Date(row.returned_at) : undefined,
    shareholderId: row.shareholder_id,
    status: row.status,
    updatedAt: new Date(row.updated_at),
    withholdingCents: Number(row.withholding_cents),
  }
}

function mapWithholding(row: WithholdingRow): DividendTaxWithholding {
  return {
    createdAt: new Date(row.created_at),
    dividendEventId: row.dividend_event_id,
    entitlementId: row.entitlement_id,
    id: row.id,
    jurisdiction: row.jurisdiction,
    metadata: row.metadata || {},
    paymentId: row.payment_id || undefined,
    reason: row.reason || undefined,
    shareholderId: row.shareholder_id,
    taxableAmountCents: Number(row.taxable_amount_cents),
    withholdingCents: Number(row.withholding_cents),
    withholdingPct: row.withholding_pct?.toString() || '0',
  }
}

function mapStatement(row: StatementRow): DividendStatement {
  return {
    accountId: row.account_id,
    createdAt: new Date(row.created_at),
    currency: row.currency,
    dividendEventId: row.dividend_event_id,
    documentStorageKey: row.document_storage_key || undefined,
    entitlementId: row.entitlement_id,
    grossAmountCents: Number(row.gross_amount_cents),
    id: row.id,
    metadata: row.metadata || {},
    netAmountCents: Number(row.net_amount_cents),
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
    shareholderId: row.shareholder_id,
    status: row.status,
    statementDate: formatDate(row.statement_date),
    updatedAt: new Date(row.updated_at),
    withholdingCents: Number(row.withholding_cents),
  }
}

function mapReinvestment(row: ReinvestmentRow): DividendReinvestmentInstruction {
  return {
    accountId: row.account_id,
    createdAt: new Date(row.created_at),
    effectiveFrom: formatDate(row.effective_from),
    effectiveTo: row.effective_to ? formatDate(row.effective_to) : undefined,
    enabled: row.enabled,
    id: row.id,
    issuerId: row.issuer_id,
    metadata: row.metadata || {},
    percentage: row.percentage?.toString() || '0',
    securityId: row.security_id,
    shareClassId: row.share_class_id || undefined,
    shareholderId: row.shareholder_id,
    updatedAt: new Date(row.updated_at),
  }
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

/**
 * Maps a `DividendPaymentStatus` to its corresponding audit action.
 * Centralised so all callers stay aligned with the audit vocabulary
 * defined in `audit.events.ts`.
 */
function paymentStatusToAuditAction(status: DividendPaymentStatus): string {
  switch (status) {
    case 'CANCELLED':
      return AuditActions.DIVIDEND_PAYMENT_CANCELLED
    case 'FAILED':
      return AuditActions.DIVIDEND_PAYMENT_FAILED
    case 'PAID':
      return AuditActions.DIVIDEND_PAYMENT_PAID
    case 'PROCESSING':
      return AuditActions.DIVIDEND_PAYMENT_PROCESSING
    case 'RECONCILED':
      return AuditActions.DIVIDEND_PAYMENT_RECONCILED
    case 'RETURNED':
      return AuditActions.DIVIDEND_PAYMENT_RETURNED
    case 'SCHEDULED':
      return AuditActions.DIVIDEND_PAYMENT_SCHEDULED
    case 'SENT':
      return AuditActions.DIVIDEND_PAYMENT_SENT
    case 'SETTLED':
      return AuditActions.DIVIDEND_PAYMENT_SETTLED
    default:
      return AuditActions.DIVIDEND_PAYMENT_SCHEDULED
  }
}

/** True when the batch is in a state that supports a reconciliation pass. */
function isReconcilableBatchStatus(status: DividendBatchStatus): boolean {
  return status === 'PROCESSED' || status === 'COMPLETED' || status === 'PARTIALLY_FAILED' || status === 'PARTIALLY_PROCESSED'
}

/**
 * Returns the action keys the UI should render given the batch +
 * payment state. Mirrors `allowedActionsFor` in `dividends.state.ts`
 * for the declaration workflow.
 */
function allowedBatchActionsFor(status: DividendBatchStatus, payments: readonly DividendPayment[]): DividendBatchAction[] {
  const actions: DividendBatchAction[] = []
  switch (status) {
    case 'DRAFT':
      actions.push('edit', 'submit', 'cancel')
      break
    case 'PENDING_APPROVAL':
      actions.push('approve', 'reject', 'cancel')
      break
    case 'APPROVED':
      actions.push('schedule', 'forceSchedule', 'cancel')
      break
    case 'SCHEDULED':
      actions.push('markProcessing', 'cancel')
      break
    case 'PROCESSING':
    case 'PARTIALLY_PROCESSED':
    case 'PARTIALLY_FAILED':
      actions.push('recordPayment', 'bulkRecord', 'cancel')
      break
    case 'PROCESSED':
    case 'COMPLETED':
      actions.push('reconcile')
      break
    case 'FAILED':
      actions.push('cancel')
      break
    case 'RECONCILED':
    case 'CANCELLED':
      break
  }
  if (status === 'PROCESSING' || status === 'PARTIALLY_PROCESSED' || status === 'PARTIALLY_FAILED') {
    if (payments.some(payment => PAID_PAYMENT_STATUSES.has(payment.status))) {
      actions.push('reconcile')
    }
  }
  return actions
}

// ----------------------------------------------------------------------
// Communications row types + mapper + state machine
// ----------------------------------------------------------------------

type CommunicationRow = {
  id: string
  dividend_event_id: string
  issuer_id: string
  kind: DividendCommunicationKind
  status: DividendCommunicationStatus
  subject: string | null
  body: string | null
  audience: string | null
  channel: 'EMAIL' | 'POSTAL' | 'PRESS' | 'PORTAL' | 'EDGAR' | null
  scheduled_at: Date | null
  sent_at: Date | null
  approved_at: Date | null
  cancelled_at: Date | null
  document_refs: DividendDocumentRef[]
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

function mapCommunication(row: CommunicationRow): DividendCommunication {
  return {
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    audience: row.audience || undefined,
    body: row.body || undefined,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
    channel: row.channel || undefined,
    createdAt: new Date(row.created_at),
    dividendEventId: row.dividend_event_id,
    documentRefs: Array.isArray(row.document_refs) ? row.document_refs : [],
    id: row.id,
    issuerId: row.issuer_id,
    kind: row.kind,
    metadata: row.metadata || {},
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
    status: row.status,
    subject: row.subject || undefined,
    updatedAt: new Date(row.updated_at),
  }
}

// ----------------------------------------------------------------------
// Fractional adjustment + reinvestment record + exception row types
// ----------------------------------------------------------------------

type FractionalAdjustmentRow = {
  id: string
  dividend_event_id: string
  entitlement_id: string
  shareholder_id: string
  policy: FractionalSharePolicy
  fractional_shares: string
  whole_shares_issued: number
  adjustment_cents: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: Date
}

function mapFractionalAdjustment(row: FractionalAdjustmentRow): DividendFractionalAdjustment {
  return {
    adjustmentCents: Number(row.adjustment_cents || '0'),
    createdAt: new Date(row.created_at),
    dividendEventId: row.dividend_event_id,
    entitlementId: row.entitlement_id,
    fractionalShares: row.fractional_shares?.toString() ?? '0',
    id: row.id,
    metadata: row.metadata || {},
    policy: row.policy,
    reason: row.reason || undefined,
    shareholderId: row.shareholder_id,
    wholeSharesIssued: Number(row.whole_shares_issued ?? 0),
  }
}

type ReinvestmentRecordRow = {
  id: string
  dividend_event_id: string
  entitlement_id: string
  shareholder_id: string
  account_id: string
  status: DividendReinvestmentStatus
  reinvested_amount_cents: string
  purchase_price: string
  shares_issued: string
  fractional_share_handling: FractionalSharePolicy
  residual_cash_cents: string
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

function mapReinvestmentRecord(row: ReinvestmentRecordRow): DividendReinvestmentRecord {
  return {
    accountId: row.account_id,
    createdAt: new Date(row.created_at),
    dividendEventId: row.dividend_event_id,
    entitlementId: row.entitlement_id,
    fractionalShareHandling: row.fractional_share_handling,
    id: row.id,
    metadata: row.metadata || {},
    purchasePrice: row.purchase_price?.toString() ?? '0',
    reinvestedAmountCents: Number(row.reinvested_amount_cents || '0'),
    residualCashCents: Number(row.residual_cash_cents || '0'),
    shareholderId: row.shareholder_id,
    sharesIssued: row.shares_issued?.toString() ?? '0',
    status: row.status,
    updatedAt: new Date(row.updated_at),
  }
}

type ReconciliationExceptionRow = {
  id: string
  dividend_event_id: string
  batch_id: string | null
  payment_id: string | null
  type: DividendReconciliationExceptionType
  status: DividendReconciliationExceptionStatus
  description: string
  expected_cents: string | null
  observed_cents: string | null
  resolution: string | null
  opened_at: Date
  resolved_at: Date | null
  metadata: Record<string, unknown>
}

function mapReconciliationException(row: ReconciliationExceptionRow): DividendReconciliationException {
  return {
    batchId: row.batch_id || undefined,
    description: row.description,
    dividendEventId: row.dividend_event_id,
    expectedCents: row.expected_cents != null ? Number(row.expected_cents) : undefined,
    id: row.id,
    metadata: row.metadata || {},
    observedCents: row.observed_cents != null ? Number(row.observed_cents) : undefined,
    openedAt: new Date(row.opened_at),
    paymentId: row.payment_id || undefined,
    resolution: row.resolution || undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    status: row.status,
    type: row.type,
  }
}

// ----------------------------------------------------------------------
// Decimal helpers for DRIP math.
// ----------------------------------------------------------------------

/** Convert a decimal-string price (dollars) to integer cents. */
function decimalToCents(text: string): number {
  const cleaned = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new BadRequestException(`Invalid decimal: ${text}`)
  }
  const negative = cleaned.startsWith('-')
  const abs = negative ? cleaned.slice(1) : cleaned
  const [whole, frac = ''] = abs.split('.')
  const padded = (frac + '00').slice(0, 2)
  const cents = Number(whole) * 100 + Number(padded || '0')
  return negative ? -cents : cents
}

/** Format an integer share count with explicit fractional precision. */
function formatNonNegativeDecimal(value: number, scale: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  const whole = Math.trunc(value)
  const frac = value - whole
  if (frac === 0) return whole.toString()
  return whole.toString() + '.' + frac.toFixed(scale).slice(2).replace(/0+$/, '')
}

/**
 * Order-preserving dedupe used by the export builders to avoid issuing
 * unnecessary duplicate lookups when many declarations share the same
 * issuer/security.
 */
function uniq<T>(values: ReadonlyArray<T>): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/**
 * Best-effort flattening of the JSON `address` blob on `shareholders`
 * into a single line. The schema doesn't enforce a particular shape so
 * we look at the most common keys and join the present ones with
 * commas. Returns `undefined` if the blob is empty.
 */
function formatAddress(address: Record<string, unknown> | null | undefined): string | undefined {
  if (!address) return undefined
  const parts: string[] = []
  for (const key of ['line1', 'line2', 'city', 'region', 'state', 'postalCode', 'postal_code', 'country']) {
    const v = address[key]
    if (typeof v === 'string' && v.trim()) parts.push(v.trim())
  }
  return parts.length ? parts.join(', ') : undefined
}
