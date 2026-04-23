import { Controller, Get, Param, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { Permissions } from '../auth/permissions.decorator.js'
import { PaginationQueryDto } from '../common/pagination.js'

import { AuditService } from './audit.service.js'
import type { AuditEntityType, AuditSeverity } from './audit.types.js'

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: AuditEntityType

  @IsOptional()
  @IsString()
  entityId?: string

  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsString()
  actorId?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsIn(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: AuditSeverity

  @IsOptional()
  @IsDateString()
  since?: string

  @IsOptional()
  @IsDateString()
  until?: string

  @IsOptional()
  @Type(() => Number)
  _dummy?: number
}

class TimelineQueryDto {
  @IsOptional()
  @IsDateString()
  since?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number
}

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Permissions('report.view')
  @Get('events')
  async list(@Query() query: AuditQueryDto) {
    return this.auditService.list(query)
  }

  /**
   * Normalized, AI-friendly timeline for a single entity. Response shape
   * is designed to be stable across domains — safe to feed into prompts,
   * exports, or timeline UI components.
   */
  @Permissions('report.view')
  @Get('timeline/:entityType/:entityId')
  async timeline(
    @Param('entityType') entityType: AuditEntityType,
    @Param('entityId') entityId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.auditService.timeline(entityType, entityId, query)
  }
}
