import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { NoticeAudience, NoticeKind, NoticeStatus } from './notices.types.js'

const KINDS: NoticeKind[] = ['COMPLIANCE', 'DIVIDEND', 'GENERAL', 'MEETING', 'SHAREHOLDER', 'TRANSFER']
const AUDIENCES: NoticeAudience[] = ['ALL', 'BOARD', 'HOLDERS', 'REGULATORS', 'TRANSFER_AGENTS']
const STATUSES: NoticeStatus[] = ['ARCHIVED', 'DRAFT', 'PUBLISHED']

export class CreateNoticeDto {
  @IsString()
  issuerId!: string

  @IsOptional()
  @IsIn(KINDS)
  kind?: NoticeKind

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string

  @IsString()
  @MinLength(2)
  body!: string

  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: NoticeAudience

  @IsOptional()
  @IsString()
  relatedEntityType?: string

  @IsOptional()
  @IsString()
  relatedEntityId?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateNoticeDto {
  @IsOptional()
  @IsIn(KINDS)
  kind?: NoticeKind

  @IsOptional()
  @IsString()
  subject?: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: NoticeAudience

  @IsOptional()
  @IsIn(STATUSES)
  status?: NoticeStatus

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class NoticeListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: NoticeStatus

  @IsOptional()
  @IsIn(KINDS)
  kind?: NoticeKind

  @IsOptional()
  @IsString()
  relatedEntityId?: string
}
