import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import {
  CreateDividendDto,
  DividendListQuery,
  EntitlementListQuery,
  MarkPaidDto,
  UpdateDividendDto,
} from './dividends.dto.js'
import { DividendsService } from './dividends.service.js'

class CancelDividendBody {
  @IsString()
  reason!: string

  @IsOptional()
  @IsString()
  notes?: string
}

@Controller('dividends')
export class DividendsController {
  constructor(private readonly dividendsService: DividendsService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  async list(@Query() query: DividendListQuery) {
    return this.dividendsService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.dividendsService.getById(id)
  }

  @Permissions('agent.admin')
  @Post()
  async create(@Body() body: CreateDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateDividendDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.update(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/declare')
  async declare(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.declare(id, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/snapshot')
  async snapshot(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.snapshot(id, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelDividendBody,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.cancel(id, actorFromRequest(request), body.reason)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id/entitlements')
  async listEntitlements(@Param('id') id: string, @Query() query: EntitlementListQuery) {
    return this.dividendsService.listEntitlements(id, query)
  }

  @Permissions('agent.admin')
  @Post('entitlements/pay')
  async markPaid(@Body() body: MarkPaidDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.markEntitlementPaid(body, actorFromRequest(request))
  }
}
