import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { PoolClient } from 'pg'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId, uid } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'
import { LedgerService } from '../ledger/ledger.service.js'

import type {
  BallotListQuery,
  BulkProposalsDto,
  CreateMeetingDto,
  MeetingListQuery,
  ProposalInputDto,
  SubmitBallotDto,
  UpdateMeetingDto,
} from './voting.dto.js'
import { tallyVotes } from './voting.math.js'
import type {
  Ballot,
  BallotStatus,
  BoardRecommendation,
  Meeting,
  MeetingKind,
  MeetingStatus,
  Proposal,
  ProposalKind,
  ProposalStatus,
  ProposalTally,
  Vote,
  VoteChoice,
} from './voting.types.js'

type MeetingRow = {
  id: string
  issuer_id: string
  kind: MeetingKind
  title: string
  status: MeetingStatus
  scheduled_at: Date
  record_date: string
  quorum_pct: string
  location: string | null
  virtual_url: string | null
  description: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type ProposalRow = {
  id: string
  meeting_id: string
  code: string
  title: string
  description: string | null
  kind: ProposalKind
  required_pct: string
  status: ProposalStatus
  sort_order: number
  board_recommendation: BoardRecommendation | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type BallotRow = {
  id: string
  meeting_id: string
  shareholder_id: string
  account_id: string
  shares_eligible: string
  status: BallotStatus
  submitted_at: Date | null
  control_number: string
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type VoteRow = {
  id: string
  ballot_id: string
  proposal_id: string
  choice: VoteChoice
  shares_cast: string
  cast_at: Date
  metadata: Record<string, unknown>
}

const MEETING_SORT: Record<string, string> = {
  scheduledAt: 'scheduled_at',
  status: 'status',
  title: 'title',
}

const BALLOT_SORT: Record<string, string> = {
  createdAt: 'created_at',
  sharesEligible: 'shares_eligible',
  status: 'status',
}

@Injectable()
export class VotingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly ledgerService: LedgerService,
  ) {}

  // Meetings
  async listMeetings(query: MeetingListQuery): Promise<PaginatedResponse<Meeting>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`LOWER(title) LIKE $${params.length}`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, MEETING_SORT, { column: 'scheduled_at', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM meetings ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')
    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length
    const rows = await this.database.query<MeetingRow>(
      `SELECT * FROM meetings ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapMeeting), total, query)
  }

  async getMeeting(id: string): Promise<Meeting & { proposals: Proposal[] }> {
    const result = await this.database.query<MeetingRow>(`SELECT * FROM meetings WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Meeting ${id} not found`)
    }
    const proposals = await this.database.query<ProposalRow>(
      `SELECT * FROM proposals WHERE meeting_id = $1 ORDER BY sort_order ASC, code ASC`,
      [id],
    )
    return { ...mapMeeting(result.rows[0]), proposals: proposals.rows.map(mapProposal) }
  }

  async createMeeting(input: CreateMeetingDto, actor: ActorContext): Promise<Meeting> {
    const id = shortId('mtg')
    return this.database.tx(async client => {
      const issuer = await client.query(`SELECT id FROM issuers WHERE id = $1`, [input.issuerId])
      if (!issuer.rows.length) {
        throw new NotFoundException(`Issuer ${input.issuerId} not found`)
      }
      const result = await client.query<MeetingRow>(
        `INSERT INTO meetings (id, issuer_id, kind, title, status, scheduled_at, record_date, quorum_pct,
                               location, virtual_url, description, metadata)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
        [
          id,
          input.issuerId,
          input.kind || 'ANNUAL',
          input.title,
          input.scheduledAt,
          input.recordDate,
          input.quorumPct ?? 50,
          input.location || null,
          input.virtualUrl || null,
          input.description || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      await this.auditService.record(
        {
          action: 'MEETING_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'MEETING',
          issuerId: input.issuerId,
          metadata: { kind: input.kind, recordDate: input.recordDate },
        },
        client,
      )
      return mapMeeting(result.rows[0])
    })
  }

  async updateMeeting(id: string, input: UpdateMeetingDto, actor: ActorContext): Promise<Meeting> {
    return this.database.tx(async client => {
      const existing = await this.findMeetingForUpdate(client, id)
      if (['CERTIFIED'].includes(existing.status) && input.status !== undefined) {
        throw new ConflictException(`Cannot modify certified meeting ${id}`)
      }
      const result = await client.query<MeetingRow>(
        `UPDATE meetings SET
           kind = $2, title = $3, status = $4, scheduled_at = $5, record_date = $6, quorum_pct = $7,
           location = $8, virtual_url = $9, description = $10, metadata = $11::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.kind ?? existing.kind,
          input.title ?? existing.title,
          input.status ?? existing.status,
          input.scheduledAt ?? existing.scheduled_at,
          input.recordDate ?? existing.record_date,
          input.quorumPct ?? Number(existing.quorum_pct),
          input.location ?? existing.location,
          input.virtualUrl ?? existing.virtual_url,
          input.description ?? existing.description,
          JSON.stringify({ ...existing.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: 'MEETING_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'MEETING',
          issuerId: existing.issuer_id,
          metadata: { status: input.status },
        },
        client,
      )
      return mapMeeting(result.rows[0])
    })
  }

  // Proposals
  async upsertProposals(meetingId: string, input: BulkProposalsDto, actor: ActorContext): Promise<Proposal[]> {
    return this.database.tx(async client => {
      const meeting = await this.findMeetingForUpdate(client, meetingId)
      if (meeting.status === 'CERTIFIED') {
        throw new ConflictException('Meeting already certified')
      }
      const output: Proposal[] = []
      for (const proposal of input.proposals) {
        output.push(await this.upsertSingleProposal(client, meetingId, proposal))
      }
      await this.auditService.record(
        {
          action: 'PROPOSALS_UPSERTED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: meetingId,
          entityType: 'MEETING',
          issuerId: meeting.issuer_id,
          metadata: { count: output.length },
        },
        client,
      )
      return output
    })
  }

  async upsertProposal(meetingId: string, input: ProposalInputDto, actor: ActorContext): Promise<Proposal> {
    return this.database.tx(async client => {
      const meeting = await this.findMeetingForUpdate(client, meetingId)
      if (meeting.status === 'CERTIFIED') {
        throw new ConflictException('Meeting already certified')
      }
      const proposal = await this.upsertSingleProposal(client, meetingId, input)
      await this.auditService.record(
        {
          action: 'PROPOSAL_UPSERTED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: proposal.id,
          entityType: 'PROPOSAL',
          issuerId: meeting.issuer_id,
          metadata: { code: proposal.code },
        },
        client,
      )
      return proposal
    })
  }

  private async upsertSingleProposal(client: PoolClient, meetingId: string, input: ProposalInputDto): Promise<Proposal> {
    const existing = await client.query<ProposalRow>(`SELECT * FROM proposals WHERE meeting_id = $1 AND code = $2`, [meetingId, input.code])
    if (existing.rows.length) {
      const row = existing.rows[0]
      const updated = await client.query<ProposalRow>(
        `UPDATE proposals SET
           title = $2, description = $3, kind = $4, required_pct = $5, sort_order = $6,
           board_recommendation = $7, metadata = $8::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          row.id,
          input.title,
          input.description ?? row.description,
          input.kind ?? row.kind,
          input.requiredPct ?? Number(row.required_pct),
          input.sortOrder ?? row.sort_order,
          input.boardRecommendation ?? row.board_recommendation,
          JSON.stringify({ ...row.metadata, ...(input.metadata || {}) }),
        ],
      )
      return mapProposal(updated.rows[0])
    }
    const id = shortId('prp')
    const created = await client.query<ProposalRow>(
      `INSERT INTO proposals (id, meeting_id, code, title, description, kind, required_pct, status, sort_order,
                              board_recommendation, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10::jsonb) RETURNING *`,
      [
        id,
        meetingId,
        input.code,
        input.title,
        input.description || null,
        input.kind || 'ORDINARY',
        input.requiredPct ?? 50,
        input.sortOrder ?? 0,
        input.boardRecommendation || null,
        JSON.stringify(input.metadata || {}),
      ],
    )
    return mapProposal(created.rows[0])
  }

  // Meeting lifecycle
  async openMeeting(meetingId: string, securityId: string, actor: ActorContext): Promise<{ meeting: Meeting; ballotsIssued: number }> {
    return this.database.tx(async client => {
      const meeting = await this.findMeetingForUpdate(client, meetingId)
      if (meeting.status !== 'DRAFT') {
        throw new ConflictException(`Cannot open meeting in status ${meeting.status}`)
      }

      const proposals = await client.query<{ id: string }>(`SELECT id FROM proposals WHERE meeting_id = $1`, [meetingId])
      if (!proposals.rows.length) {
        throw new BadRequestException('Meeting has no proposals to vote on')
      }

      const positions = await this.ledgerService.getPositionsAsOf(securityId, meeting.record_date)
      let ballotsIssued = 0
      for (const position of positions) {
        const accountResult = await client.query<{ id: string; shareholder_id: string }>(
          `SELECT id, shareholder_id FROM shareholder_accounts
           WHERE issuer_id = $1 AND account_number = $2`,
          [meeting.issuer_id, position.holderId],
        )
        if (!accountResult.rows.length) {
          continue
        }
        const account = accountResult.rows[0]
        const ballotId = shortId('bal')
        const controlNumber = uid().replaceAll('-', '').slice(0, 14).toUpperCase()
        await client.query(
          `INSERT INTO ballots (id, meeting_id, shareholder_id, account_id, shares_eligible, status, control_number, metadata)
           VALUES ($1,$2,$3,$4,$5,'ISSUED',$6,'{}'::jsonb)
           ON CONFLICT (meeting_id, account_id) DO UPDATE SET
             shares_eligible = EXCLUDED.shares_eligible,
             status = 'ISSUED',
             updated_at = NOW()`,
          [ballotId, meetingId, account.shareholder_id, account.id, position.quantity, controlNumber],
        )
        ballotsIssued += 1
      }

      await client.query(`UPDATE proposals SET status = 'OPEN', updated_at = NOW() WHERE meeting_id = $1 AND status = 'DRAFT'`, [meetingId])
      const updated = await client.query<MeetingRow>(
        `UPDATE meetings SET status = 'OPEN', metadata = metadata || jsonb_build_object('securityId', $2::text), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [meetingId, securityId],
      )

      await this.auditService.record(
        {
          action: 'MEETING_OPENED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: meetingId,
          entityType: 'MEETING',
          issuerId: meeting.issuer_id,
          metadata: { ballotsIssued, securityId },
          severity: 'MEDIUM',
        },
        client,
      )
      return { ballotsIssued, meeting: mapMeeting(updated.rows[0]) }
    })
  }

  async closeMeeting(meetingId: string, actor: ActorContext): Promise<Meeting> {
    return this.database.tx(async client => {
      const meeting = await this.findMeetingForUpdate(client, meetingId)
      if (meeting.status !== 'OPEN') {
        throw new ConflictException(`Cannot close meeting in status ${meeting.status}`)
      }
      const result = await client.query<MeetingRow>(`UPDATE meetings SET status = 'CLOSED', updated_at = NOW() WHERE id = $1 RETURNING *`, [
        meetingId,
      ])
      await this.auditService.record(
        {
          action: 'MEETING_CLOSED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: meetingId,
          entityType: 'MEETING',
          issuerId: meeting.issuer_id,
          metadata: {},
          severity: 'MEDIUM',
        },
        client,
      )
      return mapMeeting(result.rows[0])
    })
  }

  async certifyMeeting(meetingId: string, actor: ActorContext): Promise<{ meeting: Meeting; tallies: ProposalTally[] }> {
    return this.database.tx(async client => {
      const meeting = await this.findMeetingForUpdate(client, meetingId)
      if (!['CLOSED', 'OPEN'].includes(meeting.status)) {
        throw new ConflictException(`Cannot certify meeting in status ${meeting.status}`)
      }
      const tallies = await this.computeTalliesInternal(client, meetingId, meeting)
      for (const tally of tallies) {
        await client.query(`UPDATE proposals SET status = $2, updated_at = NOW() WHERE id = $1`, [
          tally.proposalId,
          tally.passed ? 'PASSED' : 'FAILED',
        ])
      }
      const result = await client.query<MeetingRow>(
        `UPDATE meetings SET status = 'CERTIFIED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [meetingId],
      )
      await this.auditService.record(
        {
          action: 'MEETING_CERTIFIED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: meetingId,
          entityType: 'MEETING',
          issuerId: meeting.issuer_id,
          metadata: { tallies },
          severity: 'HIGH',
        },
        client,
      )
      return { meeting: mapMeeting(result.rows[0]), tallies }
    })
  }

  // Ballots + votes
  async listBallots(query: BallotListQuery): Promise<PaginatedResponse<Ballot>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.meetingId) {
      params.push(query.meetingId)
      where.push(`meeting_id = $${params.length}`)
    }
    if (query.shareholderId) {
      params.push(query.shareholderId)
      where.push(`shareholder_id = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`LOWER(control_number) LIKE $${params.length}`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, BALLOT_SORT, { column: 'created_at', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ballots ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')
    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length
    const rows = await this.database.query<BallotRow>(
      `SELECT * FROM ballots ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapBallot), total, query)
  }

  async getBallotDetail(id: string): Promise<{ ballot: Ballot; votes: Vote[] }> {
    const ballot = await this.database.query<BallotRow>(`SELECT * FROM ballots WHERE id = $1`, [id])
    if (!ballot.rows.length) {
      throw new NotFoundException(`Ballot ${id} not found`)
    }
    const votes = await this.database.query<VoteRow>(`SELECT * FROM votes WHERE ballot_id = $1`, [id])
    return { ballot: mapBallot(ballot.rows[0]), votes: votes.rows.map(mapVote) }
  }

  async submitBallot(ballotId: string, input: SubmitBallotDto, actor: ActorContext): Promise<{ ballot: Ballot; votes: Vote[] }> {
    return this.database.tx(async client => {
      const ballot = await this.findBallotForUpdate(client, ballotId)
      if (ballot.control_number !== input.controlNumber) {
        throw new UnauthorizedException('Invalid ballot control number')
      }
      if (ballot.status === 'REVOKED' || ballot.status === 'INVALID') {
        throw new ConflictException(`Cannot submit ${ballot.status.toLowerCase()} ballot`)
      }
      const meeting = await client.query<MeetingRow>(`SELECT * FROM meetings WHERE id = $1 FOR SHARE`, [ballot.meeting_id])
      if (!meeting.rows.length || meeting.rows[0].status !== 'OPEN') {
        throw new ConflictException('Meeting is not open for voting')
      }

      const proposals = await client.query<ProposalRow>(`SELECT * FROM proposals WHERE meeting_id = $1`, [ballot.meeting_id])
      const proposalIds = new Set(proposals.rows.map(row => row.id))

      await client.query(`DELETE FROM votes WHERE ballot_id = $1`, [ballotId])

      const votes: Vote[] = []
      for (const choice of input.votes) {
        if (!proposalIds.has(choice.proposalId)) {
          throw new BadRequestException(`Proposal ${choice.proposalId} does not belong to this meeting`)
        }
        const shares = Number(ballot.shares_eligible)
        const sharesCast = choice.sharesCast !== undefined ? Math.min(choice.sharesCast, shares) : shares
        const inserted = await client.query<VoteRow>(
          `INSERT INTO votes (id, ballot_id, proposal_id, choice, shares_cast, cast_at, metadata)
           VALUES ($1,$2,$3,$4,$5,NOW(),'{}'::jsonb) RETURNING *`,
          [shortId('vote'), ballotId, choice.proposalId, choice.choice, sharesCast],
        )
        votes.push(mapVote(inserted.rows[0]))
      }

      const updated = await client.query<BallotRow>(
        `UPDATE ballots SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [ballotId],
      )

      await this.auditService.record(
        {
          action: 'BALLOT_SUBMITTED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: ballotId,
          entityType: 'BALLOT',
          issuerId: meeting.rows[0].issuer_id,
          metadata: { meetingId: ballot.meeting_id, voteCount: votes.length },
        },
        client,
      )
      return { ballot: mapBallot(updated.rows[0]), votes }
    })
  }

  async tallyMeeting(meetingId: string): Promise<ProposalTally[]> {
    return this.database.tx(async client => {
      const meeting = await client.query<MeetingRow>(`SELECT * FROM meetings WHERE id = $1`, [meetingId])
      if (!meeting.rows.length) {
        throw new NotFoundException(`Meeting ${meetingId} not found`)
      }
      return this.computeTalliesInternal(client, meetingId, meeting.rows[0])
    })
  }

  private async computeTalliesInternal(client: PoolClient, meetingId: string, meeting: MeetingRow): Promise<ProposalTally[]> {
    const proposals = await client.query<ProposalRow>(`SELECT * FROM proposals WHERE meeting_id = $1`, [meetingId])
    const totalEligibleResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(shares_eligible), 0)::text AS total FROM ballots WHERE meeting_id = $1`,
      [meetingId],
    )
    const totalEligibleShares = Number(totalEligibleResult.rows[0]?.total || '0')

    const tallies: ProposalTally[] = []
    for (const proposal of proposals.rows) {
      const votes = await client.query<{ choice: VoteChoice; shares: string }>(
        `SELECT choice, COALESCE(SUM(shares_cast), 0)::text AS shares
         FROM votes WHERE proposal_id = $1 GROUP BY choice`,
        [proposal.id],
      )
      tallies.push(
        tallyVotes({
          proposalId: proposal.id,
          quorumPct: Number(meeting.quorum_pct),
          requiredPct: Number(proposal.required_pct),
          totalEligibleShares,
          votes: votes.rows.map(row => ({ choice: row.choice, sharesCast: Number(row.shares) })),
        }),
      )
    }
    return tallies
  }

  private async findMeetingForUpdate(client: PoolClient, id: string): Promise<MeetingRow> {
    const result = await client.query<MeetingRow>(`SELECT * FROM meetings WHERE id = $1 FOR UPDATE`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Meeting ${id} not found`)
    }
    return result.rows[0]
  }

  private async findBallotForUpdate(client: PoolClient, id: string): Promise<BallotRow> {
    const result = await client.query<BallotRow>(`SELECT * FROM ballots WHERE id = $1 FOR UPDATE`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Ballot ${id} not found`)
    }
    return result.rows[0]
  }
}

