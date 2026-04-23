import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { BoardRecommendation, MeetingKind, MeetingStatus, ProposalKind, VoteChoice } from './voting.types.js'

const MEETING_KINDS: MeetingKind[] = ['ANNUAL', 'COURT', 'SPECIAL']
const MEETING_STATUSES: MeetingStatus[] = ['CERTIFIED', 'CLOSED', 'DRAFT', 'OPEN']
const PROPOSAL_KINDS: ProposalKind[] = ['ORDINARY', 'SHAREHOLDER', 'SPECIAL']
const CHOICES: VoteChoice[] = ['ABSTAIN', 'AGAINST', 'FOR']
const BOARD: BoardRecommendation[] = ['ABSTAIN', 'AGAINST', 'FOR']

export class CreateMeetingDto {
  @IsString()
  issuerId!: string

  @IsOptional()
  @IsIn(MEETING_KINDS)
  kind?: MeetingKind

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string

  @IsDateString()
  scheduledAt!: string

  @IsDateString()
  recordDate!: string

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  quorumPct?: number

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  virtualUrl?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateMeetingDto {
  @IsOptional()
  @IsIn(MEETING_KINDS)
  kind?: MeetingKind

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsIn(MEETING_STATUSES)
  status?: MeetingStatus

  @IsOptional()
  @IsDateString()
  scheduledAt?: string

  @IsOptional()
  @IsDateString()
  recordDate?: string

  @IsOptional()
  @Type(() => Number)
  quorumPct?: number

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  virtualUrl?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ProposalInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsIn(PROPOSAL_KINDS)
  kind?: ProposalKind

  @IsOptional()
  @Type(() => Number)
  requiredPct?: number

  @IsOptional()
  @IsIn(BOARD)
  boardRecommendation?: BoardRecommendation

  @IsOptional()
  @IsInt()
  sortOrder?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class BulkProposalsDto {
  @ValidateNested({ each: true })
  @Type(() => ProposalInputDto)
  proposals!: ProposalInputDto[]
}

export class VoteChoiceDto {
  @IsString()
  proposalId!: string

  @IsIn(CHOICES)
  choice!: VoteChoice

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sharesCast?: number
}

export class SubmitBallotDto {
  @IsString()
  controlNumber!: string

  @ValidateNested({ each: true })
  @Type(() => VoteChoiceDto)
  votes!: VoteChoiceDto[]
}

export class MeetingListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(MEETING_STATUSES)
  status?: MeetingStatus
}

export class BallotListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  meetingId?: string

  @IsOptional()
  @IsString()
  shareholderId?: string
}
