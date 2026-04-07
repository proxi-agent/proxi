import { Controller, Get } from '@nestjs/common'
import { OperationsService } from './operations.service.js'
import type { AuditTrailEntry, ExceptionItem, HolderProfile, ReconciliationBreak, ReportsSummary } from './operations.service.js'

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('audit-trail')
  getAuditTrail(): AuditTrailEntry[] {
    return this.operationsService.getAuditTrail()
  }

  @Get('exceptions')
  getExceptions(): ExceptionItem[] {
    return this.operationsService.getExceptions()
  }

  @Get('holders')
  getHolders(): HolderProfile[] {
    return this.operationsService.getHolderProfiles()
  }

  @Get('reconciliation')
  getReconciliation(): ReconciliationBreak[] {
    return this.operationsService.getReconciliationBreaks()
  }

  @Get('reports/summary')
  getReportsSummary(): ReportsSummary {
    return this.operationsService.getReportsSummary()
  }
}
