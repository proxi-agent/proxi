import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateSecurityDto, SecurityListQuery, ShareClassInputDto, UpdateSecurityDto } from './securities.dto.js'
import { SecuritiesService } from './securities.service.js'

@Controller('securities')
export class SecuritiesController {
  constructor(private readonly securitiesService: SecuritiesService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  async list(@Query() query: SecurityListQuery) {
    return this.securitiesService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.securitiesService.getById(id)
  }

  @Permissions('agent.admin')
  @Post()
  async create(@Body() body: CreateSecurityDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.securitiesService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateSecurityDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.securitiesService.update(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/classes')
  async upsertClass(@Param('id') id: string, @Body() body: ShareClassInputDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.securitiesService.upsertShareClass(id, body, actorFromRequest(request))
  }
}
