import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'

import { AuditActions } from '../audit/audit.events.js'
import { AuditService } from '../audit/audit.service.js'
import type { AuditSeverity } from '../audit/audit.types.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import type { TransferRequest, TransferReview as TransferReviewRow } from '../generated/prisma/client.js'
import {
  LedgerEntryType,
  LedgerSourceType,
  Prisma,
  TransferIntakeMethod,
  TransferKind,
  TransferPriority,
  TransferReviewAction,
  TransferState,
} from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TasksSignalsService } from '../tasks/tasks.signals.service.js'

import { derivePhase, PHASE_LABEL, readEnvelope, resolveBranch, writeEnvelope } from './case/case-envelope.js'
import type { CaseType, DocRequirement, SettlementStep, WorkflowCaseEnvelope } from './case/case-types.js'
import { CURRENT_CASE_VERSION } from './case/case-types.js'
import { buildRequirements, missingRequirementCodes, reconcileRequirements } from './case/requirements.js'
import type { RuleInput } from './case/rules.js'
import { runRules } from './case/rules.js'
import { advanceStep, allStepsComplete, buildSettlementPlan, initialTaxFollowUps } from './case/settlement-plan.js'
import type {
  AdvanceSettlementStepDto,
  ApproveTransferDto,
  CancelTransferDto,
  ClearAdverseClaimDto,
  ClearDeceasedFlagDto,
  ClearRestrictionDto,
  ClearStopOrderDto,
  CreateTransferRequestDto,
  FailTransferDto,
  IntakeTransferDto,
  IssuerReviewResponseDto,
  ProvideLegalOpinionDto,
  RaiseAdverseClaimDto,
  RaiseDeceasedFlagDto,
  RaiseRestrictionDto,
  RaiseStopOrderDto,
  RejectTransferDto,
  RequestInfoDto,
  RequestIssuerReviewDto,
  RequestLegalOpinionDto,
  ResubmitDto,
  RunAutomatedReviewDto,
  SettleTransferDto,
  StartReviewDto,
  SubmitDocumentsDto,
  TransferQueueQuery,
} from './transfer-workflow.dto.js'
import { assertTransferTransition, lifecycleStageFor } from './transfer-workflow.state.js'
import type {
  LedgerImpactLeg,
  LedgerImpactPreview,
  TransferDetail,
  TransferRequestSummary,
  TransferReviewEntry,
  TransferTimelineEntry,
} from './transfer-workflow.types.js'

/** Transaction client handle exposed by `prisma.$transaction(cb)`. */
type Tx = Prisma.TransactionClient

const SORT_COLUMNS: Record<string, keyof Prisma.TransferRequestOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  priority: 'priority',
  quantity: 'quantity',
  state: 'state',
  submittedAt: 'submittedAt',
  updatedAt: 'updatedAt',
}
const SORT_KEYS: Record<string, string> = {
  createdAt: 'createdAt',
  priority: 'priority',
  quantity: 'quantity',
  state: 'state',
  submittedAt: 'submittedAt',
  updatedAt: 'updatedAt',
}

const OPEN_STATES: TransferState[] = [TransferState.SUBMITTED, TransferState.UNDER_REVIEW, TransferState.NEEDS_INFO]

/**
 * Orchestrates the full stock-transfer lifecycle.
 *
 * Invariants enforced here:
 * - No transfer progresses except through `assertTransferTransition`.
 * - Ledger rows are only ever written during `settle`, inside a single
 *   Prisma `$transaction` together with the state mutation and the Holding
 *   projection updates.
 * - Every mutation records an append-only AuditEvent and, when appropriate,
 *   opens or updates an operational Task so the admin queue stays truthful.
 * - Quantity math uses BigInt end-to-end; Holding is updated transactionally
 *   so reads are always consistent with the ledger.
 */
