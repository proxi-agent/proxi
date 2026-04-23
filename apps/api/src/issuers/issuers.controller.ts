import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateIssuerDto, IssuerListQuery, UpdateIssuerDto } from './issuers.dto.js'
import { IssuersService } from './issuers.service.js'

@Controller('issuers')
export class IssuersController {
  constructor(private readonly issuersService: IssuersService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  async list(@Query() query: IssuerListQuery) {
    return this.issuersService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.issuersService.getById(id)
  }

  @Permissions('agent.admin')
  @Post()
  async create(@Body() body: CreateIssuerDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.issuersService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateIssuerDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.issuersService.update(id, body, actorFromRequest(request))
  }
}
