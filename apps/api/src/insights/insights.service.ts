import { Injectable, Logger, NotFoundException } from '@nestjs/common'

import { AuditService } from '../audit/audit.service.js'
import { CasesService } from '../cases/cases.service.js'
import { DatabaseService } from '../database/database.service.js'
import { DividendsService } from '../dividends/dividends.service.js'
import { IssuersService } from '../issuers/issuers.service.js'
import { LedgerService } from '../ledger/ledger.service.js'
import { ReportingService } from '../reporting/reporting.service.js'
import { ShareholdersService } from '../shareholders/shareholders.service.js'
import { TasksService } from '../tasks/tasks.service.js'
import { VotingService } from '../voting/voting.service.js'

import { buildActivitySearchInsight } from './builders/activity-search.js'
import type { AnomalyInputs } from './builders/anomaly.js'
import { buildAnomalyInsight } from './builders/anomaly.js'
import { buildDividendReadinessInsight } from './builders/dividend-insight.js'
import { buildIssuerInsight } from './builders/issuer-insight.js'
import { buildMeetingTurnoutInsight } from './builders/meeting-turnout.js'
import { buildOperationalCopilotInsight } from './builders/operational-copilot.js'
import { buildShareholderInsight } from './builders/shareholder-insight.js'
import { buildTaskFocusInsight } from './builders/task-focus.js'
import { buildTransferInsight } from './builders/transfer-insight.js'
import type { Insight } from './insights.types.js'
import { InsightsLlmService } from './llm.service.js'
import { PROMPTS } from './prompts.js'

const STALE_TRANSFER_HOURS = 72
const ACTIVITY_DEFAULT_LIMIT = 25

export interface TaskFocusOptions {
  issuerId?: string
  assigneeId?: string
  limit?: number
}

