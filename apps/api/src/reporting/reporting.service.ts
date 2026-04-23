import { Injectable } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'

export interface OperationalSummary {
  issuers: { active: number; total: number }
  shareholders: { total: number; withHoldings: number }
  transfers: { pending: number; settled: number; total: number }
  ledgerEvents: { last24h: number; total: number }
  dividends: { declared: number; draft: number; paid: number; totalDistributionCents: number }
  voting: { upcomingMeetings: number; openMeetings: number; certifiedMeetings: number }
  tasks: { open: number; overdue: number; total: number }
  notices: { published: number; draft: number }
}

export interface IssuerSummary {
  issuerId: string
  securities: number
  shareholders: number
  outstandingShares: number
  pendingTransfers: number
  openTasks: number
  upcomingMeetings: number
}

@Injectable()
export class ReportingService {
  constructor(private readonly database: DatabaseService) {}

  async operationalSummary(): Promise<OperationalSummary> {
    const queries = await Promise.all([
      this.database.query<{ total: string; active: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::text AS active
         FROM issuers`,
      ),
      this.database.query<{ total: string; with_holdings: string }>(
        `SELECT COUNT(DISTINCT s.id)::text AS total,
                COUNT(DISTINCT sa.shareholder_id) FILTER (WHERE h.quantity > 0)::text AS with_holdings
         FROM shareholders s
         LEFT JOIN shareholder_accounts sa ON sa.shareholder_id = s.id
         LEFT JOIN v_holdings h ON h.holder_id = sa.account_number`,
      ),
      this.database.query<{ total: string; pending: string; settled: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'PENDING')::text AS pending,
                COUNT(*) FILTER (WHERE status = 'SETTLED')::text AS settled
         FROM transfer_cases`,
      ),
      this.database.query<{ total: string; last24h: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours')::text AS last24h
         FROM ledger_events`,
      ),
      this.database.query<{ draft: string; declared: string; paid: string; distributed: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'DRAFT')::text AS draft,
            COUNT(*) FILTER (WHERE status = 'DECLARED')::text AS declared,
            COUNT(*) FILTER (WHERE status = 'PAID')::text AS paid,
            COALESCE(SUM(total_distribution_cents) FILTER (WHERE status IN ('DECLARED','SNAPSHOTTED','PAID')),0)::text AS distributed
         FROM dividend_events`,
      ),
      this.database.query<{ upcoming: string; open: string; certified: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'DRAFT' AND scheduled_at > NOW())::text AS upcoming,
            COUNT(*) FILTER (WHERE status = 'OPEN')::text AS open,
            COUNT(*) FILTER (WHERE status = 'CERTIFIED')::text AS certified
         FROM meetings`,
      ),
      this.database.query<{ total: string; open: string; overdue: string }>(
        `SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status IN ('OPEN','IN_REVIEW','BLOCKED'))::text AS open,
            COUNT(*) FILTER (WHERE status IN ('OPEN','IN_REVIEW','BLOCKED') AND due_at < NOW())::text AS overdue
         FROM tasks`,
      ),
      this.database.query<{ published: string; draft: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'PUBLISHED')::text AS published,
            COUNT(*) FILTER (WHERE status = 'DRAFT')::text AS draft
         FROM notices`,
      ),
    ])
    const [issuers, holders, transfers, ledger, dividends, voting, tasks, notices] = queries
    return {
      dividends: {
        declared: Number(dividends.rows[0]?.declared || '0'),
        draft: Number(dividends.rows[0]?.draft || '0'),
        paid: Number(dividends.rows[0]?.paid || '0'),
        totalDistributionCents: Number(dividends.rows[0]?.distributed || '0'),
      },
      issuers: {
        active: Number(issuers.rows[0]?.active || '0'),
        total: Number(issuers.rows[0]?.total || '0'),
      },
      ledgerEvents: {
        last24h: Number(ledger.rows[0]?.last24h || '0'),
        total: Number(ledger.rows[0]?.total || '0'),
      },
      notices: {
        draft: Number(notices.rows[0]?.draft || '0'),
        published: Number(notices.rows[0]?.published || '0'),
      },
      shareholders: {
        total: Number(holders.rows[0]?.total || '0'),
        withHoldings: Number(holders.rows[0]?.with_holdings || '0'),
      },
      tasks: {
        open: Number(tasks.rows[0]?.open || '0'),
        overdue: Number(tasks.rows[0]?.overdue || '0'),
        total: Number(tasks.rows[0]?.total || '0'),
      },
      transfers: {
        pending: Number(transfers.rows[0]?.pending || '0'),
        settled: Number(transfers.rows[0]?.settled || '0'),
        total: Number(transfers.rows[0]?.total || '0'),
      },
      voting: {
        certifiedMeetings: Number(voting.rows[0]?.certified || '0'),
        openMeetings: Number(voting.rows[0]?.open || '0'),
        upcomingMeetings: Number(voting.rows[0]?.upcoming || '0'),
      },
    }
  }

  async issuerSummary(issuerId: string): Promise<IssuerSummary> {
    const queries = await Promise.all([
      this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM securities WHERE issuer_id = $1`, [issuerId]),
      this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM shareholders WHERE issuer_id = $1`, [issuerId]),
      this.database.query<{ total: string }>(
        `SELECT COALESCE(SUM(h.quantity),0)::text AS total
         FROM v_holdings h
         JOIN securities s ON s.id = h.security_id
         WHERE s.issuer_id = $1`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM transfer_cases WHERE issuer_id = $1 AND status = 'PENDING'`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks WHERE issuer_id = $1 AND status IN ('OPEN','IN_REVIEW','BLOCKED')`,
        [issuerId],
      ),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meetings WHERE issuer_id = $1 AND scheduled_at > NOW() AND status IN ('DRAFT','OPEN')`,
        [issuerId],
      ),
    ])
    return {
      issuerId,
      openTasks: Number(queries[4].rows[0]?.count || '0'),
      outstandingShares: Number(queries[2].rows[0]?.total || '0'),
      pendingTransfers: Number(queries[3].rows[0]?.count || '0'),
      securities: Number(queries[0].rows[0]?.count || '0'),
      shareholders: Number(queries[1].rows[0]?.count || '0'),
      upcomingMeetings: Number(queries[5].rows[0]?.count || '0'),
    }
  }

  async topHolders(securityId: string, limit = 25) {
    const rows = await this.database.query<{ holder_id: string; quantity: string; legal_name: string | null }>(
      `SELECT h.holder_id, h.quantity::text, sh.legal_name
       FROM v_holdings h
       LEFT JOIN shareholder_accounts sa ON sa.account_number = h.holder_id
       LEFT JOIN shareholders sh ON sh.id = sa.shareholder_id
       WHERE h.security_id = $1 AND h.quantity > 0
       ORDER BY h.quantity DESC
       LIMIT $2`,
      [securityId, limit],
    )
    return rows.rows.map(row => ({
      holderId: row.holder_id,
      legalName: row.legal_name,
      quantity: Number(row.quantity),
    }))
  }
}