function mapMeeting(row: MeetingRow): Meeting {
  return {
    createdAt: new Date(row.created_at),
    description: row.description || undefined,
    id: row.id,
    issuerId: row.issuer_id,
    kind: row.kind,
    location: row.location || undefined,
    metadata: row.metadata || {},
    quorumPct: Number(row.quorum_pct),
    recordDate: formatDate(row.record_date),
    scheduledAt: new Date(row.scheduled_at),
    status: row.status,
    title: row.title,
    updatedAt: new Date(row.updated_at),
    virtualUrl: row.virtual_url || undefined,
  }
}

function mapProposal(row: ProposalRow): Proposal {
  return {
    boardRecommendation: row.board_recommendation || undefined,
    code: row.code,
    createdAt: new Date(row.created_at),
    description: row.description || undefined,
    id: row.id,
    kind: row.kind,
    meetingId: row.meeting_id,
    metadata: row.metadata || {},
    requiredPct: Number(row.required_pct),
    sortOrder: row.sort_order,
    status: row.status,
    title: row.title,
    updatedAt: new Date(row.updated_at),
  }
}

function mapBallot(row: BallotRow): Ballot {
  return {
    accountId: row.account_id,
    controlNumber: row.control_number,
    createdAt: new Date(row.created_at),
    id: row.id,
    meetingId: row.meeting_id,
    metadata: row.metadata || {},
    shareholderId: row.shareholder_id,
    sharesEligible: Number(row.shares_eligible),
    status: row.status,
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
    updatedAt: new Date(row.updated_at),
  }
}

function mapVote(row: VoteRow): Vote {
  return {
    ballotId: row.ballot_id,
    castAt: new Date(row.cast_at),
    choice: row.choice,
    id: row.id,
    metadata: row.metadata || {},
    proposalId: row.proposal_id,
    sharesCast: Number(row.shares_cast),
  }
}

function formatDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}