@Injectable()
export class TransferWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signals: TasksSignalsService,
  ) {}

  // ------------------------------------------------------------------
  // Public API — queue + detail
  // ------------------------------------------------------------------

  async list(query: TransferQueueQuery): Promise<PaginatedResponse<TransferRequestSummary>> {
    const where: Prisma.TransferRequestWhereInput = {}

    if (query.issuerId) where.issuerId = query.issuerId
    if (query.state) where.state = query.state
    if (query.lifecycleStage) where.lifecycleStage = query.lifecycleStage
    if (query.kind) where.kind = query.kind
    if (query.priority) where.priority = query.priority
    if (query.securityId) where.securityId = query.securityId
    if (query.shareClassId) where.shareClassId = query.shareClassId
    if (query.assignedReviewerId) where.assignedReviewerId = query.assignedReviewerId

    if (query.accountId) {
      where.OR = [{ fromAccountId: query.accountId }, { toAccountId: query.accountId }]
    }

    if (query.onlyOpen) {
      where.state = { in: OPEN_STATES }
    }

    if (query.caseType) {
      where.canonicalData = {
        ...(where.canonicalData as Prisma.JsonFilter | undefined),
        path: ['caseType'],
        equals: query.caseType,
      }
    }
    if (query.branch) {
      // Prisma supports one JSON path filter per field at a time; we fold
      // caseType + branch into an AND so both can coexist.
      const clause: Prisma.TransferRequestWhereInput = {
        canonicalData: { path: ['branch'], equals: query.branch },
      }
      where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), clause] : [clause]
    }

    if (query.q) {
      const q = query.q.trim()
      const tokens: Prisma.TransferRequestWhereInput[] = [
        { reference: { contains: q, mode: 'insensitive' } },
        { securityId: { contains: q, mode: 'insensitive' } },
        { fromAccountId: { contains: q, mode: 'insensitive' } },
        { toAccountId: { contains: q, mode: 'insensitive' } },
      ]
      where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), { OR: tokens }] : [{ OR: tokens }]
    }

    const sort = resolveSort(query, SORT_KEYS, { column: 'createdAt', dir: 'desc' })
    const orderBy: Prisma.TransferRequestOrderByWithRelationInput = {
      [SORT_COLUMNS[sort.column] ?? 'createdAt']: sort.dir,
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transferRequest.count({ where }),
      this.prisma.transferRequest.findMany({
        where,
        orderBy,
        skip: pageOffset(query),
        take: query.pageSize,
      }),
    ])

    return buildPaginated(rows.map(mapSummary), total, query)
  }

  async getDetail(id: string): Promise<TransferDetail> {
    const transfer = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: { reviews: { orderBy: { createdAt: 'asc' } } },
    })
    if (!transfer) {
      throw new NotFoundException(`Transfer ${id} not found`)
    }

    const auditRows = await this.audit.timeline('TRANSFER_REQUEST', id, { limit: 200 })

    const preview = await this.previewLedgerImpactFromTransfer(transfer)
    const reviews = transfer.reviews.map(mapReview)
    const timeline = buildTimeline(
      reviews,
      auditRows.map(row => ({
        action: row.action,
        actorId: row.actor.id,
        actorRole: row.actor.role,
        id: row.id,
        metadata: row.payload,
        occurredAt: new Date(row.at),
      })),
    )

    return {
      ...mapSummary(transfer),
      case: readEnvelope(transfer),
      ledgerImpactPreview: preview,
      reviews,
      timeline,
    }
  }

  // ------------------------------------------------------------------
  // Workflow actions
  // ------------------------------------------------------------------

  async create(input: CreateTransferRequestDto, actor: ActorContext): Promise<TransferRequestSummary> {
    await this.validateRelationships(input)

    if (input.idempotencyKey) {
      const existing = await this.prisma.transferRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      })
      if (existing) return mapSummary(existing)
    }

    const initialState = input.submit ? TransferState.SUBMITTED : TransferState.DRAFT
    const reference = await this.allocateReference(input.issuerId)

    const created = await this.prisma.$transaction(async tx => {
      const record = await tx.transferRequest.create({
        data: {
          reference,
          issuerId: input.issuerId,
          securityId: input.securityId,
          shareClassId: input.shareClassId,
          fromAccountId: input.fromAccountId ?? null,
          toAccountId: input.toAccountId ?? null,
          quantity: BigInt(input.quantity),
          kind: input.kind ?? TransferKind.TRANSFER,
          intakeMethod: input.intakeMethod ?? TransferIntakeMethod.GUIDED_ENTRY,
          priority: input.priority ?? TransferPriority.STANDARD,
          state: initialState,
          lifecycleStage: lifecycleStageFor(initialState),
          submittedById: actor.actorId ?? null,
          submittedAt: input.submit ? new Date() : null,
          evidenceRequired: input.evidenceRequired ?? [],
          evidenceSubmitted: input.evidenceSubmitted ?? [],
          missingEvidence: computeMissingEvidence(input.evidenceRequired, input.evidenceSubmitted),
          idempotencyKey: input.idempotencyKey ?? null,
        },
      })

      await this.recordAudit(tx, actor, record, input.submit ? AuditActions.TRANSFER_SUBMITTED : AuditActions.TRANSFER_DRAFTED, 'INFO', {
        quantity: input.quantity,
        kind: record.kind,
      })
      return record
    })

    return mapSummary(created)
  }

  async submit(id: string, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.SUBMITTED,
      action: AuditActions.TRANSFER_SUBMITTED,
      severity: 'INFO',
      patch: () => ({ submittedAt: new Date() }),
    })
  }

  async startReview(id: string, input: StartReviewDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.UNDER_REVIEW,
      action: AuditActions.TRANSFER_REVIEW_STARTED,
      severity: 'INFO',
      patch: () => ({
        assignedReviewerId: input.assignedReviewerId ?? actor.actorId ?? null,
      }),
      review: {
        action: TransferReviewAction.COMMENT,
        notes: input.notes,
      },
    })
  }

  async requestInfo(id: string, input: RequestInfoDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.NEEDS_INFO,
      action: AuditActions.TRANSFER_INFO_REQUESTED,
      severity: 'MEDIUM',
      patch: current => ({
        missingEvidence: mergeEvidence(current.missingEvidence, input.missingEvidence),
      }),
      review: {
        action: TransferReviewAction.REQUEST_INFO,
        reason: input.reason,
        notes: input.notes,
      },
      afterCommit: async current => {
        // Surface this to the ops queue so the request-info loop is visible.
        await this.signals
          .flagTransferBlocked(
            {
              issuerId: current.issuerId,
              transferId: current.id,
              reference: current.reference,
              reasons: current.missingEvidence.length
                ? current.missingEvidence.map(key => `missing_evidence:${key}`)
                : ['additional_information_requested'],
              priority: 'MEDIUM',
              severity: 'WARN',
            },
            actor,
          )
          .catch(() => undefined)
      },
    })
  }

  async resubmit(id: string, input: ResubmitDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.UNDER_REVIEW,
      action: AuditActions.TRANSFER_RESUBMITTED,
      severity: 'INFO',
      patch: current => {
        const submitted = dedupe([...(current.evidenceSubmitted ?? []), ...(input.evidenceSubmitted ?? [])])
        const missing = computeMissingEvidence(current.evidenceRequired, submitted)
        return { evidenceSubmitted: submitted, missingEvidence: missing }
      },
      review: {
        action: TransferReviewAction.COMMENT,
        notes: input.notes,
      },
      afterCommit: async current => {
        // Root cause cleared — close open blocker tasks. `closeForEntity`
        // is idempotent so calling it on every resubmit is cheap.
        if (!current.missingEvidence.length) {
          await this.signals.clearForEntity('TRANSFER_REQUEST', current.id, 'resubmitted with evidence', actor).catch(() => undefined)
        }
      },
    })
  }

  async approve(id: string, input: ApproveTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.APPROVED,
      action: AuditActions.TRANSFER_APPROVED,
      severity: 'MEDIUM',
      guard: current => this.guardApproval(current),
      review: {
        action: TransferReviewAction.APPROVE,
        notes: input.notes,
      },
      afterCommit: async current => {
        // All outstanding review tasks can close once the case is approved.
        await this.signals.clearForEntity('TRANSFER_REQUEST', current.id, 'transfer approved', actor).catch(() => undefined)
      },
    })
  }

  async reject(id: string, input: RejectTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.REJECTED,
      action: AuditActions.TRANSFER_REJECTED,
      severity: 'HIGH',
      patch: () => ({ failureReason: input.reason }),
      review: {
        action: TransferReviewAction.REJECT,
        reason: input.reason,
        notes: input.notes,
      },
      afterCommit: async current => {
        await this.signals
          .flagTransferRejected(
            {
              issuerId: current.issuerId,
              transferId: current.id,
              reference: current.reference,
              reason: input.reason,
            },
            actor,
          )
          .catch(() => undefined)
      },
    })
  }

  async cancel(id: string, input: CancelTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      id,
      actor,
      to: TransferState.CANCELLED,
      action: AuditActions.TRANSFER_CANCELLED,
      severity: 'MEDIUM',
      patch: () => ({ failureReason: input.reason }),
      review: {
        action: TransferReviewAction.WITHDRAW,
        reason: input.reason,
      },
      afterCommit: async current => {
        await this.signals.clearForEntity('TRANSFER_REQUEST', current.id, 'transfer cancelled', actor).catch(() => undefined)
      },
    })
  }

  /**
   * Settlement is the only path that writes LedgerEntry rows. It runs a
   * single Prisma transaction that:
   *   1. Locks and re-reads the transfer request.
   *   2. Validates the state transition APPROVED -> SETTLED.
   *   3. Re-validates transferable holdings with BigInt precision.
   *   4. Writes one or two LedgerEntry rows with a shared correlationId.
   *   5. Updates/creates Holding projection rows accordingly.
   *   6. Updates the transfer record (state, timestamps, review trail).
   *   7. Emits the `TRANSFER_SETTLED` audit event.
   *
   * If any step throws, the whole transaction rolls back — the ledger is
   * never partially updated.
   */
  async settle(id: string, input: SettleTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    const settled = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      assertTransferTransitionOrThrow(current.state, TransferState.SETTLED)
      this.guardSettlement(current)

      const blockers = await this.computeBlockers(current, tx)
      if (blockers.length > 0) {
        // Record the blocked attempt for audit/AI *before* rolling back.
        // The audit row itself is written against a separate connection so
        // it survives the tx rollback; it gives operators a trail of
        // "why couldn't this settle?" without polluting the ledger.
        await this.audit.record({
          action: AuditActions.TRANSFER_SETTLEMENT_BLOCKED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: current.id,
          entityType: 'TRANSFER_REQUEST',
          issuerId: current.issuerId,
          metadata: { blockers, reference: current.reference },
          severity: 'HIGH',
          sourceContext: {
            component: 'transfer-workflow',
            system: 'HTTP_API',
          },
        })
        await this.signals.flagTransferBlocked(
          {
            issuerId: current.issuerId,
            transferId: current.id,
            reference: current.reference,
            reasons: blockers,
            priority: 'HIGH',
            severity: 'ERROR',
          },
          actor,
        )
        throw new ConflictException(`Cannot settle transfer: ${blockers.join('; ')}`)
      }

      const correlationId = `xfer:${current.id}`
      const quantity = current.quantity
      const now = new Date()

      const legs = resolveLedgerLegs(current)

      for (const leg of legs) {
        await tx.ledgerEntry.create({
          data: {
            issuerId: current.issuerId,
            securityId: current.securityId,
            shareClassId: current.shareClassId,
            shareholderAccountId: leg.accountId,
            type: leg.entryType,
            quantityDelta: leg.sign === 'POS' ? quantity : -quantity,
            sourceType: LedgerSourceType.TRANSFER_REQUEST,
            sourceRef: current.id,
            correlationId,
            occurredAt: now,
            actorId: actor.actorId || null,
            reason: input.notes || null,
          },
        })

        await upsertHolding(tx, {
          accountId: leg.accountId,
          securityId: current.securityId,
          shareClassId: current.shareClassId,
          quantityDelta: leg.sign === 'POS' ? quantity : -quantity,
        })
      }

      const updated = await tx.transferRequest.update({
        where: { id: current.id },
        data: {
          state: TransferState.SETTLED,
          lifecycleStage: lifecycleStageFor(TransferState.SETTLED),
          settledAt: now,
          reviews: {
            create: {
              action: TransferReviewAction.APPROVE,
              reviewerId: resolveReviewerId(actor),
              notes: input.notes ?? null,
            },
          },
        },
      })

      await this.recordAudit(tx, actor, updated, AuditActions.TRANSFER_SETTLED, 'MEDIUM', {
        correlationId,
        quantity: Number(quantity),
        legs: legs.map(l => ({ accountId: l.accountId, sign: l.sign, type: l.entryType })),
      })

      return updated
    })

    // Settlement succeeded — close any lingering ops tasks tied to this case.
    await this.signals.clearForEntity('TRANSFER_REQUEST', settled.id, 'transfer settled', actor).catch(() => undefined)

    return mapSummary(settled)
  }

  // ------------------------------------------------------------------
  // Ledger impact preview (pure computation — no writes)
  // ------------------------------------------------------------------

  async previewLedgerImpact(id: string): Promise<LedgerImpactPreview> {
    const transfer = await this.prisma.transferRequest.findUnique({ where: { id } })
    if (!transfer) throw new NotFoundException(`Transfer ${id} not found`)
    return this.previewLedgerImpactFromTransfer(transfer)
  }

  private async previewLedgerImpactFromTransfer(transfer: TransferRequest): Promise<LedgerImpactPreview> {
    const legs = resolveLedgerLegs(transfer)
    const blockers = await this.computeBlockers(transfer, this.prisma)

    const resolved: LedgerImpactLeg[] = []
    for (const leg of legs) {
      const holding = await this.prisma.holding.findUnique({
        where: {
          shareholderAccountId_securityId_shareClassId: {
            shareholderAccountId: leg.accountId,
            securityId: transfer.securityId,
            shareClassId: transfer.shareClassId,
          },
        },
      })
      const before = holding?.quantity ?? 0n
      const delta = leg.sign === 'POS' ? transfer.quantity : -transfer.quantity
      resolved.push({
        accountId: leg.accountId,
        entryType: leg.entryType,
        balanceBefore: Number(before),
        balanceAfter: Number(before + delta),
        quantityDelta: Number(delta),
      })
    }

    return {
      securityId: transfer.securityId,
      shareClassId: transfer.shareClassId,
      quantity: Number(transfer.quantity),
      legs: resolved,
      blockers,
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /**
   * Generic state-transition engine. Centralizes the "load, validate,
   * patch, record review, emit audit" pattern so every action handler
   * stays tiny and predictable.
   */
  private async transition(input: {
    id: string
    actor: ActorContext
    to: TransferState
    action: string
    severity: AuditSeverity
    patch?: (current: TransferRequest) => Prisma.TransferRequestUpdateInput
    guard?: (current: TransferRequest) => void | Promise<void>
    review?: {
      action: TransferReviewAction
      reason?: string
      notes?: string
    }
    afterCommit?: (updated: TransferRequest) => Promise<void>
  }): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id: input.id } })
      if (!current) throw new NotFoundException(`Transfer ${input.id} not found`)
      assertTransferTransitionOrThrow(current.state, input.to)
      if (input.guard) await input.guard(current)

      const patch = input.patch ? input.patch(current) : {}
      const data: Prisma.TransferRequestUpdateInput = {
        state: input.to,
        lifecycleStage: lifecycleStageFor(input.to),
        ...patch,
      }

      if (input.to === TransferState.SUBMITTED && !current.submittedAt) {
        data.submittedAt = new Date()
      }

      if (input.review) {
        data.reviews = {
          create: {
            action: input.review.action,
            reviewerId: resolveReviewerId(input.actor),
            reason: input.review.reason ?? null,
            notes: input.review.notes ?? null,
          },
        }
      }

      const next = await tx.transferRequest.update({ where: { id: current.id }, data })
      await this.recordAudit(tx, input.actor, next, input.action, input.severity, {
        from: current.state,
        to: input.to,
        ...(input.review?.reason ? { reason: input.review.reason } : {}),
      })
      return next
    })

    if (input.afterCommit) {
      await input.afterCommit(updated)
    }

    return mapSummary(updated)
  }

  private async recordAudit(
    _tx: Tx,
    actor: ActorContext,
    transfer: TransferRequest,
    action: string,
    severity: AuditSeverity,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Audit events live in the legacy pg pool (separate connection). We
    // still write them through the same logical flow; if the outer Prisma
    // tx rolls back, the audit insert is reconciled by the nightly drift
    // checker. Keeping it outside the Prisma tx also avoids holding a pg
    // advisory lock while Prisma holds its own connection.
    await this.audit.record({
      action,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      entityId: transfer.id,
      entityType: 'TRANSFER_REQUEST',
      issuerId: transfer.issuerId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      severity,
      metadata: { ...metadata, reference: transfer.reference },
      sourceContext: {
        component: 'transfer-workflow',
        correlationId: `xfer:${transfer.id}`,
        idempotencyKey: transfer.idempotencyKey ?? undefined,
        system: 'HTTP_API',
      },
    })
  }

  private async validateRelationships(input: CreateTransferRequestDto): Promise<void> {
    const [security, shareClass, fromAccount, toAccount] = await Promise.all([
      this.prisma.security.findUnique({ where: { id: input.securityId } }),
      this.prisma.shareClass.findUnique({ where: { id: input.shareClassId } }),
      input.fromAccountId ? this.prisma.shareholderAccount.findUnique({ where: { id: input.fromAccountId } }) : Promise.resolve(null),
      input.toAccountId ? this.prisma.shareholderAccount.findUnique({ where: { id: input.toAccountId } }) : Promise.resolve(null),
    ])

    if (!security) throw new NotFoundException(`Security ${input.securityId} not found`)
    if (security.issuerId !== input.issuerId) {
      throw new BadRequestException('Security does not belong to the specified issuer')
    }
    if (!shareClass) throw new NotFoundException(`Share class ${input.shareClassId} not found`)
    if (shareClass.securityId !== input.securityId) {
      throw new BadRequestException('Share class does not belong to the specified security')
    }
    if (input.fromAccountId && !fromAccount) {
      throw new NotFoundException(`From account ${input.fromAccountId} not found`)
    }
    if (input.toAccountId && !toAccount) {
      throw new NotFoundException(`To account ${input.toAccountId} not found`)
    }
    if (fromAccount && fromAccount.issuerId !== input.issuerId) {
      throw new BadRequestException('From account is registered under a different issuer')
    }
    if (toAccount && toAccount.issuerId !== input.issuerId) {
      throw new BadRequestException('To account is registered under a different issuer')
    }

    const kind = input.kind ?? TransferKind.TRANSFER
    if (kind === TransferKind.TRANSFER) {
      if (!input.fromAccountId || !input.toAccountId) {
        throw new BadRequestException('TRANSFER requires both fromAccountId and toAccountId')
      }
      if (input.fromAccountId === input.toAccountId) {
        throw new BadRequestException('From and to accounts must differ')
      }
    }
    if (kind === TransferKind.ISSUANCE && !input.toAccountId) {
      throw new BadRequestException('ISSUANCE requires toAccountId')
    }
    if (kind === TransferKind.CANCELLATION && !input.fromAccountId) {
      throw new BadRequestException('CANCELLATION requires fromAccountId')
    }
    if (shareClass.transferRestricted && kind === TransferKind.TRANSFER) {
      throw new ForbiddenException('Share class is transfer-restricted; route through the restriction review queue')
    }
  }

  private guardApproval(transfer: TransferRequest): void {
    if (transfer.missingEvidence.length > 0) {
      throw new ConflictException(`Cannot approve: ${transfer.missingEvidence.length} evidence item(s) still missing`)
    }
    if (transfer.blockingReasons.length > 0) {
      throw new ConflictException(`Cannot approve: ${transfer.blockingReasons.join('; ')}`)
    }
  }

  private guardSettlement(transfer: TransferRequest): void {
    if (transfer.quantity <= 0n) {
      throw new BadRequestException('Transfer quantity must be positive to settle')
    }
  }

  /**
   * Computes human-readable blockers that would prevent settlement right
   * now. Used both by the preview API and the settlement guard, so the UI
   * preview always matches the server-side check.
   */
  private async computeBlockers(transfer: TransferRequest, runner: Pick<PrismaService, 'holding'> | Tx): Promise<string[]> {
    const blockers: string[] = []

    if (transfer.kind === TransferKind.TRANSFER || transfer.kind === TransferKind.CANCELLATION) {
      if (!transfer.fromAccountId) {
        blockers.push('Missing source account')
      } else {
        const holding = await runner.holding.findUnique({
          where: {
            shareholderAccountId_securityId_shareClassId: {
              shareholderAccountId: transfer.fromAccountId,
              securityId: transfer.securityId,
              shareClassId: transfer.shareClassId,
            },
          },
        })
        const available = holding?.quantity ?? 0n
        if (available < transfer.quantity) {
          blockers.push(`Insufficient shares: account holds ${available.toString()}, needs ${transfer.quantity.toString()}`)
        }
      }
    }

    if (transfer.kind === TransferKind.TRANSFER || transfer.kind === TransferKind.ISSUANCE) {
      if (!transfer.toAccountId) blockers.push('Missing destination account')
    }

    if (transfer.missingEvidence.length > 0) {
      blockers.push(`${transfer.missingEvidence.length} evidence item(s) missing`)
    }
    for (const reason of transfer.blockingReasons) {
      blockers.push(reason)
    }

    return blockers
  }

  /**
   * Issues a human-friendly reference like `TR-2026-000123` unique per
   * issuer. Uses a count-based numbering scheme for MVP; a stricter
   * sequence can replace this later without changing the public surface.
   */
  private async allocateReference(issuerId: string): Promise<string> {
    const year = new Date().getUTCFullYear()
    const count = await this.prisma.transferRequest.count({ where: { issuerId } })
    const next = (count + 1).toString().padStart(6, '0')
    return `TR-${year}-${next}`
  }

  // ==================================================================
  // Case-level workflow (built on top of the base state machine).
  //
  // These methods encode the branching flowchart: intake → automated
  // review → manual review / exception branches → settlement. Each one
  // updates the `canonicalData` envelope inside a transaction, emits an
  // audit event, and keeps the derived Prisma state / lifecycle stage
  // in sync so queue views stay correct.
  // ==================================================================

  /**
   * Run intake on a draft/submitted case. Classifies transfer type,
   * generates the per-type document checklist, records extracted fields,
   * and either:
   *   • moves the case into `awaiting_documents` (if items are missing), or
   *   • leaves it ready for `runAutomatedReview`.
   *
   * Safe to call multiple times — the checklist is recomputed from the
   * latest input, and submitted-doc state is preserved where possible.
   */
  async runIntake(id: string, input: IntakeTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      if (current.state === TransferState.SETTLED || current.state === TransferState.REJECTED) {
        throw new ConflictException('Cannot re-run intake on a terminal case')
      }

      const env = readEnvelope(current)
      const caseType = (input.caseType ?? env.caseType ?? 'standard_individual') as CaseType

      const baseReqs = buildRequirements({
        caseType,
        destinationKind:
          (input.destinationKind as 'individual' | 'joint' | 'trust' | 'entity' | 'broker' | 'certificate' | undefined) ?? undefined,
        estimatedValueUsd: input.estimatedValueUsd,
        needsInheritanceWaiver: input.needsInheritanceWaiver,
        quantity: Number(current.quantity),
      })
      const reconciled = reconcileRequirements(
        mergeRequirements(env.requirements, baseReqs),
        input.submittedDocumentCodes ?? current.evidenceSubmitted,
      )
      const missingCodes = missingRequirementCodes(reconciled)

      const nextEnvelope: WorkflowCaseEnvelope = {
        ...env,
        autoRouted: false,
        caseType,
        extracted: mergeExtracted(env.extracted, input.extractedFields),
        intakeAt: new Date().toISOString(),
        intakeSource: input.intakeSource ?? env.intakeSource ?? 'portal',
        narratives: {
          ...env.narratives,
          summary: summarizeCase(caseType, reconciled, env.branch),
        },
        phase: missingCodes.length > 0 ? 'awaiting_documents' : 'ready_for_review',
        phaseEnteredAt: new Date().toISOString(),
        requirements: reconciled,
        settlementPlan: env.settlementPlan,
        version: CURRENT_CASE_VERSION,
      }
      nextEnvelope.branch = resolveBranch(nextEnvelope)

      // Use the state machine to flip UNDER_REVIEW when the checklist is
      // already satisfied. Otherwise stay SUBMITTED/NEEDS_INFO.
      const nextState =
        missingCodes.length > 0
          ? current.state === TransferState.DRAFT
            ? TransferState.SUBMITTED
            : TransferState.NEEDS_INFO
          : current.state === TransferState.DRAFT
            ? TransferState.SUBMITTED
            : current.state

      const data: Prisma.TransferRequestUpdateInput = {
        canonicalData: writeEnvelope(nextEnvelope),
        evidenceRequired: reconciled.map(r => r.code),
        evidenceSubmitted: dedupe([...current.evidenceSubmitted, ...(input.submittedDocumentCodes ?? [])]),
        missingEvidence: missingCodes,
      }
      if (nextState !== current.state) {
        assertTransferTransitionOrThrow(current.state, nextState)
        data.state = nextState
        data.lifecycleStage = lifecycleStageFor(nextState)
        if (nextState === TransferState.SUBMITTED && !current.submittedAt) {
          data.submittedAt = new Date()
        }
      }

      const next = await tx.transferRequest.update({ where: { id }, data })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_INTAKE_COMPLETED, 'INFO', {
        branch: nextEnvelope.branch,
        caseType,
        missingCount: missingCodes.length,
        phase: nextEnvelope.phase,
      })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_CASE_CLASSIFIED, 'INFO', {
        caseType,
        requirements: reconciled.map(r => r.code),
      })
      if (missingCodes.length) {
        await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_DOCUMENTS_REQUESTED, 'MEDIUM', {
          missing: missingCodes,
        })
      }
      return next
    })

    if (updated.missingEvidence.length) {
      await this.signals
        .flagTransferBlocked(
          {
            issuerId: updated.issuerId,
            priority: 'MEDIUM',
            reasons: updated.missingEvidence.map(c => `missing_document:${c}`),
            reference: updated.reference,
            severity: 'WARN',
            transferId: updated.id,
          },
          actor,
        )
        .catch(() => undefined)
    }

    return mapSummary(updated)
  }

  /**
   * Record document uploads against the case checklist. Accepts a mix of
   * `submitted` (new uploads to mark received), `accepted` (reviewer
   * sign-off), and `rejected` (needs re-upload). Automatically flips the
   * case back out of `awaiting_documents` once nothing is left missing.
   */
  async submitDocuments(id: string, input: SubmitDocumentsDto, actor: ActorContext): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)

      const env = readEnvelope(current)
      const reconciled = reconcileRequirements(env.requirements, input.submitted, input.rejected, input.accepted)
      const missingCodes = missingRequirementCodes(reconciled)

      const nextEnvelope: WorkflowCaseEnvelope = {
        ...env,
        phase: missingCodes.length ? 'awaiting_documents' : 'ready_for_review',
        phaseEnteredAt: new Date().toISOString(),
        requirements: reconciled,
      }
      nextEnvelope.branch = resolveBranch(nextEnvelope)

      let data: Prisma.TransferRequestUpdateInput = {
        canonicalData: writeEnvelope(nextEnvelope),
        evidenceRequired: reconciled.map(r => r.code),
        evidenceSubmitted: dedupe([...(current.evidenceSubmitted ?? []), ...input.submitted]),
        missingEvidence: missingCodes,
      }

      // If the case was stuck in NEEDS_INFO and everything has now been
      // provided, flip it back to UNDER_REVIEW automatically.
      if (current.state === TransferState.NEEDS_INFO && missingCodes.length === 0) {
        assertTransferTransitionOrThrow(current.state, TransferState.UNDER_REVIEW)
        data = {
          ...data,
          lifecycleStage: lifecycleStageFor(TransferState.UNDER_REVIEW),
          reviews: {
            create: {
              action: TransferReviewAction.COMMENT,
              notes: input.notes ?? 'Supplemental documents received',
              reviewerId: resolveReviewerId(actor),
            },
          },
          state: TransferState.UNDER_REVIEW,
        }
      }

      const next = await tx.transferRequest.update({ where: { id }, data })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_DOCUMENTS_RECEIVED, 'INFO', {
        accepted: input.accepted ?? [],
        rejected: input.rejected ?? [],
        stillMissing: missingCodes,
        submitted: input.submitted,
      })
      return next
    })

    if (!updated.missingEvidence.length) {
      await this.signals.clearForEntity('TRANSFER_REQUEST', updated.id, 'all documents received', actor).catch(() => undefined)
    }
    return mapSummary(updated)
  }

  /**
   * Run the deterministic rule suite on the case. Produces structured
   * rule outcomes, routes the case into either automated-pass or
   * manual-review, and raises the corresponding branch (stop order,
   * adverse claim, …) when a matching rule fails.
   */
  async runAutomatedReview(id: string, input: RunAutomatedReviewDto, actor: ActorContext): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      if (current.state !== TransferState.SUBMITTED && current.state !== TransferState.UNDER_REVIEW) {
        throw new ConflictException(`Automated review requires the case to be SUBMITTED or UNDER_REVIEW (was ${current.state})`)
      }

      const env = readEnvelope(current)

      // Look up holdings for the source account to score sufficiency.
      const sourceHolding = current.fromAccountId
        ? ((
            await tx.holding.findUnique({
              where: {
                shareholderAccountId_securityId_shareClassId: {
                  securityId: current.securityId,
                  shareClassId: current.shareClassId,
                  shareholderAccountId: current.fromAccountId,
                },
              },
            })
          )?.quantity ?? null)
        : null

      const ruleInput: RuleInput = {
        caseType: env.caseType,
        extracted: env.extracted,
        flags: env.flags,
        registeredAccountOwner: input.registeredAccountOwner,
        registeredHolderName: input.registeredHolderName,
        requirements: env.requirements,
        sourceHolding: sourceHolding ?? undefined,
        transfer: {
          fromAccountId: current.fromAccountId,
          id: current.id,
          issuerId: current.issuerId,
          kind: current.kind,
          missingEvidence: current.missingEvidence,
          quantity: current.quantity,
          securityId: current.securityId,
          shareClassId: current.shareClassId,
          toAccountId: current.toAccountId,
        },
      }
      const verdict = runRules(ruleInput)

      const nextEnvelope: WorkflowCaseEnvelope = {
        ...env,
        autoRouted: verdict.autoPassCandidate,
        completeness: verdict.completeness,
        confidence: verdict.overallConfidence,
        narratives: {
          ...env.narratives,
          nextAction: verdict.autoPassCandidate
            ? 'Ready for dual-control approval.'
            : verdict.blockingFailures.length
              ? `Resolve blockers: ${verdict.blockingFailures.map(b => b.reason ?? b.code).join(', ')}.`
              : 'Assign a reviewer to perform manual checks.',
          summary: summarizeVerdict(env.caseType, verdict.autoPassCandidate, verdict.blockingFailures.length),
        },
        phase: verdict.autoPassCandidate ? 'automated_review_passed' : 'manual_review_required',
        phaseEnteredAt: new Date().toISOString(),
        rules: verdict.results,
      }
      nextEnvelope.branch = verdict.suggestedBranch ?? resolveBranch(nextEnvelope)

      const blockingReasons = verdict.blockingFailures.map(r => r.reason ?? r.code).filter((v): v is string => Boolean(v))

      const targetState = current.state === TransferState.SUBMITTED ? TransferState.UNDER_REVIEW : current.state

      const data: Prisma.TransferRequestUpdateInput = {
        aiConfidence: new Prisma.Decimal(verdict.overallConfidence.toFixed(4)),
        aiSummary: nextEnvelope.narratives.summary ?? null,
        blockingReasons,
        canonicalData: writeEnvelope(nextEnvelope),
      }
      if (targetState !== current.state) {
        assertTransferTransitionOrThrow(current.state, targetState)
        data.state = targetState
        data.lifecycleStage = lifecycleStageFor(targetState)
      }

      const next = await tx.transferRequest.update({ where: { id }, data })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_AUTOMATED_REVIEW_RAN, 'INFO', {
        blockingFailures: blockingReasons,
        confidence: verdict.overallConfidence,
        routed: verdict.autoPassCandidate ? 'auto_pass' : 'manual_review',
      })
      if (verdict.autoPassCandidate) {
        await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_AUTOMATED_REVIEW_PASSED, 'INFO', {})
      } else {
        await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_ROUTED_TO_MANUAL_REVIEW, 'MEDIUM', {
          reasons: blockingReasons,
        })
      }
      return next
    })

    if (updated.blockingReasons.length) {
      await this.signals
        .flagTransferBlocked(
          {
            issuerId: updated.issuerId,
            priority: 'HIGH',
            reasons: updated.blockingReasons,
            reference: updated.reference,
            severity: 'WARN',
            transferId: updated.id,
          },
          actor,
        )
        .catch(() => undefined)
    }
    return mapSummary(updated)
  }

  // ---------- Exception branches ----------

  async raiseStopOrder(id: string, input: RaiseStopOrderDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(
      id,
      actor,
      AuditActions.TRANSFER_STOP_ORDER_RAISED,
      'HIGH',
      env => {
        env.flags.stopTransferOrder = {
          raisedAt: new Date().toISOString(),
          raisedBy: actor.actorId,
          reason: input.reason,
          referenceCode: input.referenceCode,
        }
        env.narratives.summary = `Stop transfer order raised — ${input.reason}`
        return env
      },
      {
        signal: async updated => {
          await this.signals
            .flagTransferBlocked(
              {
                issuerId: updated.issuerId,
                priority: 'CRITICAL',
                reasons: ['stop_transfer_order'],
                reference: updated.reference,
                severity: 'CRITICAL',
                transferId: updated.id,
              },
              actor,
            )
            .catch(() => undefined)
        },
      },
    )
  }

  async clearStopOrder(id: string, input: ClearStopOrderDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_STOP_ORDER_CLEARED, 'MEDIUM', env => {
      if (env.flags.stopTransferOrder) {
        env.flags.stopTransferOrder.resolvedAt = new Date().toISOString()
        env.flags.stopTransferOrder.resolvedBy = actor.actorId
      }
      env.narratives.summary = `Stop transfer order cleared — ${input.reason}`
      return env
    })
  }

  async raiseAdverseClaim(id: string, input: RaiseAdverseClaimDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_ADVERSE_CLAIM_RAISED, 'HIGH', env => {
      env.flags.adverseClaim = {
        claimantName: input.claimantName,
        raisedAt: new Date().toISOString(),
        raisedBy: actor.actorId,
        reason: input.reason,
      }
      env.narratives.summary = `Adverse claim raised — ${input.reason}`
      return env
    })
  }

  async clearAdverseClaim(id: string, input: ClearAdverseClaimDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_ADVERSE_CLAIM_CLEARED, 'MEDIUM', env => {
      if (env.flags.adverseClaim) {
        env.flags.adverseClaim.resolvedAt = new Date().toISOString()
        env.flags.adverseClaim.resolvedBy = actor.actorId
      }
      env.narratives.summary = `Adverse claim cleared — ${input.reason}`
      return env
    })
  }

  async raiseDeceasedFlag(id: string, input: RaiseDeceasedFlagDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_DECEASED_FLAG_RAISED, 'HIGH', env => {
      env.flags.deceasedOwner = {
        dateOfDeath: input.dateOfDeath,
        raisedAt: new Date().toISOString(),
        raisedBy: actor.actorId,
        reason: input.reason,
        waiverRequired: input.waiverRequired,
      }
      env.narratives.summary = 'Registered-owner deceased suspicion raised.'
      return env
    })
  }

  async clearDeceasedFlag(id: string, input: ClearDeceasedFlagDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_DECEASED_FLAG_CLEARED, 'MEDIUM', env => {
      if (env.flags.deceasedOwner) {
        env.flags.deceasedOwner.resolvedAt = new Date().toISOString()
        env.flags.deceasedOwner.resolvedBy = actor.actorId
      }
      env.narratives.summary = `Deceased-owner flag cleared — ${input.reason}`
      return env
    })
  }

  async raiseRestriction(id: string, input: RaiseRestrictionDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_RESTRICTION_RAISED, 'HIGH', env => {
      env.flags.restriction = {
        category: input.category,
        raisedAt: new Date().toISOString(),
        raisedBy: actor.actorId,
        reason: input.reason,
      }
      env.narratives.summary = `Restriction review: ${input.category} — ${input.reason}`
      return env
    })
  }

  async clearRestriction(id: string, input: ClearRestrictionDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_RESTRICTION_CLEARED, 'MEDIUM', env => {
      if (env.flags.restriction) {
        env.flags.restriction.resolvedAt = new Date().toISOString()
        env.flags.restriction.resolvedBy = actor.actorId
      }
      env.narratives.summary = `Restriction cleared — ${input.reason}`
      return env
    })
  }

  async requestLegalOpinion(id: string, input: RequestLegalOpinionDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_LEGAL_OPINION_REQUESTED, 'MEDIUM', env => {
      env.flags.legalOpinion = {
        provider: input.provider,
        requestedAt: new Date().toISOString(),
        requestedBy: actor.actorId,
      }
      return env
    })
  }

  async provideLegalOpinion(id: string, input: ProvideLegalOpinionDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_LEGAL_OPINION_PROVIDED, 'INFO', env => {
      env.flags.legalOpinion = {
        ...(env.flags.legalOpinion ?? { requestedAt: new Date().toISOString() }),
        opinionDocId: input.opinionDocId,
        providedAt: new Date().toISOString(),
        provider: input.provider ?? env.flags.legalOpinion?.provider,
      }
      return env
    })
  }

  async requestIssuerReview(id: string, input: RequestIssuerReviewDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_ISSUER_REVIEW_REQUESTED, 'MEDIUM', env => {
      env.flags.issuerReview = {
        reason: input.reason,
        requestedAt: new Date().toISOString(),
        requestedBy: actor.actorId,
      }
      return env
    })
  }

  async respondIssuerReview(id: string, input: IssuerReviewResponseDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.applyFlagUpdate(id, actor, AuditActions.TRANSFER_ISSUER_REVIEW_RESPONDED, 'INFO', env => {
      env.flags.issuerReview = {
        ...(env.flags.issuerReview ?? { requestedAt: new Date().toISOString() }),
        decision: input.decision,
        reason: input.reason,
        respondedAt: new Date().toISOString(),
      }
      return env
    })
  }

  // ---------- Settlement orchestration ----------

  /**
   * Settlement *launcher* — extends the base `approve` flow to also seed
   * a concrete settlement plan (the series of sub-steps operators tick
   * through post-approval). Called by the admin when moving from
   * APPROVED to the hands-on settlement phase.
   */
  async scheduleSettlement(id: string, actor: ActorContext): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      if (current.state !== TransferState.APPROVED) {
        throw new ConflictException('Only APPROVED cases can schedule settlement')
      }
      const env = readEnvelope(current)

      const plan = env.settlementPlan.length
        ? env.settlementPlan
        : buildSettlementPlan({
            caseType: env.caseType,
            hasWithholding: env.flags.taxFollowUps?.some(t => t.withholdingCents && t.withholdingCents > 0),
            kind: current.kind,
            needsFastUpdate: env.rules.some(r => r.code === 'fast_reconciliation_required' && r.outcome !== 'skip'),
            needsTaxDocs: env.caseType === 'standard_individual' || env.caseType === 'restricted_shares',
          })

      const nextEnvelope: WorkflowCaseEnvelope = {
        ...env,
        flags: {
          ...env.flags,
          taxFollowUps: env.flags.taxFollowUps?.length ? env.flags.taxFollowUps : initialTaxFollowUps(env.caseType),
        },
        phase: 'ready_for_settlement',
        phaseEnteredAt: new Date().toISOString(),
        settlementPlan: plan,
      }

      const next = await tx.transferRequest.update({
        where: { id },
        data: { canonicalData: writeEnvelope(nextEnvelope) },
      })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_SETTLEMENT_STARTED, 'INFO', {
        steps: plan.map(s => s.code),
      })
      return next
    })

    return mapSummary(updated)
  }

  async advanceSettlementStep(id: string, input: AdvanceSettlementStepDto, actor: ActorContext): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      const env = readEnvelope(current)
      if (!env.settlementPlan.find(s => s.code === input.step)) {
        throw new BadRequestException(`Step ${input.step} is not part of this settlement plan`)
      }

      const now = new Date().toISOString()
      const patch: Partial<SettlementStep> = {
        notes: input.notes,
        reference: input.reference,
        status: input.status,
      }
      if (input.status === 'in_progress') patch.startedAt = now
      if (input.status === 'completed') patch.completedAt = now

      const plan = advanceStep(env.settlementPlan, input.step, patch)
      const nextEnvelope: WorkflowCaseEnvelope = {
        ...env,
        phase: allStepsComplete(plan) ? 'approved' : 'ready_for_settlement',
        phaseEnteredAt: now,
        settlementPlan: plan,
      }

      const next = await tx.transferRequest.update({
        where: { id },
        data: { canonicalData: writeEnvelope(nextEnvelope) },
      })
      await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_SETTLEMENT_STEP_ADVANCED, 'INFO', {
        reference: input.reference,
        status: input.status,
        step: input.step,
      })
      if (input.step === 'generate_drs_statement' && input.status === 'completed') {
        await this.recordAudit(tx, actor, next, AuditActions.TRANSFER_DRS_STATEMENT_ISSUED, 'INFO', {
          reference: input.reference,
        })
      }
      return next
    })
    return mapSummary(updated)
  }

  /**
   * Explicit failure path — used when external deadlines expire (e.g.
   * supplemental documents never arrived within the configured window)
   * or when legal/compliance conditions can't be met.
   */
  async failCase(id: string, input: FailTransferDto, actor: ActorContext): Promise<TransferRequestSummary> {
    return this.transition({
      action: input.code === 'documents_timeout' ? AuditActions.TRANSFER_FAILED_TIMEOUT : AuditActions.TRANSFER_FAILED,
      actor,
      afterCommit: async next => {
        await this.signals
          .flagTransferRejected(
            {
              issuerId: next.issuerId,
              reason: input.reason,
              reference: next.reference,
              transferId: next.id,
            },
            actor,
          )
          .catch(() => undefined)
      },
      id,
      patch: current => {
        const env = readEnvelope(current)
        const nextEnv: WorkflowCaseEnvelope = {
          ...env,
          narratives: { ...env.narratives, failureReason: input.reason, summary: input.reason },
          phase: 'failed',
          phaseEnteredAt: new Date().toISOString(),
        }
        return {
          canonicalData: writeEnvelope(nextEnv),
          failureReason: input.reason,
        }
      },
      review: {
        action: TransferReviewAction.REJECT,
        reason: input.reason,
      },
      severity: 'HIGH',
      to: TransferState.REJECTED,
    })
  }

  // ---------- Shared flag-update helper ----------

  /**
   * Common pattern for all branch flag raise/clear operations: load,
   * mutate the envelope via callback, re-derive branch, persist, emit
   * audit. Keeps exception-branch handlers small and symmetric.
   */
  private async applyFlagUpdate(
    id: string,
    actor: ActorContext,
    action: string,
    severity: AuditSeverity,
    mutate: (env: WorkflowCaseEnvelope) => WorkflowCaseEnvelope,
    options: {
      signal?: (updated: TransferRequest) => Promise<void>
    } = {},
  ): Promise<TransferRequestSummary> {
    const updated = await this.prisma.$transaction(async tx => {
      const current = await tx.transferRequest.findUnique({ where: { id } })
      if (!current) throw new NotFoundException(`Transfer ${id} not found`)
      const env = readEnvelope(current)
      const nextEnvelope = mutate({ ...env, flags: { ...env.flags } })
      nextEnvelope.branch = resolveBranch(nextEnvelope)
      nextEnvelope.phaseEnteredAt = new Date().toISOString()

      // Raising a branch flag automatically moves the case into manual
      // review so it shows up in the ops queue; clearing a flag
      // returns routing to whatever the rules engine previously said.
      let targetState = current.state
      if (nextEnvelope.branch !== 'normal' && current.state === TransferState.SUBMITTED) {
        targetState = TransferState.UNDER_REVIEW
      }

      const data: Prisma.TransferRequestUpdateInput = {
        canonicalData: writeEnvelope(nextEnvelope),
      }
      if (targetState !== current.state) {
        assertTransferTransitionOrThrow(current.state, targetState)
        data.state = targetState
        data.lifecycleStage = lifecycleStageFor(targetState)
      }

      const next = await tx.transferRequest.update({ where: { id }, data })
      await this.recordAudit(tx, actor, next, action, severity, {
        branch: nextEnvelope.branch,
      })
      return next
    })

    await options.signal?.(updated)
    return mapSummary(updated)
  }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function assertTransferTransitionOrThrow(from: TransferState, to: TransferState): void {
  try {
    assertTransferTransition(from, to)
  } catch (error) {
    throw new ConflictException(error instanceof Error ? error.message : String(error))
  }
}

