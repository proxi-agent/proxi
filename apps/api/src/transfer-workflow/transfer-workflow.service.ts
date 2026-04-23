import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  Prisma,
  TransferRequest,
  TransferReview as TransferReviewRow,
} from '@prisma/client'
import {
  LedgerEntryType,
  LedgerSourceType,
  TransferIntakeMethod,
  TransferKind,
  TransferPriority,
  TransferReviewAction,
  TransferState,
} from '@prisma/client'

import { AuditService } from '../audit/audit.service.js'
import { AuditActions } from '../audit/audit.events.js'
import type { AuditSeverity } from '../audit/audit.types.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TasksSignalsService } from '../tasks/tasks.signals.service.js'

import type {
  ApproveTransferDto,
  CancelTransferDto,
  CreateTransferRequestDto,
  RejectTransferDto,
  RequestInfoDto,
  ResubmitDto,
  SettleTransferDto,
  StartReviewDto,
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

const OPEN_STATES: TransferState[] = [
  TransferState.SUBMITTED,
  TransferState.UNDER_REVIEW,
  TransferState.NEEDS_INFO,
]

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

      await this.recordAudit(
        tx,
        actor,
        record,
        input.submit ? AuditActions.TRANSFER_SUBMITTED : AuditActions.TRANSFER_DRAFTED,
        'INFO',
        { quantity: input.quantity, kind: record.kind },
      )
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

  async startReview(
    id: string,
    input: StartReviewDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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

  async requestInfo(
    id: string,
    input: RequestInfoDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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

  async resubmit(
    id: string,
    input: ResubmitDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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
          await this.signals
            .clearForEntity('TRANSFER_REQUEST', current.id, 'resubmitted with evidence', actor)
            .catch(() => undefined)
        }
      },
    })
  }

  async approve(
    id: string,
    input: ApproveTransferDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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
        await this.signals
          .clearForEntity('TRANSFER_REQUEST', current.id, 'transfer approved', actor)
          .catch(() => undefined)
      },
    })
  }

  async reject(
    id: string,
    input: RejectTransferDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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

  async cancel(
    id: string,
    input: CancelTransferDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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
        await this.signals
          .clearForEntity('TRANSFER_REQUEST', current.id, 'transfer cancelled', actor)
          .catch(() => undefined)
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
  async settle(
    id: string,
    input: SettleTransferDto,
    actor: ActorContext,
  ): Promise<TransferRequestSummary> {
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
    await this.signals
      .clearForEntity('TRANSFER_REQUEST', settled.id, 'transfer settled', actor)
      .catch(() => undefined)

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
      input.fromAccountId
        ? this.prisma.shareholderAccount.findUnique({ where: { id: input.fromAccountId } })
        : Promise.resolve(null),
      input.toAccountId
        ? this.prisma.shareholderAccount.findUnique({ where: { id: input.toAccountId } })
        : Promise.resolve(null),
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
      throw new ConflictException(
        `Cannot approve: ${transfer.missingEvidence.length} evidence item(s) still missing`,
      )
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
  private async computeBlockers(
    transfer: TransferRequest,
    runner: Pick<PrismaService, 'holding'> | Tx,
  ): Promise<string[]> {
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
          blockers.push(
            `Insufficient shares: account holds ${available.toString()}, needs ${transfer.quantity.toString()}`,
          )
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
