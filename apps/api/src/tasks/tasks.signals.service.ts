import { Injectable } from '@nestjs/common'

import type { ActorContext } from '../common/actor.js'
import type { Queryable } from '../database/database.service.js'

import { TasksService } from './tasks.service.js'
import type { Task, TaskPriority, TaskSeverity } from './tasks.types.js'

/**
 * Operational signals.
 *
 * This layer converts domain conditions (a transfer is blocked, a
 * dividend has failed payments, a meeting is undersubscribed) into
 * *operator-facing tasks*. By centralizing the wiring we ensure:
 *
 *   1. Signals are idempotent — repeated emits for the same root cause
 *      don't produce duplicate queue items. Dedup is handled by
 *      `TasksService.ensure()`.
 *   2. Recommended actions are authored once, not per call site.
 *   3. When a root cause is cleared the matching tasks auto-close via
 *      `TasksService.closeForEntity()`.
 *
 * Workflow services call these hooks; any future automation (cron jobs,
 * webhooks, AI triage) should prefer these over touching `TasksService`
 * directly.
 */
@Injectable()
export class TasksSignalsService {
  constructor(private readonly tasks: TasksService) {}

  /**
   * Transfer cannot be approved/settled because validation failed.
   * `reasons` is an ordered list of blocker keys (e.g.
   * `insufficient_holdings`, `missing_evidence:medallion_signature`).
   */
  async flagTransferBlocked(
    args: {
      issuerId: string
      transferId: string
      reference?: string
      reasons: string[]
      priority?: TaskPriority
      severity?: TaskSeverity
      assigneeId?: string
    },
    actor: ActorContext,
    client?: Queryable,
  ): Promise<Task> {
    return this.tasks.ensure(
      {
        assigneeId: args.assigneeId,
        description: [
          args.reference ? `Transfer ${args.reference} cannot proceed.` : 'Transfer cannot proceed.',
          `Blockers: ${args.reasons.join(', ')}.`,
        ].join(' '),
        issuerId: args.issuerId,
        metadata: {
          blockers: args.reasons,
          reference: args.reference,
        },
        priority: args.priority || 'HIGH',
        recommendedActions: [
          { action: 'transfer.review', label: 'Open transfer for review', url: `/admin/transfers/${args.transferId}` },
          { action: 'transfer.request-info', label: 'Request additional information' },
        ],
        relatedEntityId: args.transferId,
        relatedEntityType: 'TRANSFER_REQUEST',
        severity: args.severity || 'WARN',
        source: 'SYSTEM',
        title: args.reference ? `Transfer ${args.reference} blocked` : 'Transfer blocked pending review',
        type: 'TRANSFER_REVIEW',
      },
      actor,
      client,
    )
  }

  /** Transfer was rejected — escalation task for the investor-support lane. */
  async flagTransferRejected(
    args: {
      issuerId: string
      transferId: string
      reference?: string
      reason: string
      assigneeId?: string
    },
    actor: ActorContext,
    client?: Queryable,
  ): Promise<Task> {
    return this.tasks.ensure(
      {
        assigneeId: args.assigneeId,
        description: `${args.reference ? `Transfer ${args.reference}` : 'Transfer'} rejected: ${args.reason}.`,
        issuerId: args.issuerId,
        metadata: { reason: args.reason, reference: args.reference },
        priority: 'MEDIUM',
        recommendedActions: [
          { action: 'shareholder.notify', label: 'Notify shareholder', url: `/admin/transfers/${args.transferId}` },
          { action: 'transfer.review', label: 'Review rejection rationale' },
        ],
        relatedEntityId: args.transferId,
        relatedEntityType: 'TRANSFER_REQUEST',
        severity: 'WARN',
        source: 'SYSTEM',
        title: args.reference ? `Follow up on rejected transfer ${args.reference}` : 'Follow up on rejected transfer',
        type: 'TRANSFER_REVIEW',
      },
      actor,
      client,
    )
  }