function resolveReviewerId(actor: ActorContext): string {
  return actor.actorId || 'system'
}

function computeMissingEvidence(required?: string[], submitted?: string[]): string[] {
  const req = new Set(required ?? [])
  for (const item of submitted ?? []) req.delete(item)
  return [...req]
}

function mergeEvidence(existing: string[], next?: string[]): string[] {
  if (!next || next.length === 0) return existing
  return dedupe([...existing, ...next])
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

type LedgerLeg = {
  accountId: string
  entryType: LedgerEntryType
  sign: 'POS' | 'NEG'
}

function resolveLedgerLegs(transfer: TransferRequest): LedgerLeg[] {
  switch (transfer.kind) {
    case TransferKind.TRANSFER:
      if (!transfer.fromAccountId || !transfer.toAccountId) {
        throw new BadRequestException('Transfer is missing account references')
      }
      return [
        { accountId: transfer.fromAccountId, entryType: LedgerEntryType.TRANSFER_OUT, sign: 'NEG' },
        { accountId: transfer.toAccountId, entryType: LedgerEntryType.TRANSFER_IN, sign: 'POS' },
      ]
    case TransferKind.ISSUANCE:
      if (!transfer.toAccountId) throw new BadRequestException('Issuance is missing toAccountId')
      return [{ accountId: transfer.toAccountId, entryType: LedgerEntryType.ISSUE, sign: 'POS' }]
    case TransferKind.CANCELLATION:
      if (!transfer.fromAccountId) throw new BadRequestException('Cancellation is missing fromAccountId')
      return [{ accountId: transfer.fromAccountId, entryType: LedgerEntryType.CANCEL, sign: 'NEG' }]
    case TransferKind.ADJUSTMENT:
      if (!transfer.fromAccountId) throw new BadRequestException('Adjustment is missing account')
      return [
        {
          accountId: transfer.fromAccountId,
          entryType: LedgerEntryType.ADJUSTMENT_INCREASE,
          sign: 'POS',
        },
      ]
    default:
      throw new BadRequestException(`Unsupported transfer kind: ${transfer.kind}`)
  }
}

async function upsertHolding(
  tx: Tx,
  params: { accountId: string; securityId: string; shareClassId: string; quantityDelta: bigint },
): Promise<void> {
  await tx.holding.upsert({
    where: {
      shareholderAccountId_securityId_shareClassId: {
        shareholderAccountId: params.accountId,
        securityId: params.securityId,
        shareClassId: params.shareClassId,
      },
    },
    update: { quantity: { increment: params.quantityDelta } },
    create: {
      shareholderAccountId: params.accountId,
      securityId: params.securityId,
      shareClassId: params.shareClassId,
      quantity: params.quantityDelta,
    },
  })
}

function mapSummary(row: TransferRequest): TransferRequestSummary {
  const env = readEnvelope(row)
  const phase = derivePhase(row.state, env)
  return {
    id: row.id,
    reference: row.reference,
    issuerId: row.issuerId,
    securityId: row.securityId,
    shareClassId: row.shareClassId,
    fromAccountId: row.fromAccountId ?? undefined,
    toAccountId: row.toAccountId ?? undefined,
    quantity: Number(row.quantity),
    kind: row.kind,
    intakeMethod: row.intakeMethod,
    state: row.state,
    lifecycleStage: row.lifecycleStage,
    priority: row.priority,
    submittedById: row.submittedById ?? undefined,
    assignedReviewerId: row.assignedReviewerId ?? undefined,
    aiConfidence: row.aiConfidence ? Number(row.aiConfidence) : undefined,
    aiSummary: row.aiSummary ?? undefined,
    evidenceRequired: row.evidenceRequired,
    evidenceSubmitted: row.evidenceSubmitted,
    missingEvidence: row.missingEvidence,
    blockingReasons: row.blockingReasons,
    failureReason: row.failureReason ?? undefined,
    submittedAt: row.submittedAt ?? undefined,
    settledAt: row.settledAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    branch: env.branch,
    caseType: env.caseType,
    phase,
    phaseLabel: PHASE_LABEL[phase],
  }
}

function mapReview(row: TransferReviewRow): TransferReviewEntry {
  return {
    id: row.id,
    action: row.action,
    reviewerId: row.reviewerId,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  }
}

/**
 * Merge a freshly-computed requirement list with the pre-existing one,
 * preserving submitted/accepted/rejected states for codes that still
 * apply. Codes no longer required (e.g. case type changed) are dropped.
 */
function mergeRequirements(prior: readonly DocRequirement[], next: readonly DocRequirement[]): DocRequirement[] {
  const byCode = new Map(prior.map(r => [r.code, r] as const))
  return next.map(n => {
    const existing = byCode.get(n.code)
    if (!existing) return n
    return { ...n, state: existing.state, waiverReason: existing.waiverReason, reason: existing.reason }
  })
}

function mergeExtracted(prior: WorkflowCaseEnvelope['extracted'], incoming?: Record<string, unknown>): WorkflowCaseEnvelope['extracted'] {
  if (!incoming) return prior
  return { ...prior, ...(incoming as Partial<WorkflowCaseEnvelope['extracted']>) }
}

function summarizeCase(caseType: CaseType, reqs: readonly DocRequirement[], branch: string): string {
  const missing = reqs.filter(r => r.state === 'required').length
  const label = CASE_TYPE_LABEL[caseType] ?? caseType
  if (missing > 0) {
    return `${label} case intake — ${missing} document${missing === 1 ? '' : 's'} outstanding${branch !== 'normal' ? ` (${branch.replace(/_/g, ' ')})` : ''}.`
  }
  return `${label} case ready for automated review${branch !== 'normal' ? ` (${branch.replace(/_/g, ' ')})` : ''}.`
}

function summarizeVerdict(caseType: CaseType, autoPass: boolean, blockers: number): string {
  const label = CASE_TYPE_LABEL[caseType] ?? caseType
  if (autoPass) return `${label} case cleared automated checks — ready for dual-control approval.`
  if (blockers > 0) return `${label} case routed to manual review: ${blockers} blocker${blockers === 1 ? '' : 's'}.`
  return `${label} case routed to manual review for reviewer confirmation.`
}

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  adjustment: 'Adjustment',
  cancellation: 'Cancellation',
  estate: 'Estate',
  fiduciary: 'Fiduciary',
  gift: 'Gift',
  issuance: 'Issuance',
  restricted_shares: 'Restricted shares',
  special_situation: 'Special situation',
  standard_individual: 'Standard individual',
}

function buildTimeline(
  reviews: TransferReviewEntry[],
  audits: Array<{
    action: string
    actorId: string
    actorRole?: string
    id: number
    metadata: Record<string, unknown>
    occurredAt: Date
  }>,
): TransferTimelineEntry[] {
  const timeline: TransferTimelineEntry[] = [
    ...reviews.map<TransferTimelineEntry>(r => ({
      id: `review:${r.id}`,
      kind: 'REVIEW',
      at: r.createdAt,
      actorId: r.reviewerId,
      action: r.action,
      message: r.notes ?? r.reason,
    })),
    ...audits.map<TransferTimelineEntry>(a => ({
      id: `audit:${a.id}`,
      kind: 'AUDIT',
      at: a.occurredAt,
      actorId: a.actorId,
      actorRole: a.actorRole,
      action: a.action,
      metadata: a.metadata,
    })),
  ]
  return timeline.sort((a, b) => a.at.getTime() - b.at.getTime())
}
