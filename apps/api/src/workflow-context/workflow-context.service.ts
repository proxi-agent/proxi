import { Injectable, NotFoundException } from '@nestjs/common'
import type { TransferRequest } from '@prisma/client'

import { AuditService } from '../audit/audit.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TasksService } from '../tasks/tasks.service.js'

import type { WorkflowContextBundle, WorkflowFact } from './workflow-context.types.js'

/**
 * Assembles a stable, machine-readable "case context" bundle for a
 * single workflow instance.
 *
 * These bundles are the raw material for:
 *   • admin-side copilots ("summarize this transfer")
 *   • shareholder-facing explanations ("here's why your transfer is
 *     waiting")
 *   • exports / audit artifacts
 *
 * The service is deliberately thin: no LLM calls, no copy-generation.
 * The only responsibility is to gather structured records and normalize
 * them into a uniform `WorkflowContextBundle` shape.
 */
@Injectable()
export class WorkflowContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
  ) {}

  /** Bundle for a single transfer request. */
  async forTransfer(id: string): Promise<WorkflowContextBundle> {
    const transfer = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: {
        security: { select: { id: true, ticker: true, name: true } },
        shareClass: { select: { id: true, code: true, name: true } },
        fromAccount: {
          select: { id: true, accountNumber: true, shareholder: { select: { id: true, legalName: true } } },
        },
        toAccount: {
          select: { id: true, accountNumber: true, shareholder: { select: { id: true, legalName: true } } },
        },
      },
    })
    if (!transfer) throw new NotFoundException(`Transfer ${id} not found`)

    const [timeline, tasks] = await Promise.all([
      this.audit.timeline('TRANSFER_REQUEST', id, { limit: 200 }),
      this.tasks.listForEntity('TRANSFER_REQUEST', id),
    ])

    const facts: WorkflowFact[] = [
      { format: 'identifier', label: 'Reference', value: transfer.reference },
      { format: 'enum', label: 'State', value: transfer.state },
      { format: 'enum', label: 'Stage', value: transfer.lifecycleStage },
      { format: 'enum', label: 'Kind', value: transfer.kind },
      { format: 'enum', label: 'Priority', value: transfer.priority },
      { format: 'shares', label: 'Quantity', value: Number(transfer.quantity) },
      { format: 'text', label: 'Security', value: transfer.security?.ticker ?? transfer.securityId },
      { format: 'text', label: 'Share class', value: transfer.shareClass?.code ?? transfer.shareClassId },
      {
        format: 'identifier',
        label: 'From',
        value: transfer.fromAccount?.accountNumber ?? null,
      },
      {
        format: 'identifier',
        label: 'To',
        value: transfer.toAccount?.accountNumber ?? null,
      },
      { format: 'date', label: 'Submitted', value: transfer.submittedAt?.toISOString() ?? null },
      { format: 'date', label: 'Settled', value: transfer.settledAt?.toISOString() ?? null },
    ]

    if (transfer.missingEvidence?.length) {
      facts.push({ format: 'text', label: 'Missing evidence', value: transfer.missingEvidence.join(', ') })
    }
    if (transfer.blockingReasons?.length) {
      facts.push({ format: 'text', label: 'Blocking reasons', value: transfer.blockingReasons.join(', ') })
    }
    if (transfer.failureReason) {
      facts.push({ format: 'text', label: 'Failure reason', value: transfer.failureReason })
    }

    return {
      entity: serializeTransfer(transfer),
      facts,
      id: transfer.id,
      issuerId: transfer.issuerId,
      kind: 'TRANSFER',
      reference: transfer.reference,
      related: {
        fromHolder: transfer.fromAccount?.shareholder?.legalName,
        toHolder: transfer.toAccount?.shareholder?.legalName,
        security: transfer.security?.name,
      },
      status: transfer.state,
      summary: summarizeTransfer(transfer),
      tasks,
      timeline,
    }
  }

  /** Bundle for a dividend event. Uses the legacy `dividend_events` row. */
  async forDividend(id: string): Promise<WorkflowContextBundle> {
    const dividend = await this.prisma.$queryRaw<
      Array<{
        id: string
        issuer_id: string
        security_id: string
        share_class_id: string | null
        status: string
        rate_per_share_cents: number
        currency: string
        declaration_date: Date | string
        record_date: Date | string
        payment_date: Date | string
        total_distribution_cents: string
        description: string | null
      }>
    >`SELECT id, issuer_id, security_id, share_class_id, status, rate_per_share_cents, currency,
             declaration_date, record_date, payment_date, total_distribution_cents, description
      FROM dividend_events WHERE id = ${id} LIMIT 1`
    if (!dividend.length) throw new NotFoundException(`Dividend ${id} not found`)
    const event = dividend[0]!

    const [tallyRows, timeline, tasks] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: string; count: string; amount: string | null }>>`
        SELECT status, COUNT(*)::text AS count, COALESCE(SUM(amount_cents), 0)::text AS amount
        FROM dividend_entitlements WHERE dividend_event_id = ${id}
        GROUP BY status
      `,
      this.audit.timeline('DIVIDEND_EVENT', id, { limit: 200 }),
      this.tasks.listForEntity('DIVIDEND_EVENT', id),
    ])

    const byStatus = tallyRows.reduce<Record<string, { count: number; amount: number }>>((acc, row) => {
      acc[row.status] = { amount: Number(row.amount || 0), count: Number(row.count || 0) }
      return acc
    }, {})

    const facts: WorkflowFact[] = [
      { format: 'enum', label: 'Status', value: event.status },
      { format: 'money', label: 'Rate per share (¢)', value: Number(event.rate_per_share_cents) },
      { format: 'enum', label: 'Currency', value: event.currency },
      { format: 'date', label: 'Declaration', value: asIso(event.declaration_date) },
      { format: 'date', label: 'Record date', value: asIso(event.record_date) },
      { format: 'date', label: 'Payment date', value: asIso(event.payment_date) },
      { format: 'money', label: 'Total distribution (¢)', value: Number(event.total_distribution_cents) },
      { format: 'shares', label: 'Paid', value: byStatus.PAID?.count ?? 0 },
      { format: 'shares', label: 'Pending', value: byStatus.PENDING?.count ?? 0 },
      { format: 'shares', label: 'Failed', value: byStatus.FAILED?.count ?? 0 },
    ]

    return {
      entity: {
        currency: event.currency,
        declarationDate: asIso(event.declaration_date),
        description: event.description,
        id: event.id,
        issuerId: event.issuer_id,
        paymentDate: asIso(event.payment_date),
        ratePerShareCents: Number(event.rate_per_share_cents),
        recordDate: asIso(event.record_date),
        securityId: event.security_id,
        shareClassId: event.share_class_id,
        status: event.status,
        totalDistributionCents: Number(event.total_distribution_cents),
      },
      facts,
      id: event.id,
      issuerId: event.issuer_id,
      kind: 'DIVIDEND',
      status: event.status,
      summary: summarizeDividend(event, byStatus),
      tasks,
      timeline,
    }
  }

  /** Bundle for a meeting. */
  async forMeeting(id: string): Promise<WorkflowContextBundle> {
    const meeting = await this.prisma.$queryRaw<
      Array<{
        id: string
        issuer_id: string
        kind: string
        title: string
        status: string
        scheduled_at: Date
        record_date: Date | string
        quorum_pct: string
      }>
    >`SELECT id, issuer_id, kind, title, status, scheduled_at, record_date, quorum_pct
      FROM meetings WHERE id = ${id} LIMIT 1`
    if (!meeting.length) throw new NotFoundException(`Meeting ${id} not found`)
    const row = meeting[0]!

    const [ballotStats, timeline, tasks] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: string; submitted: string; eligible: string }>>`
        SELECT COUNT(*)::text AS total,
               SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END)::text AS submitted,
               COALESCE(SUM(shares_eligible), 0)::text AS eligible
        FROM ballots WHERE meeting_id = ${id}
      `,
      this.audit.timeline('MEETING', id, { limit: 200 }),
      this.tasks.listForEntity('MEETING', id),
    ])
    const stats = ballotStats[0] ?? { eligible: '0', submitted: '0', total: '0' }
    const submittedPct = stats.total !== '0'
      ? (Number(stats.submitted) / Number(stats.total)) * 100
      : 0

    const facts: WorkflowFact[] = [
      { format: 'text', label: 'Title', value: row.title },
      { format: 'enum', label: 'Kind', value: row.kind },
      { format: 'enum', label: 'Status', value: row.status },
      { format: 'date', label: 'Scheduled', value: new Date(row.scheduled_at).toISOString() },
      { format: 'date', label: 'Record date', value: asIso(row.record_date) },
      { format: 'percent', label: 'Quorum target', value: Number(row.quorum_pct) },
      { format: 'percent', label: 'Turnout', value: round1(submittedPct) },
      { format: 'shares', label: 'Ballots issued', value: Number(stats.total) },
      { format: 'shares', label: 'Ballots submitted', value: Number(stats.submitted) },
    ]

    return {
      entity: {
        id: row.id,
        issuerId: row.issuer_id,
        kind: row.kind,
        quorumPct: Number(row.quorum_pct),
        recordDate: asIso(row.record_date),
        scheduledAt: new Date(row.scheduled_at).toISOString(),
        status: row.status,
        title: row.title,
      },
      facts,
      id: row.id,
      issuerId: row.issuer_id,
      kind: 'MEETING',
      reference: row.title,
      status: row.status,
      summary: `Meeting "${row.title}" is ${row.status.toLowerCase()}. Turnout ${round1(submittedPct)}% against quorum ${row.quorum_pct}%.`,
      tasks,
      timeline,
    }
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function serializeTransfer(
  transfer: TransferRequest & {
    security?: { id: string; ticker: string | null; name: string } | null
    shareClass?: { id: string; code: string; name: string } | null
    fromAccount?: { id: string; accountNumber: string } | null
    toAccount?: { id: string; accountNumber: string } | null
  },
): Record<string, unknown> {
  return {
    createdAt: transfer.createdAt.toISOString(),
    fromAccount: transfer.fromAccount
      ? { accountNumber: transfer.fromAccount.accountNumber, id: transfer.fromAccount.id }
      : null,
    id: transfer.id,
    intakeMethod: transfer.intakeMethod,
    issuerId: transfer.issuerId,
    kind: transfer.kind,
    lifecycleStage: transfer.lifecycleStage,
    priority: transfer.priority,
    quantity: Number(transfer.quantity),
    reference: transfer.reference,
    security: transfer.security,
    settledAt: transfer.settledAt?.toISOString() ?? null,
    shareClass: transfer.shareClass,
    state: transfer.state,
    submittedAt: transfer.submittedAt?.toISOString() ?? null,
    toAccount: transfer.toAccount
      ? { accountNumber: transfer.toAccount.accountNumber, id: transfer.toAccount.id }
      : null,
    updatedAt: transfer.updatedAt.toISOString(),
  }
}

