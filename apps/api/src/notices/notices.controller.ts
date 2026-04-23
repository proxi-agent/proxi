import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateNoticeDto, NoticeListQuery, UpdateNoticeDto } from './notices.dto.js'
import { NoticesService } from './notices.service.js'

@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  async list(@Query() query: NoticeListQuery) {
    return this.noticesService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.noticesService.get(id)
  }

  @Permissions('agent.admin')
  @Post()
  async create(@Body() body: CreateNoticeDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.noticesService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateNoticeDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.noticesService.update(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/publish')
  async publish(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.noticesService.publish(id, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post(':id/archive')
  async archive(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.noticesService.archive(id, actorFromRequest(request))
  }
}
