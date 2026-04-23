import { Controller, Get, Param, Query } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import { Scope } from '../auth/scope.decorator.js'

import { HoldingsQuery, HoldingsService } from './holdings.service.js'

@Controller('holdings')
export class HoldingsController {
  constructor(private readonly holdingsService: HoldingsService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  @Scope({
    issuerPaths: ['query.issuerId'],
    shareholderPaths: ['query.shareholderId'],
    autoFillShareholderPath: 'query.shareholderId',
    autoFillIssuerPath: 'query.issuerId',
  })
  async list(@Query() query: HoldingsQuery) {
    return this.holdingsService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get('totals/:securityId')
  async totals(@Param('securityId') securityId: string) {
    return this.holdingsService.getTotals(securityId)
  }
}
