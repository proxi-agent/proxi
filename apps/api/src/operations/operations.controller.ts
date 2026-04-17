import { BadRequestException, Controller, Get, Query } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'

import type {
  AuditTrailEntry,
  ExceptionItem,
  HolderProfile,
  PortalMockResponse,
  ReconciliationBreak,
  ReportsSummary,
} from './operations.service.js'
import { OperationsService } from './operations.service.js'

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Permissions('report.view')
  @Get('audit-trail')
  async getAuditTrail(): Promise<AuditTrailEntry[]> {
    return this.operationsService.getAuditTrail()
  }

  @Permissions('report.view')
  @Get('exceptions')
  getExceptions(): ExceptionItem[] {
    return this.operationsService.getExceptions()
  }

  @Permissions('transfer.view')
  @Get('holders')
  getHolders(): HolderProfile[] {
    return this.operationsService.getHolderProfiles()
  }

  @Permissions('report.view')
  @Get('reconciliation')
  getReconciliation(): ReconciliationBreak[] {
    return this.operationsService.getReconciliationBreaks()
  }

  @Permissions('report.view')
  @Get('reports/summary')
  async getReportsSummary(): Promise<ReportsSummary> {
    return this.operationsService.getReportsSummary()
  }

  @Permissions('transfer.view')
  @Get('mock')
  getMock(@Query('page') page?: string, @Query('transferId') transferId?: string): PortalMockResponse {
    if (!page) {
      throw new BadRequestException('page query param is required')
    }
    const payload = this.operationsService.getPortalMock(page, transferId)
    if (!payload) {
      throw new BadRequestException(`Unknown mock page '${page}'`)
    }
    return payload
  }
}
