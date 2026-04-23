import { Controller, Get, Param, Query } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'

import { ReportingService } from './reporting.service.js'

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Permissions('report.view')
  @Get('summary')
  async summary() {
    return this.reportingService.operationalSummary()
  }

  @Permissions('report.view')
  @Get('issuers/:id/summary')
  async issuerSummary(@Param('id') id: string) {
    return this.reportingService.issuerSummary(id)
  }

  @Permissions('report.view')
  @Get('securities/:id/top-holders')
  async topHolders(@Param('id') id: string, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 25
    return this.reportingService.topHolders(id, Number.isFinite(parsed) ? parsed : 25)
  }
}