  /**
   * One or more dividend entitlements have failed payment. `failedCount`
   * drives priority — any failure is at least HIGH.
   */
  async flagDividendFailures(
    args: {
      issuerId: string
      dividendEventId: string
      failedCount: number
      totalEntitlements: number
      currency?: string
      failedAmountCents?: number
      assigneeId?: string
    },
    actor: ActorContext,
    client?: Queryable,
  ): Promise<Task> {
    const priority: TaskPriority = args.failedCount >= 10 ? 'CRITICAL' : 'HIGH'
    return this.tasks.ensure(
      {
        assigneeId: args.assigneeId,
        description: [
          `${args.failedCount} of ${args.totalEntitlements} dividend payments failed.`,
          args.failedAmountCents != null ? `Affected amount ≈ ${formatCents(args.failedAmountCents, args.currency || 'USD')}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        issuerId: args.issuerId,
        metadata: {
          currency: args.currency,
          failedAmountCents: args.failedAmountCents,
          failedCount: args.failedCount,
          totalEntitlements: args.totalEntitlements,
        },
        priority,
        recommendedActions: [
          { action: 'dividend.retry-payments', label: 'Retry failed payments', url: `/admin/dividends/${args.dividendEventId}` },
          { action: 'dividend.export-failures', label: 'Export exceptions report' },
        ],
        relatedEntityId: args.dividendEventId,
        relatedEntityType: 'DIVIDEND_EVENT',
        severity: priority === 'CRITICAL' ? 'CRITICAL' : 'ERROR',
        source: 'RECONCILIATION',
        title: `Dividend payment exceptions (${args.failedCount})`,
        type: 'DIVIDEND_RECONCILIATION',
      },
      actor,
      client,
    )
  }

  /**
   * Meeting is open but turnout is tracking below quorum. Severity scales
   * with how close to close-time we are. `hoursUntilClose` lets us raise
   * priority as the meeting nears certification.
   */
  async flagMeetingLowTurnout(
    args: {
      issuerId: string
      meetingId: string
      title?: string
      turnoutPct: number
      quorumPct: number
      hoursUntilClose?: number
      assigneeId?: string
    },
    actor: ActorContext,
    client?: Queryable,
  ): Promise<Task> {
    const close = args.hoursUntilClose ?? 72
    const priority: TaskPriority = close <= 12 ? 'CRITICAL' : close <= 48 ? 'HIGH' : 'MEDIUM'
    const severity: TaskSeverity = close <= 12 ? 'CRITICAL' : 'WARN'
    return this.tasks.ensure(
      {
        assigneeId: args.assigneeId,
        description: `Turnout ${args.turnoutPct.toFixed(1)}% tracking below quorum threshold ${args.quorumPct.toFixed(1)}%.`,
        issuerId: args.issuerId,
        metadata: {
          hoursUntilClose: args.hoursUntilClose,
          quorumPct: args.quorumPct,
          turnoutPct: args.turnoutPct,
        },
        priority,
        recommendedActions: [
          { action: 'meeting.send-reminder', label: 'Send reminder to uncast holders', url: `/admin/meetings/${args.meetingId}` },
          { action: 'meeting.certification-prep', label: 'Prepare certification contingency' },
        ],
        relatedEntityId: args.meetingId,
        relatedEntityType: 'MEETING',
        severity,
        source: 'SYSTEM',
        title: args.title ? `Low turnout — ${args.title}` : 'Meeting tracking below quorum',
        type: 'MEETING_CERTIFICATION',
      },
      actor,
      client,
    )
  }

  /**
   * Ledger reconciliation detected a delta between expected and actual
   * holdings for a single security/account pair. These are usually worked
   * by the ledger ops team.
   */
  async flagLedgerBreak(
    args: {
      issuerId: string
      securityId: string
      accountId: string
      delta: number
      dedupKey: string
      assigneeId?: string
    },
    actor: ActorContext,
    client?: Queryable,
  ): Promise<Task> {
    const severity: TaskSeverity = Math.abs(args.delta) > 1000 ? 'CRITICAL' : 'ERROR'
    return this.tasks.ensure(
      {
        assigneeId: args.assigneeId,
        dedupKey: args.dedupKey,
        description: `Reconciliation delta of ${args.delta} shares on account ${args.accountId}.`,
        issuerId: args.issuerId,
        metadata: { accountId: args.accountId, delta: args.delta, securityId: args.securityId },
        priority: severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        recommendedActions: [{ action: 'ledger.investigate', label: 'Open ledger investigation' }],
        relatedEntityId: args.accountId,
        relatedEntityType: 'SHAREHOLDER_ACCOUNT',
        severity,
        source: 'RECONCILIATION',
        title: `Ledger break detected (${args.delta > 0 ? '+' : ''}${args.delta} shares)`,
        type: 'LEDGER_EXCEPTION',
      },
      actor,
      client,
    )
  }

  /**
   * Clear any open tasks tied to an entity once the underlying problem is
   * resolved. Safe to call whether tasks exist or not — returns the
   * number of tasks that were closed so call sites can log it.
   */
  async clearForEntity(entityType: string, entityId: string, reason: string, actor: ActorContext, client?: Queryable): Promise<number> {
    return this.tasks.closeForEntity(entityType, entityId, actor, { reason }, client)
  }
}

function formatCents(cents: number, currency: string): string {
  const major = (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  return `${currency} ${major}`
}