function summarizeTransfer(transfer: TransferRequest): string {
  const headline = `Transfer ${transfer.reference} for ${transfer.quantity.toString()} shares`
  switch (transfer.state) {
    case 'DRAFT':
      return `${headline} is in draft and not yet submitted.`
    case 'SUBMITTED':
      return `${headline} is queued for review.`
    case 'UNDER_REVIEW':
      return `${headline} is under admin review.`
    case 'NEEDS_INFO':
      return `${headline} is waiting on the shareholder for additional information.`
    case 'APPROVED':
      return `${headline} is approved and awaiting settlement.`
    case 'REJECTED':
      return `${headline} was rejected${transfer.failureReason ? ` (${transfer.failureReason})` : ''}.`
    case 'SETTLED':
      return `${headline} has settled.`
    case 'CANCELLED':
      return `${headline} was cancelled.`
    default:
      return `${headline}.`
  }
}

function summarizeDividend(
  event: { status: string; currency: string; record_date: Date | string; payment_date: Date | string },
  byStatus: Record<string, { count: number; amount: number }>,
): string {
  const failed = byStatus.FAILED?.count ?? 0
  const paid = byStatus.PAID?.count ?? 0
  const pending = byStatus.PENDING?.count ?? 0
  const parts = [`Dividend is ${event.status.toLowerCase()}`]
  if (paid) parts.push(`${paid} paid`)
  if (pending) parts.push(`${pending} pending`)
  if (failed) parts.push(`${failed} failed`)
  parts.push(`pays ${asIso(event.payment_date)} (${event.currency}).`)
  return parts.join(', ')
}

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
