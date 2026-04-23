import { Controller, Get, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator'

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

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Permissions('report.view')
  @Get('events')
  async list(@Query() query: AuditQueryDto) {
    return this.auditService.list(query)
  }
}