export interface ActivitySearchOptions {
  q: string
  issuerId?: string
  entityType?: string
  limit?: number
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name)

  constructor(
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly database: DatabaseService,
    private readonly dividendsService: DividendsService,
    private readonly issuersService: IssuersService,
    private readonly ledgerService: LedgerService,
    private readonly llm: InsightsLlmService,
    private readonly reportingService: ReportingService,
    private readonly shareholdersService: ShareholdersService,
    private readonly tasksService: TasksService,
    private readonly votingService: VotingService,
  ) {}

  llmEnabled(): boolean {
    return this.llm.isEnabled()
  }

  // ─── Transfers ───────────────────────────────────────────────────────────

  async transferInsight(caseId: number): Promise<Insight> {
    const caseData = await this.casesService.getCaseById(caseId)
    const insight = buildTransferInsight(caseData)
    return this.enrich(insight, 'transferSummary', {
      aiConfidence: caseData.aiConfidence,
      events: caseData.events.slice(-5).map(event => ({
        actor: event.actor,
        at: event.createdAt,
        type: event.eventType,
      })),
      lifecycleStage: caseData.lifecycleStage,
      missingEvidence: caseData.missingEvidence,
      restrictionBlockingReasons: caseData.restrictionBlockingReasons,
      status: caseData.status,
      type: caseData.type,
    })
  }

  // ─── Dividends ───────────────────────────────────────────────────────────

  async dividendReadinessInsight(dividendId: string): Promise<Insight> {
    const event = await this.dividendsService.getById(dividendId)
    const positions = await this.ledgerService.getPositionsAsOf(event.securityId, event.recordDate)
    const positiveHolders = positions.filter(position => position.quantity > 0)
    const eligibleHolderCount = positiveHolders.length
    const totalSharesAtRecordDate = positiveHolders.reduce((acc, position) => acc + position.quantity, 0)

    const holderIds = positiveHolders.map(position => position.holderId)
    const linkedAccountCount = holderIds.length
      ? Number(
          (
            await this.database.query<{ count: string }>(
              `SELECT COUNT(*)::text AS count
               FROM shareholder_accounts
               WHERE issuer_id = $1 AND account_number = ANY($2::text[])`,
              [event.issuerId, holderIds],
            )
          ).rows[0]?.count || '0',
        )
      : 0

    const entitlementRows = await this.database.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM dividend_entitlements WHERE dividend_event_id = $1 GROUP BY status`,
      [dividendId],
    )
    const entitlementCounts = { paid: 0, pending: 0, total: 0, voided: 0 }
    for (const row of entitlementRows.rows) {
      const count = Number(row.count)
      entitlementCounts.total += count
      if (row.status === 'PAID') entitlementCounts.paid = count
      if (row.status === 'PENDING') entitlementCounts.pending = count
      if (row.status === 'VOIDED') entitlementCounts.voided = count
    }

    const outstandingRow = await this.database.query<{ authorized: string }>(
      `SELECT authorized_shares::text AS authorized FROM securities WHERE id = $1`,
      [event.securityId],
    )
    const outstandingShares = Number(outstandingRow.rows[0]?.authorized || '0')

    const insight = buildDividendReadinessInsight({
      eligibleHolderCount,
      entitlementCounts,
      event,
      linkedAccountCount,
      outstandingShares,
      totalSharesAtRecordDate,
    })
    return this.enrich(insight, 'dividendReadiness', {
      eligibleHolderCount,
      entitlementCounts,
      event,
      linkedAccountCount,
      totalSharesAtRecordDate,
    })
  }

  // ─── Issuers ────────────────────────────────────────────────────────────

  async issuerInsight(issuerId: string): Promise<Insight> {
    const issuer = await this.issuersService.getById(issuerId)
    const summary = await this.reportingService.issuerSummary(issuerId)

    const [recentAudits, exceptionCases, overdueTasks, dividendCounts, openMeetings] = await Promise.all([
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_events
         WHERE issuer_id = $1 AND occurred_at > NOW() - INTERVAL '24 hours'`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM transfer_cases
         WHERE issuer_id = $1 AND lifecycle_stage = 'EXCEPTION'`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
         WHERE issuer_id = $1 AND status IN ('OPEN','IN_REVIEW','BLOCKED') AND due_at < NOW()`,
        [issuerId],
      ),
      this.database.query<{ draft: string; declared: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'DRAFT')::text AS draft,
           COUNT(*) FILTER (WHERE status IN ('DECLARED','SNAPSHOTTED'))::text AS declared
         FROM dividend_events WHERE issuer_id = $1`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings WHERE issuer_id = $1 AND status IN ('DRAFT','OPEN')`,
        [issuerId],
      ),
    ])

    const insight = buildIssuerInsight({
      declaredDividends: Number(dividendCounts.rows[0]?.declared || '0'),
      draftDividends: Number(dividendCounts.rows[0]?.draft || '0'),
      issuer,
      openExceptionCases: Number(exceptionCases.rows[0]?.count || '0'),
      openMeetings: Number(openMeetings.rows[0]?.count || '0'),
      overdueTasks: Number(overdueTasks.rows[0]?.count || '0'),
      recentAuditCount24h: Number(recentAudits.rows[0]?.count || '0'),
      summary,
    })
    return this.enrich(insight, 'issuerSummary', {
      counts: summary,
      issuer: { id: issuer.id, name: issuer.name, status: issuer.status },
    })
  }

  // ─── Shareholders ───────────────────────────────────────────────────────

  async shareholderInsight(shareholderId: string): Promise<Insight> {
    const shareholder = await this.shareholdersService.getById(shareholderId)
    const accounts = await this.shareholdersService.listAccounts(shareholderId)
    const accountNumbers = accounts.map(acct => acct.accountNumber)

    const holdings = accountNumbers.length
      ? await this.database.query<{ account_number: string; quantity: string; security_id: string }>(
          `SELECT h.holder_id AS account_number, h.quantity::text, h.security_id
           FROM v_holdings h
           WHERE h.holder_id = ANY($1::text[])`,
          [accountNumbers],
        )
      : { rows: [] as Array<{ account_number: string; quantity: string; security_id: string }> }

    const recentEvents = await this.auditService.list({
      entityId: shareholderId,
      entityType: 'SHAREHOLDER',
      page: 1,
      pageSize: 10,
      sortDir: 'desc',
    })

    const pendingTransfers = accountNumbers.length
      ? await this.database.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM transfer_cases
           WHERE status = 'PENDING' AND (from_holder_id = ANY($1::text[]) OR to_holder_id = ANY($1::text[]) OR holder_id = ANY($1::text[]))`,
          [accountNumbers],
        )
      : { rows: [{ count: '0' }] }

    const openTasks = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tasks
       WHERE status IN ('OPEN','IN_REVIEW','BLOCKED')
         AND ((related_entity_type = 'SHAREHOLDER' AND related_entity_id = $1)
              OR (related_entity_type = 'SHAREHOLDER_ACCOUNT' AND related_entity_id = ANY($2::text[])))`,
      [shareholderId, accounts.map(acct => acct.id)],
    )

    const entitlements = await this.database.query<{ count: string; amount: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount_cents),0)::text AS amount
       FROM dividend_entitlements WHERE shareholder_id = $1 AND status = 'PENDING'`,
      [shareholderId],
    )

    const insight = buildShareholderInsight({
      accounts,
      holdings: holdings.rows.map(row => ({
        accountNumber: row.account_number,
        quantity: Number(row.quantity),
        securityId: row.security_id,
      })),
      openTaskCount: Number(openTasks.rows[0]?.count || '0'),
      pendingEntitlementAmountCents: Number(entitlements.rows[0]?.amount || '0'),
      pendingEntitlementCount: Number(entitlements.rows[0]?.count || '0'),
      pendingTransferCount: Number(pendingTransfers.rows[0]?.count || '0'),
      recentEvents: recentEvents.items,
      shareholder,
    })
    return this.enrich(insight, 'shareholderSummary', {
      accountCount: accounts.length,
      kycStatus: shareholder.kycStatus,
      openTasks: insight.data?.openTasks,
      pendingEntitlements: insight.data?.pendingEntitlements,
      pendingTransfers: insight.data?.pendingTransfers,
      recentEventCount: recentEvents.items.length,
      riskTier: shareholder.riskTier,
      shareholderId,
      totalShares: insight.data?.totalShares,
    })
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────

  async taskFocusInsight(options: TaskFocusOptions = {}): Promise<Insight> {
    const limit = options.limit ?? 5
    const page = await this.tasksService.list({
      assigneeId: options.assigneeId,
      issuerId: options.issuerId,
      page: 1,
      pageSize: 50,
      sortBy: 'dueAt',
      sortDir: 'asc',
      status: 'OPEN',
    })
    // Include in-review and blocked tasks too for ranking scope.
    const additional = await this.tasksService.list({
      assigneeId: options.assigneeId,
      issuerId: options.issuerId,
      page: 1,
      pageSize: 50,
      sortBy: 'dueAt',
      sortDir: 'asc',
      status: 'IN_REVIEW',
    })
    const blocked = await this.tasksService.list({
      assigneeId: options.assigneeId,
      issuerId: options.issuerId,
      page: 1,
      pageSize: 20,
      sortDir: 'desc',
      status: 'BLOCKED',
    })
    const candidates = [...page.items, ...additional.items, ...blocked.items]
    const insight = buildTaskFocusInsight(candidates, limit)
    return this.enrich(insight, 'taskFocus', {
      candidates: candidates.length,
      limit,
      top: (insight.data?.ranked as Array<Record<string, unknown>> | undefined)?.slice(0, limit),
    })
  }

  // ─── Anomalies ──────────────────────────────────────────────────────────

  async anomalyInsight(): Promise<Insight> {
    const inputs = await this.collectAnomalyInputs()
    const insight = buildAnomalyInsight(inputs)
    return this.enrich(insight, 'anomalyFlags', {
      highSeverityAudits24h: inputs.highSeverityAudits24h,
      kycPendingWithHoldings: inputs.kycPendingWithHoldings,
      meetingsBelowQuorumCount: inputs.meetingsBelowQuorum.length,
      overdueDividendSnapshotsCount: inputs.overdueDividendSnapshots.length,
      overdueUnassignedCriticalTasks: inputs.overdueUnassignedCriticalTasks,
      staleTransfersCount: inputs.staleTransfers.length,
      unpaidPastPaymentCount: inputs.unpaidPastPayment.length,
    })
  }

  private async collectAnomalyInputs(): Promise<AnomalyInputs> {
    const [stale, overdueDividends, unpaidDividends, meetingsBelowQuorum, audits24h, kycMismatch, unassignedCritical] = await Promise.all([
      this.database.query<{ id: string; status: string; lifecycle_stage: string; age_hours: string }>(
        `SELECT id::text, status, lifecycle_stage,
                  EXTRACT(EPOCH FROM (NOW() - updated_at))/3600 AS age_hours
           FROM transfer_cases
           WHERE status IN ('PENDING','IN_REVIEW')
             AND updated_at < NOW() - INTERVAL '${STALE_TRANSFER_HOURS} hours'
           ORDER BY updated_at ASC LIMIT 25`,
      ),
      this.database.query<{ id: string; record_date: string }>(
        `SELECT id, record_date::text FROM dividend_events
           WHERE status = 'DECLARED' AND record_date < CURRENT_DATE`,
      ),
      this.database.query<{ id: string; payment_date: string; pending: string }>(
        `SELECT d.id, d.payment_date::text,
                  COUNT(e.*) FILTER (WHERE e.status = 'PENDING')::text AS pending
           FROM dividend_events d
           JOIN dividend_entitlements e ON e.dividend_event_id = d.id
           WHERE d.status = 'SNAPSHOTTED' AND d.payment_date < CURRENT_DATE
           GROUP BY d.id, d.payment_date
           HAVING COUNT(e.*) FILTER (WHERE e.status = 'PENDING') > 0`,
      ),
      this.database.query<{ meeting_id: string; quorum: string; turnout: string }>(
        `SELECT m.id AS meeting_id, m.quorum_pct::text AS quorum,
                  CASE WHEN SUM(b.shares_eligible) > 0
                       THEN (COALESCE(SUM(v.shares_cast),0)::float / SUM(b.shares_eligible) * 100)::text
                       ELSE '0' END AS turnout
           FROM meetings m
           LEFT JOIN ballots b ON b.meeting_id = m.id
           LEFT JOIN votes v ON v.ballot_id = b.id
           WHERE m.status = 'CLOSED'
           GROUP BY m.id
           HAVING CASE WHEN SUM(b.shares_eligible) > 0
                       THEN (COALESCE(SUM(v.shares_cast),0)::float / SUM(b.shares_eligible) * 100)
                       ELSE 0 END < m.quorum_pct`,
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_events
           WHERE severity IN ('HIGH','CRITICAL') AND occurred_at > NOW() - INTERVAL '24 hours'`,
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(DISTINCT sh.id)::text AS count
           FROM shareholders sh
           JOIN shareholder_accounts sa ON sa.shareholder_id = sh.id
           JOIN v_holdings h ON h.holder_id = sa.account_number
           WHERE sh.kyc_status <> 'APPROVED' AND h.quantity > 0`,
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks
           WHERE priority IN ('CRITICAL','HIGH')
             AND status IN ('OPEN','IN_REVIEW','BLOCKED')
             AND assignee_id IS NULL
             AND due_at < NOW()`,
      ),
    ])

    return {
      highSeverityAudits24h: Number(audits24h.rows[0]?.count || '0'),
      kycPendingWithHoldings: Number(kycMismatch.rows[0]?.count || '0'),
      meetingsBelowQuorum: meetingsBelowQuorum.rows.map(row => ({
        meetingId: row.meeting_id,
        quorumPct: Number(row.quorum),
        turnoutPct: Number(row.turnout),
      })),
      negativeBalanceAttempts: 0,
      overdueDividendSnapshots: overdueDividends.rows.map(row => ({
        dividendId: row.id,
        recordDate: row.record_date,
      })),
      overdueUnassignedCriticalTasks: Number(unassignedCritical.rows[0]?.count || '0'),
      staleTransfers: stale.rows.map(row => ({
        ageHours: Number(row.age_hours),
        caseId: Number(row.id),
        lifecycleStage: row.lifecycle_stage,
        status: row.status,
      })),
      unpaidPastPayment: unpaidDividends.rows.map(row => ({
        dividendId: row.id,
        paymentDate: row.payment_date,
        pendingCount: Number(row.pending),
      })),
    }
  }

  // ─── Meetings ───────────────────────────────────────────────────────────

  async meetingTurnoutInsight(meetingId: string): Promise<Insight> {
    const meeting = await this.votingService.getMeeting(meetingId)
    const ballotStats = await this.database.query<{
      issued: string
      submitted: string
      total_eligible: string
      total_voted: string
    }>(
      `SELECT
         COUNT(*)::text AS issued,
         COUNT(*) FILTER (WHERE status = 'SUBMITTED')::text AS submitted,
         COALESCE(SUM(shares_eligible),0)::text AS total_eligible,
         COALESCE((SELECT SUM(v.shares_cast) FROM votes v JOIN ballots b2 ON b2.id = v.ballot_id WHERE b2.meeting_id = $1),0)::text AS total_voted
       FROM ballots WHERE meeting_id = $1`,
      [meetingId],
    )
    const stats = ballotStats.rows[0]
    const tallies = await this.votingService.tallyMeeting(meetingId)
    const insight = buildMeetingTurnoutInsight({
      ballotsIssued: Number(stats?.issued || '0'),
      ballotsSubmitted: Number(stats?.submitted || '0'),
      meeting,
      tallies,
      totalEligibleShares: Number(stats?.total_eligible || '0'),
      totalSharesVoted: Number(stats?.total_voted || '0'),
    })
    return this.enrich(insight, 'meetingTurnout', {
      ballotsIssued: Number(stats?.issued || '0'),
      ballotsSubmitted: Number(stats?.submitted || '0'),
      quorumPct: meeting.quorumPct,
      tallies,
      totalEligibleShares: Number(stats?.total_eligible || '0'),
      totalSharesVoted: Number(stats?.total_voted || '0'),
    })
  }

  // ─── Operational copilot ────────────────────────────────────────────────

  async operationalCopilotInsight(): Promise<Insight> {
    const [summary, anomalies] = await Promise.all([this.reportingService.operationalSummary(), this.collectAnomalyInputs()])
    const insight = buildOperationalCopilotInsight({
      meetingsBelowQuorum: anomalies.meetingsBelowQuorum.length,
      overdueDividendSnapshots: anomalies.overdueDividendSnapshots.length,
      overdueUnassignedCriticalTasks: anomalies.overdueUnassignedCriticalTasks,
      staleTransferCount: anomalies.staleTransfers.length,
      summary,
      unpaidEntitlementsPastPayment: anomalies.unpaidPastPayment.length,
    })
    return this.enrich(insight, 'operationalCopilot', {
      anomalies: {
        meetingsBelowQuorum: anomalies.meetingsBelowQuorum.length,
        overdueDividendSnapshots: anomalies.overdueDividendSnapshots.length,
        overdueUnassignedCriticalTasks: anomalies.overdueUnassignedCriticalTasks,
        staleTransferCount: anomalies.staleTransfers.length,
        unpaidEntitlementsPastPayment: anomalies.unpaidPastPayment.length,
      },
      summary,
    })
  }

  // ─── Activity search ────────────────────────────────────────────────────

  async activitySearchInsight(options: ActivitySearchOptions): Promise<Insight> {
    const limit = options.limit ?? ACTIVITY_DEFAULT_LIMIT
    if (!options.q || options.q.trim().length < 2) {
      throw new NotFoundException('Query must be at least 2 characters')
    }
    const where: string[] = []
    const params: unknown[] = []
    const addParam = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    const like = `%${options.q.toLowerCase()}%`
    const likeParam = addParam(like)
    where.push(
      `(LOWER(action) LIKE ${likeParam} OR LOWER(entity_id) LIKE ${likeParam} OR LOWER(COALESCE(metadata::text, '')) LIKE ${likeParam})`,
    )
    if (options.entityType) {
      where.push(`entity_type = ${addParam(options.entityType)}`)
    }
    if (options.issuerId) {
      where.push(`issuer_id = ${addParam(options.issuerId)}`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_events ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')
    const limitParam = addParam(limit)
    const rows = await this.database.query<{
      id: string
      occurred_at: Date
      actor_id: string
      actor_role: string | null
      action: string
      severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      entity_type: string
      entity_id: string
      issuer_id: string | null
      metadata: Record<string, unknown>
    }>(
      `SELECT id::text, occurred_at, actor_id, actor_role, action, severity, entity_type, entity_id, issuer_id, metadata
       FROM audit_events ${whereSql}
       ORDER BY occurred_at DESC
       LIMIT ${limitParam}`,
      params,
    )

    const insight = buildActivitySearchInsight({
      matches: rows.rows.map(row => ({
        action: row.action,
        actorId: row.actor_id,
        actorRole: row.actor_role || undefined,
        entityId: row.entity_id,

        entityType: row.entity_type as any,
        id: Number(row.id),
        issuerId: row.issuer_id || undefined,
        metadata: row.metadata || {},
        occurredAt: new Date(row.occurred_at),
        severity: row.severity,
      })),
      query: options.q,
      totalMatches: total,
    })
    return this.enrich(insight, 'activitySearch', {
      matchCount: rows.rows.length,
      q: options.q,
      totalMatches: total,
    })
  }

  // ─── LLM enrichment ─────────────────────────────────────────────────────

  private async enrich(insight: Insight, promptKey: keyof typeof PROMPTS, context: Record<string, unknown>): Promise<Insight> {
    if (!this.llm.isEnabled()) {
      return insight
    }
    try {
      const result = await this.llm.enrich(PROMPTS[promptKey], context)
      if (result.used && result.summary) {
        return { ...insight, generator: 'MIXED', summary: result.summary }
      }
      if (result.error) {
        return { ...insight, llmError: result.error }
      }
      return insight
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM enrichment failed'
      this.logger.warn(`Insight enrichment failed: ${message}`)
      return { ...insight, llmError: message }
    }
  }
}
