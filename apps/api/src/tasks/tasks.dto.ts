import { Type } from 'class-transformer'
import { IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { TaskPriority, TaskRecommendedAction, TaskSeverity, TaskSource, TaskStatus, TaskType } from './tasks.types.js'

const PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH', 'LOW', 'MEDIUM']
const SEVERITIES: TaskSeverity[] = ['CRITICAL', 'ERROR', 'INFO', 'WARN']
const STATUSES: TaskStatus[] = ['BLOCKED', 'CANCELLED', 'IN_REVIEW', 'OPEN', 'RESOLVED']
const SOURCES: TaskSource[] = ['AI', 'LEDGER', 'RECONCILIATION', 'SYSTEM', 'USER']
const TYPES: TaskType[] = [
  'BALLOT_REVIEW',
  'DIVIDEND_RECONCILIATION',
  'KYC_FOLLOWUP',
  'LEDGER_EXCEPTION',
  'MEETING_CERTIFICATION',
  'TRANSFER_REVIEW',
]

class RecommendedActionDto implements TaskRecommendedAction {
  @IsString()
  label!: string

  @IsString()
  action!: string

  @IsOptional()
  @IsString()
  url?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsIn(TYPES)
  type!: TaskType

  @IsOptional()
  @IsIn(SOURCES)
  source?: TaskSource

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TaskPriority

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: TaskSeverity

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsString()
  relatedEntityType?: string

  @IsOptional()
  @IsString()
  relatedEntityId?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedActionDto)
  recommendedActions?: RecommendedActionDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TaskPriority

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: TaskSeverity

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendedActionDto)
  recommendedActions?: RecommendedActionDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class TransitionTaskDto {
  @IsIn(STATUSES)
  status!: TaskStatus

  @IsOptional()
  @IsString()
  note?: string
}

export class TaskListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: TaskStatus

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TaskPriority

  @IsOptional()
  @IsIn(TYPES)
  type?: TaskType

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsString()
  relatedEntityId?: string
}
